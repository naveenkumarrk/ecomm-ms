/**
 * Order constants
 */

export const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, X-Timestamp, X-Signature, X-Dev-Mode, X-User-Id, X-User-Role',
};

export const SIGNATURE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
export const MAX_ORDERS_PER_USER = 50;
export const MAX_ORDERS_ADMIN = 100;
