/**
 * Integration tests for product-worker
 * Tests full request/response cycles
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import sinon from 'sinon';

// Resolve import path relative to this file to avoid CI path resolution issues
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const handlerModule = await import('file://' + resolve(__dirname, '../../src/index.js'));
const handler = handlerModule.default;

describe('Product Worker Integration', () => {
	let env, request;

	beforeEach(() => {
		env = {
			DB: {
				prepare: sinon.stub().returns({
					bind: sinon.stub().returnsThis(),
					all: sinon.stub(),
					first: sinon.stub(),
					run: sinon.stub(),
				}),
			},
			PRODUCT_IMAGES: {
				put: sinon.stub().resolves(),
			},
			R2_PUBLIC_URL: 'https://example.com',
			INVENTORY_SERVICE_URL: 'https://inventory.example.com',
			INTERNAL_SECRET: 'test-secret',
		};
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('GET /products', () => {
		it('should return products list with stock', async () => {
			const mockProducts = {
				results: [
					{
						product_id: 'pro_1',
						title: 'Product 1',
						sku: 'SKU-001',
						description: 'Test',
						category: 'Test',
						images: '[]',
						metadata: '{"price": 100}',
						created_at: 1234567890,
						updated_at: 1234567890,
					},
				],
			};

			env.DB.prepare().all.resolves(mockProducts);

			// Mock inventory service call
			global.fetch = sinon.stub().resolves({
				ok: true,
				status: 200,
				text: sinon.stub().resolves(JSON.stringify({ stock: 50, reserved: 5 })),
			});

			request = new Request('https://example.com/products?limit=10&offset=0', {
				method: 'GET',
				headers: {
					'x-timestamp': Date.now().toString(),
					'x-signature': 'test-signature',
				},
			});

			const response = await handler.fetch(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.be.an('array');
		});
	});

	describe('GET /products/:id', () => {
		it('should return single product by ID', async () => {
			const mockProduct = {
				product_id: 'pro_123',
				title: 'Test Product',
				sku: 'SKU-001',
				description: 'Test',
				category: 'Test',
				images: '[]',
				metadata: '{"price": 100}',
				created_at: 1234567890,
				updated_at: 1234567890,
			};

			env.DB.prepare().bind.returnsThis();
			env.DB.prepare().first.resolves(mockProduct);

			global.fetch = sinon.stub().resolves({
				ok: true,
				status: 200,
				text: sinon.stub().resolves(JSON.stringify({ stock: 50, reserved: 5 })),
			});

			request = new Request('https://example.com/products/pro_123', {
				method: 'GET',
				headers: {
					'x-timestamp': Date.now().toString(),
					'x-signature': 'test-signature',
				},
			});

			const response = await handler.fetch(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.have.property('productId', 'pro_123');
		});

		it('should return 404 for non-existent product', async () => {
			env.DB.prepare().bind.returnsThis();
			env.DB.prepare().first.resolves(null);

			request = new Request('https://example.com/products/pro_notfound', {
				method: 'GET',
				headers: {
					'x-timestamp': Date.now().toString(),
					'x-signature': 'test-signature',
				},
			});

			const response = await handler.fetch(request, env);
			const data = await response.json();

			expect(response.status).to.equal(404);
			expect(data).to.have.property('error');
		});
	});


});
