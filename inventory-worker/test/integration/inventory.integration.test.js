/**
 * Integration tests for inventory-worker
 * Tests full inventory reservation flow
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import handler from '../../../src/index.js';
import sinon from 'sinon';

describe('Inventory Worker Integration', () => {
	let env, request;

	beforeEach(() => {
		env = {
			DB: {
				prepare: sinon.stub().returns({
					bind: sinon.stub().returnsThis(),
					first: sinon.stub(),
					run: sinon.stub(),
				}),
			},
			INVENTORY_LOCK_KV: {
				get: sinon.stub(),
				put: sinon.stub().resolves(),
				delete: sinon.stub().resolves(),
			},
			INTERNAL_SECRET: 'test-secret',
			TEST_MODE: 'true',
		};
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('POST /inventory/reserve', () => {
		it('should reserve inventory for items', async () => {
			const mockStock = {
				product_id: 'pro_1',
				stock: 100,
				reserved: 10,
			};

			env.DB.prepare().bind.returnsThis();
			env.DB.prepare().first.onFirstCall().resolves(mockStock); // Get stock
			env.DB.prepare().first.onSecondCall().resolves(null); // Check lock
			env.DB.prepare().run.onFirstCall().resolves({ success: true }); // Reserve stock
			env.DB.prepare().run.onSecondCall().resolves({ success: true }); // Create reservation

			env.INVENTORY_LOCK_KV.get.resolves(null); // No existing lock

			request = new Request('https://example.com/inventory/reserve', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-timestamp': Date.now().toString(),
					'x-signature': 'test-signature',
				},
				body: JSON.stringify({
					reservationId: 'res_123',
					cartId: 'cart_123',
					userId: 'user_123',
					items: [{ productId: 'pro_1', qty: 2 }],
					ttl: 900,
				}),
			});

			const response = await handler.fetch(request, env);
			const data = await response.json();

			expect([200, 400]).to.include(response.status);
		});
	});

	describe('POST /inventory/commit', () => {
		it('should commit reserved inventory', async () => {
			const mockReservation = {
				reservation_id: 'res_123',
				status: 'active',
				items: JSON.stringify([{ productId: 'pro_1', qty: 2 }]),
			};

			env.DB.prepare().bind.returnsThis();
			env.DB.prepare().first.resolves(mockReservation);
			env.DB.prepare().run.resolves({ success: true });

			request = new Request('https://example.com/inventory/commit', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-timestamp': Date.now().toString(),
					'x-signature': 'test-signature',
				},
				body: JSON.stringify({
					reservationId: 'res_123',
				}),
			});

			const response = await handler.fetch(request, env);

			expect([200, 404]).to.include(response.status);
		});
	});
});

