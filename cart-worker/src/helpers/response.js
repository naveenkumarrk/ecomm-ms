/**
 * Response helpers
 */
import { CORS_HEADERS } from '../config/constants.js';

export function corsHeaders() {
	return CORS_HEADERS;
}

export async function handleOptions() {
	return new Response(null, { status: 204, headers: corsHeaders() });
}

export function jsonResponse(body, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...corsHeaders() },
	});
}

export function errorResponse(message, details = null, status = 400) {
	return jsonResponse({ error: message, details }, status);
}
