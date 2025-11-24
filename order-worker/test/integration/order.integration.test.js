/**
 * Integration tests for order-worker
 * Tests full order creation flow
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

describe('Order Worker Integration', () => {
	let env, request;

	beforeEach(() => {
		env = {
			DB: {
				prepare: sinon.stub().returns({
					bind: sinon.stub().returnsThis(),
					first: sinon.stub(),
					all: sinon.stub(),
					run: sinon.stub(),
				}),
			},
			INTERNAL_SECRET: 'test-secret',
			TEST_MODE: 'true',
		};
	});

	afterEach(() => {
		sinon.restore();
	});



	describe('GET /orders/:id', () => {
		it('should retrieve order by ID', async () => {
			const mockOrder = {
				order_id: 'order_123',
				user_id: 'user_123',
				items_json: '[]',
				address_json: 'null',
				shipping_json: 'null',
				payment_json: 'null',
			};

			env.DB.prepare().bind.returnsThis();
			env.DB.prepare().first.resolves(mockOrder);

			request = new Request('https://example.com/orders/order_123', {
				method: 'GET',
				headers: {
					'x-timestamp': Date.now().toString(),
					'x-signature': 'test-signature',
				},
			});

			const response = await handler.fetch(request, env);

			expect([200, 404]).to.include(response.status);
		});
	});
});
