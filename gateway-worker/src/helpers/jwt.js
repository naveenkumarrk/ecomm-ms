/**
 * JWT verification helpers
 */

export async function verifyJWT(token, secretBase64) {
	try {
		const [h, p, s] = token.split('.');
		if (!h || !p || !s) return null;

		const rawKey = Uint8Array.from(atob(secretBase64), (c) => c.charCodeAt(0));
		const cryptoKey = await crypto.subtle.importKey('raw', rawKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);

		const signature = Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

		const valid = await crypto.subtle.verify('HMAC', cryptoKey, signature, new TextEncoder().encode(`${h}.${p}`));

		if (!valid) return null;

		const payload = JSON.parse(
			decodeURIComponent(
				atob(p.replace(/-/g, '+').replace(/_/g, '/'))
					.split('')
					.map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
					.join(''),
			),
		);

		const epoch = Math.floor(Date.now() / 1000);
		if (payload.exp < epoch) return null;

		return payload;
	} catch (error) {
		console.error('verifyJWT error:', error);
		return null;
	}
}
