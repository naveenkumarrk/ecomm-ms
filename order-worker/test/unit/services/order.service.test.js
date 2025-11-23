/**
 * Unit tests for order.service.js
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { transformOrderRow, transformOrderRows } from '../../../src/services/order.service.js';
import sinon from 'sinon';

describe('order.service', () => {
	afterEach(() => {
		sinon.restore();
	});

	describe('transformOrderRow', () => {
		it('should transform order row with JSON fields parsed', () => {
			const row = {
				order_id: 'order_123',
				user_id: 'user_123',
				items_json: '[{"productId": "pro_1", "qty": 2}]',
				address_json: '{"street": "123 Main St"}',
				shipping_json: '{"method": "standard"}',
				payment_json: '{"paymentId": "pay_123"}',
			};

			const result = transformOrderRow(row);

			expect(result.items_json).to.be.an('array');
			expect(result.address_json).to.be.an('object');
			expect(result.shipping_json).to.be.an('object');
			expect(result.payment_json).to.be.an('object');
		});
	});

	describe('transformOrderRows', () => {
		it('should transform multiple order rows', () => {
			const rows = {
				results: [
					{
						order_id: 'order_1',
						items_json: '[]',
						address_json: 'null',
						shipping_json: 'null',
						payment_json: 'null',
					},
					{
						order_id: 'order_2',
						items_json: '[]',
						address_json: 'null',
						shipping_json: 'null',
						payment_json: 'null',
					},
				],
			};

			const results = transformOrderRows(rows);

			expect(results).to.be.an('array').with.length(2);
			expect(results[0]).to.have.property('order_id', 'order_1');
			expect(results[1]).to.have.property('order_id', 'order_2');
		});

		it('should handle empty results', () => {
			const rows = { results: [] };

			const results = transformOrderRows(rows);

			expect(results).to.be.an('array').that.is.empty;
		});
	});
});
