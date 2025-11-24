/**
 * Utility functions
 */

export function constantTimeEqual(a = '', b = '') {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

export function parseJSONSafe(v, fallback) {
	try {
		return v ? JSON.parse(v) : fallback;
	} catch {
		return fallback;
	}
}
