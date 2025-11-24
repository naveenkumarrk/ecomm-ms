/**
 * Unit tests for fulfillment.validator.js
 */
import { describe, it } from 'mocha';
import { getOptionsSchema, allocateSchema, shipSchema } from '../../../src/validators/fulfillment.validator.js';

describe('fulfillment.validator', () => {
	describe('getOptionsSchema', () => {
		it('should validate a valid get options request', () => {
			const validRequest = {
				items: [
					{
						productId: 'pro_1',
						variantId: 'var_1',
						qty: 2,
						unitPrice: 99.99,
						attributes: { weight: 1.5 },
					},
				],
				address: { pincode: '12345' },
				subtotal: 200,
			};

			const { error } = getOptionsSchema.validate(validRequest);
			expect(error).to.be.undefined;
		});

		it('should require items array', () => {
			const invalidRequest = {
				address: { pincode: '12345' },
			};

			const { error } = getOptionsSchema.validate(invalidRequest);
			expect(error).to.exist;
			expect(error.details[0].path).to.include('items');
		});

		it('should require at least one item', () => {
			const invalidRequest = {
				items: [],
			};

			const { error } = getOptionsSchema.validate(invalidRequest);
			expect(error).to.exist;
			expect(error.details[0].message).to.include('At least one item is required');
		});
	});

	describe('allocateSchema', () => {
		it('should validate a valid allocate request', () => {
			const validAllocate = {
				orderId: 'order_123',
				reservationId: 'res_123',
				items: [{ variantId: 'var_1', qty: 2 }],
				address: { pincode: '12345' },
			};

			const { error } = allocateSchema.validate(validAllocate);
			expect(error).to.be.undefined;
		});

		it('should require items array', () => {
			const invalidAllocate = {
				orderId: 'order_123',
			};

			const { error } = allocateSchema.validate(invalidAllocate);
			expect(error).to.exist;
		});
	});

	describe('shipSchema', () => {
		it('should validate a valid ship request', () => {
			const validShip = {
				orderId: 'order_123',
				allocation: [
					{
						warehouseId: 'wh_1',
						tracking: 'TRACK123',
						carrier: 'UPS',
					},
				],
				shippedAt: Date.now(),
			};

			const { error } = shipSchema.validate(validShip);
			expect(error).to.be.undefined;
		});

		it('should require orderId', () => {
			const invalidShip = {
				allocation: [],
			};

			const { error } = shipSchema.validate(invalidShip);
			expect(error).to.exist;
			expect(error.details[0].path).to.include('orderId');
		});
	});
});
