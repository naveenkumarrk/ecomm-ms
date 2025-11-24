/**
 * Payment storage service (KV and DB)
 */
import { parseJSONSafe } from '../helpers/utils.js';
import { PAYMENT_KV_TTL, FAILED_PAYMENT_TTL } from '../config/constants.js';

export async function storePaymentInKV(env, paypalOrderId, paymentData) {
	if (!env.PAYMENT_KV) return;
	await env.PAYMENT_KV.put(`payment:${paypalOrderId}`, JSON.stringify(paymentData), { expirationTtl: PAYMENT_KV_TTL });
}

export async function getPaymentFromKV(env, paypalOrderId) {
	if (!env.PAYMENT_KV) return null;
	const stored = await env.PAYMENT_KV.get(`payment:${paypalOrderId}`);
	return stored ? parseJSONSafe(stored, null) : null;
}

export async function deletePaymentFromKV(env, paypalOrderId) {
	if (!env.PAYMENT_KV) return;
	await env.PAYMENT_KV.delete(`payment:${paypalOrderId}`);
}

export async function storeFailedPayment(env, key, data) {
	if (!env.PAYMENT_KV) return;
	await env.PAYMENT_KV.put(key, JSON.stringify(data), { expirationTtl: FAILED_PAYMENT_TTL });
}
