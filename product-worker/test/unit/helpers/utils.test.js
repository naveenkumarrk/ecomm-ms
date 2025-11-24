/**
 * Unit tests for utils.js
 */
import { describe, it } from 'mocha';
import { parseJSONSafe, nowSec } from '../../../src/helpers/utils.js';

describe('utils', () => {
	describe('parseJSONSafe', () => {
		it('should parse valid JSON string', () => {
			const result = parseJSONSafe('{"key": "value"}', {});
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
			const result = parseJSONSafe('', []);
			expect(result).to.deep.equal([]);
		});
	});

	describe('nowSec', () => {
		it('should return current timestamp in seconds', () => {
			const before = Math.floor(Date.now() / 1000);
			const result = nowSec();
			const after = Math.floor(Date.now() / 1000);

			expect(result).to.be.at.least(before);
			expect(result).to.be.at.most(after);
		});
	});
});
