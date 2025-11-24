/**
 * Authentication middleware
 */
import { verifySignature } from '../helpers/hmac.js';
import { jsonError } from '../helpers/response.js';

export async function requireInternalAuth(req, env) {
	const ok = await verifySignature(req, env.INTERNAL_SECRET, env);
	if (!ok) {
		return jsonError({ error: 'unauthorized' }, 401);
	}
	return null; // Auth passed
}

export function requireAdmin(req) {
	const requestUserRole = req.headers.get('x-user-role');
	if (requestUserRole !== 'admin') {
		return jsonError({ error: 'admin_only' }, 403);
	}
	return null; // Auth passed
}

export function checkUserAccess(req, userId) {
	const requestUserId = req.headers.get('x-user-id');
	const requestUserRole = req.headers.get('x-user-role');

	if (requestUserId !== userId && requestUserRole !== 'admin') {
		return jsonError({ error: 'forbidden' }, 403);
	}
	return null; // Access granted
}
