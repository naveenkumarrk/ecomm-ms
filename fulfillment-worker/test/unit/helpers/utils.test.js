/**
 * Unit tests for helpers/utils.js
 */
import { describe, it } from 'mocha';
import { nowSec, formatDateDaysFromNow, constantTimeEqual } from '../../../src/helpers/utils.js';

describe('utils', () => {
	describe('nowSec', () => {
		it('should return current timestamp in seconds', () => {
			const timestamp = nowSec();
			expect(timestamp).to.be.a('number');
			expect(timestamp).to.be.closeTo(Math.floor(Date.now() / 1000), 2);
		});
	});

	describe('formatDateDaysFromNow', () => {
		it('should format date days from now', () => {
			const dateStr = formatDateDaysFromNow(5);
			expect(dateStr).to.match(/^\d{4}-\d{2}-\d{2}$/);
		});

		it('should format date for zero days', () => {
			const dateStr = formatDateDaysFromNow(0);
			expect(dateStr).to.match(/^\d{4}-\d{2}-\d{2}$/);
		});
	});

	describe('constantTimeEqual', () => {
		it('should return true for equal strings', () => {
			expect(constantTimeEqual('test', 'test')).to.be.true;
		});

		it('should return false for different strings', () => {
			expect(constantTimeEqual('test', 'test2')).to.be.false;
		});

		it('should return false for different length strings', () => {
			expect(constantTimeEqual('test', 'test123')).to.be.false;
		});

		it('should handle empty strings', () => {
			expect(constantTimeEqual('', '')).to.be.true;
			expect(constantTimeEqual('', 'a')).to.be.false;
		});
	});
});
