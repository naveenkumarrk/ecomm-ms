/**
 * Gateway Worker - Main entry point
 */
import { Router } from 'itty-router';
import { setupRoutes } from './routes/index.js';
import { jsonRes } from './helpers/response.js';
import { GATEWAY_TIMEOUT } from './config/constants.js';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

const router = Router();

// Setup all routes
setupRoutes(router);

// Helper function to send trace to Honeycomb
async function sendTrace(env, spanData) {
	if (!env.HONEYCOMB_API_KEY || !env.OTEL_EXPORTER_URL) {
		return;
	}

	try {
		const tracePayload = {
			data: [
				{
					trace_id: spanData.traceId,
					span_id: spanData.spanId,
					parent_span_id: spanData.parentSpanId,
					name: spanData.name,
					start_time: spanData.startTime,
					end_time: spanData.endTime,
					attributes: spanData.attributes,
					events: spanData.events,
					status: spanData.status,
				},
			],
		};

		await fetch(env.OTEL_EXPORTER_URL || 'https://api.honeycomb.io/v1/traces', {
			method: 'POST',
			headers: {
				'x-honeycomb-team': env.HONEYCOMB_API_KEY,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(tracePayload),
		});
	} catch (error) {
		console.error('[GATEWAY] Failed to send trace:', error);
	}
}

// Export with OpenTelemetry tracing
export default {
	async fetch(request, env, ctx) {
		const tracer = trace.getTracer(env.SERVICE_NAME || 'ecomm-ms-gateway');
		const cfRay = request.headers.get('cf-ray') || 'No cf-ray header';
		const traceId = crypto.randomUUID();
		const spanId = crypto.randomUUID();

		const spanData = {
			traceId: traceId,
			spanId: spanId,
			parentSpanId: null,
			name: `${request.method} ${new URL(request.url).pathname}`,
			startTime: Date.now() * 1000000, // nanoseconds
			endTime: 0,
			attributes: {
				'http.method': request.method,
				'http.url': request.url,
				'http.route': new URL(request.url).pathname,
				'cf.ray': cfRay,
				'service.name': env.SERVICE_NAME || 'ecomm-ms-gateway',
			},
			events: [],
			status: { code: SpanStatusCode.OK },
		};

		console.log('[GATEWAY] Request:', request.method, new URL(request.url).pathname, 'CF-Ray:', cfRay, 'TraceId:', traceId);

		// Add request received event
		spanData.events.push({
			name: 'request_received',
			time: Date.now() * 1000000,
			attributes: {
				message: JSON.stringify({
					request: request.url,
					method: request.method,
					headers: Object.fromEntries(request.headers.entries()),
					traceId: traceId,
					cfRay: cfRay,
				}),
			},
		});

		try {
			const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Gateway timeout')), GATEWAY_TIMEOUT));

			const responsePromise = router.fetch(request, env, ctx);
			const response = await Promise.race([responsePromise, timeoutPromise]);

			spanData.endTime = Date.now() * 1000000;
			spanData.status = {
				code: response.status >= 200 && response.status < 400 ? SpanStatusCode.OK : SpanStatusCode.ERROR,
			};

			// Add response sent event
			spanData.events.push({
				name: 'response_sent',
				time: Date.now() * 1000000,
				attributes: {
					status: response.status,
					statusText: response.statusText,
				},
			});

			spanData.attributes['http.status_code'] = response.status;

			// Send trace asynchronously (don't block response)
			ctx.waitUntil(sendTrace(env, spanData));

			return response;
		} catch (error) {
			console.error('[GATEWAY] Worker error:', error);

			spanData.endTime = Date.now() * 1000000;
			spanData.status = {
				code: SpanStatusCode.ERROR,
				message: error.message,
			};

			// Add error event
			spanData.events.push({
				name: 'error_occurred',
				time: Date.now() * 1000000,
				attributes: {
					error: error.message,
					stack: error.stack,
				},
			});

			// Send trace asynchronously
			ctx.waitUntil(sendTrace(env, spanData));

			return new Response(
				JSON.stringify({ error: 'Internal Server Error', message: error.message }),
				{ status: 500, headers: { 'Content-Type': 'application/json' } },
			);
		}
	},
};
