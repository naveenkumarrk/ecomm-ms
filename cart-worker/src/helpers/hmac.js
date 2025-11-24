/**
 * HMAC signature helpers for internal service calls
 */

export async function hmac(secret, message) {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey('raw', enc.encode(secret || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
	return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function fetchWithInternalAuth(baseUrl, path, method, body, secret) {
	const url = baseUrl.replace(/\/$/, '') + path;
	const ts = Date.now().toString();
	const bodyText = body ? JSON.stringify(body) : '';
	const msg = `${ts}|${method}|${path}|${bodyText}`;
	const signature = await hmac(secret, msg);

	const headers = {
		'x-timestamp': ts,
		'x-signature': signature,
		'content-type': 'application/json',
	};

	const res = await fetch(url, {
		method,
		headers,
		body: bodyText || undefined,
	});

	const txt = await res.text();
	try {
		return {
			ok: res.ok,
			status: res.status,
			body: txt ? JSON.parse(txt) : null,
		};
	} catch {
		return { ok: res.ok, status: res.status, body: txt };
	}
}
