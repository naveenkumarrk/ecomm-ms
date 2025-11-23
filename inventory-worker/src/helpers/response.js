/**
 * Response helpers
 */
import { CORS_HEADERS } from '../config/constants.js';

export function jsonResponse(body, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
	});
}

export function jsonError(obj, status = 500) {
	return new Response(JSON.stringify(obj), {
		status,
		headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
	});
}

export function corsHeaders() {
	return CORS_HEADERS;
}
