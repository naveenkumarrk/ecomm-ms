/**
 * Unit tests for payment.validator.js
 */
import { describe, it } from 'mocha';
import { createPaymentSchema, capturePaymentSchema } from '../../../src/validators/payment.validator.js';

describe('payment.validator', () => {
	describe('createPaymentSchema', () => {
		it('should validate a valid payment creation', () => {
			const validPayment = {
				reservationId: 'res_123',
				amount: 99.99,
				currency: 'USD',
				userId: 'user_123',
				metadata: { cartId: 'cart_123' },
			};

			const { error } = createPaymentSchema.validate(validPayment);
			expect(error).to.be.undefined;
		});

		it('should require reservationId', () => {
			const invalidPayment = {
				amount: 99.99,
				userId: 'user_123',
			};

			const { error } = createPaymentSchema.validate(invalidPayment);
			expect(error).to.exist;
			expect(error.details[0].path).to.include('reservationId');
		});

		it('should require amount', () => {
			const invalidPayment = {
				reservationId: 'res_123',
				userId: 'user_123',
			};

			const { error } = createPaymentSchema.validate(invalidPayment);
			expect(error).to.exist;
			expect(error.details[0].path).to.include('amount');
		});

		it('should require userId', () => {
			const invalidPayment = {
				reservationId: 'res_123',
				amount: 99.99,
			};

			const { error } = createPaymentSchema.validate(invalidPayment);
			expect(error).to.exist;
			expect(error.details[0].path).to.include('userId');
		});

		it('should validate amount is non-negative', () => {
			const invalidPayment = {
				reservationId: 'res_123',
				amount: -10,
				userId: 'user_123',
			};

			const { error } = createPaymentSchema.validate(invalidPayment);
			expect(error).to.exist;
			expect(error.details[0].message).to.include('must be greater than or equal to 0');
		});
	});

	describe('capturePaymentSchema', () => {
		it('should validate a valid capture request', () => {
			const validCapture = {
				paypalOrderId: 'paypal_order_123',
				reservationId: 'res_123',
			};

			const { error } = capturePaymentSchema.validate(validCapture);
			expect(error).to.be.undefined;
		});

		it('should require paypalOrderId', () => {
			const invalidCapture = {
				reservationId: 'res_123',
			};

			const { error } = capturePaymentSchema.validate(invalidCapture);
			expect(error).to.exist;
			expect(error.details[0].path).to.include('paypalOrderId');
		});

		it('should require reservationId', () => {
			const invalidCapture = {
				paypalOrderId: 'paypal_order_123',
			};

			const { error } = capturePaymentSchema.validate(invalidCapture);
			expect(error).to.exist;
			expect(error.details[0].path).to.include('reservationId');
		});
	});
});
