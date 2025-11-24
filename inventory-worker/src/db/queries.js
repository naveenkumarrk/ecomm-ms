/**
 * Database query functions
 */

export async function getProductStock(env, productId) {
	return await env.DB.prepare('SELECT * FROM product_stock WHERE product_id = ?').bind(productId).first();
}

export async function reserveStock(env, productId, qty) {
	return await env.DB.prepare(
		`UPDATE product_stock 
     SET reserved = reserved + ?, updated_at = strftime('%s','now') 
     WHERE product_id = ? AND (stock - reserved) >= ?`,
	)
		.bind(qty, productId, qty)
		.run();
}

export async function releaseReservedStock(env, productId, qty) {
	return await env.DB.prepare(`UPDATE product_stock SET reserved = reserved - ? WHERE product_id = ?`).bind(qty, productId).run();
}

export async function commitStock(env, productId, qty) {
	return await env.DB.prepare(
		`UPDATE product_stock 
     SET stock = stock - ?, reserved = reserved - ?, updated_at = strftime('%s','now') 
     WHERE product_id = ?`,
	)
		.bind(qty, qty, productId)
		.run();
}

export async function createReservation(env, reservationId, userId, cartId, items, expiresAt, now) {
	return await env.DB.prepare(
		`INSERT OR REPLACE INTO reservations (
      reservation_id, user_id, cart_id, items, status, expires_at, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
	)
		.bind(reservationId, userId, cartId, JSON.stringify(items), expiresAt, now, now)
		.run();
}

export async function getReservation(env, reservationId) {
	return await env.DB.prepare('SELECT * FROM reservations WHERE reservation_id = ?').bind(reservationId).first();
}

export async function updateReservationStatus(env, reservationId, status, now) {
	return await env.DB.prepare(`UPDATE reservations SET status=?, updated_at=? WHERE reservation_id=?`)
		.bind(status, now, reservationId)
		.run();
}
