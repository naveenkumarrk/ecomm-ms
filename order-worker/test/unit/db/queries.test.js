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
					all: sinon.stub(),
					run: sinon.stub(),
				}),
			},
		};
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('getOrderById', () => {
		it('should fetch order by ID', async () => {
			const mockOrder = {
				order_id: 'order_123',
				user_id: 'user_123',
				items_json: '[]',
				address_json: 'null',
				shipping_json: 'null',
				payment_json: 'null',
			};

			const stmt = {
				bind: sinon.stub().returnsThis(),
				first: sinon.stub().resolves(mockOrder),
			};

			env.DB.prepare.returns(stmt);

			const result = await queries.getOrderById(env, 'order_123');

			expect(env.DB.prepare).to.have.been.calledWith('SELECT * FROM orders WHERE order_id = ?');
			expect(stmt.bind).to.have.been.calledWith('order_123');
			expect(result).to.have.property('order_id', 'order_123');
		});
	});

	describe('getOrdersByUserId', () => {
		it('should fetch orders for a user', async () => {
			const mockOrders = {
				results: [
					{ order_id: 'order_1', user_id: 'user_123' },
					{ order_id: 'order_2', user_id: 'user_123' },
				],
			};

			const stmt = {
				bind: sinon.stub().returnsThis(),
				all: sinon.stub().resolves(mockOrders),
			};

			env.DB.prepare.returns(stmt);

			const result = await queries.getOrdersByUserId(env, 'user_123', 50);

			expect(env.DB.prepare).to.have.been.calledWith('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?');
			expect(stmt.bind).to.have.been.calledWith('user_123', 50);
			expect(result).to.have.property('results');
		});
	});

	describe('getAllOrders', () => {
		it('should fetch all orders with limit', async () => {
			const mockOrders = {
				results: [{ order_id: 'order_1' }, { order_id: 'order_2' }],
			};

			const stmt = {
				bind: sinon.stub().returnsThis(),
				all: sinon.stub().resolves(mockOrders),
			};

			env.DB.prepare.returns(stmt);

			const result = await queries.getAllOrders(env, 100);

			expect(env.DB.prepare).to.have.been.calledWith('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?');
			expect(stmt.bind).to.have.been.calledWith(100);
			expect(result).to.have.property('results');
		});
	});

	describe('checkOrderExists', () => {
		it('should check if order exists by orderId', async () => {
			const mockOrder = { order_id: 'order_123' };

			const stmt = {
				bind: sinon.stub().returnsThis(),
				first: sinon.stub().resolves(mockOrder),
			};

			env.DB.prepare.returns(stmt);

			const result = await queries.checkOrderExists(env, 'order_123', 'res_123');

			expect(env.DB.prepare).to.have.been.calledWith('SELECT order_id FROM orders WHERE order_id = ? OR reservation_id = ?');
			expect(stmt.bind).to.have.been.calledWith('order_123', 'res_123');
			expect(result).to.have.property('order_id', 'order_123');
		});
	});

	describe('createOrder', () => {
		it('should create a new order', async () => {
			const orderData = {
				orderId: 'order_123',
				reservationId: 'res_123',
				userId: 'user_123',
				email: 'user@example.com',
				amount: 99.99,
				currency: 'USD',
				status: 'paid',
				items: [{ productId: 'pro_1', qty: 2 }],
				address: { street: '123 Main St' },
				shipping: { method: 'standard' },
				payment: { paymentId: 'pay_123' },
				now: Date.now(),
			};

			const stmt = {
				bind: sinon.stub().returnsThis(),
				run: sinon.stub().resolves({ success: true }),
			};

			env.DB.prepare.returns(stmt);

			await queries.createOrder(env, orderData);

			expect(env.DB.prepare).to.have.been.called;
			expect(stmt.run).to.have.been.calledOnce;
		});
	});

	describe('updateOrderStatus', () => {
		it('should update order status', async () => {
			const stmt = {
				bind: sinon.stub().returnsThis(),
				run: sinon.stub().resolves({ success: true }),
			};

			env.DB.prepare.returns(stmt);

			const now = Date.now();
			await queries.updateOrderStatus(env, 'order_123', 'shipped', now);

			expect(env.DB.prepare).to.have.been.calledWith('UPDATE orders SET status=?, updated_at=? WHERE order_id=?');
			expect(stmt.bind).to.have.been.calledWith('shipped', now, 'order_123');
			expect(stmt.run).to.have.been.calledOnce;
		});
	});
});
