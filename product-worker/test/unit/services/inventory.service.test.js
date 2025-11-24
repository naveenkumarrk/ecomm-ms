/**
 * Unit tests for inventory.service.js
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { getProductStock } from '../../../src/services/inventory.service.js';
import sinon from 'sinon';

describe('inventory.service', () => {
	let fetchStub;
	let env;

	beforeEach(() => {
		fetchStub = sinon.stub(global, 'fetch');
		env = {
			INVENTORY_SERVICE_URL: 'https://inventory.example.com',
			INTERNAL_SECRET: 'test-secret',
		};
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('getProductStock', () => {
		it('should return stock data from inventory service', async () => {
			fetchStub.resolves({
				ok: true,
				status: 200,
				text: sinon.stub().resolves('{"stock": 50, "reserved": 5}'),
			});

			const result = await getProductStock(env, 'pro_123');

			expect(result).to.have.property('stock', 50);
			expect(result).to.have.property('reserved', 5);
			expect(fetchStub).to.have.been.calledOnce;
		});

		it('should return zero stock when service not configured', async () => {
			delete env.INVENTORY_SERVICE_URL;

			const result = await getProductStock(env, 'pro_123');

			expect(result).to.have.property('stock', 0);
			expect(result).to.have.property('reserved', 0);
			expect(fetchStub).to.not.have.been.called;
		});

		it('should return zero stock when INTERNAL_SECRET not configured', async () => {
			delete env.INTERNAL_SECRET;

			const result = await getProductStock(env, 'pro_123');

			expect(result).to.have.property('stock', 0);
			expect(result).to.have.property('reserved', 0);
		});

		it('should return zero stock when service returns error', async () => {
			fetchStub.resolves({
				ok: false,
				status: 500,
				text: sinon.stub().resolves('{"error": "Internal error"}'),
			});

			const result = await getProductStock(env, 'pro_123');

			expect(result).to.have.property('stock', 0);
			expect(result).to.have.property('reserved', 0);
		});

		it('should return zero stock when response has no body', async () => {
			fetchStub.resolves({
				ok: true,
				status: 200,
				text: sinon.stub().resolves(''),
			});

			const result = await getProductStock(env, 'pro_123');

			expect(result).to.have.property('stock', 0);
			expect(result).to.have.property('reserved', 0);
		});

		it('should handle fetch errors gracefully', async () => {
			fetchStub.rejects(new Error('Network error'));

			const result = await getProductStock(env, 'pro_123');

			expect(result).to.have.property('stock', 0);
			expect(result).to.have.property('reserved', 0);
		});

		it('should handle missing stock/reserved in response', async () => {
			fetchStub.resolves({
				ok: true,
				status: 200,
				text: sinon.stub().resolves('{}'),
			});

			const result = await getProductStock(env, 'pro_123');

			expect(result).to.have.property('stock', 0);
			expect(result).to.have.property('reserved', 0);
		});

		it('should use nullish coalescing for stock values', async () => {
			fetchStub.resolves({
				ok: true,
				status: 200,
				text: sinon.stub().resolves('{"stock": null, "reserved": undefined}'),
			});

			const result = await getProductStock(env, 'pro_123');

			expect(result).to.have.property('stock', 0);
			expect(result).to.have.property('reserved', 0);
		});
	});
});
