/**
 * Unit tests for product.service.js
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { transformProductRow, enrichProductWithStock, enrichProductsWithStock } from '../../../src/services/product.service.js';
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
		let fetchStub;

		beforeEach(() => {
			fetchStub = sinon.stub(global, 'fetch');
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

			const mockEnv = {
				INVENTORY_SERVICE_URL: 'https://inventory.example.com',
				INTERNAL_SECRET: 'test-secret',
			};

			fetchStub.resolves({
				ok: true,
				status: 200,
				text: sinon.stub().resolves('{"stock": 50, "reserved": 5}'),
			});

			const result = await enrichProductWithStock(mockEnv, row);

			expect(result).to.have.property('stock', 50);
			expect(result).to.have.property('reserved', 5);
			expect(fetchStub).to.have.been.calledOnce;
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

			const mockEnv = {
				INVENTORY_SERVICE_URL: 'https://inventory.example.com',
				INTERNAL_SECRET: 'test-secret',
			};

			fetchStub.rejects(new Error('Inventory service unavailable'));

			try {
				await enrichProductWithStock(mockEnv, row);
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error).to.be.instanceOf(Error);
			}
		});

		it('should return zero stock when inventory service not configured', async () => {
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

			const mockEnv = {}; // No INVENTORY_SERVICE_URL or INTERNAL_SECRET

			const result = await enrichProductWithStock(mockEnv, row);

			expect(result).to.have.property('stock', 0);
			expect(result).to.have.property('reserved', 0);
			expect(fetchStub).to.not.have.been.called;
		});

		it('should return zero stock when inventory service returns error response', async () => {
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

			const mockEnv = {
				INVENTORY_SERVICE_URL: 'https://inventory.example.com',
				INTERNAL_SECRET: 'test-secret',
			};

			fetchStub.resolves({
				ok: false,
				status: 500,
				text: sinon.stub().resolves('{"error": "Internal error"}'),
			});

			const result = await enrichProductWithStock(mockEnv, row);

			expect(result).to.have.property('stock', 0);
			expect(result).to.have.property('reserved', 0);
		});
	});

	describe('enrichProductsWithStock', () => {
		let fetchStub;

		beforeEach(() => {
			fetchStub = sinon.stub(global, 'fetch');
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

			const mockEnv = {
				INVENTORY_SERVICE_URL: 'https://inventory.example.com',
				INTERNAL_SECRET: 'test-secret',
			};

			// Mock fetch to return different stock based on request body
			fetchStub.callsFake(async (url, options) => {
				const body = JSON.parse(options.body);
				if (body.productId === 'pro_1') {
					return {
						ok: true,
						status: 200,
						text: sinon.stub().resolves('{"stock": 50, "reserved": 5}'),
					};
				} else if (body.productId === 'pro_2') {
					return {
						ok: true,
						status: 200,
						text: sinon.stub().resolves('{"stock": 100, "reserved": 10}'),
					};
				}
				return {
					ok: true,
					status: 200,
					text: sinon.stub().resolves('{"stock": 0, "reserved": 0}'),
				};
			});

			const results = await enrichProductsWithStock(mockEnv, rows);

			expect(results).to.be.an('array').with.length(2);
			// Match by productId since Promise.all preserves order
			const pro1 = results.find((r) => r.productId === 'pro_1');
			const pro2 = results.find((r) => r.productId === 'pro_2');
			expect(pro1).to.have.property('stock', 50);
			expect(pro2).to.have.property('stock', 100);
			expect(fetchStub).to.have.been.calledTwice;
		});
	});
});
