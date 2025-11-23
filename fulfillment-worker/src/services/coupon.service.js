/**
 * Coupon service for shipping discounts
 */

export async function getCouponDiscount(env, couponCode) {
	if (!couponCode || !env.DISCOUNT_KV) return null;

	try {
		const raw = await env.DISCOUNT_KV.get(`discount:${couponCode}`);
		if (!raw) return null;

		const disc = JSON.parse(raw);

		// Only return shipping-related coupons
		if (disc.type === 'percent_shipping' || disc.type === 'flat_shipping' || disc.type === 'free_shipping') {
			return {
				code: couponCode,
				type: disc.type,
				value: disc.value,
			};
		}

		return null;
	} catch (e) {
		console.error('Coupon read error', e);
		return null;
	}
}
