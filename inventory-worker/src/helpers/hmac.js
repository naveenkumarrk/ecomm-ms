/**
 * HMAC signature helpers
 */
import { constantTimeEqual } from './utils.js';
import { SIGNATURE_TIMEOUT } from '../config/constants.js';

export async function hmacHex(secret, message) {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey('raw', enc.encode(secret || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
	return Array.from(new Uint8Array(sig))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export async function verifySignature(req, secret, env) {
	const dev = req.headers.get('x-dev-mode');
	if (dev && env.DEV_SECRET && dev === env.DEV_SECRET) {
		console.log('[verifySignature] dev bypass used');
		return true;
	}

	if (!secret) {
		console.warn('[verifySignature] no INTERNAL_SECRET configured');
		return false;
	}

	const ts = req.headers.get('x-timestamp');
	const sig = req.headers.get('x-signature');
	if (!ts || !sig) {
		console.warn('[verifySignature] missing headers');
		return false;
	}

	const t = Number(ts);
	if (Number.isNaN(t)) return false;
	if (Math.abs(Date.now() - t) > SIGNATURE_TIMEOUT) return false;

	const url = new URL(req.url);
	const path = url.pathname + url.search;
	const body = ['GET', 'HEAD'].includes(req.method)
		? ''
		: await req
				.clone()
				.text()
				.catch(() => '');
	const msg = `${ts}|${req.method}|${path}|${body}`;
	const expected = await hmacHex(secret, msg);

	return constantTimeEqual(expected, sig);
}
