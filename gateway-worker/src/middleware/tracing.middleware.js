/**
 * Tracing Middleware
 * Creates child spans for service calls to build a proper span tree
 */
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

/**
 * Get or create a tracer for service calls
 */
function getTracer() {
	return trace.getTracer('ecomm-ms-gateway', '1.0.0');
}

/**
 * Creates a child span for a service call
 * This ensures proper span hierarchy in distributed tracing
 *
 * @param {string} serviceName - Name of the service being called
 * @param {string} path - API path being called
 * @param {string} method - HTTP method
 * @param {Function} operation - Async function to execute within the span
 * @returns {Promise} Result of the operation
 */
export async function withServiceSpan(serviceName, path, method, operation) {
	const tracer = getTracer();
	const spanName = `${serviceName} ${method} ${path}`;

	// Get the active span (parent span from gateway request)
	const parentSpan = trace.getActiveSpan();

	// Create a child span for this service call
	return tracer.startActiveSpan(
		spanName,
		{
			attributes: {
				'service.name': serviceName,
				'http.method': method,
				'http.url': path,
				'http.route': path,
				'span.kind': 'client', // This is a client span (outgoing request)
			},
			// Link to parent span if available
			links: parentSpan
				? [
						{
							context: parentSpan.spanContext(),
						},
					]
				: [],
		},
		async (span) => {
			try {
				// Add span start event
				span.addEvent('service_call_started', {
					service: serviceName,
					path: path,
					method: method,
				});

				// Execute the operation within the span context
				const result = await operation();

				// Add success attributes
				if (result && typeof result === 'object' && 'status' in result) {
					span.setAttribute('http.status_code', result.status);
					span.setAttribute('service.response.ok', result.ok || false);

					if (result.status >= 500) {
						span.setStatus({ code: SpanStatusCode.ERROR, message: `Service error: ${result.status}` });
					} else if (result.status >= 400) {
						span.setStatus({ code: SpanStatusCode.ERROR, message: `Client error: ${result.status}` });
					} else {
						span.setStatus({ code: SpanStatusCode.OK });
					}
				}

				// Add completion event
				span.addEvent('service_call_completed', {
					service: serviceName,
					success: true,
				});

				return result;
			} catch (error) {
				// Record error in span
				span.recordException(error);
				span.setStatus({
					code: SpanStatusCode.ERROR,
					message: error.message || 'Service call failed',
				});

				span.addEvent('service_call_failed', {
					service: serviceName,
					error: error.message,
				});

				throw error;
			} finally {
				// Always end the span
				span.end();
			}
		},
	);
}

/**
 * Creates a child span for Durable Object calls
 *
 * @param {string} doName - Name of the Durable Object
 * @param {string} doId - ID of the Durable Object instance
 * @param {string} path - Path being called
 * @param {string} method - HTTP method
 * @param {Function} operation - Async function to execute within the span
 * @returns {Promise} Result of the operation
 */
export async function withDOSpan(doName, doId, path, method, operation) {
	const tracer = getTracer();
	const spanName = `${doName} ${method} ${path}`;

	const parentSpan = trace.getActiveSpan();

	return tracer.startActiveSpan(
		spanName,
		{
			attributes: {
				'durable_object.name': doName,
				'durable_object.id': doId,
				'http.method': method,
				'http.url': path,
				'http.route': path,
				'span.kind': 'client',
			},
			links: parentSpan
				? [
						{
							context: parentSpan.spanContext(),
						},
					]
				: [],
		},
		async (span) => {
			try {
				span.addEvent('do_call_started', {
					do: doName,
					doId: doId,
					path: path,
				});

				const result = await operation();

				if (result && typeof result === 'object' && 'status' in result) {
					span.setAttribute('http.status_code', result.status);
					span.setAttribute('do.response.ok', result.status < 400);

					if (result.status >= 500) {
						span.setStatus({ code: SpanStatusCode.ERROR, message: `DO error: ${result.status}` });
					} else if (result.status >= 400) {
						span.setStatus({ code: SpanStatusCode.ERROR, message: `DO client error: ${result.status}` });
					} else {
						span.setStatus({ code: SpanStatusCode.OK });
					}
				}

				span.addEvent('do_call_completed', {
					do: doName,
					success: true,
				});

				return result;
			} catch (error) {
				span.recordException(error);
				span.setStatus({
					code: SpanStatusCode.ERROR,
					message: error.message || 'DO call failed',
				});

				span.addEvent('do_call_failed', {
					do: doName,
					error: error.message,
				});

				throw error;
			} finally {
				span.end();
			}
		},
	);
}
