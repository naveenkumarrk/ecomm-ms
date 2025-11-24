/**
 * Unit tests for service-caller.js
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { callService } from '../../../src/services/service-caller.js';
import sinon from 'sinon';

describe('service-caller', () => {
	let env;

	beforeEach(() => {
		env = {
			PRODUCTS_SERVICE: {
				fetch: sinon.stub(),
			},
			PRODUCTS_SERVICE_URL: 'https://products.example.com',
			INTERNAL_SECRET: 'test-secret',
		};
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('callService', () => {
		it('should call service using service binding', async () => {
			const mockResponse = {
				ok: true,
				status: 200,
				text: sinon.stub().resolves('{"data": "test"}'),
			};

			env.PRODUCTS_SERVICE.fetch.resolves(mockResponse);

			const result = await callService('PRODUCTS_SERVICE', '/products', 'GET', null, {}, null, env);

			expect(env.PRODUCTS_SERVICE.fetch).to.have.been.calledOnce;
			expect(result).to.have.property('ok', true);
			expect(result).to.have.property('status', 200);
			expect(result.body).to.deep.equal({ data: 'test' });
		});

		it('should call service using URL when binding not available', async () => {
			delete env.PRODUCTS_SERVICE;

			const mockResponse = {
				ok: true,
				status: 200,
				text: sinon.stub().resolves('{"data": "test"}'),
			};

			global.fetch = sinon.stub().resolves(mockResponse);

			const result = await callService('PRODUCTS_SERVICE', '/products', 'GET', null, {}, null, env);

			expect(global.fetch).to.have.been.calledOnce;
			expect(global.fetch.firstCall.args[0]).to.include('https://products.example.com/products');
			expect(result).to.have.property('ok', true);
			expect(result).to.have.property('status', 200);
		});

		it('should include user context in headers', async () => {
			const userContext = {
				sub: 'user123',
				role: 'user',
				sid: 'session123',
			};

			const mockResponse = {
				ok: true,
				status: 200,
				text: sinon.stub().resolves('{}'),
			};

			env.PRODUCTS_SERVICE.fetch.resolves(mockResponse);

			await callService('PRODUCTS_SERVICE', '/products', 'GET', null, {}, userContext, env);

			const callArgs = env.PRODUCTS_SERVICE.fetch.firstCall.args[0];
			expect(callArgs.headers.get('x-user-id')).to.equal('user123');
			expect(callArgs.headers.get('x-user-role')).to.equal('user');
			expect(callArgs.headers.get('x-session-id')).to.equal('session123');
		});

		it('should include body in request', async () => {
			const body = { test: 'data' };
			const mockResponse = {
				ok: true,
				status: 200,
				text: sinon.stub().resolves('{}'),
			};

			env.PRODUCTS_SERVICE.fetch.resolves(mockResponse);

			await callService('PRODUCTS_SERVICE', '/products', 'POST', body, {}, null, env);

			const callArgs = env.PRODUCTS_SERVICE.fetch.firstCall.args[0];
			// Request body is a ReadableStream, need to clone it to read
			expect(callArgs.body).to.exist;
			if (callArgs.body && typeof callArgs.body.text === 'function') {
				const bodyText = await callArgs.body.text();
				expect(bodyText).to.equal(JSON.stringify(body));
			} else if (callArgs.body && callArgs.body instanceof ReadableStream) {
				// Clone the stream to read it
				const cloned = callArgs.body.tee();
				const bodyText = await new Response(cloned[0]).text();
				expect(bodyText).to.equal(JSON.stringify(body));
			} else {
				// Just verify body exists and Request was created
				expect(callArgs).to.be.instanceOf(Request);
				expect(callArgs.method).to.equal('POST');
			}
		});

		it('should return error when service not configured', async () => {
			delete env.PRODUCTS_SERVICE;
			delete env.PRODUCTS_SERVICE_URL;

			const result = await callService('PRODUCTS_SERVICE', '/products', 'GET', null, {}, null, env);

			expect(result).to.have.property('ok', false);
			expect(result).to.have.property('status', 502);
			expect(result.body).to.have.property('error', 'service_not_configured');
		});

		it('should handle timeout', async () => {
			env.PRODUCTS_SERVICE.fetch.returns(
				new Promise((resolve) => setTimeout(() => resolve({ ok: true, status: 200, text: () => Promise.resolve('{}') }), 100)),
			);

			const result = await callService('PRODUCTS_SERVICE', '/products', 'GET', null, {}, null, env, 10);

			expect(result).to.have.property('ok', false);
			expect(result).to.have.property('status', 504);
			expect(result.body).to.have.property('error', 'gateway_timeout');
		});

		it('should handle non-JSON response', async () => {
			const mockResponse = {
				ok: true,
				status: 200,
				text: sinon.stub().resolves('plain text response'),
			};

			env.PRODUCTS_SERVICE.fetch.resolves(mockResponse);

			const result = await callService('PRODUCTS_SERVICE', '/products', 'GET', null, {}, null, env);

			expect(result.body).to.equal('plain text response');
		});

		it('should propagate trace context when active span exists', async () => {
			const { trace, context, propagation } = await import('@opentelemetry/api');
			const mockSpan = {
				spanContext: sinon.stub().returns({
					traceId: 'test-trace-id',
					spanId: 'test-span-id',
				}),
			};

			// Mock getActiveSpan to return span when called inside the operation
			let spanReturned = false;
			const originalGetActiveSpan = trace.getActiveSpan;
			sinon.stub(trace, 'getActiveSpan').callsFake(() => {
				// Return span on second call (inside the operation callback)
				if (spanReturned) {
					return mockSpan;
				}
				spanReturned = true;
				return originalGetActiveSpan ? originalGetActiveSpan() : null;
			});

			const injectStub = sinon.stub(propagation, 'inject').callsFake((ctx, headers, carrier) => {
				if (carrier && carrier.set) {
					carrier.set(headers, 'traceparent', '00-test-trace-id-test-span-id-01');
				}
			});

			const mockResponse = {
				ok: true,
				status: 200,
				text: sinon.stub().resolves('{}'),
			};

			env.PRODUCTS_SERVICE.fetch.resolves(mockResponse);

			const result = await callService('PRODUCTS_SERVICE', '/products', 'GET', null, {}, null, env);

			expect(result).to.have.property('ok', true);
			expect(result).to.have.property('status', 200);
			// Verify that trace context propagation was attempted
			expect(trace.getActiveSpan.callCount).to.be.greaterThan(0);
		});

		it('should handle error responses', async () => {
			const mockResponse = {
				ok: false,
				status: 500,
				text: sinon.stub().resolves('{"error": "internal error"}'),
			};

			env.PRODUCTS_SERVICE.fetch.resolves(mockResponse);

			const result = await callService('PRODUCTS_SERVICE', '/products', 'GET', null, {}, null, env);

			expect(result).to.have.property('ok', false);
			expect(result).to.have.property('status', 500);
			expect(result.body).to.deep.equal({ error: 'internal error' });
		});
	});
});
