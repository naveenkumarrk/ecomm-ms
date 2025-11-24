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

	describe('getProductStock', () => {
		it('should fetch product stock', async () => {
			const mockStock = {
				product_id: 'pro_123',
				stock: 100,
				reserved: 10,
			};

			const stmt = {
				bind: sinon.stub().returnsThis(),
				first: sinon.stub().resolves(mockStock),
			};

			env.DB.prepare.returns(stmt);

			const result = await queries.getProductStock(env, 'pro_123');

			expect(env.DB.prepare).to.have.been.calledWith('SELECT * FROM product_stock WHERE product_id = ?');
			expect(stmt.bind).to.have.been.calledWith('pro_123');
			expect(result).to.have.property('stock', 100);
		});
	});

	describe('reserveStock', () => {
		it('should reserve stock for a product', async () => {
			const stmt = {
				bind: sinon.stub().returnsThis(),
				run: sinon.stub().resolves({ success: true, changes: 1 }),
			};

			env.DB.prepare.returns(stmt);

			const result = await queries.reserveStock(env, 'pro_123', 5);

			expect(env.DB.prepare).to.have.been.called;
			expect(stmt.bind).to.have.been.calledWith(5, 'pro_123', 5);
			expect(stmt.run).to.have.been.calledOnce;
		});
	});

	describe('createReservation', () => {
		it('should create a reservation record', async () => {
			const stmt = {
				bind: sinon.stub().returnsThis(),
				run: sinon.stub().resolves({ success: true }),
			};

			env.DB.prepare.returns(stmt);

			const items = [{ productId: 'pro_1', qty: 2 }];
			const now = Math.floor(Date.now() / 1000);
			const expiresAt = now + 900;

			await queries.createReservation(env, 'res_123', 'user_123', 'cart_123', items, expiresAt, now);

			expect(env.DB.prepare).to.have.been.called;
			expect(stmt.run).to.have.been.calledOnce;
		});
	});
});
