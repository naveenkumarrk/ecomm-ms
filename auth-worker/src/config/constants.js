/**
 * Constants and configuration values
 */

export const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': '*',
	'Access-Control-Allow-Headers': '*',
};

export const DEFAULT_TOKEN_TTL = 86400; // 24 hours in seconds

export const PBKDF2_ITERATIONS = 20000;

export const ROLES = {
	USER: 'user',
	ADMIN: 'admin',
};
