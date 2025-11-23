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

		// Capture via PayPal
		const { captureId, raw } = await capturePaypalOrder(env, paypalOrderId);
		capJson = raw;

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
