/**
 * Fulfillment request handlers
 */
import { jsonResponse, jsonError } from '../helpers/response.js';
import { requireInternalAuth } from '../middleware/auth.middleware.js';
import { fetchWarehouses, getPincodeZone } from '../db/queries.js';
import { calculateTotalWeight, calculateShippingOptions, getZoneTransitDays } from '../services/shipping.service.js';
import { getCouponDiscount } from '../services/coupon.service.js';
import { getOptionsSchema, allocateSchema, shipSchema } from '../validators/fulfillment.validator.js';

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

/**
 * POST /fulfillment/get-options - Get shipping options
 */
export async function getShippingOptionsHandler(req, env) {
	const authError = await requireInternalAuth(req, env);
	if (authError) return authError;

	const validation = await validateBody(getOptionsSchema)(req);
	if (validation.error) {
		return jsonError({ error: 'validation_error', details: validation.error }, 400);
	}

	const { items, address = {}, couponCode = null, subtotal = 0 } = validation.value;

	// Calculate total weight
	const totalWeight = calculateTotalWeight(items);

	// Find zone from pincode
	const pincode = (address && (address.pincode || address.postal || address.zip)) || null;
	const zone = (await getPincodeZone(env, pincode)) || 'OTHER';

	// Choose warehouse
	const warehouses = await fetchWarehouses(env);
	let chosenWarehouse = warehouses.find((w) => (w.zone || '').toUpperCase() === (zone || '').toUpperCase());
	if (!chosenWarehouse) chosenWarehouse = warehouses[0] || null;

	// Get transit days
	const baseDays = getZoneTransitDays(zone);
	const transitDays = baseDays;

	// Get coupon discount if provided
	const couponDiscount = await getCouponDiscount(env, couponCode);

	// Calculate shipping options
	const { options, discountApplied } = calculateShippingOptions(
		env,
		totalWeight,
		subtotal,
		zone,
		transitDays,
		chosenWarehouse,
		couponDiscount,
	);

	return jsonResponse({
		shippingOptions: options,
		subtotalWeight: totalWeight,
		discountApplied,
	});
}

/**
 * POST /fulfillment/allocate - Allocate items to warehouse
 */
export async function allocateHandler(req, env) {
	const authError = await requireInternalAuth(req, env);
	if (authError) return authError;

	const validation = await validateBody(allocateSchema)(req);
	if (validation.error) {
		return jsonError({ error: 'validation_error', details: validation.error }, 400);
	}

	const { items, address = {}, orderId, reservationId } = validation.value;

	const pincode = address?.pincode;
	const zone = (await getPincodeZone(env, pincode)) || 'OTHER';
	const warehouses = await fetchWarehouses(env);
	let chosenWarehouse = warehouses.find((w) => (w.zone || '').toUpperCase() === (zone || '').toUpperCase());
	if (!chosenWarehouse) chosenWarehouse = warehouses[0] || null;

	const estimatedPickupAt = Date.now() + (chosenWarehouse?.handlingHours || 24) * 3600 * 1000;

	const allocation = [
		{
			warehouseId: chosenWarehouse ? chosenWarehouse.warehouseId : null,
			items: items.map((it) => ({ variantId: it.variantId, qty: it.qty })),
			estimatedPickupAt,
		},
	];

	return jsonResponse({ allocation });
}

/**
 * POST /fulfillment/ship - Mark order as shipped
 */
export async function shipHandler(req, env) {
	const authError = await requireInternalAuth(req, env);
	if (authError) return authError;

	const validation = await validateBody(shipSchema)(req);
	if (validation.error) {
		return jsonError({ error: 'validation_error', details: validation.error }, 400);
	}

	const { orderId, allocation = [], shippedAt = Date.now() } = validation.value;

	// In real app: persist to DB, notify user, create tracking, call courier APIs
	return jsonResponse({ ok: true, orderId, allocation, shippedAt });
}
