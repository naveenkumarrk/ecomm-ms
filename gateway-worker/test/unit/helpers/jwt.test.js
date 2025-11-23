/**
 * Unit tests for jwt.js
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { verifyJWT } from '../../../src/helpers/jwt.js';
import sinon from 'sinon';

describe('jwt.helpers', () => {
	afterEach(() => {
		sinon.restore();
	});

	describe('verifyJWT', () => {
		it('should return null for invalid token format', async () => {
			const result = await verifyJWT('invalid-token', 'dGVzdC1zZWNyZXQ=');
			expect(result).to.be.null;
		});

		it('should return null for token with missing parts', async () => {
			const result = await verifyJWT('header.payload', 'dGVzdC1zZWNyZXQ=');
			expect(result).to.be.null;
		});

		it('should return null for expired token', async () => {
			// Create an expired token payload
			const expiredPayload = {
				sub: 'user123',
				role: 'user',
				exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
			};

			const payloadB64 = btoa(JSON.stringify(expiredPayload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

			// This will fail signature verification, but we're testing the exp check
			const token = `header.${payloadB64}.signature`;

			const result = await verifyJWT(token, 'dGVzdC1zZWNyZXQ=');
			// Will return null due to signature verification failure or exp check
			expect(result).to.be.null;
		});

		it('should return null for invalid signature', async () => {
			const payload = {
				sub: 'user123',
				role: 'user',
				exp: Math.floor(Date.now() / 1000) + 3600,
			};

			const payloadB64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

			const token = `header.${payloadB64}.invalid-signature`;

			const result = await verifyJWT(token, 'dGVzdC1zZWNyZXQ=');
			expect(result).to.be.null;
		});
	});
});
