/**
 * Unit tests for jwt.js
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { signJWT, verifyJWT } from '../../../src/helpers/jwt.js';
import sinon from 'sinon';

describe('jwt.helpers', () => {
	const secretB64 = btoa('test-secret-key');

	afterEach(() => {
		sinon.restore();
	});

	describe('signJWT', () => {
		it('should sign a JWT token', async () => {
			const payload = {
				sub: 'user123',
				role: 'user',
			};

			const token = await signJWT(payload, secretB64);

			expect(token).to.be.a('string');
			expect(token.split('.')).to.have.length(3);
		});

		it('should include payload in token', async () => {
			const payload = {
				sub: 'user123',
				role: 'user',
			};

			const token = await signJWT(payload, secretB64);
			const decoded = await verifyJWT(token, secretB64);

			expect(decoded).to.have.property('sub', 'user123');
			expect(decoded).to.have.property('role', 'user');
			expect(decoded).to.have.property('iat');
			expect(decoded).to.have.property('exp');
		});

		it('should use custom TTL', async () => {
			const payload = { sub: 'user123' };
			const ttl = 3600; // 1 hour

			const token = await signJWT(payload, secretB64, ttl);
			const decoded = await verifyJWT(token, secretB64);

			const now = Math.floor(Date.now() / 1000);
			expect(decoded.exp - decoded.iat).to.equal(ttl);
		});
	});

	describe('verifyJWT', () => {
		it('should verify valid JWT token', async () => {
			const payload = {
				sub: 'user123',
				role: 'user',
			};

			const token = await signJWT(payload, secretB64);
			const decoded = await verifyJWT(token, secretB64);

			expect(decoded).to.have.property('sub', 'user123');
			expect(decoded).to.have.property('role', 'user');
		});

		it('should return null for invalid token format', async () => {
			const result = await verifyJWT('invalid-token', secretB64);

			expect(result).to.be.null;
		});

		it('should return null for token with wrong signature', async () => {
			const payload = { sub: 'user123' };
			const token = await signJWT(payload, secretB64);

			// Modify the signature
			const parts = token.split('.');
			const invalidToken = `${parts[0]}.${parts[1]}.invalid-signature`;

			const result = await verifyJWT(invalidToken, secretB64);

			expect(result).to.be.null;
		});

		it('should return null for expired token', async () => {
			const payload = { sub: 'user123' };
			const token = await signJWT(payload, secretB64, -3600); // Expired 1 hour ago

			const result = await verifyJWT(token, secretB64);

			expect(result).to.be.null;
		});

		it('should return null for token signed with different secret', async () => {
			const payload = { sub: 'user123' };
			const token = await signJWT(payload, secretB64);
			const differentSecret = btoa('different-secret');

			const result = await verifyJWT(token, differentSecret);

			expect(result).to.be.null;
		});
	});
});
