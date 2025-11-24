/**
 * Unit tests for product.validator.js
 */
import { describe, it } from 'mocha';
import { createProductSchema, updateProductSchema } from '../../../src/validators/product.validator.js';

describe('product.validator', () => {
	describe('createProductSchema', () => {
		it('should validate a valid product', () => {
			const validProduct = {
				title: 'Test Product',
				description: 'This is a test product description',
				category: 'Electronics',
				sku: 'SKU-001',
				images: ['https://example.com/image.jpg'],
				metadata: { price: 99.99 },
			};

			const { error } = createProductSchema.validate(validProduct);
			expect(error).to.be.undefined;
		});

		it('should require title', () => {
			const invalidProduct = {
				description: 'Test description',
			};

			const { error } = createProductSchema.validate(invalidProduct);
			expect(error).to.exist;
			expect(error.details[0].path).to.include('title');
		});

		it('should validate title min length', () => {
			const invalidProduct = {
				title: '',
			};

			const { error } = createProductSchema.validate(invalidProduct);
			expect(error).to.exist;
			// Empty string fails required check first
			expect(error.details[0].message).to.include('Title is required');
		});

		it('should validate title max length', () => {
			const invalidProduct = {
				title: 'A'.repeat(501),
			};

			const { error } = createProductSchema.validate(invalidProduct);
			expect(error).to.exist;
			expect(error.details[0].message).to.include('Title must not exceed 500 characters');
		});

		it('should allow any description length (no min requirement)', () => {
			const validProduct = {
				title: 'Valid Title',
				description: 'Short',
			};

			const { error } = createProductSchema.validate(validProduct);
			// Description has no min length requirement in the schema
			expect(error).to.be.undefined;
		});

		it('should allow empty description', () => {
			const validProduct = {
				title: 'Valid Title',
				description: '',
			};

			const { error } = createProductSchema.validate(validProduct);
			expect(error).to.be.undefined;
		});

		it('should validate images as URI array', () => {
			const invalidProduct = {
				title: 'Valid Title',
				images: ['not-a-uri'],
			};

			const { error } = createProductSchema.validate(invalidProduct);
			expect(error).to.exist;
		});

		it('should allow optional fields', () => {
			const minimalProduct = {
				title: 'Valid Title',
			};

			const { error } = createProductSchema.validate(minimalProduct);
			expect(error).to.be.undefined;
		});
	});

	describe('updateProductSchema', () => {
		it('should validate a valid update', () => {
			const validUpdate = {
				title: 'Updated Title',
			};

			const { error } = updateProductSchema.validate(validUpdate);
			expect(error).to.be.undefined;
		});

		it('should allow empty update (all fields optional)', () => {
			const emptyUpdate = {};

			const { error } = updateProductSchema.validate(emptyUpdate);
			// updateProductSchema doesn't require any fields - all are optional
			expect(error).to.be.undefined;
		});

		it('should validate title min length if provided', () => {
			const invalidUpdate = {
				title: '',
			};

			const { error } = updateProductSchema.validate(invalidUpdate);
			expect(error).to.exist;
			expect(error.details[0].message).to.include('not allowed to be empty');
		});

		it('should allow partial updates', () => {
			const partialUpdate = {
				sku: 'NEW-SKU',
			};

			const { error } = updateProductSchema.validate(partialUpdate);
			expect(error).to.be.undefined;
		});
	});
});
