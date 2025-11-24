/**
 * Unit tests for utils.js
 */
import { describe, it } from 'mocha';
import {
	epoch,
	parseJSON,
	parseUser,
	normalizeEmail,
	generateUserId,
	generateSessionId,
	generateAddressId,
} from '../../../src/helpers/utils.js';

describe('utils', () => {
	describe('epoch', () => {
		it('should return current timestamp in seconds', () => {
			const before = Math.floor(Date.now() / 1000);
			const result = epoch();
			const after = Math.floor(Date.now() / 1000);

			expect(result).to.be.at.least(before);
			expect(result).to.be.at.most(after);
		});
	});

	describe('parseJSON', () => {
		it('should parse valid JSON from row data', () => {
			const row = { data: '{"key": "value"}' };
			const result = parseJSON(row);

			expect(result).to.deep.equal({ key: 'value' });
		});

		it('should return fallback for invalid JSON', () => {
			const row = { data: 'invalid json' };
			const result = parseJSON(row, { default: true });

			expect(result).to.deep.equal({ default: true });
		});

		it('should return empty object for null row', () => {
			const result = parseJSON(null, { default: true });

			// When row is null, row?.data is undefined, so it parses '{}' successfully
			expect(result).to.deep.equal({});
		});

		it('should return empty object for row without data', () => {
			const row = {};
			const result = parseJSON(row, { default: true });

			// When row.data is undefined, it parses '{}' successfully
			expect(result).to.deep.equal({});
		});

		it('should return fallback for invalid JSON', () => {
			const row = { data: 'invalid json' };
			const result = parseJSON(row, { default: true });

			expect(result).to.deep.equal({ default: true });
		});
	});

	describe('parseUser', () => {
		it('should parse user data from row', () => {
			const row = { data: '{"name": "Test User"}' };
			const result = parseUser(row);

			expect(result).to.deep.equal({ name: 'Test User' });
		});
	});

	describe('normalizeEmail', () => {
		it('should lowercase and trim email', () => {
			expect(normalizeEmail('  TEST@EXAMPLE.COM  ')).to.equal('test@example.com');
		});

		it('should handle already normalized email', () => {
			expect(normalizeEmail('test@example.com')).to.equal('test@example.com');
		});
	});

	describe('generateUserId', () => {
		it('should generate user ID with usr_ prefix', () => {
			const id = generateUserId();
			expect(id).to.match(/^usr_/);
			expect(id.length).to.be.greaterThan(4);
		});

		it('should generate unique IDs', () => {
			const id1 = generateUserId();
			const id2 = generateUserId();
			expect(id1).to.not.equal(id2);
		});
	});

	describe('generateSessionId', () => {
		it('should generate session ID with sess_ prefix', () => {
			const id = generateSessionId();
			expect(id).to.match(/^sess_/);
			expect(id.length).to.be.greaterThan(5);
		});

		it('should generate unique IDs', () => {
			const id1 = generateSessionId();
			const id2 = generateSessionId();
			expect(id1).to.not.equal(id2);
		});
	});

	describe('generateAddressId', () => {
		it('should generate address ID with addr_ prefix', () => {
			const id = generateAddressId();
			expect(id).to.match(/^addr_/);
			expect(id.length).to.be.greaterThan(5);
		});

		it('should generate unique IDs', () => {
			const id1 = generateAddressId();
			const id2 = generateAddressId();
			expect(id1).to.not.equal(id2);
		});
	});
});
