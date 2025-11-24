/**
 * Unit tests for shipping.service.js
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { calculateTotalWeight, calculateShippingOptions, getZoneTransitDays } from '../../../src/services/shipping.service.js';
import sinon from 'sinon';

describe('shipping.service', () => {
	afterEach(() => {
		sinon.restore();
	});

	describe('calculateTotalWeight', () => {
		it('should calculate total weight from items', () => {
			const items = [
				{ qty: 2, attributes: { weight: 1.5 } },
				{ qty: 1, attributes: { weight: 2.0 } },
			];

			const totalWeight = calculateTotalWeight(items);

			expect(totalWeight).to.equal(5.0);
		});

		it('should use fallback weight if not provided', () => {
			const items = [{ qty: 1 }];

			const totalWeight = calculateTotalWeight(items);

			expect(totalWeight).to.equal(0.5); // Minimum fallback
		});

		it('should handle items with weight property', () => {
			const items = [{ qty: 2, weight: 1.0 }];

			const totalWeight = calculateTotalWeight(items);

			expect(totalWeight).to.equal(2.0);
		});
	});

	describe('calculateShippingOptions', () => {
		it('should calculate shipping options with standard rates', () => {
			const env = {};
			const totalWeight = 2.0;
			const subtotal = 500;
			const zone = 'MUM';
			const transitDays = 1;
			const chosenWarehouse = { warehouseId: 'wh_1', handlingHours: 24 };
			const couponDiscount = null;

			const { options, discountApplied } = calculateShippingOptions(
				env,
				totalWeight,
				subtotal,
				zone,
				transitDays,
				chosenWarehouse,
				couponDiscount,
			);

			expect(options).to.be.an('array').with.length(3);
			expect(options[0]).to.have.property('methodId', 'standard');
			expect(options[1]).to.have.property('methodId', 'express');
			expect(options[2]).to.have.property('methodId', 'priority');
		});

		it('should apply free shipping for high subtotal', () => {
			const env = {};
			const totalWeight = 2.0;
			const subtotal = 1500; // Above free threshold
			const zone = 'MUM';
			const transitDays = 1;
			const chosenWarehouse = { warehouseId: 'wh_1', handlingHours: 24 };
			const couponDiscount = null;

			const { options, discountApplied } = calculateShippingOptions(
				env,
				totalWeight,
				subtotal,
				zone,
				transitDays,
				chosenWarehouse,
				couponDiscount,
			);

			expect(options[0].cost).to.equal(0); // Free standard
			expect(discountApplied).to.have.property('type', 'threshold_free_standard');
		});

		it('should apply coupon discount', () => {
			const env = {};
			const totalWeight = 2.0;
			const subtotal = 500;
			const zone = 'MUM';
			const transitDays = 1;
			const chosenWarehouse = { warehouseId: 'wh_1', handlingHours: 24 };
			const couponDiscount = {
				code: 'SAVE10',
				type: 'percent_shipping',
				value: 10,
			};

			const { options, discountApplied } = calculateShippingOptions(
				env,
				totalWeight,
				subtotal,
				zone,
				transitDays,
				chosenWarehouse,
				couponDiscount,
			);

			expect(discountApplied).to.have.property('coupon', 'SAVE10');
			expect(discountApplied).to.have.property('couponType', 'percent_shipping');
		});


		it('should apply flat shipping coupon discount', () => {
			const env = {};
			const totalWeight = 2.0;
			const subtotal = 500;
			const zone = 'MUM';
			const transitDays = 1;
			const chosenWarehouse = { warehouseId: 'wh_1', handlingHours: 24 };
			const couponDiscount = {
				code: 'FLAT20',
				type: 'flat_shipping',
				value: 20,
			};

			const { options, discountApplied } = calculateShippingOptions(
				env,
				totalWeight,
				subtotal,
				zone,
				transitDays,
				chosenWarehouse,
				couponDiscount,
			);

			expect(discountApplied).to.have.property('coupon', 'FLAT20');
			expect(discountApplied).to.have.property('couponType', 'flat_shipping');
		});

		it('should apply free shipping coupon', () => {
			const env = {};
			const totalWeight = 2.0;
			const subtotal = 500;
			const zone = 'MUM';
			const transitDays = 1;
			const chosenWarehouse = { warehouseId: 'wh_1', handlingHours: 24 };
			const couponDiscount = {
				code: 'FREESHIP',
				type: 'free_shipping',
			};

			const { options, discountApplied } = calculateShippingOptions(
				env,
				totalWeight,
				subtotal,
				zone,
				transitDays,
				chosenWarehouse,
				couponDiscount,
			);

			expect(options[0].cost).to.equal(0); // Standard free
			expect(options[1].cost).to.equal(0); // Express free
			expect(discountApplied).to.have.property('coupon', 'FREESHIP');
			expect(discountApplied).to.have.property('couponType', 'free_shipping');
		});
	});

	describe('getZoneTransitDays', () => {
		it('should return transit days for known zone', () => {
			const days = getZoneTransitDays('MUM');
			expect(days).to.equal(1);
		});

		it('should return default for unknown zone', () => {
			const days = getZoneTransitDays('UNKNOWN');
			expect(days).to.equal(3); // OTHER default
		});
	});
});
