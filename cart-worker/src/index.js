/**
 * Cart Worker - Main entry point (Top-level proxy)
 */
import { Router } from 'itty-router';
import { CartDurableObject } from './do/CartDurableObject.js';
import { handleOptions, corsHeaders } from './helpers/response.js';
import { CORS_HEADERS } from './config/constants.js';

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

		const outHeaders = new Headers(res.headers);
		outHeaders.set('x-cart-id', cartId);
		Object.entries(CORS_HEADERS).forEach(([k, v]) => outHeaders.set(k, v));

		const body = await res.arrayBuffer();

		return new Response(body, { status: res.status, headers: outHeaders });
	} catch (e) {
		console.error('Top router error:', e);
		return new Response(JSON.stringify({ error: 'proxy_error', details: String(e) }), {
			status: 500,
			headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
		});
	}
});

export default {
	fetch: (req, env) => topRouter.fetch(req, env),
};

export { CartDurableObject };
