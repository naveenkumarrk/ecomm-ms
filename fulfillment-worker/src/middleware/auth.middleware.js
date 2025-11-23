/**
 * Authentication middleware
 */
import { verifySignature } from '../helpers/hmac.js';
import { jsonError, corsHeaders } from '../helpers/response.js';

export async function requireInternalAuth(req, env) {
	const TEST_MODE = env.TEST_MODE === '1' || env.TEST_MODE === 'true';
	if (TEST_MODE) return null; // Test mode bypass

	const ok = await verifySignature(req, env.INTERNAL_SECRET);
	if (!ok) {
		return jsonError({ error: 'unauthenticated' }, 401);
	}
	return null; // Auth passed
}
