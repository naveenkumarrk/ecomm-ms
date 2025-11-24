/**
 * Fulfillment constants
 */

export const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, X-Timestamp, X-Signature, X-Test-Mode',
};

export const SIGNATURE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Shipping rates (defaults)
export const DEFAULT_STANDARD_RATE = 40;
export const DEFAULT_EXPRESS_RATE = 90;
export const DEFAULT_PRIORITY_RATE = 150;
export const DEFAULT_FREE_MIN = 1000; // default free shipping threshold (₹1000)
export const DEFAULT_EXPRESS_DISCOUNT_MIN = 2500; // optional express discount threshold
export const DEFAULT_EXPRESS_DISCOUNT_PERCENT = 20; // default express discount % when threshold met

// Zone transit days mapping
export const ZONE_TRANSIT_DAYS = {
	MUM: 1,
	DEL: 2,
	CHN: 2,
	BLR: 1,
	OTHER: 3,
};
