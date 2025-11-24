/**
 * HMAC signature helpers
 */

export async function hmacHex(secret, message) {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey('raw', enc.encode(secret || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
	return Array.from(new Uint8Array(sig))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export async function signedHeadersFor(secret, method, path, body = '') {
	const ts = Date.now().toString();
	const bodyStr = typeof body === 'string' ? body : JSON.stringify(body || {});
	const msg = `${ts}|${method.toUpperCase()}|${path}|${bodyStr}`;
	const signature = await hmacHex(secret, msg);
	return {
		'x-timestamp': ts,
		'x-signature': signature,
		'content-type': 'application/json',
	};
}
