/**
 * Order request handlers
 */
import { jsonResponse, jsonError } from '../helpers/response.js';
import { requireInternalAuth, requireAdmin, checkUserAccess } from '../middleware/auth.middleware.js';
import { getOrderById, getOrdersByUserId, getAllOrders, checkOrderExists, createOrder, updateOrderStatus } from '../db/queries.js';
import { transformOrderRow, transformOrderRows } from '../services/order.service.js';
import { createOrderSchema } from '../validators/order.validator.js';
import { MAX_ORDERS_PER_USER, MAX_ORDERS_ADMIN } from '../config/constants.js';

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
 * POST /orders/create - Create order (internal)
 */
export async function createOrderHandler(req, env) {
	console.log('[ORDERS.CREATE] start');

	const authError = await requireInternalAuth(req, env);
	if (authError) return authError;

	const validation = await validateBody(createOrderSchema)(req);
	if (validation.error) {
		return jsonError({ error: 'validation_error', details: validation.error }, 400);
	}

	const payload = validation.value;
	const { reservationId, orderId: providedOrderId, payment, userId, email, items = [], address = null, shipping = null } = payload;

	if (!env.DB) {
		return jsonError({ error: 'database_not_configured' }, 500);
	}

	try {
		const orderId = providedOrderId || `order_${crypto.randomUUID()}`;

		// Check existing by orderId or reservationId
		const existing = await checkOrderExists(env, orderId, reservationId);

		if (existing) {
			return jsonResponse(
				{
					ok: true,
					orderId: existing.order_id,
					message: 'order_already_exists',
				},
				200,
			);
		}

		const now = Date.now();

		await createOrder(env, {
			orderId,
			reservationId,
			userId,
			email,
			amount: payment.amount || null,
			currency: payment.currency || null,
			status: 'paid',
			items,
			address,
			shipping,
			payment,
			now,
		});

		// Verify insertion
		const verify = await getOrderById(env, orderId);
		if (!verify) {
			return jsonError({ error: 'insertion_verification_failed', orderId }, 500);
		}

		return jsonResponse({ ok: true, orderId, created_at: now }, 200);
	} catch (err) {
		console.error('order create error', err);
		return jsonError({ error: 'database_error', message: String(err) }, 500);
	}
}

/**
 * GET /orders/:orderId - Get order by ID
 */
export async function getOrderByIdHandler(req, env) {
	try {
		if (!env.DB) {
			return jsonError({ error: 'database_not_configured' }, 500);
		}

		const { orderId } = req.params;
		const row = await getOrderById(env, orderId);

		if (!row) {
			return jsonError({ error: 'not_found' }, 404);
		}

		const order = transformOrderRow(row);
		return jsonResponse(order);
	} catch (err) {
		console.error('get order error', err);
		return jsonError({ error: 'database_error', message: String(err) }, 500);
	}
}

/**
 * GET /orders/user/:userId - Get user orders
 */
export async function getUserOrdersHandler(req, env) {
	try {
		if (!env.DB) {
			return jsonError({ error: 'database_not_configured' }, 500);
		}

		const { userId } = req.params;

		// Verify user can only access their own orders (unless admin)
		const accessError = checkUserAccess(req, userId);
		if (accessError) return accessError;

		const rows = await getOrdersByUserId(env, userId, MAX_ORDERS_PER_USER);
		const orders = transformOrderRows(rows);

		return jsonResponse({ orders });
	} catch (err) {
		console.error('get user orders error', err);
		return jsonError({ error: 'database_error', message: String(err) }, 500);
	}
}

/**
 * GET /debug/list-orders - List all orders (admin)
 */
export async function listAllOrdersHandler(req, env) {
	const adminError = requireAdmin(req);
	if (adminError) return adminError;

	if (!env.DB) {
		return jsonError({ error: 'database_not_configured' }, 500);
	}

	const rows = await getAllOrders(env, MAX_ORDERS_ADMIN);
	const orders = transformOrderRows(rows);

	return jsonResponse({ count: orders.length, orders });
}

/**
 * PUT /orders/:orderId/status - Update order status (admin)
 */
export async function updateOrderStatusHandler(req, env) {
	const adminError = requireAdmin(req);
	if (adminError) return adminError;

	try {
		if (!env.DB) {
			return jsonError({ error: 'database_not_configured' }, 500);
		}

		const { orderId } = req.params;
		const body = await req.json().catch(() => ({}));
		const { status } = body;

		if (!status) {
			return jsonError({ error: 'status is required' }, 400);
		}

		const validStatuses = ['paid', 'processing', 'shipped', 'delivered', 'cancelled'];
		if (!validStatuses.includes(status)) {
			return jsonError({ error: 'invalid_status', validStatuses }, 400);
		}

		const now = Date.now();
		await updateOrderStatus(env, orderId, status, now);

		return jsonResponse({ ok: true, orderId, status, updated_at: now });
	} catch (err) {
		console.error('update order status error', err);
		return jsonError({ error: 'database_error', message: String(err) }, 500);
	}
}
