/**
 * Authentication middleware
 */
import { verifyJWT } from '../helpers/jwt.js';
import { jsonRes, corsHeaders } from '../helpers/response.js';

export async function extractUser(req, env) {
	try {
		const auth = req.headers.get('Authorization') || '';
		if (!auth.startsWith('Bearer ')) return null;

		const token = auth.slice(7);
		const payload = await verifyJWT(token, env.JWT_SECRET);

		return payload;
	} catch (error) {
		console.error('extractUser error:', error);
		return null;
	}
}

export async function requireAuth(req, env) {
	const user = await extractUser(req, env);
	if (!user) {
		return new Response(JSON.stringify({ error: 'unauthorized', message: 'Valid token required' }), { status: 401, headers: corsHeaders });
	}
	return user;
}

export async function requireAdmin(req, env) {
	const user = await extractUser(req, env);
	if (!user || user.role !== 'admin') {
		return new Response(JSON.stringify({ error: 'forbidden', message: 'Admin access required' }), { status: 403, headers: corsHeaders });
	}
	return user;
}
