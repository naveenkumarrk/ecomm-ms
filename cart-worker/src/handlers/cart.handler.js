/**
 * Cart operation handlers
 */
import { fetchProduct, getProductVariant, getProductPrice } from '../services/product.service.js';
import { recomputeCartSummary, calculateDiscount, resetCheckoutState } from '../services/cart.service.js';
import { fetchUserAddresses, fetchUserInfo } from '../services/gateway.service.js';
import { fetchWithInternalAuth } from '../helpers/hmac.js';
import { createEmptyCart } from '../helpers/utils.js';
import { CART_TTL, RESERVATION_TTL, DEFAULT_CURRENCY } from '../config/constants.js';
import {
	addItemSchema,
	updateItemSchema,
	removeItemSchema,
	setAddressSchema,
	selectShippingSchema,
	applyCouponSchema,
} from '../validators/cart.validator.js';

/**
 * Validate request body against Joi schema
 */
function validateBody(schema) {
	return async (req) => {
		try {
			const body = await req.json().catch(() => ({}));
			const { error, value } = schema.validate(body, { abortEarly: false });
			if (error) {
				const errors = error.details.map((d) => d.message).join(', ');
				return { error: errors, value: null };
			}
			return { error: null, value };
		} catch {
			return { error: 'invalid_json', value: null };
		}
	};
}

export async function initCartHandler(req, cart, state, env) {
	const headerId = req.headers.get('x-cart-id');
	if (headerId) cart.cartId = headerId;

	const userId = req.headers.get('x-user-id') || req.headers.get('x-userid') || null;
	if (userId) cart.userId = userId;

	await state.storage.put('cart', cart, { expirationTtl: CART_TTL });
	return { cartId: cart.cartId, userId: cart.userId };
}

export async function getCartSummaryHandler(cart) {
	recomputeCartSummary(cart);
	return cart;
}

export async function addItemHandler(req, cart, state, env) {
	const validation = await validateBody(addItemSchema)(req);
	if (validation.error) {
		return { error: validation.error };
	}

	const { productId, variantId, quantity = 1 } = validation.value;

	// Try to fetch product details
	let prod = null;
	if (env.PRODUCTS_SERVICE_URL) {
		prod = await fetchProduct(productId, env.PRODUCTS_SERVICE_URL);
	}

	let itemToAdd;
	if (!prod) {
		// Fallback: use provided data
		const price = validation.value.unitPrice || 0;
		const existingIndex = cart.items.findIndex((x) => x.productId === productId && x.variantId === variantId);

		if (existingIndex >= 0) {
			cart.items[existingIndex].qty += Number(quantity);
		} else {
			itemToAdd = {
				productId,
				variantId: variantId || null,
				qty: Number(quantity),
				unitPrice: Number(price),
				title: validation.value.title || 'Unknown product',
				attributes: validation.value.attributes || {},
			};
			cart.items.push(itemToAdd);
		}
	} else {
		// Use product data
		const variant = getProductVariant(prod, variantId);
		const price = getProductPrice(prod, variant);
		const chosenVariantId = variant ? variant.variantId : variantId || null;

		const existingIndex = cart.items.findIndex((x) => x.productId === productId && x.variantId === chosenVariantId);

		if (existingIndex >= 0) {
			cart.items[existingIndex].qty += Number(quantity);
		} else {
			itemToAdd = {
				productId,
				variantId: chosenVariantId,
				qty: Number(quantity),
				unitPrice: price,
				title: prod.title || 'Product',
				attributes: variant?.attributes || {},
			};
			cart.items.push(itemToAdd);
		}
	}

	resetCheckoutState(cart);
	recomputeCartSummary(cart);
	await state.storage.put('cart', cart, { expirationTtl: CART_TTL });

	return { cart };
}

export async function updateItemHandler(req, cart, state, env) {
	const validation = await validateBody(updateItemSchema)(req);
	if (validation.error) {
		return { error: validation.error };
	}

	const { productId, variantId, quantity } = validation.value;

	// Normalize variantId: treat null, undefined, and empty string as the same
	const normalizedVariantId = variantId || null;

	// Find item by productId and variantId (normalize both for comparison)
	const index = cart.items.findIndex((x) => {
		const itemVariantId = x.variantId || null;
		return x.productId === productId && itemVariantId === normalizedVariantId;
	});

	if (index < 0) {
		return {
			error: 'item_not_found',
			details: {
				productId,
				variantId: normalizedVariantId,
				availableItems: cart.items.map((i) => ({ productId: i.productId, variantId: i.variantId || null })),
			},
		};
	}

	if (Number(quantity) <= 0) {
		cart.items.splice(index, 1);
	} else {
		cart.items[index].qty = Number(quantity);
	}

	resetCheckoutState(cart);
	recomputeCartSummary(cart);
	await state.storage.put('cart', cart, { expirationTtl: CART_TTL });

	return { cart };
}

export async function removeItemHandler(req, cart, state, env) {
	const validation = await validateBody(removeItemSchema)(req);
	if (validation.error) {
		return { error: validation.error };
	}

	const { productId, variantId } = validation.value;

	const index = cart.items.findIndex((x) => x.productId === productId && (!variantId || x.variantId === variantId));

	if (index < 0) {
		return { error: 'item_not_found' };
	}

	cart.items.splice(index, 1);
	resetCheckoutState(cart);
	recomputeCartSummary(cart);
	await state.storage.put('cart', cart, { expirationTtl: CART_TTL });

	return { cart };
}

export async function clearCartHandler(cart, state, env) {
	const id = cart.cartId;
	const userId = cart.userId;

	cart = createEmptyCart(id, userId);
	await state.storage.put('cart', cart, { expirationTtl: CART_TTL });

	return { cart };
}

export async function setAddressHandler(req, cart, state, env) {
	const validation = await validateBody(setAddressSchema)(req);
	if (validation.error) {
		return { error: validation.error };
	}

	const { addressId } = validation.value;

	cart.addressId = addressId;
	cart.shippingOptions = null;
	cart.shippingMethod = null;

	await state.storage.put('cart', cart, { expirationTtl: CART_TTL });

	return { cart };
}

export async function getShippingOptionsHandler(req, cart, state, env) {
	recomputeCartSummary(cart);

	if (!cart.addressId) {
		return { error: 'address_required' };
	}

	const userId = req.headers.get('x-user-id') || req.headers.get('x-userid') || null;
	if (!userId) {
		return { error: 'user_required', status: 401 };
	}

	const authToken = req.headers.get('Authorization') || req.headers.get('authorization') || null;
	if (!authToken) {
		return { error: 'authorization_required', status: 401 };
	}

	if (!env.GATEWAY_URL) {
		return { error: 'gateway_not_configured', status: 500 };
	}

	// Fetch address from gateway
	const addresses = await fetchUserAddresses(env.GATEWAY_URL, authToken);
	const address = addresses.find((a) => a.addressId === cart.addressId);

	if (!address) {
		return { error: 'address_not_found' };
	}

	// Get shipping options from fulfillment service
	// Transform items to match fulfillment service schema (only allowed fields)
	const transformedItems = cart.items.map((item) => {
		const transformed = {
			productId: item.productId,
			qty: item.qty,
		};

		// Only include variantId if it exists
		if (item.variantId) {
			transformed.variantId = item.variantId;
		}

		// Only include unitPrice if it exists
		if (item.unitPrice !== undefined) {
			transformed.unitPrice = item.unitPrice;
		}

		// Only include weight in attributes if it exists
		if (item.attributes?.weight !== undefined) {
			transformed.attributes = { weight: item.attributes.weight };
		}

		// Include weight at top level if it exists (fulfillment service accepts both)
		if (item.weight !== undefined) {
			transformed.weight = item.weight;
		}

		return transformed;
	});

	// Transform address to match fulfillment service schema (only pincode/postal/zip)
	const transformedAddress = {};
	if (address) {
		if (address.pincode) transformedAddress.pincode = address.pincode;
		if (address.postal) transformedAddress.postal = address.postal;
		if (address.zip) transformedAddress.zip = address.zip;
	}

	const payload = {
		items: transformedItems,
		address: Object.keys(transformedAddress).length > 0 ? transformedAddress : undefined,
		subtotal: cart.summary.subtotal,
		couponCode: cart.coupon || null,
	};

	if (!env.FULFILLMENT_SERVICE_URL) {
		console.error('[CART] FULFILLMENT_SERVICE_URL not configured');
		return { error: 'fulfillment_service_not_configured', status: 500 };
	}

	if (!env.INTERNAL_SECRET) {
		console.error('[CART] INTERNAL_SECRET not configured');
		return { error: 'internal_secret_not_configured', status: 500 };
	}

	console.log('[CART] Fetching shipping options from fulfillment service:', env.FULFILLMENT_SERVICE_URL);
	const res = await fetchWithInternalAuth(env.FULFILLMENT_SERVICE_URL, '/fulfillment/get-options', 'POST', payload, env.INTERNAL_SECRET);

	if (!res.ok) {
		console.error('[CART] Fulfillment service error:', res.status, res.body);
		return {
			error: 'fulfillment_error',
			details: res.body,
			status: res.status || 502,
			message: typeof res.body === 'object' && res.body.error ? res.body.error : 'Failed to fetch shipping options',
		};
	}

	// Validate response structure
	if (!res.body || !res.body.shippingOptions) {
		console.error('[CART] Invalid fulfillment response structure:', res.body);
		return {
			error: 'fulfillment_error',
			details: 'Invalid response structure from fulfillment service',
			status: 502,
		};
	}

	cart.shippingOptions = res.body.shippingOptions || null;
	await state.storage.put('cart', cart, { expirationTtl: CART_TTL });

	console.log('[CART] Shipping options loaded:', cart.shippingOptions?.length || 0, 'options');
	return { shippingOptions: cart.shippingOptions };
}

export async function selectShippingHandler(req, cart, state, env) {
	const validation = await validateBody(selectShippingSchema)(req);
	if (validation.error) {
		return { error: validation.error };
	}

	const { methodId } = validation.value;

	// If shipping options are not loaded, try to fetch them first
	if (!cart.shippingOptions || cart.shippingOptions.length === 0) {
		// Reload cart from storage first to ensure we have latest state
		const storedCart = await state.storage.get('cart');
		if (storedCart) cart = storedCart;

		// If still no options, fetch them
		if (!cart.shippingOptions || cart.shippingOptions.length === 0) {
			const optionsResult = await getShippingOptionsHandler(req, cart, state, env);
			if (optionsResult.error) {
				return { error: optionsResult.error, details: optionsResult.details, status: optionsResult.status };
			}
			// Reload cart after fetching options
			const updatedCart = await state.storage.get('cart');
			if (updatedCart) cart = updatedCart;
		}
	}

	const option = (cart.shippingOptions || []).find((o) => o.methodId === methodId);
	if (!option) {
		return {
			error: 'invalid_shipping_method',
			details: { methodId, availableOptions: (cart.shippingOptions || []).map((o) => o.methodId) },
		};
	}

	cart.shippingMethod = option;
	recomputeCartSummary(cart);
	await state.storage.put('cart', cart, { expirationTtl: CART_TTL });

	return { cart };
}

export async function applyCouponHandler(req, cart, state, env) {
	const validation = await validateBody(applyCouponSchema)(req);
	if (validation.error) {
		return { error: validation.error };
	}

	const { code } = validation.value;

	const raw = await env.DISCOUNT_KV.get(`discount:${code}`);
	if (!raw) {
		return { error: 'invalid_coupon' };
	}

	const coupon = JSON.parse(raw);
	const subtotal = cart.items.reduce((s, i) => s + i.unitPrice * i.qty, 0);

	if (coupon.minCart && subtotal < coupon.minCart) {
		return { error: 'min_cart_not_met', details: { min: coupon.minCart } };
	}

	cart.coupon = code;
	const discountData = calculateDiscount(coupon, subtotal);
	cart.discount = discountData.discount;
	cart.discountType = discountData.discountType;

	recomputeCartSummary(cart);
	await state.storage.put('cart', cart, { expirationTtl: CART_TTL });

	return { cart };
}

export async function removeCouponHandler(cart, state, env) {
	cart.coupon = null;
	cart.discount = 0;
	cart.discountType = null;

	recomputeCartSummary(cart);
	await state.storage.put('cart', cart, { expirationTtl: CART_TTL });

	return { cart };
}

export async function checkoutStartHandler(req, cart, state, env) {
	recomputeCartSummary(cart);

	// Detailed validation with helpful error messages
	if (!cart.items || !cart.items.length) {
		return {
			error: 'cart_empty',
			message: 'Cart is empty. Please add items before checkout.',
			details: { cartId: cart.cartId, itemCount: cart.items?.length || 0 },
		};
	}
	if (!cart.addressId) {
		return {
			error: 'address_required',
			message: 'Shipping address is required. Please select an address.',
			details: { cartId: cart.cartId, hasAddress: !!cart.addressId },
		};
	}
	if (!cart.shippingMethod) {
		return {
			error: 'shipping_required',
			message: 'Shipping method is required. Please select a shipping option.',
			details: {
				cartId: cart.cartId,
				hasShippingMethod: !!cart.shippingMethod,
				shippingOptionsCount: cart.shippingOptions?.length || 0,
			},
		};
	}

	const userId = req.headers.get('x-user-id') || req.headers.get('x-userid') || null;
	if (!userId) {
		return {
			error: 'authentication_required',
			message: 'User authentication is required.',
			status: 401,
		};
	}

	const authToken = req.headers.get('Authorization');
	if (!authToken) {
		return {
			error: 'authorization_required',
			message: 'Authorization token is required.',
			status: 401,
		};
	}

	// Fetch address and user info from gateway
	const addresses = await fetchUserAddresses(env.GATEWAY_URL, authToken);
	const address = addresses.find((a) => a.addressId === cart.addressId);

	if (!address) {
		return {
			error: 'address_not_found',
			message: `Address with ID ${cart.addressId} not found for this user.`,
			details: { addressId: cart.addressId, availableAddresses: addresses.length },
		};
	}

	const userInfo = await fetchUserInfo(env.GATEWAY_URL, authToken);
	const userEmail = userInfo?.email || null;

	const reservationId = `res_${crypto.randomUUID()}`;

	// Reserve inventory
	// Map cart items to inventory service format (only productId, qty, variantId)
	const inventoryItems = cart.items.map((item) => ({
		productId: item.productId,
		qty: item.qty,
		variantId: item.variantId || null,
	}));

	const invRes = await fetchWithInternalAuth(
		env.INVENTORY_SERVICE_URL,
		'/inventory/reserve',
		'POST',
		{
			reservationId,
			items: inventoryItems,
			cartId: cart.cartId,
			userId: userId,
			ttl: RESERVATION_TTL,
		},
		env.INTERNAL_SECRET,
	);

	if (!invRes.ok) {
		return { error: 'reservation_failed', details: invRes.body, status: invRes.status };
	}

	cart.reservationId = reservationId;

	// Create payment order
	const payRes = await fetchWithInternalAuth(
		env.PAYMENT_SERVICE_URL,
		'/payment/paypal/create',
		'POST',
		{
			reservationId,
			amount: cart.summary.total,
			currency: env.DEFAULT_CURRENCY || DEFAULT_CURRENCY,
			userId: userId,
			metadata: {
				cartId: cart.cartId,
				coupon: cart.coupon,
				discount: cart.discount,
				discountType: cart.discountType,
				address: address,
				shippingMethod: cart.shippingMethod,
				items: cart.items,
				email: userEmail,
			},
		},
		env.INTERNAL_SECRET,
	);

	if (!payRes.ok) {
		// Release inventory if payment creation failed
		await fetchWithInternalAuth(env.INVENTORY_SERVICE_URL, '/inventory/release', 'POST', { reservationId }, env.INTERNAL_SECRET);

		return { error: 'payment_error', details: payRes.body, status: payRes.status };
	}

	const paymentId = payRes.body.paymentId;
	cart.paymentOrderId = paymentId;

	await state.storage.put('cart', cart, { expirationTtl: CART_TTL });

	return {
		reservationId,
		paypalOrderId: paymentId,
		paymentId,
		summary: cart.summary,
		approveUrl: payRes.body.approveUrl,
	};
}
