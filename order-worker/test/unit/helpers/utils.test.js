/**
 * Unit tests for helpers/utils.js
 */
import { describe, it } from 'mocha';
import { constantTimeEqual, parseJSONSafe } from '../../../src/helpers/utils.js';

describe('utils', () => {
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

	describe('parseJSONSafe', () => {
		it('should parse valid JSON string', () => {
			const result = parseJSONSafe('{"key":"value"}', {});
			expect(result).to.deep.equal({ key: 'value' });
		});

		it('should return fallback for null', () => {
			const result = parseJSONSafe(null, { default: true });
			expect(result).to.deep.equal({ default: true });
		});

		it('should return fallback for undefined', () => {
			const result = parseJSONSafe(undefined, { default: true });
			expect(result).to.deep.equal({ default: true });
		});

		it('should return fallback for invalid JSON', () => {
			const result = parseJSONSafe('invalid json', { default: true });
			expect(result).to.deep.equal({ default: true });
		});

		it('should return fallback for empty string', () => {
			const result = parseJSONSafe('', { default: true });
			expect(result).to.deep.equal({ default: true });
		});
	});
});

