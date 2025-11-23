/**
 * Cart constants
 */

export const CART_TTL = 86400; // 24 hours
export const DEFAULT_CURRENCY = 'USD';
export const RESERVATION_TTL = 900; // 15 minutes

export const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-timestamp, x-signature, x-cart-id, x-user-id, x-user-role',
};
