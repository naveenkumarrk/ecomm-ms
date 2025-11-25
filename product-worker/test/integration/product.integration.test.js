/**
 * Integration tests for product-worker
 * Tests full request/response cycles
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import sinon from 'sinon';

// Build handler without instrumentation to avoid cloudflare: protocol issues
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import components directly to build handler without instrumentation
const routesModule = await import('file://' + resolve(__dirname, '../../src/routes/product.routes.js'));
const { Router } = await import('itty-router');
const { jsonResponse } = await import('file://' + resolve(__dirname, '../../src/helpers/response.js'));

const router = Router();
routesModule.setupProductRoutes(router);
router.all('*', () => jsonResponse({ error: 'not_found' }, 404));

// Create handler without OpenTelemetry instrumentation for tests
const handler = {
	async fetch(request, env, ctx) {
		try {
			return await router.fetch(request, env, ctx);
		} catch (error) {
			console.error('[PRODUCT] Worker error:', error);
			return new Response(JSON.stringify({ error: 'Internal Server Error', message: error.message }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			});
		}
	},
};

describe('Product Worker Integration', () => {
	let testEnv, request;

	beforeEach(() => {
		testEnv = {
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

			testEnv.DB.prepare().all.resolves(mockProducts);

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

			const response = await handler.fetch(request, testEnv);
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

			testEnv.DB.prepare().bind.returnsThis();
			testEnv.DB.prepare().first.resolves(mockProduct);

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

			const response = await handler.fetch(request, testEnv);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.have.property('productId', 'pro_123');
		});

		it('should return 404 for non-existent product', async () => {
			testEnv.DB.prepare().bind.returnsThis();
			testEnv.DB.prepare().first.resolves(null);

			request = new Request('https://example.com/products/pro_notfound', {
				method: 'GET',
				headers: {
					'x-timestamp': Date.now().toString(),
					'x-signature': 'test-signature',
				},
			});

			const response = await handler.fetch(request, testEnv);
			const data = await response.json();

			expect(response.status).to.equal(404);
			expect(data).to.have.property('error');
		});
	});
});
