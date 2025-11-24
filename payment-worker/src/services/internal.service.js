/**
 * Internal service call helpers
 */
import { signedHeadersFor } from '../helpers/hmac.js';

export async function internalCall(serviceBinding, path, method = 'POST', body = null, secret, userContext = null) {
	const bodyText = body ? JSON.stringify(body) : '';
	const headers = await signedHeadersFor(secret, method, path, bodyText);

	// Add user context if available
	if (userContext) {
		headers['x-user-id'] = userContext.userId;
		headers['x-user-role'] = userContext.role;
	}

	console.log(`[internalCall] Calling ${method} ${path}`);

	try {
		if (!serviceBinding) {
			console.error('[internalCall] Service binding is null/undefined');
			return { ok: false, status: 503, body: { error: 'service_binding_not_configured' } };
		}

		if (typeof serviceBinding.fetch !== 'function') {
			console.error('[internalCall] Service binding does not have fetch method');
			return { ok: false, status: 503, body: { error: 'invalid_service_binding' } };
		}

		const req = new Request(`https://internal${path}`, {
			method,
			headers,
			body: bodyText || undefined,
		});

		const res = await serviceBinding.fetch(req);
		const txt = await res.text();

		console.log(`[internalCall] Response: ${res.status}`, txt.substring(0, 200));

		try {
			return { ok: res.ok, status: res.status, body: txt ? JSON.parse(txt) : null };
		} catch {
			return { ok: res.ok, status: res.status, body: txt };
		}
	} catch (err) {
		console.error(`[internalCall] Error:`, err.message, err.stack);
		return { ok: false, status: 503, body: { error: 'service_unavailable', message: String(err) } };
	}
}
