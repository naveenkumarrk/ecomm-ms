/**
 * Payment constants
 */

export const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, X-Timestamp, X-Signature, X-Dev-Mode, X-User-Id, X-User-Role',
	'Access-Control-Max-Age': '86400',
};

export const SIGNATURE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
export const PAYMENT_KV_TTL = 3600; // 1 hour
export const FAILED_PAYMENT_TTL = 86400 * 7; // 7 days
