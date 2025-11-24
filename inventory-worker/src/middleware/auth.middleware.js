/**
 * Authentication middleware
 */
import { verifySignature } from '../helpers/hmac.js';
import { jsonError } from '../helpers/response.js';

export async function requireInternalAuth(req, env) {
	const ok = await verifySignature(req, env.INTERNAL_SECRET, env);
	if (!ok) {
		console.log('[requireInternalAuth] Signature verification failed');
		return jsonError({ error: 'unauthorized' }, 401);
	}
	return null; // Auth passed
}

export function extractUserContext(req) {
	const userId = req.headers.get('x-user-id');
	const role = req.headers.get('x-user-role');
	if (!userId) return null;
	return { userId, role: role || 'user' };
}
