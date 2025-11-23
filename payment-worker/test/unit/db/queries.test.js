/**
 * Unit tests for db/queries.js
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as queries from '../../../src/db/queries.js';
import sinon from 'sinon';

describe('db.queries', () => {
	let env;

	beforeEach(() => {
		env = {
			DB: {
				prepare: sinon.stub().returns({
					bind: sinon.stub().returnsThis(),
					first: sinon.stub(),
					run: sinon.stub(),
				}),
			},
		};
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('createPayment', () => {
		it('should create a payment record', async () => {
			const stmt = {
				bind: sinon.stub().returnsThis(),
				run: sinon.stub().resolves({ success: true }),
			};

			env.DB.prepare.returns(stmt);

			const paymentId = 'pay_123';
			const reservationId = 'res_123';
			const paypalOrderId = 'paypal_order_123';
			const userId = 'user_123';
			const amount = 99.99;
			const currency = 'USD';
			const metadata = { cartId: 'cart_123' };
			const now = Date.now();

			await queries.createPayment(env, paymentId, reservationId, paypalOrderId, userId, amount, currency, metadata, now);

			expect(env.DB.prepare).to.have.been.called;
			expect(stmt.run).to.have.been.calledOnce;
		});
	});

	describe('getPaymentByPaypalOrderId', () => {
		it('should fetch payment by PayPal order ID', async () => {
			const mockPayment = {
				payment_id: 'pay_123',
				paypal_order_id: 'paypal_order_123',
				user_id: 'user_123',
				amount: 99.99,
				status: 'pending',
			};

			const stmt = {
				bind: sinon.stub().returnsThis(),
				first: sinon.stub().resolves(mockPayment),
			};

			env.DB.prepare.returns(stmt);

			const result = await queries.getPaymentByPaypalOrderId(env, 'paypal_order_123');

			expect(env.DB.prepare).to.have.been.calledWith('SELECT * FROM payments WHERE paypal_order_id = ?');
			expect(result).to.have.property('paypal_order_id', 'paypal_order_123');
		});
	});

	describe('updatePaymentStatus', () => {
		it('should update payment status', async () => {
			const stmt = {
				bind: sinon.stub().returnsThis(),
				run: sinon.stub().resolves({ success: true }),
			};

			env.DB.prepare.returns(stmt);

			const paypalOrderId = 'paypal_order_123';
			const status = 'captured';
			const captureId = 'capture_123';
			const rawPaypal = { id: 'paypal_order_123' };
			const now = Date.now();

			await queries.updatePaymentStatus(env, paypalOrderId, status, captureId, rawPaypal, now);

			expect(env.DB.prepare).to.have.been.called;
			expect(stmt.run).to.have.been.calledOnce;
		});
	});
});
