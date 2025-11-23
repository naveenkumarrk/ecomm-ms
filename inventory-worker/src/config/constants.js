/**
 * Inventory constants
 */

export const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, X-Timestamp, X-Signature, X-Dev-Mode, X-User-Id, X-User-Role',
};

export const SIGNATURE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
export const DEFAULT_RESERVATION_TTL = 900; // 15 minutes
export const LOCK_RETRY_ATTEMPTS = 3;
export const LOCK_RETRY_DELAY = 2000; // 2 seconds
