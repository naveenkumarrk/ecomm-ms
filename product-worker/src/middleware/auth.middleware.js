/**
 * Authentication middleware for admin routes
 */
import { hmacSHA256Hex } from '../helpers/hmac.js';
import { jsonResponse, corsHeaders } from '../helpers/response.js';

export async function verifyAdminAuth(req, env) {
	const ts = req.headers.get('x-timestamp');
	const sig = req.headers.get('x-signature');

	if (!env.ADMIN_SECRET) {
		return new Response('admin_secret_not_configured', { status: 500, headers: corsHeaders() });
	}

	if (!ts || !sig) {
		return new Response('unauthorized', { status: 401, headers: corsHeaders() });
	}

	const contentType = req.headers.get('content-type') || '';
	const isMultipart = contentType.includes('multipart/form-data');

	// For multipart, verify signature with empty body; for direct binary, use body hash
	const bodyText = isMultipart
		? ''
		: await req
				.clone()
				.text()
				.catch(() => '');
	const msg = `${ts}|${req.method}|${new URL(req.url).pathname}|${bodyText}`;
	const expected = await hmacSHA256Hex(env.ADMIN_SECRET, msg);

	if (expected !== sig) {
		return new Response('unauthorized', { status: 401, headers: corsHeaders() });
	}

	return null; // Auth passed
}
