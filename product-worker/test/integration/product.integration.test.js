/**
 * Integration tests for product-worker
 * Tests full request/response cycles
 */
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import worker from '../../src';
import sinon from 'sinon';

describe('Product Worker Integration', () => {
	let testEnv, request, ctx;

	beforeEach(() => {
		ctx = createExecutionContext();
		testEnv = {
			...env,
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

			const response = await worker.fetch(request, testEnv, ctx);
			await waitOnExecutionContext(ctx);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data).toBeInstanceOf(Array);
		});
	});
});
