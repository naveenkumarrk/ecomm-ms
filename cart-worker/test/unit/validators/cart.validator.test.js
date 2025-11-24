/**
 * Unit tests for cart.validator.js
 */
import { describe, it } from 'mocha';
import {
	addItemSchema,
	updateItemSchema,
	removeItemSchema,
	setAddressSchema,
	selectShippingSchema,
	applyCouponSchema,
} from '../../../src/validators/cart.validator.js';

describe('cart.validator', () => {
	describe('addItemSchema', () => {
		it('should validate a valid add item request', () => {
			const validItem = {
				productId: 'pro_123',
				variantId: 'var_123',
				quantity: 2,
				unitPrice: 99.99,
			};

			const { error } = addItemSchema.validate(validItem);
			expect(error).to.be.undefined;
		});

		it('should require productId', () => {
			const invalidItem = {
				quantity: 2,
			};

			const { error } = addItemSchema.validate(invalidItem);
			expect(error).to.exist;
			expect(error.details[0].path).to.include('productId');
		});

		it('should validate quantity min value', () => {
			const invalidItem = {
				productId: 'pro_123',
				quantity: 0,
			};

			const { error } = addItemSchema.validate(invalidItem);
			expect(error).to.exist;
			expect(error.details[0].message).to.include('must be greater than or equal to 1');
		});
	});

	describe('updateItemSchema', () => {
		it('should validate a valid update request', () => {
			const validUpdate = {
				productId: 'pro_123',
				quantity: 5,
			};

			const { error } = updateItemSchema.validate(validUpdate);
			expect(error).to.be.undefined;
		});

		it('should require quantity', () => {
			const invalidUpdate = {
				productId: 'pro_123',
			};

			const { error } = updateItemSchema.validate(invalidUpdate);
			expect(error).to.exist;
			expect(error.details[0].path).to.include('quantity');
		});
	});

	describe('removeItemSchema', () => {
		it('should validate a valid remove request', () => {
			const validRemove = {
				productId: 'pro_123',
			};

			const { error } = removeItemSchema.validate(validRemove);
			expect(error).to.be.undefined;
		});

		it('should require productId', () => {
			const invalidRemove = {};

			const { error } = removeItemSchema.validate(invalidRemove);
			expect(error).to.exist;
		});
	});

	describe('setAddressSchema', () => {
		it('should validate a valid address request', () => {
			const validAddress = {
				addressId: 'addr_123',
			};

			const { error } = setAddressSchema.validate(validAddress);
			expect(error).to.be.undefined;
		});

		it('should require addressId', () => {
			const invalidAddress = {};

			const { error } = setAddressSchema.validate(invalidAddress);
			expect(error).to.exist;
		});
	});

	describe('selectShippingSchema', () => {
		it('should validate a valid shipping selection', () => {
			const validShipping = {
				methodId: 'standard',
			};

			const { error } = selectShippingSchema.validate(validShipping);
			expect(error).to.be.undefined;
		});

		it('should require methodId', () => {
			const invalidShipping = {};

			const { error } = selectShippingSchema.validate(invalidShipping);
			expect(error).to.exist;
		});
	});

	describe('applyCouponSchema', () => {
		it('should validate a valid coupon code', () => {
			const validCoupon = {
				code: 'SAVE10',
			};

			const { error } = applyCouponSchema.validate(validCoupon);
			expect(error).to.be.undefined;
		});

		it('should require coupon code', () => {
			const invalidCoupon = {};

			const { error } = applyCouponSchema.validate(invalidCoupon);
			expect(error).to.exist;
		});
	});
});
