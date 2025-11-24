/**
 * Inventory request handlers
 */
import { jsonResponse, jsonError } from '../helpers/response.js';
import { requireInternalAuth } from '../middleware/auth.middleware.js';
import { reserveInventory, rollbackReservation, commitReservation, releaseReservation } from '../services/inventory.service.js';
import { getProductStock } from '../db/queries.js';
import { reserveSchema, commitSchema, releaseSchema, productStockSchema } from '../validators/inventory.validator.js';

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
 * POST /inventory/reserve - Reserve inventory
 */
export async function reserveHandler(req, env) {
	console.log('[INVENTORY.RESERVE] Starting reservation');

	const authError = await requireInternalAuth(req, env);
	if (authError) return authError;

	const validation = await validateBody(reserveSchema)(req);
	if (validation.error) {
		return jsonError({ error: 'validation_error', details: validation.error }, 400);
	}

	const { reservationId, cartId, userId, items, ttl } = validation.value;

	console.log('[INVENTORY.RESERVE] Request:', { reservationId, userId, itemCount: items.length });

	try {
		const result = await reserveInventory(env, reservationId, userId, cartId, items, ttl);
		console.log(`[INVENTORY.RESERVE] Reservation created: ${reservationId}`);
		return jsonResponse(result);
	} catch (err) {
		console.error('[INVENTORY.RESERVE] Error, rolling back', err);

		// Extract applied items and locked items from error context
		const applied = (err && err.applied) || [];
		const locked = (err && err.locked) || [];

		await rollbackReservation(env, applied, locked);

		if (err && typeof err === 'object') {
			if (err.error === 'INSUFFICIENT_STOCK') {
				return jsonError(
					{
						error: 'INSUFFICIENT_STOCK',
						productId: err.productId,
						available: err.available,
						requested: err.requested,
					},
					409,
				);
			}
			if (err.error === 'product_not_found') {
				return jsonError({ error: 'product_not_found', productId: err.productId }, 404);
			}
			if (err.error === 'locked') {
				return jsonError({ error: 'product_locked', message: err.message || 'locked' }, 409);
			}
		}

		return jsonError(
			{
				error: 'reservation_failed',
				message: String(err),
				details: err,
			},
			500,
		);
	}
}

/**
 * POST /inventory/commit - Commit reservation
 */
export async function commitHandler(req, env) {
	console.log('[INVENTORY.COMMIT] Starting commit');

	const authError = await requireInternalAuth(req, env);
	if (authError) return authError;

	const validation = await validateBody(commitSchema)(req);
	if (validation.error) {
		return jsonError({ error: 'validation_error', details: validation.error }, 400);
	}

	const { reservationId } = validation.value;

	console.log(`[INVENTORY.COMMIT] Committing reservation: ${reservationId}`);

	try {
		const result = await commitReservation(env, reservationId);
		console.log(`[INVENTORY.COMMIT] Reservation committed: ${reservationId}`);
		return jsonResponse(result);
	} catch (e) {
		console.error('[INVENTORY.COMMIT] Error', e);
		if (e.error === 'not_found') {
			return jsonError({ error: 'not_found' }, 404);
		}
		if (e.error === 'not_active') {
			return jsonError({ error: 'not_active', status: e.status }, 409);
		}
		return jsonError({ error: 'commit_failed', message: String(e) }, 500);
	}
}

/**
 * POST /inventory/release - Release reservation
 */
export async function releaseHandler(req, env) {
	console.log('[INVENTORY.RELEASE] Starting release');

	const authError = await requireInternalAuth(req, env);
	if (authError) return authError;

	const validation = await validateBody(releaseSchema)(req);
	if (validation.error) {
		return jsonError({ error: 'validation_error', details: validation.error }, 400);
	}

	const { reservationId } = validation.value;

	console.log(`[INVENTORY.RELEASE] Releasing reservation: ${reservationId}`);

	try {
		const result = await releaseReservation(env, reservationId);
		console.log(`[INVENTORY.RELEASE] Reservation released: ${reservationId}`);
		return jsonResponse(result);
	} catch (e) {
		console.error('[INVENTORY.RELEASE] Error', e);
		if (e.error === 'not_found') {
			return jsonError({ error: 'not_found' }, 404);
		}
		return jsonError({ error: 'release_failed', message: String(e) }, 500);
	}
}

/**
 * POST /inventory/product-stock - Get product stock
 */
export async function getProductStockHandler(req, env) {
	const authError = await requireInternalAuth(req, env);
	if (authError) return authError;

	const validation = await validateBody(productStockSchema)(req);
	if (validation.error) {
		return jsonError({ error: 'validation_error', details: validation.error }, 400);
	}

	const { productId } = validation.value;

	const row = await getProductStock(env, productId);

	if (!row) {
		return jsonResponse({ productId, stock: 0, reserved: 0 });
	}

	return jsonResponse({
		productId: row.product_id,
		stock: row.stock || 0,
		reserved: row.reserved || 0,
	});
}

/**
 * GET /debug/product/:productId - Debug endpoint
 */
export async function debugProductHandler(req, env) {
	const productId = req.params.productId;

	if (!productId) {
		return jsonError({ error: 'missing_productId' }, 400);
	}

	let stockRow = null;
	let lockValue = null;
	let reservation = null;

	try {
		stockRow = await getProductStock(env, productId);

		if (env.INVENTORY_LOCK_KV) {
			const key = `lock:product:${productId}`;
			lockValue = await env.INVENTORY_LOCK_KV.get(key);

			if (lockValue && lockValue.startsWith('res-')) {
				const reservationId = lockValue.replace('res-', '');
				reservation = await env.DB.prepare('SELECT * FROM reservations WHERE reservation_id = ?').bind(reservationId).first();
			}
		}
	} catch (err) {
		return jsonError({ error: 'debug_query_failed', message: String(err) }, 500);
	}

	return jsonResponse({
		productId,
		stock: stockRow?.stock ?? 0,
		reserved: stockRow?.reserved ?? 0,
		lock: lockValue || null,
		reservation,
	});
}

/**
 * GET /debug/locks/:productId - Debug lock endpoint
 */
export async function debugLockHandler(req, env) {
	if (!env.INVENTORY_LOCK_KV) {
		return jsonError({ error: 'KV not configured' }, 500);
	}

	try {
		const key = `lock:product:${req.params.productId}`;
		const lock = await env.INVENTORY_LOCK_KV.get(key);
		return jsonResponse({ productId: req.params.productId, lock });
	} catch (e) {
		return jsonError({ error: 'lock_check_failed', message: String(e) }, 500);
	}
}
