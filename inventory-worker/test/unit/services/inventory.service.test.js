/**
 * Unit tests for inventory.service.js
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { reserveInventory, rollbackReservation, commitReservation, releaseReservation } from '../../../src/services/inventory.service.js';
import * as dbQueries from '../../../src/db/queries.js';
import * as lockService from '../../../src/services/lock.service.js';
import sinon from 'sinon';

describe('inventory.service', () => {
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
			INVENTORY_LOCK_KV: {
				get: sinon.stub(),
				put: sinon.stub(),
				delete: sinon.stub(),
			},
		};
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('reserveInventory', () => {
		it('should reserve inventory for valid items', async () => {
			const items = [
				{ productId: 'pro_1', qty: 2 },
				{ productId: 'pro_2', qty: 1 },
			];

			const getStockStub = sinon.stub(dbQueries, 'getProductStock');
			getStockStub.onFirstCall().resolves({ stock: 10, reserved: 2 });
			getStockStub.onSecondCall().resolves({ stock: 5, reserved: 1 });

			const acquireLockStub = sinon.stub(lockService, 'acquireLock');
			acquireLockStub.onFirstCall().resolves({ ok: true, key: 'lock:product:pro_1' });
			acquireLockStub.onSecondCall().resolves({ ok: true, key: 'lock:product:pro_2' });

			const reserveStockStub = sinon.stub(dbQueries, 'reserveStock');
			reserveStockStub.onFirstCall().resolves({ success: true, changes: 1 });
			reserveStockStub.onSecondCall().resolves({ success: true, changes: 1 });

			const createReservationStub = sinon.stub(dbQueries, 'createReservation').resolves({ success: true });

			const result = await reserveInventory(env, 'res_123', 'user123', 'cart_123', items, 900);

			expect(result).to.have.property('reservationId', 'res_123');
			expect(result.items).to.have.length(2);
			expect(getStockStub).to.have.been.calledTwice;
			expect(acquireLockStub).to.have.been.calledTwice;
		});

		it('should throw error for insufficient stock', async () => {
			const items = [{ productId: 'pro_1', qty: 100 }];

			const getStockStub = sinon.stub(dbQueries, 'getProductStock').resolves({ stock: 10, reserved: 5 });
			const acquireLockStub = sinon.stub(lockService, 'acquireLock').resolves({ ok: true });

			try {
				await reserveInventory(env, 'res_123', 'user123', 'cart_123', items, 900);
				expect.fail('Should have thrown an error');
			} catch (err) {
				expect(err.error).to.equal('INSUFFICIENT_STOCK');
				expect(err.applied).to.be.an('array');
				expect(err.locked).to.be.an('array');
			}
		});

		it('should throw error for product not found', async () => {
			const items = [{ productId: 'pro_notfound', qty: 1 }];

			const getStockStub = sinon.stub(dbQueries, 'getProductStock').resolves(null);

			try {
				await reserveInventory(env, 'res_123', 'user123', 'cart_123', items, 900);
				expect.fail('Should have thrown an error');
			} catch (err) {
				expect(err.error).to.equal('product_not_found');
			}
		});
	});

	describe('commitReservation', () => {
		it('should commit reservation successfully', async () => {
			const reservation = {
				reservation_id: 'res_123',
				status: 'active',
				items: JSON.stringify([{ productId: 'pro_1', qty: 2 }]),
			};

			const getReservationStub = sinon.stub(dbQueries, 'getReservation').resolves(reservation);
			const commitStockStub = sinon.stub(dbQueries, 'commitStock').resolves({ success: true });
			const updateStatusStub = sinon.stub(dbQueries, 'updateReservationStatus').resolves({ success: true });

			env.INVENTORY_LOCK_KV.delete.resolves();

			const result = await commitReservation(env, 'res_123');

			expect(result).to.have.property('committed', true);
			expect(commitStockStub).to.have.been.calledOnce;
			expect(updateStatusStub).to.have.been.calledWith(env, 'res_123', 'committed', sinon.match.number);
		});

		it('should throw error for reservation not found', async () => {
			const getReservationStub = sinon.stub(dbQueries, 'getReservation').resolves(null);

			try {
				await commitReservation(env, 'res_notfound');
				expect.fail('Should have thrown an error');
			} catch (err) {
				expect(err.error).to.equal('not_found');
			}
		});
	});

	describe('releaseReservation', () => {
		it('should release reservation successfully', async () => {
			const reservation = {
				reservation_id: 'res_123',
				status: 'active',
				items: JSON.stringify([{ productId: 'pro_1', qty: 2 }]),
			};

			const getReservationStub = sinon.stub(dbQueries, 'getReservation').resolves(reservation);
			const releaseStockStub = sinon.stub(dbQueries, 'releaseReservedStock').resolves({ success: true });
			const updateStatusStub = sinon.stub(dbQueries, 'updateReservationStatus').resolves({ success: true });

			env.INVENTORY_LOCK_KV.delete.resolves();

			const result = await releaseReservation(env, 'res_123');

			expect(result).to.have.property('released', true);
			expect(releaseStockStub).to.have.been.calledOnce;
		});
	});
});
