/**
 * Gateway Worker - Main entry point
 * Uses @microlabs/otel-cf-workers for automatic instrumentation
 * This will automatically trace:
 * - HTTP requests/responses
 * - Internal fetch calls to other services
 * - Trace context propagation across services
 */
import { Router } from 'itty-router';
import { instrument } from '@microlabs/otel-cf-workers';
import { setupRoutes } from './routes/index.js';
import { jsonRes } from './helpers/response.js';
import { GATEWAY_TIMEOUT } from './config/constants.js';
import { trace } from '@opentelemetry/api';

const router = Router();

// Setup all routes
setupRoutes(router);

const handler = {
	async fetch(request, env, ctx) {
		const cfRay = request.headers.get('cf-ray') || 'No cf-ray header';
		
		// Get active span (created by the instrument function)
		const span = trace.getActiveSpan();
		
		if (span) {
			// Add custom attributes to the span
			span.setAttribute('cf.ray', cfRay);
			span.setAttribute('http.method', request.method);
			span.setAttribute('http.url', request.url);
			span.setAttribute('http.route', new URL(request.url).pathname);
			span.setAttribute('service.name', env.SERVICE_NAME || 'ecomm-ms-gateway');
			
			// Add request received event
			span.addEvent('request_received', {
				message: JSON.stringify({
					request: request.url,
					method: request.method,
					cfRay: cfRay,
					traceId: span.spanContext().traceId,
				}),
			});
		}

		console.log('[GATEWAY] Request:', request.method, new URL(request.url).pathname, 'CF-Ray:', cfRay);

		try {
			const timeoutPromise = new Promise((_, reject) => 
				setTimeout(() => reject(new Error('Gateway timeout')), GATEWAY_TIMEOUT)
			);

			const responsePromise = router.fetch(request, env, ctx);
			const response = await Promise.race([responsePromise, timeoutPromise]);

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
			console.error('[GATEWAY] Worker error:', error);

			// Record error in span
			if (span) {
				span.recordException(error);
				span.setStatus({ code: 2, message: error.message }); // ERROR status
				span.addEvent('error_occurred', {
					error: error.message,
					stack: error.stack,
				});
			}

			return new Response(
				JSON.stringify({ error: 'Internal Server Error', message: error.message }),
				{ status: 500, headers: { 'Content-Type': 'application/json' } },
			);
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
			name: env.SERVICE_NAME || 'ecomm-ms-gateway',
		},
		// Enable fetch instrumentation - this will automatically trace all fetch calls
		// including internal service calls, and propagate trace context
		fetch: {
			enabled: true,
			// Propagate trace context to downstream services
			propagateTraceContext: true,
		},
		// Optional: Enable other instrumentations
		// You can add more instrumentations here as needed
	};
};

// Export the instrumented handler
// This will automatically:
// 1. Create spans for HTTP requests
// 2. Instrument all fetch() calls (including service calls)
// 3. Propagate trace context via W3C Trace Context headers
// 4. Send traces to Honeycomb
export default instrument(handler, config);
