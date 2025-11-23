/**
 * Unit tests for product.service.js
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { transformProductRow, enrichProductWithStock, enrichProductsWithStock } from '../../../src/services/product.service.js';
import * as inventoryService from '../../../src/services/inventory.service.js';
import sinon from 'sinon';

describe('product.service', () => {
	describe('transformProductRow', () => {
		it('should transform a product row with stock data', () => {
			const row = {
				product_id: 'pro_123',
				sku: 'SKU-001',
				title: 'Test Product',
				description: 'Test Description',
				category: 'Electronics',
				images: '["https://example.com/image.jpg"]',
				metadata: '{"price": 99.99, "attributes": {"color": "red"}}',
				created_at: 1234567890,
				updated_at: 1234567890,
			};

			const result = transformProductRow(row, 100, 10);

			expect(result).to.have.property('productId', 'pro_123');
			expect(result).to.have.property('sku', 'SKU-001');
			expect(result).to.have.property('title', 'Test Product');
			expect(result).to.have.property('stock', 100);
			expect(result).to.have.property('reserved', 10);
			expect(result.variants).to.be.an('array').with.length(1);
			expect(result.variants[0]).to.have.property('price', 99.99);
			expect(result.variants[0]).to.have.property('stock', 100);
		});

		it('should handle missing metadata gracefully', () => {
			const row = {
				product_id: 'pro_123',
				sku: null,
				title: 'Test Product',
				description: null,
				category: null,
				images: '[]',
				metadata: null,
				created_at: 1234567890,
				updated_at: 1234567890,
			};

			const result = transformProductRow(row, 0, 0);

			expect(result).to.have.property('productId', 'pro_123');
			expect(result).to.have.property('sku', null);
			expect(result.metadata).to.deep.equal({});
			expect(result.images).to.be.an('array').that.is.empty;
			expect(result.variants[0]).to.have.property('price', 0);
		});

		it('should parse JSON images and metadata correctly', () => {
			const row = {
				product_id: 'pro_123',
				sku: 'SKU-001',
				title: 'Test Product',
				description: 'Test',
				category: 'Test',
				images: '["img1.jpg", "img2.jpg"]',
				metadata: '{"price": 50, "attributes": {"size": "L"}}',
				created_at: 1234567890,
				updated_at: 1234567890,
			};

			const result = transformProductRow(row, 50, 5);

			expect(result.images).to.be.an('array').with.length(2);
			expect(result.metadata).to.have.property('price', 50);
			expect(result.metadata.attributes).to.have.property('size', 'L');
		});
	});

	describe('enrichProductWithStock', () => {
		let getProductStockStub;

		beforeEach(() => {
			getProductStockStub = sinon.stub(inventoryService, 'getProductStock');
		});

		afterEach(() => {
			sinon.restore();
		});

		it('should enrich product with stock data from inventory service', async () => {
			const row = {
				product_id: 'pro_123',
				sku: 'SKU-001',
				title: 'Test Product',
				description: 'Test',
				category: 'Test',
				images: '[]',
				metadata: '{"price": 100}',
				created_at: 1234567890,
				updated_at: 1234567890,
			};

			const mockEnv = {};
			getProductStockStub.resolves({ stock: 50, reserved: 5 });

			const result = await enrichProductWithStock(mockEnv, row);

			expect(getProductStockStub).to.have.been.calledOnceWith(mockEnv, 'pro_123');
			expect(result).to.have.property('stock', 50);
			expect(result).to.have.property('reserved', 5);
		});

		it('should handle inventory service errors gracefully', async () => {
			const row = {
				product_id: 'pro_123',
				sku: 'SKU-001',
				title: 'Test Product',
				description: 'Test',
				category: 'Test',
				images: '[]',
				metadata: '{"price": 100}',
				created_at: 1234567890,
				updated_at: 1234567890,
			};

			const mockEnv = {};
			getProductStockStub.rejects(new Error('Inventory service unavailable'));

			try {
				await enrichProductWithStock(mockEnv, row);
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error).to.be.instanceOf(Error);
			}
		});
	});

	describe('enrichProductsWithStock', () => {
		let getProductStockStub;

		beforeEach(() => {
			getProductStockStub = sinon.stub(inventoryService, 'getProductStock');
		});

		afterEach(() => {
			sinon.restore();
		});

		it('should enrich multiple products with stock data', async () => {
			const rows = [
				{
					product_id: 'pro_1',
					sku: 'SKU-001',
					title: 'Product 1',
					description: 'Test',
					category: 'Test',
					images: '[]',
					metadata: '{"price": 100}',
					created_at: 1234567890,
					updated_at: 1234567890,
				},
				{
					product_id: 'pro_2',
					sku: 'SKU-002',
					title: 'Product 2',
					description: 'Test',
					category: 'Test',
					images: '[]',
					metadata: '{"price": 200}',
					created_at: 1234567890,
					updated_at: 1234567890,
				},
			];

			const mockEnv = {};
			getProductStockStub.onFirstCall().resolves({ stock: 50, reserved: 5 });
			getProductStockStub.onSecondCall().resolves({ stock: 100, reserved: 10 });

			const results = await enrichProductsWithStock(mockEnv, rows);

			expect(results).to.be.an('array').with.length(2);
			expect(results[0]).to.have.property('stock', 50);
			expect(results[1]).to.have.property('stock', 100);
			expect(getProductStockStub).to.have.been.calledTwice;
		});
	});
});
