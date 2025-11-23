/**
 * Response helpers
 */
import { CORS_HEADERS } from '../config/constants.js';

export const json = (data, status = 200) =>
	new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
	});

export const jsonError = (error, message, status = 400) => json({ error, message }, status);
