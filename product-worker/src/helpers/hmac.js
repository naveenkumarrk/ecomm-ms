/**
 * HMAC signature helpers for internal service calls
 */

export async function hmacSHA256Hex(secret, message) {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey('raw', enc.encode(secret || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
	return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signedHeadersFor(secret, method, path, body = '') {
	const ts = Date.now().toString();
	const bodyText = typeof body === 'string' ? body : JSON.stringify(body || {});
	const msg = `${ts}|${method.toUpperCase()}|${path}|${bodyText}`;
	const signature = await hmacSHA256Hex(secret, msg);
	return {
		'x-timestamp': ts,
		'x-signature': signature,
		'content-type': 'application/json',
	};
}

export async function callInternal(url, path, method, body, secret) {
	const full = url.replace(/\/$/, '') + path;
	const bodyText = body ? JSON.stringify(body) : '';
	const headers = secret
		? await signedHeadersFor(secret, method, new URL(full).pathname + new URL(full).search, bodyText)
		: { 'Content-Type': 'application/json' };
	const res = await fetch(full, { method, headers, body: bodyText || undefined });
	const text = await res.text();
	try {
		return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null };
	} catch {
		return { ok: res.ok, status: res.status, body: text };
	}
}
