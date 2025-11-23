/**
 * Authentication middleware
 */
import { verifyJWT } from '../helpers/jwt.js';
import { dbGet } from '../db/helpers.js';
import { SESSION_QUERIES } from '../db/queries.js';
import { epoch } from '../helpers/utils.js';
import { json } from '../helpers/response.js';

/**
 * Extract user from request (optional auth)
 * Returns user payload or null
 */
export async function getUser(req, env) {
	const auth = req.headers.get('Authorization') || '';
	if (!auth.startsWith('Bearer ')) return null;

	const secret = env.JWT_SECRET;
	if (!secret) {
		console.error('JWT_SECRET missing');
		return null;
	}

	const token = auth.slice(7);
	const payload = await verifyJWT(token, secret);
	if (!payload) return null;

	// Validate session
	const session = await dbGet(env, SESSION_QUERIES.FIND_BY_ID, [payload.sid]);
	if (!session) return null;
	if (session.expires_at <= epoch()) return null;

	return payload;
}

/**
 * Require authentication
 * Returns user payload or Response with 401
 */
export async function requireAuth(req, env) {
	const u = await getUser(req, env);
	if (!u) return json({ error: 'unauthorized', message: 'Valid token required' }, 401);
	return u;
}
