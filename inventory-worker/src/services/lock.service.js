/**
 * KV lock service for inventory operations
 */
import { nowSec } from '../helpers/utils.js';
import { sleep } from '../helpers/utils.js';
import { LOCK_RETRY_ATTEMPTS, LOCK_RETRY_DELAY } from '../config/constants.js';

export async function acquireLock(env, productId, owner, requestedTtl = 900) {
	if (!env.INVENTORY_LOCK_KV) return { ok: true };

	const key = `lock:product:${productId}`;
	const ttl = Math.max(60, Number(requestedTtl) || 900);

	for (let attempt = 1; attempt <= LOCK_RETRY_ATTEMPTS; attempt++) {
		try {
			const existing = await env.INVENTORY_LOCK_KV.get(key);
			if (!existing) {
				await env.INVENTORY_LOCK_KV.put(key, owner, { expirationTtl: ttl });
				const verify = await env.INVENTORY_LOCK_KV.get(key);
				if (verify === owner) {
					console.log(`[acquireLock] Lock acquired for ${productId} by ${owner}`);
					return { ok: true, key, ttl };
				}
			} else if (existing === owner) {
				console.log(`[acquireLock] Lock already held by ${owner}`);
				return { ok: true, key, ttl };
			} else if (existing.startsWith('res-')) {
				// Check if reservation is still active
				try {
					const oldResId = existing.replace('res-', '');
					const row = await env.DB.prepare('SELECT status, expires_at FROM reservations WHERE reservation_id = ?').bind(oldResId).first();

					if (!row || row.status !== 'active' || row.expires_at < nowSec()) {
						console.log(`[acquireLock] Stealing expired lock from ${existing}`);
						await env.INVENTORY_LOCK_KV.delete(key);
						await env.INVENTORY_LOCK_KV.put(key, owner, { expirationTtl: ttl });
						const verify2 = await env.INVENTORY_LOCK_KV.get(key);
						if (verify2 === owner) return { ok: true, key, ttl };
					}
				} catch (e) {
					console.error('[acquireLock] Error checking reservation', e);
				}
			}
		} catch (e) {
			console.error('[acquireLock] KV error', e);
			return { ok: false, error: 'kv_error', message: String(e) };
		}

		if (attempt < LOCK_RETRY_ATTEMPTS) {
			console.log(`[acquireLock] Lock held by another, retrying ${attempt}/${LOCK_RETRY_ATTEMPTS}`);
			await sleep(LOCK_RETRY_DELAY);
		}
	}

	console.error(`[acquireLock] Failed to acquire lock for ${productId}`);
	return { ok: false, error: 'locked', message: 'product locked by another reservation' };
}

export async function releaseLock(env, productId, owner) {
	if (!env.INVENTORY_LOCK_KV) return true;

	const key = `lock:product:${productId}`;
	try {
		const existing = await env.INVENTORY_LOCK_KV.get(key);
		if (existing === owner) {
			await env.INVENTORY_LOCK_KV.delete(key);
			console.log(`[releaseLock] Lock released for ${productId}`);
			return true;
		}
		console.warn(`[releaseLock] Lock not owned by ${owner}, current: ${existing}`);
		return false;
	} catch (e) {
		console.error('[releaseLock] error', e);
		return false;
	}
}
