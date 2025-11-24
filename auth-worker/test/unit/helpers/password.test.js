/**
 * Unit tests for password.js
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { hashPassword, verifyPassword } from '../../../src/helpers/password.js';
import sinon from 'sinon';

describe('password.helpers', () => {
	afterEach(() => {
		sinon.restore();
	});

	describe('hashPassword', () => {
		it('should hash a password', async () => {
			const password = 'testPassword123';

			const hash = await hashPassword(password);

			expect(hash).to.be.a('string');
			expect(hash).to.include('pbkdf2$');
			expect(hash.split('$')).to.have.length(4);
		});

		it('should generate different hashes for same password (due to salt)', async () => {
			const password = 'testPassword123';

			const hash1 = await hashPassword(password);
			const hash2 = await hashPassword(password);

			expect(hash1).to.not.equal(hash2);
		});

		it('should generate valid hash format', async () => {
			const password = 'testPassword123';

			const hash = await hashPassword(password);
			const parts = hash.split('$');

			expect(parts[0]).to.equal('pbkdf2');
			expect(parts[1]).to.equal('20000');
			expect(parts[2]).to.be.a('string').with.length(32); // 16 bytes = 32 hex chars
			expect(parts[3]).to.be.a('string').with.length(64); // 32 bytes = 64 hex chars
		});
	});

	describe('verifyPassword', () => {
		it('should verify correct password', async () => {
			const password = 'testPassword123';
			const hash = await hashPassword(password);

			const result = await verifyPassword(hash, password);

			expect(result).to.be.true;
		});

		it('should reject incorrect password', async () => {
			const password = 'testPassword123';
			const hash = await hashPassword(password);

			const result = await verifyPassword(hash, 'wrongPassword');

			expect(result).to.be.false;
		});

		it('should return false for invalid hash format', async () => {
			const result = await verifyPassword('invalid-hash', 'password');

			expect(result).to.be.false;
		});

		it('should return false for non-pbkdf2 hash', async () => {
			const result = await verifyPassword('md5$salt$hash', 'password');

			expect(result).to.be.false;
		});

		it('should handle malformed hash gracefully', async () => {
			const result = await verifyPassword('pbkdf2$invalid', 'password');

			expect(result).to.be.false;
		});
	});
});
