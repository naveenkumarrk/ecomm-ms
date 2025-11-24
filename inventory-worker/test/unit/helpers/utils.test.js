/**
 * Unit tests for utils.js
 */
import { describe, it } from 'mocha';
import { nowSec, sleep, constantTimeEqual } from '../../../src/helpers/utils.js';

describe('utils', () => {
	describe('nowSec', () => {
		it('should return current timestamp in seconds', () => {
			const before = Math.floor(Date.now() / 1000);
			const result = nowSec();
			const after = Math.floor(Date.now() / 1000);

			expect(result).to.be.at.least(before);
			expect(result).to.be.at.most(after);
		});
	});

	describe('sleep', () => {
		it('should wait for specified milliseconds', async () => {
			const start = Date.now();
			await sleep(10);
			const elapsed = Date.now() - start;

			expect(elapsed).to.be.at.least(8); // Allow some margin
		});
	});

	describe('constantTimeEqual', () => {
		it('should return true for equal strings', () => {
			expect(constantTimeEqual('test', 'test')).to.be.true;
		});

		it('should return false for different strings of same length', () => {
			expect(constantTimeEqual('test', 'best')).to.be.false;
		});

		it('should return false for different length strings', () => {
			expect(constantTimeEqual('test', 'testing')).to.be.false;
		});

		it('should handle empty strings', () => {
			expect(constantTimeEqual('', '')).to.be.true;
			expect(constantTimeEqual('', 'test')).to.be.false;
		});

		it('should handle undefined values', () => {
			expect(constantTimeEqual(undefined, undefined)).to.be.true;
			expect(constantTimeEqual(undefined, '')).to.be.true;
		});
	});
});
