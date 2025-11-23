/**
 * Utility functions
 */

export function parseJSONSafe(v, fallback) {
	try {
		return v ? JSON.parse(v) : fallback;
	} catch {
		return fallback;
	}
}

export function nowSec() {
	return Math.floor(Date.now() / 1000);
}
