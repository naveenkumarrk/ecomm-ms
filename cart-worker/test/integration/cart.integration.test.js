/**
 * Integration tests for cart-worker (Durable Object)
 * Tests full cart operations flow
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

describe('Cart Worker Integration', () => {
	let env, request, mockStub;

	beforeEach(() => {
		mockStub = {
			fetch: sinon.stub(),
		};
		
		env = {
			CART_DO: {
				idFromName: sinon.stub().returns('mock-id'),
				get: sinon.stub().returns(mockStub),
			},
			PRODUCTS_SERVICE: {
				fetch: sinon.stub(),
			},
			INTERNAL_SECRET: 'test-secret',
		};
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('POST /cart/:cartId/add', () => {
		it('should add item to cart', async () => {
			mockStub.fetch.resolves(
				new Response(
					JSON.stringify({
						success: true,
						cart: {
							cartId: 'cart_123',
							items: [{ productId: 'pro_1', qty: 1 }],
						},
					}),
					{ status: 200 },
				),
			);

			request = new Request('https://example.com/cart/cart_123/add', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-timestamp': Date.now().toString(),
					'x-signature': 'test-signature',
				},
				body: JSON.stringify({
					productId: 'pro_1',
					quantity: 1,
				}),
			});

			const response = await handler.fetch(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.have.property('success', true);
		});
	});

	describe('GET /cart/:cartId', () => {
		it('should retrieve cart', async () => {
			mockStub.fetch.resolves(
				new Response(
					JSON.stringify({
						cartId: 'cart_123',
						items: [],
						summary: { subtotal: 0, total: 0 },
					}),
					{ status: 200 },
				),
			);

			request = new Request('https://example.com/cart/cart_123', {
				method: 'GET',
				headers: {
					'x-timestamp': Date.now().toString(),
					'x-signature': 'test-signature',
				},
			});

			const response = await handler.fetch(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.have.property('cartId', 'cart_123');
		});
	});
});
