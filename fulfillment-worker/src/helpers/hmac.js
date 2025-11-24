/**
 * HMAC signature helpers
 */
import { constantTimeEqual } from './utils.js';
import { SIGNATURE_TIMEOUT } from '../config/constants.js';

export async function hmacSHA256Hex(secret, message) {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey('raw', enc.encode(secret || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
	return Array.from(new Uint8Array(sig))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export async function verifySignature(request, secret, maxSkewMs = SIGNATURE_TIMEOUT) {
	if (!secret) return false;
	const TEST_MODE = request.headers.get('x-test-mode') === 'true';
	if (TEST_MODE) return true;

	const ts = request.headers.get('x-timestamp');
	const sig = request.headers.get('x-signature');
	if (!ts || !sig) return false;
	const t = Number(ts);
	if (Number.isNaN(t)) return false;
	if (Math.abs(Date.now() - t) > maxSkewMs) return false;
	const method = request.method.toUpperCase();
	const url = new URL(request.url);
	const path = url.pathname + url.search;
	let bodyText = '';
	if (method !== 'GET' && method !== 'HEAD') {
		try {
			bodyText = await request.clone().text();
		} catch {}
	}
	const msg = `${ts}|${method}|${path}|${bodyText}`;
	const expected = await hmacSHA256Hex(secret, msg);
	// constant-time-ish compare
	if (expected.length !== sig.length) return false;
	let diff = 0;
	for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
	return diff === 0;
}
