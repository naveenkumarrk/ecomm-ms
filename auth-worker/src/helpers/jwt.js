/**
 * JWT signing and verification using HMAC-SHA256
 */
import { epoch } from './utils.js';

/**
 * Import crypto key from base64 secret
 */
function importKeyFromBase64(secretB64) {
	const raw = Uint8Array.from(atob(secretB64), (c) => c.charCodeAt(0));
	return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/**
 * Base64 URL encode
 */
function b64urlEncode(bytes) {
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

/**
 * Base64 URL decode
 */
function b64urlDecode(str) {
	str = str.replace(/-/g, '+').replace(/_/g, '/');
	while (str.length % 4) str += '=';
	return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

/**
 * Sign a JWT token
 * @param {object} payload - Token payload
 * @param {string} secretB64 - Base64 encoded secret
 * @param {number} ttl - Time to live in seconds
 * @returns {Promise<string>} - JWT token
 */
export async function signJWT(payload, secretB64, ttl = 86400) {
	const now = epoch();
	const exp = now + ttl;

	const header = { alg: 'HS256', typ: 'JWT' };
	const enc = new TextEncoder();

	const h = b64urlEncode(enc.encode(JSON.stringify(header)));
	const p = b64urlEncode(enc.encode(JSON.stringify({ ...payload, iat: now, exp })));

	const signingInput = `${h}.${p}`;
	const key = await importKeyFromBase64(secretB64);

	const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signingInput));
	const s = b64urlEncode(new Uint8Array(sig));

	return `${signingInput}.${s}`;
}

/**
 * Verify a JWT token
 * @param {string} token - JWT token
 * @param {string} secretB64 - Base64 encoded secret
 * @returns {Promise<object|null>} - Decoded payload or null if invalid
 */
export async function verifyJWT(token, secretB64) {
	try {
		const parts = token.split('.');
		if (parts.length !== 3) return null;

		const [h, p, s] = parts;
		const signingInput = `${h}.${p}`;

		const key = await importKeyFromBase64(secretB64);
		const enc = new TextEncoder();

		const sigBytes = b64urlDecode(s);
		const ok = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(signingInput));

		if (!ok) return null;

		const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
		if (payload.exp < epoch()) return null;

		return payload;
	} catch {
		return null;
	}
}
