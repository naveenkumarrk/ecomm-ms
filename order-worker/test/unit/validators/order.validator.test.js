/**
 * Unit tests for order.validator.js
 */
import { describe, it } from 'mocha';
import { createOrderSchema } from '../../../src/validators/order.validator.js';

describe('order.validator', () => {
	describe('createOrderSchema', () => {
		it('should validate a valid order', () => {
			const validOrder = {
				reservationId: 'res_123',
				orderId: 'order_123',
				payment: {
					paymentId: 'pay_123',
					amount: 99.99,
					currency: 'USD',
					method: 'paypal',
				},
				userId: 'user_123',
				email: 'user@example.com',
				items: [
					{
						productId: 'pro_1',
						qty: 2,
						unitPrice: 49.99,
						title: 'Product 1',
					},
				],
				address: { street: '123 Main St' },
				shipping: { method: 'standard' },
			};

			const { error } = createOrderSchema.validate(validOrder);
			expect(error).to.be.undefined;
		});

		it('should require reservationId', () => {
			const invalidOrder = {
				payment: { paymentId: 'pay_123', amount: 100 },
			};

			const { error } = createOrderSchema.validate(invalidOrder);
			expect(error).to.exist;
			expect(error.details[0].path).to.include('reservationId');
		});

		it('should require payment object', () => {
			const invalidOrder = {
				reservationId: 'res_123',
			};

			const { error } = createOrderSchema.validate(invalidOrder);
			expect(error).to.exist;
			expect(error.details[0].path).to.include('payment');
		});

		it('should validate payment amount', () => {
			const invalidOrder = {
				reservationId: 'res_123',
				payment: {
					paymentId: 'pay_123',
					amount: -10,
				},
			};

			const { error } = createOrderSchema.validate(invalidOrder);
			expect(error).to.exist;
			expect(error.details[0].message).to.include('must be greater than or equal to 0');
		});

		it('should validate items array', () => {
			const invalidOrder = {
				reservationId: 'res_123',
				payment: { paymentId: 'pay_123', amount: 100 },
				items: [
					{
						productId: 'pro_1',
						// Missing qty
					},
				],
			};

			const { error } = createOrderSchema.validate(invalidOrder);
			expect(error).to.exist;
		});
	});
});
