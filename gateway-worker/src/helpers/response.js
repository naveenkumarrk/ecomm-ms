/**
 * Response helpers
 */
import { CORS_HEADERS } from '../config/constants.js';

export const jsonRes = (data, status = 200) =>
	new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
	});

export const corsHeaders = CORS_HEADERS;
