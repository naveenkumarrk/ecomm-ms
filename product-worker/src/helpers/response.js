/**
 * Response helpers
 */
import { CORS_HEADERS } from '../config/constants.js';

export function jsonResponse(body, status = 200, extra = {}) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...extra, ...CORS_HEADERS },
	});
}

export function corsHeaders() {
	return CORS_HEADERS;
}

export async function handleOptions() {
	return new Response(null, {
		status: 204,
		headers: CORS_HEADERS,
	});
}
