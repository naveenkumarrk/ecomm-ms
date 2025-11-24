/**
 * Service caller - Handles both service bindings and URLs
 * Ensures trace context propagation for distributed tracing
 */
import { DEFAULT_TIMEOUT } from '../config/constants.js';
import { trace, context, propagation } from '@opentelemetry/api';

export async function callService(
	serviceName,
	path,
	method = 'GET',
	body = null,
	headers = {},
	userContext = null,
	env,
	timeout = DEFAULT_TIMEOUT,
) {
	console.log(`[GATEWAY] Calling ${serviceName} ${method} ${path}`);

	try {
		const bodyText = body ? JSON.stringify(body) : null;
		const reqHeaders = {
			'Content-Type': 'application/json',
			...headers,
		};

		// Pass user context to internal services
		if (userContext) {
			reqHeaders['x-user-id'] = userContext.sub;
			reqHeaders['x-user-role'] = userContext.role;
			reqHeaders['x-session-id'] = userContext.sid;
		}

		// Get active span to propagate trace context
		const activeSpan = trace.getActiveSpan();
		if (activeSpan) {
			const spanContext = activeSpan.spanContext();
			console.log(`[GATEWAY] Propagating trace context to ${serviceName}:`, {
				traceId: spanContext.traceId,
				spanId: spanContext.spanId,
			});

			// Manually inject trace context into headers for service bindings
			// (fetch() calls are automatically instrumented, but service bindings need manual propagation)
			propagation.inject(context.active(), reqHeaders, {
				set: (carrier, key, value) => {
					carrier[key] = value;
				},
			});
		}

		// Determine target - try service binding first, then URL
		let fetchPromise;
		const serviceBinding = env[serviceName];
		const serviceUrl = env[`${serviceName}_URL`];

		// Try Service Binding first
		if (serviceBinding && typeof serviceBinding.fetch === 'function') {
			console.log(`[GATEWAY] Using service binding for ${serviceName}`);
			fetchPromise = serviceBinding.fetch(
				new Request(`https://internal${path}`, {
					method,
					headers: reqHeaders,
					body: bodyText,
				}),
			);
		}
		// Fallback to URL - fetch() is automatically instrumented by @microlabs/otel-cf-workers
		else if (serviceUrl && serviceUrl.startsWith('http')) {
			console.log(`[GATEWAY] Using URL for ${serviceName}: ${serviceUrl}`);
			const fullUrl = serviceUrl.replace(/\/$/, '') + path;
			// Use the instrumented fetch from the active context
			fetchPromise = fetch(fullUrl, {
				method,
				headers: reqHeaders,
				body: bodyText,
			});
		} else {
			console.error(`[GATEWAY] No valid target for ${serviceName}`);
			return {
				ok: false,
				status: 502,
				body: {
					error: 'service_not_configured',
					service: serviceName,
					message: `Neither binding nor URL available for ${serviceName}`,
				},
			};
		}

		// Add timeout protection
		const timeoutPromise = new Promise((_, reject) =>
			setTimeout(() => reject(new Error(`Service call timeout after ${timeout}ms`)), timeout),
		);

		const res = await Promise.race([fetchPromise, timeoutPromise]);

		console.log(`[GATEWAY] ${serviceName} responded with status: ${res.status}`);

		const txt = await res.text();

		try {
			return { ok: res.ok, status: res.status, body: JSON.parse(txt) };
		} catch {
			return { ok: res.ok, status: res.status, body: txt };
		}
	} catch (err) {
		console.error(`[GATEWAY] ${serviceName} Error:`, err.message);
		return {
			ok: false,
			status: 504,
			body: {
				error: 'gateway_timeout',
				message: err.message,
				service: serviceName,
				path: path,
			},
		};
	}
}
