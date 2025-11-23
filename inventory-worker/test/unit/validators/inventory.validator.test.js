/**
 * Unit tests for inventory.validator.js
 */
import { describe, it } from 'mocha';
import { reserveSchema, commitSchema, releaseSchema, productStockSchema } from '../../../src/validators/inventory.validator.js';

describe('inventory.validator', () => {
	describe('reserveSchema', () => {
		it('should validate a valid reserve request', () => {
			const validReserve = {
				reservationId: 'res_123',
				cartId: 'cart_123',
				userId: 'user_123',
				items: [{ productId: 'pro_1', qty: 2, variantId: 'var_1' }],
				ttl: 900,
			};

			const { error } = reserveSchema.validate(validReserve);
			expect(error).to.be.undefined;
		});

		it('should require reservationId', () => {
			const invalidReserve = {
				items: [{ productId: 'pro_1', qty: 2 }],
			};

			const { error } = reserveSchema.validate(invalidReserve);
			expect(error).to.exist;
			expect(error.details[0].path).to.include('reservationId');
		});

		it('should require items array with at least one item', () => {
			const invalidReserve = {
				reservationId: 'res_123',
				items: [],
			};

			const { error } = reserveSchema.validate(invalidReserve);
			expect(error).to.exist;
			expect(error.details[0].message).to.include('At least one item is required');
		});

		it('should validate item structure', () => {
			const invalidReserve = {
				reservationId: 'res_123',
				items: [{ productId: 'pro_1' }], // Missing qty
			};

			const { error } = reserveSchema.validate(invalidReserve);
			expect(error).to.exist;
		});
	});

	describe('commitSchema', () => {
		it('should validate a valid commit request', () => {
			const validCommit = {
				reservationId: 'res_123',
			};

			const { error } = commitSchema.validate(validCommit);
			expect(error).to.be.undefined;
		});

		it('should require reservationId', () => {
			const invalidCommit = {};

			const { error } = commitSchema.validate(invalidCommit);
			expect(error).to.exist;
		});
	});

	describe('releaseSchema', () => {
		it('should validate a valid release request', () => {
			const validRelease = {
				reservationId: 'res_123',
			};

			const { error } = releaseSchema.validate(validRelease);
			expect(error).to.be.undefined;
		});

		it('should require reservationId', () => {
			const invalidRelease = {};

			const { error } = releaseSchema.validate(invalidRelease);
			expect(error).to.exist;
		});
	});

	describe('productStockSchema', () => {
		it('should validate a valid product stock request', () => {
			const validRequest = {
				productId: 'pro_123',
			};

			const { error } = productStockSchema.validate(validRequest);
			expect(error).to.be.undefined;
		});

		it('should require productId', () => {
			const invalidRequest = {};

			const { error } = productStockSchema.validate(invalidRequest);
			expect(error).to.exist;
		});
	});
});
