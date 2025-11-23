/**
 * Constants and configuration values
 */

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
export const DEFAULT_PRODUCT_LIMIT = 20;
export const DEFAULT_PRODUCT_OFFSET = 0;
export const CACHE_CONTROL = 'public, max-age=31536000'; // 1 year

export const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-timestamp, x-signature',
};
