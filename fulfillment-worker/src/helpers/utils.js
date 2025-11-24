/**
 * Utility functions
 */

export function nowSec() {
	return Math.floor(Date.now() / 1000);
}

export function formatDateDaysFromNow(days) {
	const d = new Date(Date.now() + days * 24 * 3600 * 1000);
	return d.toISOString().slice(0, 10);
}

export function constantTimeEqual(a = '', b = '') {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}
