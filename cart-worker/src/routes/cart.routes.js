/**
 * Cart routes setup for Durable Object
 */
import {
	initCartHandler,
	getCartSummaryHandler,
	addItemHandler,
	updateItemHandler,
	removeItemHandler,
	clearCartHandler,
	setAddressHandler,
	getShippingOptionsHandler,
	selectShippingHandler,
	applyCouponHandler,
	removeCouponHandler,
	checkoutStartHandler,
} from '../handlers/cart.handler.js';
import { errorResponse, jsonResponse, corsHeaders } from '../helpers/response.js';

export function setupCartRoutes(router, doInstance) {
	const getCart = () => doInstance.cart;
	const getState = () => doInstance.state;
	const getEnv = () => doInstance.env;
	// INIT
	router.post('/cart/init', async (req) => {
		const result = await initCartHandler(req, getCart(), getState(), getEnv());
		return jsonResponse(result);
	});

	// SUMMARY
	router.get('/cart/summary', async () => {
		const result = await getCartSummaryHandler(getCart());
		return jsonResponse(result);
	});

	// ADD ITEM
	router.post('/cart/add', async (req) => {
		const result = await addItemHandler(req, getCart(), getState(), getEnv());
		if (result.error) {
			return errorResponse(result.error);
		}
		return jsonResponse(result);
	});

	// UPDATE ITEM
	router.post('/cart/update', async (req) => {
		const result = await updateItemHandler(req, getCart(), getState(), getEnv());
		if (result.error) {
			return errorResponse(result.error);
		}
		return jsonResponse(result);
	});

	// REMOVE ITEM
	router.post('/cart/remove', async (req) => {
		const result = await removeItemHandler(req, getCart(), getState(), getEnv());
		if (result.error) {
			return errorResponse(result.error);
		}
		return jsonResponse(result);
	});

	// CLEAR CART
	router.post('/cart/clear', async () => {
		const result = await clearCartHandler(getCart(), getState(), getEnv());
		return jsonResponse(result);
	});

	// SET ADDRESS
	router.post('/cart/address', async (req) => {
		const result = await setAddressHandler(req, getCart(), getState(), getEnv());
		if (result.error) {
			return errorResponse(result.error);
		}
		return jsonResponse(result);
	});

	// SHIPPING OPTIONS
	router.get('/cart/shipping-options', async (req) => {
		const result = await getShippingOptionsHandler(req, getCart(), getState(), getEnv());
		if (result.error) {
			return errorResponse(result.error, result.details, result.status || 400);
		}
		return jsonResponse(result);
	});

	// SELECT SHIPPING
	router.post('/cart/shipping', async (req) => {
		const result = await selectShippingHandler(req, getCart(), getState(), getEnv());
		if (result.error) {
			return errorResponse(result.error);
		}
		return jsonResponse(result);
	});

	// COUPON APPLY
	router.post('/cart/coupon/apply', async (req) => {
		const result = await applyCouponHandler(req, getCart(), getState(), getEnv());
		if (result.error) {
			return errorResponse(result.error, result.details);
		}
		return jsonResponse(result);
	});

	// REMOVE COUPON
	router.post('/cart/coupon/remove', async () => {
		const result = await removeCouponHandler(getCart(), getState(), getEnv());
		return jsonResponse(result);
	});

	// CHECKOUT START
	router.post('/checkout/start', async (req) => {
		const result = await checkoutStartHandler(req, getCart(), getState(), getEnv());
		if (result.error) {
			// Include message if available
			const errorBody = { error: result.error };
			if (result.message) errorBody.message = result.message;
			if (result.details) errorBody.details = result.details;
			return jsonResponse(errorBody, result.status || 400);
		}
		return jsonResponse(result);
	});

	// 404
	router.all('*', () => new Response('Not found', { status: 404, headers: corsHeaders() }));

	return router;
}
