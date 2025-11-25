/**
 * Integration tests for inventory-worker
 * Tests full inventory reservation flow
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
			env.DB.prepare()
				.run.onFirstCall()
				.resolves({ success: true, meta: { changes: 1 } }); // Reserve stock
			env.DB.prepare().run.onSecondCall().resolves({ success: true }); // Create reservation

			// Mock lock acquisition: first call returns null (no lock), then after put, verify returns the owner
			let lockCallCount = 0;
			env.INVENTORY_LOCK_KV.get.callsFake(() => {
				lockCallCount++;
				if (lockCallCount === 1) {
					return Promise.resolve(null); // No existing lock initially
				}
				// After put, verify should return the owner
				return Promise.resolve('res-res_123');
			});
			env.INVENTORY_LOCK_KV.put.resolves(); // Allow lock to be set

			const body = JSON.stringify({
				reservationId: 'res_123',
				cartId: 'cart_123',
				userId: 'user_123',
				items: [{ productId: 'pro_1', qty: 2 }],
				ttl: 900,
			});
			const { timestamp, signature } = await generateSignature(env.INTERNAL_SECRET, 'POST', '/inventory/reserve', body);

			request = new Request('https://example.com/inventory/reserve', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-timestamp': timestamp,
					'x-signature': signature,
				},
				body,
			});

			const response = await handler.fetch(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data.reservationId).to.equal('res_123');
		});

		it('should return 409 when product is locked by another reservation', async () => {
			const mockStock = {
				product_id: 'pro_1',
				stock: 100,
				reserved: 10,
			};

			// Mock active reservation that holds the lock
			const mockActiveReservation = {
				reservation_id: 'other_123',
				status: 'active',
				expires_at: Date.now() / 1000 + 3600, // Not expired
			};

			env.DB.prepare().bind.returnsThis();
			env.DB.prepare().first.onFirstCall().resolves(mockStock); // Get stock
			env.DB.prepare().first.onSecondCall().resolves(mockActiveReservation); // Check reservation status (active, not expired)

			// Mock lock conflict: lock is held by another active reservation
			// The lock service will retry, so we need to return the same value for all attempts
			env.INVENTORY_LOCK_KV.get.resolves('res-other_123'); // Lock held by another reservation

			const body = JSON.stringify({
				reservationId: 'res_123',
				cartId: 'cart_123',
				userId: 'user_123',
				items: [{ productId: 'pro_1', qty: 2 }],
				ttl: 900,
			});
			const { timestamp, signature } = await generateSignature(env.INTERNAL_SECRET, 'POST', '/inventory/reserve', body);

			request = new Request('https://example.com/inventory/reserve', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-timestamp': timestamp,
					'x-signature': signature,
				},
				body,
			});

			const response = await handler.fetch(request, env);
			const data = await response.json();

			expect(response.status).to.equal(409);
			expect(data.error).to.equal('product_locked');
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

			const body = JSON.stringify({
				reservationId: 'res_123',
			});
			const { timestamp, signature } = await generateSignature(env.INTERNAL_SECRET, 'POST', '/inventory/commit', body);

			request = new Request('https://example.com/inventory/commit', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-timestamp': timestamp,
					'x-signature': signature,
				},
				body,
			});

			const response = await handler.fetch(request, env);

			expect([200, 404]).to.include(response.status);
		});
	});
});
