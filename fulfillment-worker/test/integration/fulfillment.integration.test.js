/**
 * Integration tests for fulfillment-worker
 * Tests full shipping options and fulfillment flow
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import handler from '../../../src/index.js';
import sinon from 'sinon';

describe('Fulfillment Worker Integration', () => {
	let env, request;

	beforeEach(() => {
		env = {
			DB: {
				prepare: sinon.stub().returns({
					bind: sinon.stub().returnsThis(),
					all: sinon.stub(),
				}),
			},
			PINCODE_KV: {
				get: sinon.stub(),
			},
			DISCOUNT_KV: {
				get: sinon.stub(),
			},
			INTERNAL_SECRET: 'test-secret',
			TEST_MODE: 'true',
		};
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('POST /fulfillment/get-options', () => {
		it('should return shipping options', async () => {
			const mockWarehouses = {
				results: [
					{
						warehouse_id: 'wh_1',
						name: 'Warehouse 1',
						zone: 'MUM',
						pincode: '400001',
						handling_hours: 24,
						cutoff_hour: 18,
						priority: 1,
					},
				],
			};

			env.DB.prepare().all.resolves(mockWarehouses);
			env.PINCODE_KV.get.resolves(JSON.stringify({ zone: 'MUM' }));

			request = new Request('https://example.com/fulfillment/get-options', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-timestamp': Date.now().toString(),
					'x-signature': 'test-signature',
				},
				body: JSON.stringify({
					items: [
						{
							productId: 'pro_1',
							qty: 2,
							attributes: { weight: 1.5 },
						},
					],
					address: { pincode: '400001' },
					subtotal: 500,
				}),
			});

			const response = await handler.fetch(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.have.property('shippingOptions');
			expect(data.shippingOptions).to.be.an('array').with.length(3);
		});

		it('should apply free shipping for high subtotal', async () => {
			const mockWarehouses = {
				results: [
					{
						warehouse_id: 'wh_1',
						zone: 'MUM',
						handling_hours: 24,
						priority: 1,
					},
				],
			};

			env.DB.prepare().all.resolves(mockWarehouses);
			env.PINCODE_KV.get.resolves(JSON.stringify({ zone: 'MUM' }));

			request = new Request('https://example.com/fulfillment/get-options', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-timestamp': Date.now().toString(),
					'x-signature': 'test-signature',
				},
				body: JSON.stringify({
					items: [{ productId: 'pro_1', qty: 1 }],
					address: { pincode: '400001' },
					subtotal: 1500, // Above free threshold
				}),
			});

			const response = await handler.fetch(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data.shippingOptions[0].cost).to.equal(0); // Free standard
		});
	});

	describe('POST /fulfillment/allocate', () => {
		it('should allocate items to warehouse', async () => {
			const mockWarehouses = {
				results: [
					{
						warehouse_id: 'wh_1',
						zone: 'MUM',
						handling_hours: 24,
						priority: 1,
					},
				],
			};

			env.DB.prepare().all.resolves(mockWarehouses);
			env.PINCODE_KV.get.resolves(JSON.stringify({ zone: 'MUM' }));

			request = new Request('https://example.com/fulfillment/allocate', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-timestamp': Date.now().toString(),
					'x-signature': 'test-signature',
				},
				body: JSON.stringify({
					orderId: 'order_123',
					reservationId: 'res_123',
					items: [{ variantId: 'var_1', qty: 2 }],
					address: { pincode: '400001' },
				}),
			});

			const response = await handler.fetch(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.have.property('allocation');
		});
	});

	describe('POST /fulfillment/ship', () => {
		it('should mark order as shipped', async () => {
			request = new Request('https://example.com/fulfillment/ship', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-timestamp': Date.now().toString(),
					'x-signature': 'test-signature',
				},
				body: JSON.stringify({
					orderId: 'order_123',
					allocation: [
						{
							warehouseId: 'wh_1',
							tracking: 'TRACK123',
							carrier: 'UPS',
						},
					],
					shippedAt: Date.now(),
				}),
			});

			const response = await handler.fetch(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.have.property('ok', true);
			expect(data).to.have.property('orderId', 'order_123');
		});
	});
});

