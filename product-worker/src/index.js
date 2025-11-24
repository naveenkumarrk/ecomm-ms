/**
 * Product Worker - Main entry point
 */
import { Router } from 'itty-router';
import { instrument } from '@microlabs/otel-cf-workers';
import { setupProductRoutes } from './routes/product.routes.js';
import { jsonResponse } from './helpers/response.js';
import { trace } from '@opentelemetry/api';

const router = Router();

// Setup all routes
setupProductRoutes(router);

// Catch all 404
router.all('*', () => jsonResponse({ error: 'not_found' }, 404));

const handler = {
	async fetch(request, env, ctx) {
		try {
			// Get active span and add custom attributes
			const span = trace.getActiveSpan();
			const cfRay = request.headers.get('cf-ray') || 'No cf-ray header';

			// Debug: Log span context to verify trace propagation from gateway
			if (span) {
				const spanContext = span.spanContext();
				console.log('[PRODUCT] Span Context:', {
					traceId: spanContext.traceId,
					spanId: spanContext.spanId,
					traceFlags: spanContext.traceFlags,
					isRemote: spanContext.isRemote,
				});

				// Check for trace context headers (W3C Trace Context)
				const traceparent = request.headers.get('traceparent');
				const tracestate = request.headers.get('tracestate');
				console.log('[PRODUCT] Trace Context Headers:', {
					traceparent: traceparent ? traceparent.substring(0, 50) + '...' : 'none',
					tracestate: tracestate || 'none',
				});

				span.setAttribute('cf.ray', cfRay);
				span.setAttribute('http.method', request.method);
				span.setAttribute('http.url', request.url);
				span.setAttribute('http.route', new URL(request.url).pathname);
				span.setAttribute('service.name', env.SERVICE_NAME || 'product-worker');

				span.addEvent('request_received', {
					message: JSON.stringify({
						request: request.url,
						method: request.method,
						cfRay: cfRay,
						traceId: spanContext.traceId,
					}),
				});
			} else {
				console.warn('[PRODUCT] No active span found! Tracing may not be initialized correctly.');
			}

			const response = await router.fetch(request, env, ctx);

			// Add response attributes to span
			if (span) {
				span.setAttribute('http.status_code', response.status);
				span.addEvent('response_sent', {
					status: response.status,
					statusText: response.statusText,
				});

				// Set span status based on response
				if (response.status >= 500) {
					span.setStatus({ code: 2, message: `HTTP ${response.status}` }); // ERROR
				} else if (response.status >= 400) {
					span.setStatus({ code: 1, message: `HTTP ${response.status}` }); // OK but client error
				}
			}

			return response;
		} catch (error) {
			console.error('[PRODUCT] Worker error:', error);

			// Record error in span
			const span = trace.getActiveSpan();
			if (span) {
				span.recordException(error);
				span.setStatus({ code: 2, message: error.message }); // ERROR status
			}

			return new Response(JSON.stringify({ error: 'Internal Server Error', message: error.message }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			});
		}
	},
};

// OpenTelemetry configuration
const config = (env, _trigger) => {
	// Build headers with both API key and dataset
	const headers = {
		'x-honeycomb-team': env.HONEYCOMB_API_KEY || '',
	};

	// Add dataset header if provided
	if (env.HONEYCOMB_DATASET) {
		headers['x-honeycomb-dataset'] = env.HONEYCOMB_DATASET;
	}

	return {
		exporter: {
			url: env.OTEL_EXPORTER_URL || 'https://api.honeycomb.io/v1/traces',
			headers: headers,
		},
		service: {
			name: env.SERVICE_NAME || 'product-worker',
		},
		// Optional: Add fetch instrumentation
		fetch: {
			enabled: true,
		},
	};
};

// Export the instrumented handler
export default instrument(handler, config);
