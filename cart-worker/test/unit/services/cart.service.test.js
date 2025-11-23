/**
 * Unit tests for cart.service.js
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { recomputeCartSummary, calculateDiscount, resetCheckoutState } from '../../../src/services/cart.service.js';
import sinon from 'sinon';

describe('cart.service', () => {
	afterEach(() => {
		sinon.restore();
	});

	describe('recomputeCartSummary', () => {
		it('should calculate cart summary correctly', () => {
			const cart = {
				items: [
					{ unitPrice: 100, qty: 2 },
					{ unitPrice: 50, qty: 3 },
				],
				discount: 20,
				shippingMethod: { cost: 10 },
			};

			recomputeCartSummary(cart);

			expect(cart.summary).to.have.property('subtotal', 350);
			expect(cart.summary).to.have.property('discount', 20);
			expect(cart.summary).to.have.property('shipping', 10);
			expect(cart.summary).to.have.property('total', 340);
		});

		it('should cap discount at subtotal', () => {
			const cart = {
				items: [{ unitPrice: 100, qty: 1 }],
				discount: 200, // More than subtotal
				shippingMethod: null,
			};

			recomputeCartSummary(cart);

			expect(cart.summary.discount).to.equal(100);
			expect(cart.summary.total).to.equal(0);
		});

		it('should handle empty cart', () => {
			const cart = {
				items: [],
				discount: 0,
				shippingMethod: null,
			};

			recomputeCartSummary(cart);

			expect(cart.summary).to.have.property('subtotal', 0);
			expect(cart.summary).to.have.property('total', 0);
		});
	});

	describe('calculateDiscount', () => {
		it('should calculate percent discount', () => {
			const coupon = { type: 'percent', value: 10 };
			const subtotal = 1000;

			const result = calculateDiscount(coupon, subtotal);

			expect(result).to.have.property('discount', 100);
			expect(result).to.have.property('discountType', 'percent');
		});

		it('should calculate flat discount', () => {
			const coupon = { type: 'flat', value: 50 };
			const subtotal = 1000;

			const result = calculateDiscount(coupon, subtotal);

			expect(result).to.have.property('discount', 50);
			expect(result).to.have.property('discountType', 'flat');
		});

		it('should cap flat discount at subtotal', () => {
			const coupon = { type: 'flat', value: 150 };
			const subtotal = 100;

			const result = calculateDiscount(coupon, subtotal);

			expect(result).to.have.property('discount', 100);
		});

		it('should return zero discount for null coupon', () => {
			const result = calculateDiscount(null, 1000);

			expect(result).to.have.property('discount', 0);
			expect(result).to.have.property('discountType', null);
		});
	});

	describe('resetCheckoutState', () => {
		it('should reset reservation and payment IDs', () => {
			const cart = {
				reservationId: 'res_123',
				paymentOrderId: 'pay_123',
				items: [],
			};

			resetCheckoutState(cart);

			expect(cart.reservationId).to.be.null;
			expect(cart.paymentOrderId).to.be.null;
		});
	});
});
