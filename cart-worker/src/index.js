/**
 * Cart Worker - Main entry point (Top-level proxy)
 */
import { Router } from 'itty-router';
import { CartDurableObject } from './do/CartDurableObject.js';
import { handleOptions, corsHeaders } from './helpers/response.js';
import { CORS_HEADERS } from './config/constants.js';
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

const topRouter = Router();

topRouter.options('*', handleOptions);

topRouter.get(
	'/health',
	() =>
		new Response(JSON.stringify({ ok: true, service: 'cart-do' }), {
			headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
		}),
);

topRouter.all('*', async (req, env) => {
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
			span.setAttribute('service.name', env.SERVICE_NAME || 'cart-worker');
		}

		let cartId = req.headers.get('x-cart-id');
		if (!cartId) cartId = `cart_${crypto.randomUUID()}`;

		const id = env.CART_DO.idFromName(cartId);
		const stub = env.CART_DO.get(id);

		const newHeaders = new Headers(req.headers);
		newHeaders.set('x-cart-id', cartId);

		const forwardedUrl = new URL(req.url);
		const requestInit = {
			method: req.method,
			headers: newHeaders,
			redirect: req.redirect,
		};

		// Add body and duplex option if request has a body (Node.js requirement)
		if (req.body) {
			requestInit.body = req.body;
			requestInit.duplex = 'half';
		}

		const forwarded = new Request(forwardedUrl.href, requestInit);

		const res = await stub.fetch(forwarded, { waitUntil: false });

		// Add response attributes to span
		if (span) {
			span.setAttribute('http.status_code', res.status);
			if (res.status >= 500) {
				span.setStatus({ code: 2, message: `HTTP ${res.status}` }); // ERROR
			} else if (res.status >= 400) {
				span.setStatus({ code: 1, message: `HTTP ${res.status}` }); // OK but client error
			}
		}

		const outHeaders = new Headers(res.headers);
		outHeaders.set('x-cart-id', cartId);
		Object.entries(CORS_HEADERS).forEach(([k, v]) => outHeaders.set(k, v));

		const body = await res.arrayBuffer();

		return new Response(body, { status: res.status, headers: outHeaders });
	} catch (e) {
		console.error('Top router error:', e);
		// Record error in span
		const span = trace.getActiveSpan();
		if (span) {
			span.recordException(e);
			span.setStatus({ code: 2, message: e.message }); // ERROR status
		}
		return new Response(JSON.stringify({ error: 'proxy_error', details: String(e) }), {
			status: 500,
			headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
		});
	}
});

const handler = {
	fetch: (req, env) => topRouter.fetch(req, env),
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
			name: env.SERVICE_NAME || 'cart-worker',
		},
		// Enable fetch instrumentation - this will automatically trace all fetch calls
		fetch: {
			enabled: true,
		},
	};
};

// Export the raw handler for testing (without instrumentation)
export { handler, CartDurableObject };

// Export the instrumented handler (default export for production)
// If instrument is not available (e.g., in Node.js), just export the raw handler
export default instrument ? instrument(handler, config) : handler;
