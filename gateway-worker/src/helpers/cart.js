/**
 * Cart Durable Object helpers
 * Includes tracing middleware for proper span tree
 */
import { withDOSpan } from '../middleware/tracing.middleware.js';
import { trace, context, propagation } from '@opentelemetry/api';

export function getCartStub(env, cartId) {
	try {
		if (!env.CART_DO) throw new Error('CART_DO binding not found');
		const id = env.CART_DO.idFromName(cartId);
		return env.CART_DO.get(id);
	} catch (e) {
		console.error('DO Stub Error:', e);
		return null;
	}
}

export async function fetchDO(stub, path, method = 'GET', body = null, cartId, userContext = null, authHeader = null, timeout = 20000) {
	if (!stub) return { status: 500, body: { error: 'cart_do_unavailable' } };

	// Wrap DO call in a child span for proper trace tree
	return withDOSpan('CartDurableObject', cartId, path, method, async () => {
		try {
			const headers = {
				'Content-Type': 'application/json',
				'x-cart-id': cartId,
			};

			if (userContext) {
				headers['x-user-id'] = userContext.sub;
				headers['x-user-role'] = userContext.role;
			}

			if (authHeader) {
				headers['Authorization'] = authHeader;
			}

			// Propagate trace context to Durable Object
			const activeSpan = trace.getActiveSpan();
			if (activeSpan) {
				propagation.inject(context.active(), headers, {
					set: (carrier, key, value) => {
						carrier[key] = value;
					},
				});
			}

			const fetchPromise = stub.fetch(`https://cart${path}`, {
				method,
				headers,
				body: body ? JSON.stringify(body) : null,
			});

			const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error(`Cart DO timeout after ${timeout}ms`)), timeout));

			const res = await Promise.race([fetchPromise, timeoutPromise]);
			const txt = await res.text();

			try {
				return { status: res.status, body: JSON.parse(txt) };
			} catch {
				return { status: res.status, body: txt };
			}
		} catch (e) {
			console.error('fetchDO error:', e);
			return { status: 504, body: { error: 'cart_timeout', message: e.message } };
		}
	});
}
