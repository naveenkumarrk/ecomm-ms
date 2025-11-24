/**
 * Cart business logic service
 */
import { nowSec } from '../helpers/utils.js';

export function recomputeCartSummary(cart) {
	const subtotal = cart.items.reduce((s, i) => s + Number(i.unitPrice || 0) * Number(i.qty || 0), 0);

	let discount = cart.discount || 0;
	discount = Math.min(discount, subtotal);

	const shipping = (cart.shippingMethod && Number(cart.shippingMethod.cost || 0)) || 0;

	cart.summary = {
		subtotal,
		discount,
		shipping,
		total: Math.max(0, subtotal - discount + shipping),
		userId: cart.userId || null, // Include userId in summary
	};
}

export function calculateDiscount(coupon, subtotal) {
	if (!coupon) return { discount: 0, discountType: null };

	if (coupon.type === 'percent') {
		return {
			discount: Math.round(subtotal * (coupon.value / 100)),
			discountType: 'percent',
		};
	} else if (coupon.type === 'flat') {
		return {
			discount: Math.min(subtotal, coupon.value),
			discountType: 'flat',
		};
	}

	return { discount: 0, discountType: null };
}

export function resetCheckoutState(cart) {
	cart.reservationId = null;
	cart.paymentOrderId = null;
}
