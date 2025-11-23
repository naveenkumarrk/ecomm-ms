/**
 * Utility functions
 */

export function nowSec() {
	return Math.floor(Date.now() / 1000);
}

export function createEmptyCart(cartId, userId = null) {
	return {
		cartId,
		userId,
		items: [],
		addressId: null,
		shippingOptions: null,
		shippingMethod: null,
		reservationId: null,
		paymentOrderId: null,
		coupon: null,
		discount: 0,
		discountType: null,
		summary: { subtotal: 0, discount: 0, shipping: 0, total: 0 },
		createdAt: nowSec(),
		updatedAt: nowSec(),
	};
}
