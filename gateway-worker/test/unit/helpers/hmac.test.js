/**
 * Unit tests for hmac.js
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { hmacHex, signedHeadersFor } from '../../../src/helpers/hmac.js';
import sinon from 'sinon';

describe('hmac.helpers', () => {
	afterEach(() => {
		sinon.restore();
	});

	describe('hmacHex', () => {
		it('should generate HMAC hex string', async () => {
			const secret = 'test-secret';
			const message = 'test-message';

			const result = await hmacHex(secret, message);

			expect(result).to.be.a('string');
			expect(result.length).to.be.greaterThan(0);
			expect(result).to.match(/^[0-9a-f]+$/); // Hex string
		});

		it('should generate same hash for same input', async () => {
			const secret = 'test-secret';
			const message = 'test-message';

			const result1 = await hmacHex(secret, message);
			const result2 = await hmacHex(secret, message);

			expect(result1).to.equal(result2);
		});

		it('should generate different hash for different message', async () => {
			const secret = 'test-secret';

			const result1 = await hmacHex(secret, 'message1');
			const result2 = await hmacHex(secret, 'message2');

			expect(result1).to.not.equal(result2);
		});

		it('should handle empty secret', async () => {
			const result = await hmacHex('', 'test-message');
			expect(result).to.be.a('string');
		});
	});

	describe('signedHeadersFor', () => {
		it('should generate signed headers with timestamp and signature', async () => {
			const secret = 'test-secret';
			const method = 'POST';
			const path = '/api/test';
			const body = { test: 'data' };

			const headers = await signedHeadersFor(secret, method, path, body);

			expect(headers).to.have.property('x-timestamp');
			expect(headers).to.have.property('x-signature');
			expect(headers).to.have.property('content-type', 'application/json');
			expect(headers['x-timestamp']).to.be.a('string');
			expect(headers['x-signature']).to.be.a('string');
		});

		it('should include body in signature calculation', async () => {
			const secret = 'test-secret';
			const method = 'POST';
			const path = '/api/test';

			const headers1 = await signedHeadersFor(secret, method, path, { data: '1' });
			const headers2 = await signedHeadersFor(secret, method, path, { data: '2' });

			expect(headers1['x-signature']).to.not.equal(headers2['x-signature']);
		});

		it('should handle string body', async () => {
			const secret = 'test-secret';
			const method = 'POST';
			const path = '/api/test';
			const body = '{"test": "data"}';

			const headers = await signedHeadersFor(secret, method, path, body);

			expect(headers).to.have.property('x-signature');
			expect(headers['x-signature']).to.be.a('string');
		});

		it('should handle empty body', async () => {
			const secret = 'test-secret';
			const method = 'GET';
			const path = '/api/test';

			const headers = await signedHeadersFor(secret, method, path, '');

			expect(headers).to.have.property('x-signature');
		});
	});
});
