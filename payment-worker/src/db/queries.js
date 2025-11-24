/**
 * Database query functions
 */

export async function createPayment(env, paymentId, reservationId, paypalOrderId, userId, amount, currency, metadata, now) {
	return await env.DB.prepare(
		`INSERT INTO payments (
      payment_id, reservation_id, paypal_order_id, user_id, amount, currency, 
      status, metadata_json, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	)
		.bind(paymentId, reservationId, paypalOrderId, userId, amount, currency, 'pending', JSON.stringify(metadata || {}), now, now)
		.run();
}

export async function getPaymentByPaypalOrderId(env, paypalOrderId) {
	return await env.DB.prepare('SELECT * FROM payments WHERE paypal_order_id = ?').bind(paypalOrderId).first();
}

export async function updatePaymentStatus(env, paypalOrderId, status, captureId, rawPaypal, now) {
	return await env.DB.prepare(
		'UPDATE payments SET status = ?, paypal_capture_id = ?, raw_paypal = ?, updated_at = ? WHERE paypal_order_id = ?',
	)
		.bind(status, captureId, JSON.stringify(rawPaypal), now, paypalOrderId)
		.run();
}
