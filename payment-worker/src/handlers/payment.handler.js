/**
 * Payment request handlers
 */
import { jsonResponse, jsonError } from '../helpers/response.js';
import { requireInternalAuth, requireUser, extractUserContext } from '../middleware/auth.middleware.js';
import { createPaypalOrder, capturePaypalOrder, verifyPaypalOrder } from '../services/paypal.service.js';
import { internalCall } from '../services/internal.service.js';
import { createPayment, getPaymentByPaypalOrderId, updatePaymentStatus } from '../db/queries.js';
import { storePaymentInKV, getPaymentFromKV, deletePaymentFromKV, storeFailedPayment } from '../services/payment-storage.service.js';
import { createPaymentSchema, capturePaymentSchema } from '../validators/payment.validator.js';
import { parseJSONSafe } from '../helpers/utils.js';

/**
 * Validate request body against Joi schema
 */
function validateBody(schema) {
	return async (req) => {
		try {
			const body = await req.json().catch(() => ({}));
			const { error, value } = schema.validate(body, { abortEarly: false });
			if (error) {
				const errors = error.details.map((d) => d.message).join(', ');
				return { error: errors, value: null };
			}
			return { error: null, value };
		} catch {
			return { error: 'invalid_json', value: null };
		}
	};
}

/**
 * POST /payment/paypal/create - Create PayPal payment order
 */
export async function createPaymentHandler(req, env) {
	console.log('[PAYMENT.CREATE] Starting payment creation');

	const authError = await requireInternalAuth(req, env);
	if (authError) return authError;

	const validation = await validateBody(createPaymentSchema)(req);
	if (validation.error) {
		return jsonError({ error: 'validation_error', details: validation.error }, 400);
	}

	const { reservationId, amount, currency = 'USD', returnUrl, userId, metadata } = validation.value;

	try {
		// Create PayPal order
		const { orderID, approveUrl, raw } = await createPaypalOrder(env, reservationId, amount, currency, returnUrl);

		console.log('[PAYMENT.CREATE] PayPal order created', { orderID, reservationId });

		// Store in KV
		const paymentData = {
			reservationId,
			userId,
			amount,
			currency,
			metadata,
			paypalOrderId: orderID,
			status: 'pending',
			createdAt: Date.now(),
		};
		await storePaymentInKV(env, orderID, paymentData);

		// Store in DB
		if (env.DB) {
			try {
				const paymentId = `pay_${crypto.randomUUID()}`;
				await createPayment(env, paymentId, reservationId, orderID, userId, amount, currency, metadata, Date.now());
				console.log('[PAYMENT.CREATE] Payment record created in DB', { paymentId });
			} catch (dbErr) {
				console.error('[PAYMENT.CREATE] DB insert failed', dbErr);
			}
		}

		return jsonResponse({
			paymentId: orderID,
			paypalOrderId: orderID,
			approveUrl: approveUrl,
			raw: raw,
		});
	} catch (err) {
		console.error('[PAYMENT.CREATE] Error', err);
		if (err.error === 'paypal_create_failed') {
			return jsonError({ error: 'paypal_create_failed', details: err.details }, err.status || 502);
		}
		return jsonError({ error: 'server_error', message: String(err) }, 500);
	}
}

/**
 * POST /payment/paypal/capture - Capture PayPal payment
 */
export async function capturePaymentHandler(req, env) {
	console.log('[PAYMENT.CAPTURE] Starting capture process');

	const userError = requireUser(req);
	if (userError) return userError;

	const validation = await validateBody(capturePaymentSchema)(req);
	if (validation.error) {
		return jsonError({ error: 'validation_error', details: validation.error }, 400);
	}

	const { paypalOrderId, reservationId } = validation.value;
	const userContext = extractUserContext(req);

	console.log('[PAYMENT.CAPTURE] Request data:', { paypalOrderId, reservationId });

	let capJson = null;
	let paymentData = null;

	try {
		// Fetch payment data
		paymentData = await getPaymentFromKV(env, paypalOrderId);

		if (!paymentData && env.DB) {
			try {
				const row = await getPaymentByPaypalOrderId(env, paypalOrderId);
				if (row) {
					paymentData = {
						reservationId: row.reservation_id,
						userId: row.user_id,
						amount: row.amount,
						currency: row.currency,
						metadata: parseJSONSafe(row.metadata_json, {}),
					};
				}
			} catch (dbErr) {
				console.error('[PAYMENT.CAPTURE] DB lookup failed', dbErr);
			}
		}

		if (!paymentData) {
			return jsonError({ error: 'payment_not_found' }, 404);
		}

		// Verify user owns this payment
		if (paymentData.userId !== userContext.userId) {
			return jsonError({ error: 'forbidden', message: 'Payment does not belong to user' }, 403);
		}

		// Check PayPal order status first to see if already captured
		let capJson = null;
		let captureId = null;

		try {
			// Try to capture first - most common case
			const captureResult = await capturePaypalOrder(env, paypalOrderId);
			captureId = captureResult.captureId;
			capJson = captureResult.raw;
			console.log('[PAYMENT.CAPTURE] PayPal capture successful, captureId:', captureId);
		} catch (captureErr) {
			// If capture fails, check if it's because order is already captured
			if (captureErr.error === 'capture_failed' && captureErr.details) {
				const details = captureErr.details;
				console.log('[PAYMENT.CAPTURE] Capture failed, checking if order already captured:', details);

				// Check if error indicates payment was declined (not already captured)
				const isPaymentDeclined =
					details.details && Array.isArray(details.details) && details.details.some((d) => d.issue === 'INSTRUMENT_DECLINED');

				// Check if error indicates order already captured
				const isAlreadyCaptured =
					details.error === 'ORDER_ALREADY_CAPTURED' ||
					(details.details &&
						Array.isArray(details.details) &&
						details.details.some(
							(d) =>
								d.issue === 'ORDER_ALREADY_CAPTURED' ||
								d.description?.includes('already captured') ||
								d.description?.includes('already completed'),
						));

				// Handle payment declined first - this is a failure, not already captured
				if (isPaymentDeclined) {
					console.log('[PAYMENT.CAPTURE] Payment instrument declined, releasing inventory...');

					// Release inventory reservation since payment failed
					if (env.INVENTORY_SERVICE && env.INTERNAL_SECRET) {
						try {
							await internalCall(env.INVENTORY_SERVICE, '/inventory/release', 'POST', { reservationId }, env.INTERNAL_SECRET, userContext);
							console.log('[PAYMENT.CAPTURE] Inventory released after payment decline');
						} catch (releaseErr) {
							console.error('[PAYMENT.CAPTURE] Failed to release inventory:', releaseErr);
							// Continue even if release fails - log it
						}
					}

					// Return user-friendly error for declined payment
					const declineDetails = details.details?.find((d) => d.issue === 'INSTRUMENT_DECLINED');
					return jsonError(
						{
							error: 'payment_declined',
							message:
								declineDetails?.description ||
								'Your payment method was declined. Please try a different payment method or contact your bank.',
							details: {
								issue: 'INSTRUMENT_DECLINED',
								description: declineDetails?.description,
								paypalOrderId,
								reservationId,
							},
						},
						402, // Payment Required
					);
				}

				// Check if order is already captured (not declined)
				if (isAlreadyCaptured || (captureErr.status === 422 && !isPaymentDeclined)) {
					// Order might already be captured, verify and get capture info
					console.log('[PAYMENT.CAPTURE] Order appears to be already captured, verifying status...');
					try {
						const verifyResult = await verifyPaypalOrder(env, paypalOrderId);
						if (verifyResult.ok && verifyResult.data) {
							const orderData = verifyResult.data;
							const orderStatus = orderData.status;
							console.log('[PAYMENT.CAPTURE] PayPal order status:', orderStatus);

							if (orderStatus === 'COMPLETED') {
								// Order is completed, extract capture ID
								const purchaseUnits = orderData.purchase_units || [];
								for (const pu of purchaseUnits) {
									const captures = (pu.payments || {}).captures || [];
									for (const c of captures) {
										if (c.status === 'COMPLETED' || c.status === 'PENDING') {
											captureId = c.id;
											capJson = orderData;
											console.log('[PAYMENT.CAPTURE] Found existing capture, captureId:', captureId);
											break;
										}
									}
									if (captureId) break;
								}

								if (captureId) {
									// Successfully found existing capture, proceed with order creation
									console.log('[PAYMENT.CAPTURE] Using existing capture, proceeding with order creation');
								} else {
									// Order completed but no capture found
									return jsonError(
										{
											error: 'order_already_completed',
											message: 'Order is already completed but capture ID not found',
											details: orderData,
										},
										400,
									);
								}
							} else if (orderStatus === 'APPROVED') {
								// Order is approved but capture failed - this is unexpected
								return jsonError(
									{
										error: 'capture_failed',
										details: captureErr.details,
										message: 'Order is approved but capture failed. Please try again.',
									},
									captureErr.status || 502,
								);
							} else {
								// Order is in an invalid state
								return jsonError(
									{
										error: 'invalid_order_state',
										message: `Order is in ${orderStatus} state and cannot be captured`,
										details: { status: orderStatus, orderId: paypalOrderId },
									},
									400,
								);
							}
						} else {
							// Verification failed
							throw new Error('Failed to verify order status');
						}
					} catch (verifyErr) {
						console.error('[PAYMENT.CAPTURE] Failed to verify order status:', verifyErr);
						// Return original capture error
						return jsonError(
							{
								error: 'capture_failed',
								details: captureErr.details,
								message: captureErr.details?.message || captureErr.details?.details?.[0]?.description || 'Failed to capture PayPal payment',
							},
							captureErr.status || 502,
						);
					}
				} else {
					// Different error - check if it's a payment failure that should release inventory
					const isPaymentFailure =
						details.details &&
						Array.isArray(details.details) &&
						details.details.some(
							(d) =>
								d.issue === 'PAYER_ACTION_REQUIRED' ||
								d.issue === 'PAYMENT_DENIED' ||
								d.issue === 'INSTRUMENT_DECLINED' ||
								d.description?.toLowerCase().includes('declined') ||
								d.description?.toLowerCase().includes('denied'),
						);

					if (isPaymentFailure) {
						console.log('[PAYMENT.CAPTURE] Payment failure detected, releasing inventory...');
						// Release inventory reservation since payment failed
						if (env.INVENTORY_SERVICE && env.INTERNAL_SECRET) {
							try {
								await internalCall(
									env.INVENTORY_SERVICE,
									'/inventory/release',
									'POST',
									{ reservationId },
									env.INTERNAL_SECRET,
									userContext,
								);
								console.log('[PAYMENT.CAPTURE] Inventory released after payment failure');
							} catch (releaseErr) {
								console.error('[PAYMENT.CAPTURE] Failed to release inventory:', releaseErr);
							}
						}
					}

					// Return error
					console.error('[PAYMENT.CAPTURE] Capture failed with unexpected error:', captureErr);
					const errorMessage =
						details.details?.[0]?.description || details.message || 'Failed to capture PayPal payment. Please try again.';
					return jsonError(
						{
							error: 'capture_failed',
							details: captureErr.details,
							message: errorMessage,
						},
						captureErr.status || 502,
					);
				}
			} else {
				// Unexpected error
				console.error('[PAYMENT.CAPTURE] Unexpected capture error:', captureErr);
				return jsonError(
					{
						error: 'server_error',
						message: String(captureErr),
					},
					500,
				);
			}
		}

		// If we still don't have a capture ID at this point, something went wrong
		if (!captureId) {
			return jsonError(
				{
					error: 'capture_failed',
					message: 'Failed to capture payment or retrieve existing capture',
				},
				502,
			);
		}

		console.log('[PAYMENT.CAPTURE] PayPal capture successful, captureId:', captureId);

		let orderId = `ord_${crypto.randomUUID()}`;

		// Commit inventory - MUST succeed before creating order
		if (env.INVENTORY_SERVICE && env.INTERNAL_SECRET) {
			const invRes = await internalCall(
				env.INVENTORY_SERVICE,
				'/inventory/commit',
				'POST',
				{ reservationId },
				env.INTERNAL_SECRET,
				userContext,
			);

			if (!invRes.ok) {
				console.error('[PAYMENT.CAPTURE] Inventory commit failed', invRes);
				await storeFailedPayment(env, `failed:${paypalOrderId}`, {
					paypalOrderId,
					reservationId,
					captureId,
					error: 'inventory_commit_failed',
					timestamp: Date.now(),
					paymentData,
				});
				// Fail the capture if inventory commit fails
				return jsonError(
					{
						error: 'inventory_commit_failed',
						message: 'Failed to commit inventory reservation',
						details: invRes.body,
					},
					invRes.status || 502,
				);
			}
			console.log('[PAYMENT.CAPTURE] Inventory committed successfully');
		} else {
			console.warn('[PAYMENT.CAPTURE] Inventory service not configured, skipping commit');
		}

		// Create order - MUST succeed
		if (env.ORDER_SERVICE && env.INTERNAL_SECRET) {
			// Map cart items to order format (only productId, qty, unitPrice, title)
			const orderItems = (paymentData.metadata?.items || []).map((item) => ({
				productId: item.productId,
				qty: item.qty,
				unitPrice: item.unitPrice,
				title: item.title || 'Product',
			}));

			const orderPayload = {
				reservationId,
				orderId,
				payment: {
					paymentId: captureId || paypalOrderId, // Order service requires paymentId
					amount: paymentData.amount,
					currency: paymentData.currency,
					method: 'paypal', // Optional but helpful
				},
				items: orderItems,
				address: paymentData.metadata?.address || null,
				shipping: paymentData.metadata?.shippingMethod || null,
				userId: paymentData.userId,
				email: paymentData.metadata?.email || null,
			};

			const ordRes = await internalCall(env.ORDER_SERVICE, '/orders/create', 'POST', orderPayload, env.INTERNAL_SECRET, userContext);

			if (!ordRes.ok) {
				console.error('[PAYMENT.CAPTURE] Order creation failed', ordRes);
				await storeFailedPayment(env, `order_failed:${paypalOrderId}`, {
					paypalOrderId,
					orderId,
					reservationId,
					captureId,
					error: 'order_creation_failed',
					response: ordRes.body,
					timestamp: Date.now(),
					payload: orderPayload,
				});
				// Fail the capture if order creation fails
				return jsonError(
					{
						error: 'order_creation_failed',
						message: 'Failed to create order',
						details: ordRes.body,
					},
					ordRes.status || 502,
				);
			}

			// Extract actual orderId from response if provided
			const createdOrderId = ordRes.body?.orderId || ordRes.body?.order_id || orderId;
			console.log('[PAYMENT.CAPTURE] Order created successfully:', createdOrderId);
			console.log('[PAYMENT.CAPTURE] Order response:', JSON.stringify(ordRes.body));

			// Update orderId to use the one from response
			orderId = createdOrderId;
		} else {
			console.warn('[PAYMENT.CAPTURE] Order service not configured, skipping order creation');
			return jsonError(
				{
					error: 'order_service_not_configured',
					message: 'Order service is not available',
				},
				503,
			);
		}

		// Update payment record
		if (env.DB) {
			try {
				await updatePaymentStatus(env, paypalOrderId, 'captured', captureId, capJson, Date.now());
				console.log('[PAYMENT.CAPTURE] Payment record updated');
			} catch (dbErr) {
				console.error('[PAYMENT.CAPTURE] DB update failed', dbErr);
			}
		}

		// Clean up KV
		await deletePaymentFromKV(env, paypalOrderId);

		console.log('[PAYMENT.CAPTURE] Capture process completed successfully');

		return jsonResponse({
			success: true,
			orderId,
			paypalOrderId,
			captureId,
			status: 'captured',
			raw: capJson,
		});
	} catch (err) {
		console.error('[PAYMENT.CAPTURE] Error', err);

		// Release inventory on error
		if (env.INVENTORY_SERVICE && env.INTERNAL_SECRET) {
			try {
				await internalCall(env.INVENTORY_SERVICE, '/inventory/release', 'POST', { reservationId }, env.INTERNAL_SECRET);
			} catch (e) {
				console.error('[PAYMENT.CAPTURE] Release failed', e);
			}
		}

		if (err.error === 'capture_failed') {
			return jsonError({ error: 'capture_failed', details: err.details }, err.status || 502);
		}
		if (err.error === 'not_captured') {
			return jsonError({ error: 'not_captured', details: err.details }, 400);
		}

		return jsonError({ error: 'server_error', message: String(err) }, 500);
	}
}

/**
 * GET /payment/paypal/verify/:orderId - Verify PayPal order
 */
export async function verifyPaymentHandler(req, env) {
	try {
		const { orderId } = req.params;
		const { ok, status, data } = await verifyPaypalOrder(env, orderId);
		return jsonResponse(data, status);
	} catch (err) {
		return jsonError({ error: 'verify_failed', message: String(err) }, 500);
	}
}
