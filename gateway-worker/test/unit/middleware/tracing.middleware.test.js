/**
 * Unit tests for tracing.middleware.js
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { withServiceSpan, withDOSpan } from '../../../src/middleware/tracing.middleware.js';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import sinon from 'sinon';

describe('tracing.middleware', () => {
	let mockSpan;
	let mockTracer;
	let mockParentSpan;

	beforeEach(() => {
		mockSpan = {
			addEvent: sinon.stub(),
			setAttribute: sinon.stub(),
			setStatus: sinon.stub(),
			recordException: sinon.stub(),
			end: sinon.stub(),
			spanContext: sinon.stub().returns({
				traceId: 'test-trace-id',
				spanId: 'test-span-id',
			}),
		};

		mockParentSpan = {
			spanContext: sinon.stub().returns({
				traceId: 'parent-trace-id',
				spanId: 'parent-span-id',
			}),
		};

		mockTracer = {
			startActiveSpan: sinon.stub().callsFake((name, options, callback) => {
				return callback(mockSpan);
			}),
		};

		sinon.stub(trace, 'getTracer').returns(mockTracer);
		sinon.stub(trace, 'getActiveSpan').returns(mockParentSpan);
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('withServiceSpan', () => {
		it('should create a span and execute operation successfully', async () => {
			const operation = sinon.stub().resolves({ ok: true, status: 200 });

			const result = await withServiceSpan('TEST_SERVICE', '/test', 'GET', operation);

			expect(mockTracer.startActiveSpan).to.have.been.calledOnce;
			expect(mockSpan.addEvent).to.have.been.calledWith('service_call_started', {
				service: 'TEST_SERVICE',
				path: '/test',
				method: 'GET',
			});
			expect(mockSpan.setAttribute).to.have.been.calledWith('http.status_code', 200);
			expect(mockSpan.setAttribute).to.have.been.calledWith('service.response.ok', true);
			expect(mockSpan.setStatus).to.have.been.calledWith({ code: SpanStatusCode.OK });
			expect(mockSpan.addEvent).to.have.been.calledWith('service_call_completed', {
				service: 'TEST_SERVICE',
				success: true,
			});
			expect(mockSpan.end).to.have.been.calledOnce;
			expect(result).to.deep.equal({ ok: true, status: 200 });
		});

		it('should handle 500 error status', async () => {
			const operation = sinon.stub().resolves({ ok: false, status: 500 });

			await withServiceSpan('TEST_SERVICE', '/test', 'GET', operation);

			expect(mockSpan.setStatus).to.have.been.calledWith({
				code: SpanStatusCode.ERROR,
				message: 'Service error: 500',
			});
		});

		it('should handle 400 error status', async () => {
			const operation = sinon.stub().resolves({ ok: false, status: 400 });

			await withServiceSpan('TEST_SERVICE', '/test', 'GET', operation);

			expect(mockSpan.setStatus).to.have.been.calledWith({
				code: SpanStatusCode.ERROR,
				message: 'Client error: 400',
			});
		});

		it('should handle operation without status', async () => {
			const operation = sinon.stub().resolves({ data: 'test' });

			const result = await withServiceSpan('TEST_SERVICE', '/test', 'GET', operation);

			expect(mockSpan.setAttribute).to.not.have.been.calledWith('http.status_code', sinon.match.any);
			expect(result).to.deep.equal({ data: 'test' });
		});

		it('should handle operation errors', async () => {
			const error = new Error('Test error');
			const operation = sinon.stub().rejects(error);

			try {
				await withServiceSpan('TEST_SERVICE', '/test', 'GET', operation);
				expect.fail('Should have thrown error');
			} catch (e) {
				expect(e).to.equal(error);
				expect(mockSpan.recordException).to.have.been.calledWith(error);
				expect(mockSpan.setStatus).to.have.been.calledWith({
					code: SpanStatusCode.ERROR,
					message: 'Test error',
				});
				expect(mockSpan.addEvent).to.have.been.calledWith('service_call_failed', {
					service: 'TEST_SERVICE',
					error: 'Test error',
				});
				expect(mockSpan.end).to.have.been.calledOnce;
			}
		});

		it('should handle operation errors without message', async () => {
			const error = new Error();
			const operation = sinon.stub().rejects(error);

			try {
				await withServiceSpan('TEST_SERVICE', '/test', 'GET', operation);
				expect.fail('Should have thrown error');
			} catch (e) {
				expect(mockSpan.setStatus).to.have.been.calledWith({
					code: SpanStatusCode.ERROR,
					message: 'Service call failed',
				});
			}
		});

		it('should create span without parent span', async () => {
			trace.getActiveSpan.returns(null);
			const operation = sinon.stub().resolves({ ok: true, status: 200 });

			await withServiceSpan('TEST_SERVICE', '/test', 'GET', operation);

			const callArgs = mockTracer.startActiveSpan.firstCall.args;
			expect(callArgs[1].links).to.deep.equal([]);
		});

		it('should link to parent span when available', async () => {
			const operation = sinon.stub().resolves({ ok: true, status: 200 });

			await withServiceSpan('TEST_SERVICE', '/test', 'GET', operation);

			const callArgs = mockTracer.startActiveSpan.firstCall.args;
			expect(callArgs[1].links).to.have.length(1);
			expect(callArgs[1].links[0].context).to.deep.equal({
				traceId: 'parent-trace-id',
				spanId: 'parent-span-id',
			});
		});

		it('should set correct span attributes', async () => {
			const operation = sinon.stub().resolves({ ok: true, status: 200 });

			await withServiceSpan('TEST_SERVICE', '/test', 'POST', operation);

			const callArgs = mockTracer.startActiveSpan.firstCall.args;
			expect(callArgs[1].attributes).to.deep.equal({
				'service.name': 'TEST_SERVICE',
				'http.method': 'POST',
				'http.url': '/test',
				'http.route': '/test',
				'span.kind': 'client',
			});
		});
	});

	describe('withDOSpan', () => {
		it('should create a DO span and execute operation successfully', async () => {
			const operation = sinon.stub().resolves({ status: 200 });

			const result = await withDOSpan('CartDurableObject', 'cart-123', '/cart/add', 'POST', operation);

			expect(mockTracer.startActiveSpan).to.have.been.calledOnce;
			expect(mockSpan.addEvent).to.have.been.calledWith('do_call_started', {
				do: 'CartDurableObject',
				doId: 'cart-123',
				path: '/cart/add',
			});
			expect(mockSpan.setAttribute).to.have.been.calledWith('http.status_code', 200);
			expect(mockSpan.setAttribute).to.have.been.calledWith('do.response.ok', true);
			expect(mockSpan.setStatus).to.have.been.calledWith({ code: SpanStatusCode.OK });
			expect(mockSpan.addEvent).to.have.been.calledWith('do_call_completed', {
				do: 'CartDurableObject',
				success: true,
			});
			expect(mockSpan.end).to.have.been.calledOnce;
			expect(result).to.deep.equal({ status: 200 });
		});

		it('should handle 500 error status for DO', async () => {
			const operation = sinon.stub().resolves({ status: 500 });

			await withDOSpan('CartDurableObject', 'cart-123', '/cart/add', 'POST', operation);

			expect(mockSpan.setStatus).to.have.been.calledWith({
				code: SpanStatusCode.ERROR,
				message: 'DO error: 500',
			});
		});

		it('should handle 400 error status for DO', async () => {
			const operation = sinon.stub().resolves({ status: 400 });

			await withDOSpan('CartDurableObject', 'cart-123', '/cart/add', 'POST', operation);

			expect(mockSpan.setAttribute).to.have.been.calledWith('do.response.ok', false);
			expect(mockSpan.setStatus).to.have.been.calledWith({
				code: SpanStatusCode.ERROR,
				message: 'DO client error: 400',
			});
		});

		it('should handle DO operation errors', async () => {
			const error = new Error('DO error');
			const operation = sinon.stub().rejects(error);

			try {
				await withDOSpan('CartDurableObject', 'cart-123', '/cart/add', 'POST', operation);
				expect.fail('Should have thrown error');
			} catch (e) {
				expect(e).to.equal(error);
				expect(mockSpan.recordException).to.have.been.calledWith(error);
				expect(mockSpan.setStatus).to.have.been.calledWith({
					code: SpanStatusCode.ERROR,
					message: 'DO error',
				});
				expect(mockSpan.addEvent).to.have.been.calledWith('do_call_failed', {
					do: 'CartDurableObject',
					error: 'DO error',
				});
			}
		});

		it('should handle DO operation without status', async () => {
			const operation = sinon.stub().resolves({ data: 'test' });

			const result = await withDOSpan('CartDurableObject', 'cart-123', '/cart/add', 'POST', operation);

			expect(mockSpan.setAttribute).to.not.have.been.calledWith('http.status_code', sinon.match.any);
			expect(result).to.deep.equal({ data: 'test' });
		});

		it('should set correct DO span attributes', async () => {
			const operation = sinon.stub().resolves({ status: 200 });

			await withDOSpan('CartDurableObject', 'cart-123', '/cart/add', 'POST', operation);

			const callArgs = mockTracer.startActiveSpan.firstCall.args;
			expect(callArgs[1].attributes).to.deep.equal({
				'durable_object.name': 'CartDurableObject',
				'durable_object.id': 'cart-123',
				'http.method': 'POST',
				'http.url': '/cart/add',
				'http.route': '/cart/add',
				'span.kind': 'client',
			});
		});

		it('should create DO span without parent span', async () => {
			trace.getActiveSpan.returns(null);
			const operation = sinon.stub().resolves({ status: 200 });

			await withDOSpan('CartDurableObject', 'cart-123', '/cart/add', 'POST', operation);

			const callArgs = mockTracer.startActiveSpan.firstCall.args;
			expect(callArgs[1].links).to.deep.equal([]);
		});
	});
});
