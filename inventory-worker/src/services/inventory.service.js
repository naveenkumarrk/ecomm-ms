/**
 * Inventory business logic service
 */
import {
	getProductStock,
	reserveStock,
	releaseReservedStock,
	commitStock,
	createReservation,
	getReservation,
	updateReservationStatus,
} from '../db/queries.js';
import { acquireLock, releaseLock } from './lock.service.js';
import { nowSec } from '../helpers/utils.js';
import { DEFAULT_RESERVATION_TTL } from '../config/constants.js';

export async function reserveInventory(env, reservationId, userId, cartId, items, ttl) {
	const now = nowSec();
	const expiresAt = now + Number(ttl || DEFAULT_RESERVATION_TTL);
	const locked = [];
	const applied = [];

	try {
		// Process each item
		for (const it of items) {
			const productId = it.productId;
			const qty = Number(it.qty || 0);

			if (!productId || qty <= 0) {
				const err = { error: 'invalid_item', productId };
				err.applied = applied;
				err.locked = locked;
				throw err;
			}

			// Check stock
			const row = await getProductStock(env, productId);
			if (!row) {
				const err = { error: 'product_not_found', productId };
				err.applied = applied;
				err.locked = locked;
				throw err;
			}

			const available = (row.stock || 0) - (row.reserved || 0);
			if (available < qty) {
				const err = { error: 'INSUFFICIENT_STOCK', productId, available, requested: qty };
				err.applied = applied;
				err.locked = locked;
				throw err;
			}

			// Acquire lock
			const owner = `res-${reservationId}`;
			const lock = await acquireLock(env, productId, owner, ttl);
			if (!lock.ok) {
				const err = { error: lock.error || 'locked', message: lock.message };
				err.applied = applied;
				err.locked = locked;
				throw err;
			}

			if (lock.key) locked.push({ productId, owner });

			// Reserve stock
			const upd = await reserveStock(env, productId, qty);
			const changes = upd.meta?.changes || upd.changes || 0;

			if (!upd.success || changes === 0) {
				const err = { error: 'INSUFFICIENT_STOCK', productId };
				err.applied = applied;
				err.locked = locked;
				throw err;
			}

			applied.push({ productId, qty });
		}

		// Create reservation record
		await createReservation(env, reservationId, userId, cartId, items, expiresAt, now);

		return { reservationId, expiresAt, items: applied, locked };
	} catch (err) {
		// Attach context for rollback
		if (err && typeof err === 'object' && !err.applied) {
			err.applied = applied;
			err.locked = locked;
		}
		throw err;
	}
}

export async function rollbackReservation(env, applied, locked) {
	// Rollback applied reservations
	for (const r of applied) {
		try {
			await releaseReservedStock(env, r.productId, r.qty);
			console.log(`[rollbackReservation] Rolled back ${r.productId}`);
		} catch (e) {
			console.error(`[rollbackReservation] Rollback error for ${r.productId}`, e);
		}
	}

	// Release locks
	for (const l of locked) {
		try {
			await releaseLock(env, l.productId, l.owner);
		} catch (e) {
			console.error(`[rollbackReservation] Release error for ${l.productId}`, e);
		}
	}
}

export async function commitReservation(env, reservationId) {
	const res = await getReservation(env, reservationId);
	if (!res) {
		throw { error: 'not_found' };
	}

	if (res.status !== 'active') {
		throw { error: 'not_active', status: res.status };
	}

	const items = JSON.parse(res.items || '[]');

	// Deduct stock and reserved
	for (const it of items) {
		await commitStock(env, it.productId, it.qty);

		// Release lock
		if (env.INVENTORY_LOCK_KV) {
			try {
				await env.INVENTORY_LOCK_KV.delete(`lock:product:${it.productId}`);
			} catch (e) {
				console.error(`[commitReservation] Unlock error for ${it.productId}`, e);
			}
		}
	}

	// Update reservation status
	await updateReservationStatus(env, reservationId, 'committed', nowSec());

	return { committed: true, reservationId };
}

export async function releaseReservation(env, reservationId) {
	const row = await getReservation(env, reservationId);
	if (!row) {
		throw { error: 'not_found' };
	}

	// Only release if active
	if (row.status === 'active') {
		const items = JSON.parse(row.items || '[]');

		for (const it of items) {
			await releaseReservedStock(env, it.productId, it.qty);

			// Release lock
			if (env.INVENTORY_LOCK_KV) {
				try {
					await env.INVENTORY_LOCK_KV.delete(`lock:product:${it.productId}`);
				} catch (e) {
					console.error(`[releaseReservation] Unlock error for ${it.productId}`, e);
				}
			}
		}
	}

	// Update reservation status
	await updateReservationStatus(env, reservationId, 'released', nowSec());

	return { released: true, reservationId };
}
