/**
 * Database query functions
 */

export async function getOrderById(env, orderId) {
	return await env.DB.prepare('SELECT * FROM orders WHERE order_id = ?').bind(orderId).first();
}

export async function getOrdersByUserId(env, userId, limit = 50) {
	return await env.DB.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').bind(userId, limit).all();
}

export async function getAllOrders(env, limit = 100) {
	return await env.DB.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?').bind(limit).all();
}

export async function checkOrderExists(env, orderId, reservationId) {
	return await env.DB.prepare('SELECT order_id FROM orders WHERE order_id = ? OR reservation_id = ?').bind(orderId, reservationId).first();
}

export async function createOrder(env, orderData) {
	const { orderId, reservationId, userId, email, amount, currency, status, items, address, shipping, payment, now } = orderData;
	return await env.DB.prepare(
		`INSERT INTO orders (
      order_id, reservation_id, user_id, email, amount, currency, status, 
      items_json, address_json, shipping_json, payment_json, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	)
		.bind(
			orderId,
			reservationId,
			userId || null,
			email || null,
			amount || null,
			currency || null,
			status,
			JSON.stringify(items || []),
			JSON.stringify(address || null),
			JSON.stringify(shipping || null),
			JSON.stringify(payment),
			now,
			now,
		)
		.run();
}

export async function updateOrderStatus(env, orderId, status, now) {
	return await env.DB.prepare(`UPDATE orders SET status=?, updated_at=? WHERE order_id=?`).bind(status, now, orderId).run();
}
