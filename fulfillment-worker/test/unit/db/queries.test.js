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
					all: sinon.stub(),
				}),
			},
			PINCODE_KV: {
				get: sinon.stub(),
			},
		};
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('fetchWarehouses', () => {
		it('should fetch warehouses from database', async () => {
			const mockWarehouses = {
				results: [
					{
						warehouse_id: 'wh_1',
						name: 'Warehouse 1',
						zone: 'MUM',
						pincode: '400001',
						handling_hours: 24,
						cutoff_hour: 18,
						priority: 1,
					},
				],
			};

			const stmt = {
				all: sinon.stub().resolves(mockWarehouses),
			};

			env.DB.prepare.returns(stmt);

			const result = await queries.fetchWarehouses(env);

			expect(env.DB.prepare).to.have.been.calledWith('SELECT * FROM warehouses ORDER BY priority ASC');
			expect(result).to.be.an('array').with.length(1);
			expect(result[0]).to.have.property('warehouseId', 'wh_1');
		});

		it('should return empty array on error', async () => {
			env.DB.prepare.throws(new Error('DB Error'));

			const result = await queries.fetchWarehouses(env);

			expect(result).to.be.an('array').that.is.empty;
		});
	});

	describe('getPincodeZone', () => {
		it('should get zone from pincode KV', async () => {
			env.PINCODE_KV.get.resolves(JSON.stringify({ zone: 'MUM' }));

			const result = await queries.getPincodeZone(env, '400001');

			expect(env.PINCODE_KV.get).to.have.been.calledWith('pincode:400001');
			expect(result).to.equal('MUM');
		});

		it('should return null for non-existent pincode', async () => {
			env.PINCODE_KV.get.resolves(null);

			const result = await queries.getPincodeZone(env, '999999');

			expect(result).to.be.null;
		});

		it('should return null for empty pincode', async () => {
			const result = await queries.getPincodeZone(env, null);

			expect(result).to.be.null;
		});
	});
});
