/**
 * Utility functions
 */

/**
 * Get current epoch timestamp in seconds
 */
export const epoch = () => Math.floor(Date.now() / 1000);

/**
 * Parse JSON safely with fallback
 */
export function parseJSON(row, fallback = {}) {
	try {
		return JSON.parse(row?.data || '{}');
	} catch {
		return fallback;
	}
}

/**
 * Parse user data from row
 */
export function parseUser(row) {
	return parseJSON(row);
}

/**
 * Normalize email (lowercase and trim)
 */
export function normalizeEmail(email) {
	return email.toLowerCase().trim();
}

/**
 * Generate user ID
 */
export function generateUserId() {
	return 'usr_' + crypto.randomUUID();
}

/**
 * Generate session ID
 */
export function generateSessionId() {
	return 'sess_' + crypto.randomUUID();
}

/**
 * Generate address ID
 */
export function generateAddressId() {
	return 'addr_' + crypto.randomUUID();
}
