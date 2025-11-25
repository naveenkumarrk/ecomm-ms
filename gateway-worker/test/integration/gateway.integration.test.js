/**
 * Integration tests for gateway-worker
 * Tests full request/response cycles through the gateway
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import sinon from 'sinon';

// Resolve import path relative to this file to avoid CI path resolution issues
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const handlerModule = await import('file://' + resolve(__dirname, '../../src/index.js'));
// Use the raw handler export (without instrumentation) for Node.js testing
// The default export uses @microlabs/otel-cf-workers which requires Cloudflare runtime
const handler = handlerModule.handler || handlerModule.default;

describe('Gateway Worker Integration', () => {
	let env, request;

	beforeEach(() => {
		env = {
			PRODUCTS_SERVICE: {
				fetch: sinon.stub(),
			},
			AUTH_SERVICE: {
				fetch: sinon.stub(),
			},
			INTERNAL_SECRET: 'test-secret',
			JWT_SECRET: btoa('test-secret'),
		};
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('GET /api/products', () => {
		it('should proxy request to products service', async () => {
			const mockProducts = [{ productId: 'pro_1', title: 'Product 1' }];

			env.PRODUCTS_SERVICE.fetch.resolves(
				new Response(JSON.stringify(mockProducts), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				}),
			);

			request = new Request('https://example.com/api/products', {
				method: 'GET',
				headers: {
					Authorization: 'Bearer valid-token',
				},
			});

			const response = await handler.fetch(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(env.PRODUCTS_SERVICE.fetch).to.have.been.calledOnce;
		});
	});

	describe('Authentication', () => {
		it('should return 401 for unauthenticated request to protected endpoint', async () => {
			// Test an endpoint that requires authentication
			request = new Request('https://example.com/api/auth/me', {
				method: 'GET',
			});

			const response = await handler.fetch(request, env);
			const data = await response.json();

			expect(response.status).to.equal(401);
			expect(data).to.have.property('error');
		});
	});

	describe('POST /api/auth/signup', () => {
		it('should proxy signup request to auth service', async () => {
			const mockResponse = {
				userId: 'user123',
				email: 'test@example.com',
			};

			env.AUTH_SERVICE.fetch.resolves(
				new Response(JSON.stringify(mockResponse), {
					status: 201,
					headers: { 'Content-Type': 'application/json' },
				}),
			);

			request = new Request('https://example.com/api/auth/signup', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					email: 'test@example.com',
					password: 'password123',
					name: 'Test User',
				}),
			});

			const response = await handler.fetch(request, env);
			const data = await response.json();

			expect(response.status).to.equal(201);
			expect(env.AUTH_SERVICE.fetch).to.have.been.calledOnce;
		});
	});

	describe('CORS', () => {
		it('should handle OPTIONS preflight request', async () => {
			request = new Request('https://example.com/api/products', {
				method: 'OPTIONS',
			});

			const response = await handler.fetch(request, env);

			expect(response.status).to.equal(200);
			expect(response.headers.get('Access-Control-Allow-Origin')).to.equal('*');
		});
	});
});
