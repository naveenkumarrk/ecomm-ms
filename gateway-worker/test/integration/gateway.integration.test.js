/**
 * Integration tests for gateway-worker
 * Tests full request/response cycles through the gateway
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import handler from '../../../src/index.js';
import sinon from 'sinon';

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

			env.PRODUCTS_SERVICE.fetch.resolves({
				ok: true,
				status: 200,
				text: sinon.stub().resolves(JSON.stringify(mockProducts)),
			});

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

		it('should return 401 for unauthenticated request', async () => {
			request = new Request('https://example.com/api/products', {
				method: 'GET',
			});

			const response = await handler.fetch(request, env);
			const data = await response.json();

			expect(response.status).to.equal(401);
			expect(data).to.have.property('error', 'unauthorized');
		});
	});

	describe('POST /api/auth/signup', () => {
		it('should proxy signup request to auth service', async () => {
			const mockResponse = {
				userId: 'user123',
				email: 'test@example.com',
			};

			env.AUTH_SERVICE.fetch.resolves({
				ok: true,
				status: 201,
				text: sinon.stub().resolves(JSON.stringify(mockResponse)),
			});

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

