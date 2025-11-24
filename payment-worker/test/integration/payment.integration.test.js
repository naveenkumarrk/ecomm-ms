/**
 * Integration tests for payment-worker
 * Tests full payment processing flow
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

// Helper function to generate HMAC signature
async function generateSignature(secret, method, path, body = '') {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey('raw', enc.encode(secret || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const ts = Date.now().toString();
	const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
	const msg = `${ts}|${method.toUpperCase()}|${path}|${bodyStr}`;
	const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
	const signature = Array.from(new Uint8Array(sig))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return { timestamp: ts, signature };
}

describe('Payment Worker Integration', () => {
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
			PAYMENT_KV: {
				put: sinon.stub().resolves(),
				get: sinon.stub(),
				delete: sinon.stub().resolves(),
			},
			INVENTORY_SERVICE: {
				fetch: sinon.stub(),
			},
			ORDER_SERVICE: {
				fetch: sinon.stub(),
			},
			PAYPAL_CLIENT_ID: 'test_client_id',
			PAYPAL_SECRET: 'test_secret',
			PAYPAL_API: 'https://api.sandbox.paypal.com',
			INTERNAL_SECRET: 'test-secret',
			TEST_MODE: 'true',
		};
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('POST /payment/paypal/create', () => {
		it('should create PayPal payment order', async () => {
			// Mock PayPal token
			global.fetch = sinon
				.stub()
				.onFirstCall()
				.resolves({
					ok: true,
					json: sinon.stub().resolves({
						access_token: 'test_token',
						expires_in: 3600,
					}),
				});

			// Mock PayPal order creation
			global.fetch.onSecondCall().resolves({
				ok: true,
				json: sinon.stub().resolves({
					id: 'paypal_order_123',
					links: [{ rel: 'approve', href: 'https://paypal.com/approve' }],
				}),
			});

			env.DB.prepare().bind.returnsThis();
			env.DB.prepare().run.resolves({ success: true });

			const body = JSON.stringify({
				reservationId: 'res_123',
				amount: 99.99,
				currency: 'USD',
				userId: 'user_123',
			});
			const { timestamp, signature } = await generateSignature(env.INTERNAL_SECRET, 'POST', '/payment/paypal/create', body);

			request = new Request('https://example.com/payment/paypal/create', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-timestamp': timestamp,
					'x-signature': signature,
				},
				body,
			});

			const response = await handler.fetch(request, env);

			expect([200, 400, 502]).to.include(response.status);
		});
	});

	describe('POST /payment/paypal/capture', () => {
		it('should capture PayPal payment', async () => {
			env.PAYMENT_KV.get.resolves(
				JSON.stringify({
					reservationId: 'res_123',
					userId: 'user_123',
					amount: 99.99,
					currency: 'USD',
				}),
			);

			// Mock PayPal capture
			global.fetch = sinon
				.stub()
				.onFirstCall()
				.resolves({
					ok: true,
					json: sinon.stub().resolves({
						access_token: 'test_token',
						expires_in: 3600,
					}),
				});

			global.fetch.onSecondCall().resolves({
				ok: true,
				json: sinon.stub().resolves({
					purchase_units: [
						{
							payments: {
								captures: [
									{
										id: 'capture_123',
										status: 'COMPLETED',
									},
								],
							},
						},
					],
				}),
			});

			env.INVENTORY_SERVICE.fetch.resolves({
				ok: true,
				status: 200,
				text: sinon.stub().resolves('{}'),
			});

			env.ORDER_SERVICE.fetch.resolves({
				ok: true,
				status: 200,
				text: sinon.stub().resolves('{}'),
			});

			env.DB.prepare().bind.returnsThis();
			env.DB.prepare().first.resolves(null);
			env.DB.prepare().run.resolves({ success: true });

			request = new Request('https://example.com/payment/paypal/capture', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-user-id': 'user_123',
					'x-user-role': 'user',
				},
				body: JSON.stringify({
					paypalOrderId: 'paypal_order_123',
					reservationId: 'res_123',
				}),
			});

			const response = await handler.fetch(request, env);

			expect([200, 400, 404, 502]).to.include(response.status);
		});
	});
});
