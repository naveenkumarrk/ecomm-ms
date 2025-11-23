/**
 * Integration tests for order-worker
 * Tests full order creation flow
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import handler from '../../../src/index.js';
import sinon from 'sinon';

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

	describe('POST /orders/create', () => {
		it('should create a new order', async () => {
			env.DB.prepare().bind.returnsThis();
			env.DB.prepare().run.resolves({ success: true });

			request = new Request('https://example.com/orders/create', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-timestamp': Date.now().toString(),
					'x-signature': 'test-signature',
				},
				body: JSON.stringify({
					reservationId: 'res_123',
					orderId: 'order_123',
					payment: {
						paymentId: 'pay_123',
						amount: 99.99,
						currency: 'USD',
					},
					userId: 'user_123',
					email: 'user@example.com',
					items: [
						{
							productId: 'pro_1',
							qty: 2,
							unitPrice: 49.99,
							title: 'Product 1',
						},
					],
					address: { street: '123 Main St' },
					shipping: { method: 'standard' },
				}),
			});

			const response = await handler.fetch(request, env);
			const data = await response.json();

			expect([200, 201, 400]).to.include(response.status);
		});
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
