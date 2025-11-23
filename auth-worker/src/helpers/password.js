/**
 * Password hashing and verification using PBKDF2
 */
import { PBKDF2_ITERATIONS } from '../config/constants.js';

/**
 * Hash a password using PBKDF2
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Encoded hash string
 */
export async function hashPassword(password) {
	const enc = new TextEncoder();
	const salt = crypto.getRandomValues(new Uint8Array(16));

	const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);

	const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256);

	const hash = new Uint8Array(bits);
	const saltHex = [...salt].map((b) => b.toString(16).padStart(2, '0')).join('');
	const hashHex = [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');

	return `pbkdf2$${PBKDF2_ITERATIONS}$${saltHex}$${hashHex}`;
}

/**
 * Verify a password against a hash
 * @param {string} encoded - Encoded hash string
 * @param {string} password - Plain text password to verify
 * @returns {Promise<boolean>} - True if password matches
 */
export async function verifyPassword(encoded, password) {
	try {
		const [type, iterStr, saltHex, hashHex] = encoded.split('$');
		if (type !== 'pbkdf2') return false;

		const iterations = Number(iterStr);
		const salt = new Uint8Array(saltHex.match(/.{2}/g).map((h) => parseInt(h, 16)));
		const expected = new Uint8Array(hashHex.match(/.{2}/g).map((h) => parseInt(h, 16)));

		const enc = new TextEncoder();
		const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);

		const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, expected.length * 8);

		const actual = new Uint8Array(bits);

		if (actual.length !== expected.length) return false;

		// Constant-time comparison
		let diff = 0;
		for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
		return diff === 0;
	} catch {
		return false;
	}
}
