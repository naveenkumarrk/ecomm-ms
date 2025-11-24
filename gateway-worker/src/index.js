/**
 * Gateway Worker - Main entry point
 */
import { Router } from 'itty-router';
import { setupRoutes } from './routes/index.js';
import { jsonRes } from './helpers/response.js';
import { GATEWAY_TIMEOUT } from './config/constants.js';
import { instrument } from '@cloudflare/workers-opentelemetry';
import { trace } from '@opentelemetry/api';

const router = Router();

// Setup all routes
setupRoutes(router);

// Handler with OpenTelemetry tracing
const handler = {
	async fetch(request, env, ctx) {
		try {
			const span = trace.getActiveSpan();
			const cfRay = request.headers.get('cf-ray') || 'No cf-ray header';

			console.log('[GATEWAY] Request:', request.method, new URL(request.url).pathname, 'CF-Ray:', cfRay);

			if (span) {
				span.setAttribute('cfray', cfRay);
				span.addEvent('request_received', {
					message: JSON.stringify({
						request: request.url,
						method: request.method,
						headers: Object.fromEntries(request.headers.entries()),
						traceId: span.spanContext().traceId,
						cfRay: cfRay,
					}),
				});
			}

			const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Gateway timeout')), GATEWAY_TIMEOUT));

			const responsePromise = router.fetch(request, env, ctx);
			const response = await Promise.race([responsePromise, timeoutPromise]);

			if (span) {
				span.addEvent('response_sent', {
					status: response.status,
					statusText: response.statusText,
				});
			}

			return response;
		} catch (error) {
			console.error('[GATEWAY] Worker error:', error);

			const span = trace.getActiveSpan();
			if (span) {
				span.recordException(error);
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
const config = (env, _trigger) => ({
	exporter: {
		url: env.OTEL_EXPORTER_URL || 'https://api.honeycomb.io/v1/traces',
		headers: {
			'x-honeycomb-team': env.HONEYCOMB_API_KEY,
		},
	},
	service: {
		name: env.SERVICE_NAME || 'ecomm-ms-gateway',
	},
});

// Export the instrumented handler
export default instrument(handler, config);
