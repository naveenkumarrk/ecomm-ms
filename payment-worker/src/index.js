/**
 * Payment Worker - Main entry point
 */
import { Router } from 'itty-router';
import { setupPaymentRoutes } from './routes/payment.routes.js';
import { trace } from '@opentelemetry/api';

// Try to import instrument, but handle gracefully if it fails (e.g., in Node.js test environment)
let instrument;
let instrumentModule;
try {
	// Dynamic import to avoid loading Cloudflare-specific code in Node.js
	instrumentModule = await import('@microlabs/otel-cf-workers');
	instrument = instrumentModule.instrument;
} catch (e) {
	// Not in Cloudflare runtime or module not available
	// This is expected in Node.js test environments
	instrument = null;
}

// Helper function to extract trace ID from traceparent header
function extractTraceIdFromHeader(traceparent) {
	if (!traceparent) return null;
	// traceparent format: version-trace_id-parent_id-trace_flags
	const parts = traceparent.split('-');
	if (parts.length >= 2) {
		return parts[1]; // trace_id is the second part
	}
	return null;
}

const router = Router();

// Setup all routes
setupPaymentRoutes(router);

const handler = {
	async fetch(req, env, ctx) {
		try {
			const cfRay = req.headers.get('cf-ray') || 'No cf-ray header';
			const traceparent = req.headers.get('traceparent');
			const traceIdFromHeader = extractTraceIdFromHeader(traceparent);

			// Get active span (created by the instrument function)
			const span = trace.getActiveSpan();

			if (span) {
				// Add custom attributes to the span
				span.setAttribute('cf.ray', cfRay);
				if (traceIdFromHeader) {
					span.setAttribute('trace.id', traceIdFromHeader);
				}
				span.setAttribute('http.method', req.method);
				span.setAttribute('http.url', req.url);
				span.setAttribute('http.route', new URL(req.url).pathname);
				span.setAttribute('service.name', env.SERVICE_NAME || 'payment-worker');
			}

			const response = await router.fetch(req, env, ctx);

			// Add response attributes to span
			if (span) {
				span.setAttribute('http.status_code', response.status);
				if (response.status >= 500) {
					span.setStatus({ code: 2, message: `HTTP ${response.status}` }); // ERROR
				} else if (response.status >= 400) {
					span.setStatus({ code: 1, message: `HTTP ${response.status}` }); // OK but client error
				}
			}

			return response;
		} catch (error) {
			console.error('[PAYMENT] Worker error:', error);
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
			name: env.SERVICE_NAME || 'payment-worker',
		},
		// Enable fetch instrumentation - this will automatically trace all fetch calls
		fetch: {
			enabled: true,
		},
	};
};

// Export the raw handler for testing (without instrumentation)
export { handler };

// Export the instrumented handler (default export for production)
// If instrument is not available (e.g., in Node.js), just export the raw handler
export default instrument ? instrument(handler, config) : handler;
