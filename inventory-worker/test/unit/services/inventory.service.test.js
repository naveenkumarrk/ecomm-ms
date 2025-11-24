/**
 * Unit tests for inventory.service.js
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { reserveInventory, rollbackReservation, commitReservation, releaseReservation } from '../../../src/services/inventory.service.js';
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

			// Mock DB queries
			const stmt1 = env.DB.prepare();
			stmt1.first.onFirstCall().resolves({ stock: 10, reserved: 2 });
			stmt1.first.onSecondCall().resolves({ stock: 5, reserved: 1 });

			// Mock lock service via KV
			env.INVENTORY_LOCK_KV.get.onFirstCall().resolves(null);
			env.INVENTORY_LOCK_KV.get.onSecondCall().resolves(null);
			env.INVENTORY_LOCK_KV.put.onFirstCall().resolves();
			env.INVENTORY_LOCK_KV.put.onSecondCall().resolves();
			env.INVENTORY_LOCK_KV.get.onCall(2).resolves('res-res_123'); // Verify first lock
			env.INVENTORY_LOCK_KV.get.onCall(3).resolves('res-res_123'); // Verify second lock

			// Mock reserve stock
			const reserveStmt = env.DB.prepare();
			reserveStmt.run.onFirstCall().resolves({ success: true, changes: 1, meta: { changes: 1 } });
			reserveStmt.run.onSecondCall().resolves({ success: true, changes: 1, meta: { changes: 1 } });

			// Mock create reservation
			const createStmt = env.DB.prepare();
			createStmt.run.resolves({ success: true });

			const result = await reserveInventory(env, 'res_123', 'user123', 'cart_123', items, 900);

			expect(result).to.have.property('reservationId', 'res_123');
			expect(result.items).to.have.length(2);
			expect(env.DB.prepare).to.have.been.called;
		});

		it('should throw error for insufficient stock', async () => {
			const items = [{ productId: 'pro_1', qty: 100 }];

			// Mock DB - stock check returns insufficient stock
			const stmt = env.DB.prepare();
			stmt.first.resolves({ stock: 10, reserved: 5 });

			// Mock lock service via KV
			env.INVENTORY_LOCK_KV.get.resolves(null);
			env.INVENTORY_LOCK_KV.put.resolves();
			env.INVENTORY_LOCK_KV.get.onCall(1).resolves('res-res_123'); // Verify lock

			let caughtError;
			try {
				await reserveInventory(env, 'res_123', 'user123', 'cart_123', items, 900);
				expect.fail('Should have thrown an error');
			} catch (err) {
				caughtError = err;
			}

			expect(caughtError).to.have.property('error', 'INSUFFICIENT_STOCK');
			expect(caughtError.applied).to.be.an('array');
			expect(caughtError.locked).to.be.an('array');
		});

		it('should throw error for product not found', async () => {
			const items = [{ productId: 'pro_notfound', qty: 1 }];

			// Mock DB - product not found
			const stmt = env.DB.prepare();
			stmt.first.resolves(null);

			let caughtError;
			try {
				await reserveInventory(env, 'res_123', 'user123', 'cart_123', items, 900);
				expect.fail('Should have thrown an error');
			} catch (err) {
				caughtError = err;
			}

			expect(caughtError).to.have.property('error', 'product_not_found');
		});

		it('should throw error for invalid item', async () => {
			const items = [{ productId: '', qty: 1 }];

			let caughtError;
			try {
				await reserveInventory(env, 'res_123', 'user123', 'cart_123', items, 900);
				expect.fail('Should have thrown an error');
			} catch (err) {
				caughtError = err;
			}

			expect(caughtError).to.have.property('error', 'invalid_item');
		});

		it('should throw error for zero quantity', async () => {
			const items = [{ productId: 'pro_1', qty: 0 }];

			let caughtError;
			try {
				await reserveInventory(env, 'res_123', 'user123', 'cart_123', items, 900);
				expect.fail('Should have thrown an error');
			} catch (err) {
				caughtError = err;
			}

			expect(caughtError).to.have.property('error', 'invalid_item');
		});

		it('should throw error when lock acquisition fails', async () => {
			const items = [{ productId: 'pro_1', qty: 2 }];

			// Mock DB - stock available
			const stmt = env.DB.prepare();
			stmt.first.resolves({ stock: 10, reserved: 2 });

			// Mock lock service - lock acquisition fails
			env.INVENTORY_LOCK_KV.get.resolves('res-other_reservation'); // Lock held by another

			let caughtError;
			try {
				await reserveInventory(env, 'res_123', 'user123', 'cart_123', items, 900);
				expect.fail('Should have thrown an error');
			} catch (err) {
				caughtError = err;
			}

			expect(caughtError).to.have.property('error');
		});

		it('should throw error when reserveStock fails', async () => {
			const items = [{ productId: 'pro_1', qty: 2 }];

			// Mock DB - stock available
			const stockStmt = env.DB.prepare();
			stockStmt.first.resolves({ stock: 10, reserved: 2 });

			// Mock lock service
			env.INVENTORY_LOCK_KV.get.onFirstCall().resolves(null);
			env.INVENTORY_LOCK_KV.put.resolves();
			env.INVENTORY_LOCK_KV.get.onCall(1).resolves('res-res_123');

			// Mock reserve stock - fails (no changes)
			const reserveStmt = env.DB.prepare();
			reserveStmt.run.resolves({ success: false, changes: 0 });

			let caughtError;
			try {
				await reserveInventory(env, 'res_123', 'user123', 'cart_123', items, 900);
				expect.fail('Should have thrown an error');
			} catch (err) {
				caughtError = err;
			}

			expect(caughtError).to.have.property('error', 'INSUFFICIENT_STOCK');
		});
	});

	describe('commitReservation', () => {
		it('should commit reservation successfully', async () => {
			const reservation = {
				reservation_id: 'res_123',
				status: 'active',
				items: JSON.stringify([{ productId: 'pro_1', qty: 2 }]),
			};

			// Mock DB queries - prepare returns different stmts for different queries
			let callCount = 0;
			env.DB.prepare = sinon.stub().callsFake((query) => {
				const stmt = {
					bind: sinon.stub().returnsThis(),
					first: sinon.stub(),
					run: sinon.stub().resolves({ success: true }),
				};

				if (query.includes('SELECT') && query.includes('reservations')) {
					stmt.first.resolves(reservation);
				}

				return stmt;
			});

			env.INVENTORY_LOCK_KV.delete.resolves();

			const result = await commitReservation(env, 'res_123');

			expect(result).to.have.property('committed', true);
			expect(env.DB.prepare).to.have.been.called;
		});

		it('should throw error for reservation not found', async () => {
			// Mock DB - reservation not found
			const stmt = env.DB.prepare();
			stmt.first.resolves(null);

			let caughtError;
			try {
				await commitReservation(env, 'res_notfound');
				expect.fail('Should have thrown an error');
			} catch (err) {
				caughtError = err;
			}

			expect(caughtError).to.have.property('error', 'not_found');
		});

		it('should throw error for reservation not active', async () => {
			const reservation = {
				reservation_id: 'res_123',
				status: 'committed',
				items: JSON.stringify([{ productId: 'pro_1', qty: 2 }]),
			};

			// Mock DB - reservation exists but not active
			const stmt = env.DB.prepare();
			stmt.first.resolves(reservation);

			let caughtError;
			try {
				await commitReservation(env, 'res_123');
				expect.fail('Should have thrown an error');
			} catch (err) {
				caughtError = err;
			}

			expect(caughtError).to.have.property('error', 'not_active');
			expect(caughtError).to.have.property('status', 'committed');
		});
	});

	describe('releaseReservation', () => {
		it('should release reservation successfully', async () => {
			const reservation = {
				reservation_id: 'res_123',
				status: 'active',
				items: JSON.stringify([{ productId: 'pro_1', qty: 2 }]),
			};

			// Mock DB queries - prepare returns different stmts for different queries
			env.DB.prepare = sinon.stub().callsFake((query) => {
				const stmt = {
					bind: sinon.stub().returnsThis(),
					first: sinon.stub(),
					run: sinon.stub().resolves({ success: true }),
				};

				if (query.includes('SELECT') && query.includes('reservations')) {
					stmt.first.resolves(reservation);
				}

				return stmt;
			});

			env.INVENTORY_LOCK_KV.delete.resolves();

			const result = await releaseReservation(env, 'res_123');

			expect(result).to.have.property('released', true);
			expect(env.DB.prepare).to.have.been.called;
		});

		it('should release reservation even if not active', async () => {
			const reservation = {
				reservation_id: 'res_123',
				status: 'committed',
				items: JSON.stringify([{ productId: 'pro_1', qty: 2 }]),
			};

			// Mock DB queries
			const getReservationStmt = env.DB.prepare();
			getReservationStmt.first.resolves(reservation);

			const updateStatusStmt = env.DB.prepare();
			updateStatusStmt.run.resolves({ success: true });

			const result = await releaseReservation(env, 'res_123');

			expect(result).to.have.property('released', true);
			// Should not call releaseStock for non-active reservations
		});

		it('should throw error for reservation not found', async () => {
			// Mock DB - reservation not found
			const stmt = env.DB.prepare();
			stmt.first.resolves(null);

			let caughtError;
			try {
				await releaseReservation(env, 'res_notfound');
				expect.fail('Should have thrown an error');
			} catch (err) {
				caughtError = err;
			}

			expect(caughtError).to.have.property('error', 'not_found');
		});
	});

	describe('rollbackReservation', () => {
		it('should rollback applied reservations and release locks', async () => {
			const applied = [{ productId: 'pro_1', qty: 2 }];
			const locked = [{ productId: 'pro_1', owner: 'res-res_123' }];

			// Mock DB - release stock
			const releaseStockStmt = env.DB.prepare();
			releaseStockStmt.run.resolves({ success: true });

			// Mock lock service via KV
			env.INVENTORY_LOCK_KV.get.resolves('res-res_123');
			env.INVENTORY_LOCK_KV.delete.resolves();

			await rollbackReservation(env, applied, locked);

			expect(releaseStockStmt.run).to.have.been.calledOnce;
			expect(env.INVENTORY_LOCK_KV.delete).to.have.been.calledOnce;
		});

		it('should handle rollback errors gracefully', async () => {
			const applied = [{ productId: 'pro_1', qty: 2 }];
			const locked = [{ productId: 'pro_1', owner: 'res-res_123' }];

			// Mock DB - release stock fails
			const releaseStockStmt = env.DB.prepare();
			releaseStockStmt.run.rejects(new Error('DB Error'));

			// Mock lock service via KV
			env.INVENTORY_LOCK_KV.get.resolves('res-res_123');
			env.INVENTORY_LOCK_KV.delete.resolves();

			// Should not throw, just log error
			await rollbackReservation(env, applied, locked);

			expect(releaseStockStmt.run).to.have.been.calledOnce;
		});

		it('should handle lock release errors gracefully', async () => {
			const applied = [{ productId: 'pro_1', qty: 2 }];
			const locked = [{ productId: 'pro_1', owner: 'res-res_123' }];

			// Mock DB - release stock
			const releaseStockStmt = env.DB.prepare();
			releaseStockStmt.run.resolves({ success: true });

			// Mock lock service via KV - delete fails
			env.INVENTORY_LOCK_KV.get.resolves('res-res_123');
			env.INVENTORY_LOCK_KV.delete.rejects(new Error('KV Error'));

			// Should not throw, just log error
			await rollbackReservation(env, applied, locked);

			expect(env.INVENTORY_LOCK_KV.delete).to.have.been.calledOnce;
		});
	});
});
