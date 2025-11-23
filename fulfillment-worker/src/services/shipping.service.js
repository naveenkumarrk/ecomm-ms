/**
 * Shipping calculation service
 */
import { formatDateDaysFromNow } from '../helpers/utils.js';
import {
	DEFAULT_STANDARD_RATE,
	DEFAULT_EXPRESS_RATE,
	DEFAULT_PRIORITY_RATE,
	DEFAULT_FREE_MIN,
	DEFAULT_EXPRESS_DISCOUNT_MIN,
	DEFAULT_EXPRESS_DISCOUNT_PERCENT,
	ZONE_TRANSIT_DAYS,
} from '../config/constants.js';

export function calculateTotalWeight(items) {
	let totalWeight = 0;
	for (const it of items) {
		const qty = Number(it.qty || 1);
		const w = Number((it.attributes && it.attributes.weight) || it.weight || 0);
		totalWeight += Math.max(0, w) * qty;
	}
	return totalWeight <= 0 ? 0.5 : totalWeight; // fallback to 0.5 kg minimum
}

export function calculateShippingOptions(env, totalWeight, subtotal, zone, transitDays, chosenWarehouse, couponDiscount) {
	const STANDARD_RATE = Number(env.STANDARD_RATE || DEFAULT_STANDARD_RATE);
	const EXPRESS_RATE = Number(env.EXPRESS_RATE || DEFAULT_EXPRESS_RATE);
	const PRIORITY_RATE = Number(env.PRIORITY_RATE || DEFAULT_PRIORITY_RATE);
	const FREE_MIN = Number(env.FREE_SHIPPING_MIN || DEFAULT_FREE_MIN);
	const EXPRESS_DISCOUNT_MIN = Number(env.EXPRESS_DISCOUNT_MIN || DEFAULT_EXPRESS_DISCOUNT_MIN);
	const EXPRESS_DISCOUNT_PERCENT = Number(env.EXPRESS_DISCOUNT_PERCENT || DEFAULT_EXPRESS_DISCOUNT_PERCENT);

	// Base cost: apply weight surcharge
	const weightSurcharge = Math.max(0, Math.round((totalWeight - 1) * 10)); // small per-kg add
	let standardCost = Math.max(0, STANDARD_RATE + weightSurcharge);
	let expressCost = Math.max(0, EXPRESS_RATE + Math.round(weightSurcharge * 1.5));
	let priorityCost = Math.max(0, PRIORITY_RATE + Math.round(weightSurcharge * 2.0));

	let discountApplied = null;

	// FREE SHIPPING / THRESHOLD RULES
	if ((subtotal || 0) >= FREE_MIN) {
		standardCost = 0;
		expressCost = Math.max(0, Math.round(expressCost * (1 - EXPRESS_DISCOUNT_PERCENT / 100)));
		discountApplied = {
			type: 'threshold_free_standard',
			freeStandard: true,
			expressDiscountPercent: EXPRESS_DISCOUNT_PERCENT,
			freeThreshold: FREE_MIN,
		};
	} else if ((subtotal || 0) >= EXPRESS_DISCOUNT_MIN) {
		expressCost = Math.max(0, Math.round(expressCost * (1 - EXPRESS_DISCOUNT_PERCENT / 100)));
		discountApplied = {
			type: 'express_threshold_discount',
			expressDiscountPercent: EXPRESS_DISCOUNT_PERCENT,
			expressThreshold: EXPRESS_DISCOUNT_MIN,
		};
	}

	// Apply coupon discount if provided
	if (couponDiscount) {
		if (couponDiscount.type === 'percent_shipping' && couponDiscount.value) {
			standardCost = Math.max(0, Math.round(standardCost * (1 - couponDiscount.value / 100)));
			expressCost = Math.max(0, Math.round(expressCost * (1 - couponDiscount.value / 100)));
			priorityCost = Math.max(0, Math.round(priorityCost * (1 - couponDiscount.value / 100)));
			discountApplied = Object.assign({}, discountApplied || {}, {
				coupon: couponDiscount.code,
				couponType: couponDiscount.type,
				couponValue: couponDiscount.value,
			});
		} else if (couponDiscount.type === 'flat_shipping' && couponDiscount.value) {
			standardCost = Math.max(0, standardCost - couponDiscount.value);
			expressCost = Math.max(0, expressCost - couponDiscount.value);
			priorityCost = Math.max(0, priorityCost - couponDiscount.value);
			discountApplied = Object.assign({}, discountApplied || {}, {
				coupon: couponDiscount.code,
				couponType: couponDiscount.type,
				couponValue: couponDiscount.value,
			});
		} else if (couponDiscount.type === 'free_shipping') {
			standardCost = 0;
			expressCost = 0;
			priorityCost = Math.max(0, Math.round(priorityCost * 0.5));
			discountApplied = Object.assign({}, discountApplied || {}, {
				coupon: couponDiscount.code,
				couponType: couponDiscount.type,
			});
		}
	}

	// Calculate transit days
	const handlingDays = chosenWarehouse ? Math.ceil((chosenWarehouse.handlingHours || 24) / 24) : 1;
	const finalTransitDays = handlingDays + transitDays;
	const exprDays = Math.max(1, Math.floor(finalTransitDays / 2));

	const whId = chosenWarehouse ? chosenWarehouse.warehouseId : null;

	const options = [
		{
			methodId: 'standard',
			title: 'Standard Delivery',
			cost: Math.max(0, Math.round(standardCost)),
			eta: formatDateDaysFromNow(finalTransitDays),
			transitDays: finalTransitDays,
			warehouseId: whId,
		},
		{
			methodId: 'express',
			title: 'Express Delivery',
			cost: Math.max(0, Math.round(expressCost)),
			eta: formatDateDaysFromNow(exprDays),
			transitDays: exprDays,
			warehouseId: whId,
		},
		{
			methodId: 'priority',
			title: 'Priority Delivery',
			cost: Math.max(0, Math.round(priorityCost)),
			eta: formatDateDaysFromNow(1),
			transitDays: 1,
			warehouseId: whId,
		},
	];

	return { options, discountApplied };
}

export function getZoneTransitDays(zone) {
	return ZONE_TRANSIT_DAYS[zone] || ZONE_TRANSIT_DAYS['OTHER'];
}
