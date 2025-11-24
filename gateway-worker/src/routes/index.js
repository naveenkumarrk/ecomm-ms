/**
 * Gateway routes - organized by domain
 */
import { Router } from 'itty-router';
import { jsonRes, corsHeaders } from '../helpers/response.js';
import { requireAuth, requireAdmin, extractUser } from '../middleware/auth.middleware.js';
import { callService } from '../services/service-caller.js';
import { getCartStub, fetchDO } from '../helpers/cart.js';
import { signedHeadersFor } from '../helpers/hmac.js';
import { AUTH_TIMEOUT, PRODUCT_TIMEOUT } from '../config/constants.js';

export function setupRoutes(router) {
	// CORS
	router.options('*', () => new Response('OK', { headers: corsHeaders }));

	// Health check
	router.get('/', () => jsonRes({ status: 'ok', service: 'gateway' }));
	router.get('/health', () => jsonRes({ status: 'ok', service: 'gateway' }));

	// Public auth routes
	router.post('/api/auth/signup', async (req, env) => {
		try {
			const body = await req.json().catch(() => null);
			if (!body) return jsonRes({ error: 'invalid_json' }, 400);
			const res = await callService('AUTH_SERVICE', '/auth/signup', 'POST', body, {}, null, env, AUTH_TIMEOUT);
			return jsonRes(res.body, res.status);
		} catch (error) {
			console.error('[GATEWAY] /api/auth/signup error:', error);
			return jsonRes({ error: 'gateway_error', message: error.message }, 500);
		}
	});

	router.post('/api/auth/login', async (req, env) => {
		try {
			const body = await req.json().catch(() => null);
			if (!body) return jsonRes({ error: 'invalid_json' }, 400);
			const res = await callService('AUTH_SERVICE', '/auth/login', 'POST', body, {}, null, env, AUTH_TIMEOUT);
			return jsonRes(res.body, res.status);
		} catch (error) {
			console.error('[GATEWAY] /api/auth/login error:', error);
			return jsonRes({ error: 'gateway_error', message: error.message }, 500);
		}
	});

	// Admin creation routes
	router.post('/api/auth/admin/signup', async (req, env) => {
		try {
			const body = await req.json().catch(() => null);
			if (!body) return jsonRes({ error: 'invalid_json' }, 400);
			const headers = {};
			const adminSecret = req.headers.get('x-admin-secret');
			if (adminSecret) headers['x-admin-secret'] = adminSecret;
			const res = await callService('AUTH_SERVICE', '/auth/admin/signup', 'POST', body, headers, null, env, AUTH_TIMEOUT);
			return jsonRes(res.body, res.status);
		} catch (error) {
			console.error('[GATEWAY] /api/auth/admin/signup error:', error);
			return jsonRes({ error: 'gateway_error', message: error.message }, 500);
		}
	});

	router.post('/api/auth/admin/promote', async (req, env) => {
		const user = await requireAdmin(req, env);
		if (user instanceof Response) return user;
		try {
			const body = await req.json().catch(() => null);
			if (!body) return jsonRes({ error: 'invalid_json' }, 400);
			const res = await callService(
				'AUTH_SERVICE',
				'/auth/admin/promote',
				'POST',
				body,
				{
					Authorization: req.headers.get('Authorization'),
				},
				user,
				env,
				AUTH_TIMEOUT,
			);
			return jsonRes(res.body, res.status);
		} catch (error) {
			console.error('[GATEWAY] /api/auth/admin/promote error:', error);
			return jsonRes({ error: 'gateway_error', message: error.message }, 500);
		}
	});

	// Product routes (public)
	router.get('/api/products', async (req, env) => {
		const url = new URL(req.url);
		const res = await callService(
			'PRODUCTS_SERVICE',
			`/products?limit=${url.searchParams.get('limit') || 20}&offset=${url.searchParams.get('offset') || 0}`,
			'GET',
			null,
			{},
			null,
			env,
			PRODUCT_TIMEOUT,
		);
		return jsonRes(res.body, res.status);
	});

	router.get('/api/products/:id', async (req, env) => {
		const res = await callService('PRODUCTS_SERVICE', `/products/${req.params.id}`, 'GET', null, {}, null, env, PRODUCT_TIMEOUT);
		return jsonRes(res.body, res.status);
	});

	// Authenticated user routes
	router.get('/api/auth/me', async (req, env) => {
		const user = await requireAuth(req, env);
		if (user instanceof Response) return user;
		const res = await callService(
			'AUTH_SERVICE',
			'/auth/me',
			'GET',
			null,
			{
				Authorization: req.headers.get('Authorization'),
			},
			null,
			env,
			PRODUCT_TIMEOUT,
		);
		return jsonRes(res.body, res.status);
	});

	router.post('/api/auth/logout', async (req, env) => {
		const user = await requireAuth(req, env);
		if (user instanceof Response) return user;
		const res = await callService(
			'AUTH_SERVICE',
			'/auth/logout',
			'POST',
			null,
			{
				Authorization: req.headers.get('Authorization'),
			},
			null,
			env,
			PRODUCT_TIMEOUT,
		);
		return jsonRes(res.body, res.status);
	});

	// Address management
	router.get('/api/addresses', async (req, env) => {
		const user = await requireAuth(req, env);
		if (user instanceof Response) return user;
		const res = await callService(
			'AUTH_SERVICE',
			'/auth/addresses',
			'GET',
			null,
			{
				Authorization: req.headers.get('Authorization'),
			},
			null,
			env,
			PRODUCT_TIMEOUT,
		);
		return jsonRes(res.body, res.status);
	});

	router.post('/api/addresses', async (req, env) => {
		const user = await requireAuth(req, env);
		if (user instanceof Response) return user;
		const body = await req.json();
		const res = await callService(
			'AUTH_SERVICE',
			'/auth/addresses',
			'POST',
			body,
			{
				Authorization: req.headers.get('Authorization'),
			},
			null,
			env,
			PRODUCT_TIMEOUT,
		);
		return jsonRes(res.body, res.status);
	});

	router.put('/api/addresses/:id', async (req, env) => {
		const user = await requireAuth(req, env);
		if (user instanceof Response) return user;
		try {
			const body = await req.json().catch(() => null);
			if (!body) return jsonRes({ error: 'invalid_json' }, 400);
			const res = await callService(
				'AUTH_SERVICE',
				`/auth/addresses/${req.params.id}`,
				'PUT',
				body,
				{
					Authorization: req.headers.get('Authorization'),
				},
				user,
				env,
				PRODUCT_TIMEOUT,
			);
			return jsonRes(res.body, res.status);
		} catch (error) {
			console.error('[GATEWAY] /api/addresses/:id PUT error:', error);
			return jsonRes({ error: 'gateway_error', message: error.message }, 500);
		}
	});

	router.delete('/api/addresses/:id', async (req, env) => {
		const user = await requireAuth(req, env);
		if (user instanceof Response) return user;
		try {
			const res = await callService(
				'AUTH_SERVICE',
				`/auth/addresses/${req.params.id}`,
				'DELETE',
				null,
				{
					Authorization: req.headers.get('Authorization'),
				},
				user,
				env,
				PRODUCT_TIMEOUT,
			);
			return jsonRes(res.body, res.status);
		} catch (error) {
			console.error('[GATEWAY] /api/addresses/:id DELETE error:', error);
			return jsonRes({ error: 'gateway_error', message: error.message }, 500);
		}
	});

	// Cart routes (auth optional)
	router.post('/api/cart/init', async (req, env) => {
		const user = await extractUser(req, env);
		const cartId = `cart_${crypto.randomUUID()}`;
		const stub = getCartStub(env, cartId);
		const res = await fetchDO(stub, '/cart/init', 'POST', {}, cartId, user);
		return jsonRes({ ...res.body, cartId }, res.status);
	});

	router.get('/api/cart/:cartId', async (req, env) => {
		const user = await extractUser(req, env);
		const { cartId } = req.params;
		const stub = getCartStub(env, cartId);
		const res = await fetchDO(stub, '/cart/summary', 'GET', null, cartId, user);
		return jsonRes(res.body, res.status);
	});

	router.post('/api/cart/:cartId/add', async (req, env) => {
		const user = await extractUser(req, env);
		const body = await req.json();
		const { cartId } = req.params;
		const stub = getCartStub(env, cartId);
		const res = await fetchDO(stub, '/cart/add', 'POST', body, cartId, user);
		return jsonRes(res.body, res.status);
	});

	router.post('/api/cart/:cartId/update', async (req, env) => {
		try {
			const user = await extractUser(req, env);
			const body = await req.json().catch(() => null);
			if (!body) return jsonRes({ error: 'invalid_json' }, 400);
			const { cartId } = req.params;
			const stub = getCartStub(env, cartId);
			if (!stub) return jsonRes({ error: 'cart_do_unavailable' }, 500);
			const res = await fetchDO(stub, '/cart/update', 'POST', body, cartId, user);
			return jsonRes(res.body, res.status);
		} catch (error) {
			console.error('[GATEWAY] /api/cart/:cartId/update error:', error);
			return jsonRes({ error: 'gateway_error', message: error.message }, 500);
		}
	});

	router.post('/api/cart/:cartId/remove', async (req, env) => {
		try {
			const user = await extractUser(req, env);
			const body = await req.json().catch(() => null);
			if (!body) return jsonRes({ error: 'invalid_json' }, 400);
			const { cartId } = req.params;
			const stub = getCartStub(env, cartId);
			if (!stub) return jsonRes({ error: 'cart_do_unavailable' }, 500);
			const res = await fetchDO(stub, '/cart/remove', 'POST', body, cartId, user);
			return jsonRes(res.body, res.status);
		} catch (error) {
			console.error('[GATEWAY] /api/cart/:cartId/remove error:', error);
			return jsonRes({ error: 'gateway_error', message: error.message }, 500);
		}
	});

	router.post('/api/cart/:cartId/clear', async (req, env) => {
		const user = await extractUser(req, env);
		const { cartId } = req.params;
		const stub = getCartStub(env, cartId);
		const res = await fetchDO(stub, '/cart/clear', 'POST', {}, cartId, user);
		return jsonRes(res.body, res.status);
	});

	router.post('/api/cart/:cartId/address', async (req, env) => {
		const user = await extractUser(req, env);
		const body = await req.json();
		const { cartId } = req.params;
		const stub = getCartStub(env, cartId);
		const res = await fetchDO(stub, '/cart/address', 'POST', body, cartId, user);
		return jsonRes(res.body, res.status);
	});

	router.get('/api/cart/:cartId/shipping-options', async (req, env) => {
		const user = await extractUser(req, env);
		const { cartId } = req.params;
		const stub = getCartStub(env, cartId);
		const authHeader = req.headers.get('Authorization');
		const res = await fetchDO(stub, '/cart/shipping-options', 'GET', null, cartId, user, authHeader);
		return jsonRes(res.body, res.status);
	});

	router.post('/api/cart/:cartId/shipping', async (req, env) => {
		const user = await extractUser(req, env);
		const body = await req.json();
		const { cartId } = req.params;
		const stub = getCartStub(env, cartId);
		const authHeader = req.headers.get('Authorization');
		const res = await fetchDO(stub, '/cart/shipping', 'POST', body, cartId, user, authHeader);
		return jsonRes(res.body, res.status);
	});

	router.post('/api/cart/:cartId/coupon/apply', async (req, env) => {
		const user = await extractUser(req, env);
		const body = await req.json();
		const { cartId } = req.params;
		const stub = getCartStub(env, cartId);
		const res = await fetchDO(stub, '/cart/coupon/apply', 'POST', body, cartId, user);
		return jsonRes(res.body, res.status);
	});

	router.post('/api/cart/:cartId/coupon/remove', async (req, env) => {
		const user = await extractUser(req, env);
		const { cartId } = req.params;
		const stub = getCartStub(env, cartId);
		const res = await fetchDO(stub, '/cart/coupon/remove', 'POST', {}, cartId, user);
		return jsonRes(res.body, res.status);
	});

	// Checkout routes (requires auth)
	router.post('/api/checkout/start', async (req, env) => {
		const user = await requireAuth(req, env);
		if (user instanceof Response) return user;
		const body = await req.json();
		const cartId = body.cartId || req.headers.get('x-cart-id');
		if (cartId && env.CART_DO) {
			const stub = getCartStub(env, cartId);
			const authHeader = req.headers.get('Authorization');
			const res = await fetchDO(stub, '/checkout/start', 'POST', body, cartId, user, authHeader);
			return jsonRes(res.body, res.status);
		} else {
			const res = await callService('CART_SERVICE', '/checkout/start', 'POST', body, {}, user, env);
			return jsonRes(res.body, res.status);
		}
	});

	router.post('/api/checkout/capture', async (req, env) => {
		const user = await requireAuth(req, env);
		if (user instanceof Response) return user;
		const body = await req.json();
		const headers = {
			'x-user-id': user.sub,
			'x-user-role': user.role,
		};
		const res = await callService('PAYMENT_SERVICE', '/payment/paypal/capture', 'POST', body, headers, user, env);
		return jsonRes(res.body, res.status);
	});

	// Order routes (auth required)
	router.get('/api/orders', async (req, env) => {
		const user = await requireAuth(req, env);
		if (user instanceof Response) return user;
		const res = await callService('ORDER_SERVICE', `/orders/user/${user.sub}`, 'GET', null, {}, user, env);
		return jsonRes(res.body, res.status);
	});

	router.get('/api/orders/:orderId', async (req, env) => {
		const user = await requireAuth(req, env);
		if (user instanceof Response) return user;
		const res = await callService('ORDER_SERVICE', `/orders/${req.params.orderId}`, 'GET', null, {}, user, env);
		if (res.ok && res.body.user_id !== user.sub && user.role !== 'admin') {
			return jsonRes({ error: 'forbidden' }, 403);
		}
		return jsonRes(res.body, res.status);
	});

	// Admin routes
	router.post('/api/admin/products/images/upload', async (req, env) => {
		const user = await requireAdmin(req, env);
		if (user instanceof Response) return user;
		try {
			const contentType = req.headers.get('content-type') || '';
			const isMultipart = contentType.includes('multipart/form-data');
			const bodyText = isMultipart
				? ''
				: await req
						.clone()
						.arrayBuffer()
						.then((ab) => new TextDecoder().decode(ab));
			const path = '/products/images/upload';
			const headers = await signedHeadersFor(env.ADMIN_SECRET || env.INTERNAL_SECRET, 'POST', path, bodyText);
			const serviceBinding = env.PRODUCTS_SERVICE;
			const serviceUrl = env.PRODUCTS_SERVICE_URL;
			const forwardedHeaders = new Headers(req.headers);
			Object.entries(headers).forEach(([key, value]) => {
				forwardedHeaders.set(key, value);
			});
			let response;
			if (serviceBinding && typeof serviceBinding.fetch === 'function') {
				const forwardedReq = new Request(`https://internal${path}`, {
					method: req.method,
					headers: forwardedHeaders,
					body: req.body,
				});
				response = await serviceBinding.fetch(forwardedReq);
			} else if (serviceUrl && serviceUrl.startsWith('http')) {
				const fullUrl = serviceUrl.replace(/\/$/, '') + path;
				response = await fetch(fullUrl, {
					method: req.method,
					headers: forwardedHeaders,
					body: req.body,
				});
			} else {
				return jsonRes({ error: 'service_not_configured' }, 502);
			}
			const responseBody = await response.json().catch(() => ({ error: 'Invalid response' }));
			return jsonRes(responseBody, response.status);
		} catch (error) {
			console.error('[GATEWAY] Image upload error:', error);
			return jsonRes({ error: 'gateway_error', message: error.message }, 500);
		}
	});

	router.post('/api/admin/products', async (req, env) => {
		const user = await requireAdmin(req, env);
		if (user instanceof Response) return user;
		try {
			const contentType = req.headers.get('content-type') || '';
			const isMultipart = contentType.includes('multipart/form-data');
			const path = '/products';
			let bodyText = '';
			if (isMultipart) {
				bodyText = '';
			} else {
				bodyText = await req.clone().text();
			}
			const headers = await signedHeadersFor(env.ADMIN_SECRET || env.INTERNAL_SECRET, 'POST', path, bodyText);
			const serviceBinding = env.PRODUCTS_SERVICE;
			const serviceUrl = env.PRODUCTS_SERVICE_URL;
			const forwardedHeaders = new Headers(req.headers);
			Object.entries(headers).forEach(([key, value]) => {
				forwardedHeaders.set(key, value);
			});
			let response;
			if (serviceBinding && typeof serviceBinding.fetch === 'function') {
				const forwardedReq = new Request(`https://internal${path}`, {
					method: req.method,
					headers: forwardedHeaders,
					body: req.body,
				});
				response = await serviceBinding.fetch(forwardedReq);
			} else if (serviceUrl && serviceUrl.startsWith('http')) {
				const fullUrl = serviceUrl.replace(/\/$/, '') + path;
				response = await fetch(fullUrl, {
					method: req.method,
					headers: forwardedHeaders,
					body: req.body,
				});
			} else {
				return jsonRes({ error: 'service_not_configured' }, 502);
			}
			const responseBody = await response.json().catch(() => ({ error: 'Invalid response' }));
			return jsonRes(responseBody, response.status);
		} catch (error) {
			console.error('[GATEWAY] Product creation error:', error);
			return jsonRes({ error: 'gateway_error', message: error.message }, 500);
		}
	});

	router.put('/api/admin/products/:id', async (req, env) => {
		const user = await requireAdmin(req, env);
		if (user instanceof Response) return user;
		const body = await req.json();
		const path = `/products/${req.params.id}`;
		const headers = await signedHeadersFor(env.ADMIN_SECRET || env.INTERNAL_SECRET, 'PUT', path, body);
		const res = await callService('PRODUCTS_SERVICE', path, 'PUT', body, headers, user, env);
		return jsonRes(res.body, res.status);
	});

	router.delete('/api/admin/products/:id', async (req, env) => {
		const user = await requireAdmin(req, env);
		if (user instanceof Response) return user;
		const path = `/products/${req.params.id}`;
		const headers = await signedHeadersFor(env.INTERNAL_SECRET, 'DELETE', path, '');
		const res = await callService('PRODUCTS_SERVICE', path, 'DELETE', null, headers, user, env);
		return jsonRes(res.body, res.status);
	});

	router.get('/api/admin/orders', async (req, env) => {
		const user = await requireAdmin(req, env);
		if (user instanceof Response) return user;
		const res = await callService('ORDER_SERVICE', '/debug/list-orders', 'GET', null, {}, user, env);
		return jsonRes(res.body, res.status);
	});

	router.put('/api/admin/orders/:orderId/status', async (req, env) => {
		const user = await requireAdmin(req, env);
		if (user instanceof Response) return user;
		const body = await req.json();
		const path = `/orders/${req.params.orderId}/status`;
		const headers = await signedHeadersFor(env.INTERNAL_SECRET, 'PUT', path, body);
		const res = await callService('ORDER_SERVICE', path, 'PUT', body, headers, user, env);
		return jsonRes(res.body, res.status);
	});

	router.post('/api/admin/inventory/update', async (req, env) => {
		const user = await requireAdmin(req, env);
		if (user instanceof Response) return user;
		const body = await req.json();
		const path = '/inventory/admin/update';
		const headers = await signedHeadersFor(env.INTERNAL_SECRET, 'POST', path, body);
		const res = await callService('INVENTORY_SERVICE', path, 'POST', body, headers, user, env);
		return jsonRes(res.body, res.status);
	});

	router.get('/api/admin/inventory/:productId', async (req, env) => {
		const user = await requireAdmin(req, env);
		if (user instanceof Response) return user;
		const res = await callService('INVENTORY_SERVICE', `/debug/product/${req.params.productId}`, 'GET', null, {}, user, env);
		return jsonRes(res.body, res.status);
	});

	router.post('/api/admin/coupons', async (req, env) => {
		const user = await requireAdmin(req, env);
		if (user instanceof Response) return user;
		const body = await req.json();
		const { code, type, value, expiresAt, minCart } = body;
		if (!code || !type) {
			return jsonRes({ error: 'missing_fields' }, 400);
		}
		try {
			await env.DISCOUNT_KV.put(
				`discount:${code}`,
				JSON.stringify({ type, value, expiresAt, minCart }),
				expiresAt ? { expirationTtl: Math.floor((expiresAt - Date.now()) / 1000) } : {},
			);
			return jsonRes({ ok: true, code });
		} catch (error) {
			return jsonRes({ error: 'coupon_creation_failed', message: error.message }, 500);
		}
	});

	router.delete('/api/admin/coupons/:code', async (req, env) => {
		const user = await requireAdmin(req, env);
		if (user instanceof Response) return user;
		try {
			await env.DISCOUNT_KV.delete(`discount:${req.params.code}`);
			return jsonRes({ ok: true });
		} catch (error) {
			return jsonRes({ error: 'coupon_deletion_failed', message: error.message }, 500);
		}
	});

	// Catch all 404
	router.all('*', () => jsonRes({ error: 'not_found' }, 404));

	return router;
}
