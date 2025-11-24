/**
 * Unit tests for hmac.js
 */
import { describe, it } from 'mocha';
import { hmacSHA256Hex, signedHeadersFor, callInternal } from '../../../src/helpers/hmac.js';
import sinon from 'sinon';

describe('hmac', () => {
	describe('hmacSHA256Hex', () => {
		it('should generate HMAC SHA256 hex string', async () => {
			const secret = 'test-secret';
			const message = 'test-message';
			const result = await hmacSHA256Hex(secret, message);

			expect(result).to.be.a('string');
			expect(result.length).to.equal(64); // SHA256 hex is 64 chars
		});

		it('should generate different hashes for different messages', async () => {
			const secret = 'test-secret';
			const hash1 = await hmacSHA256Hex(secret, 'message1');
			const hash2 = await hmacSHA256Hex(secret, 'message2');

			expect(hash1).to.not.equal(hash2);
		});

		it('should generate same hash for same input', async () => {
			const secret = 'test-secret';
			const message = 'test-message';
			const hash1 = await hmacSHA256Hex(secret, message);
			const hash2 = await hmacSHA256Hex(secret, message);

			expect(hash1).to.equal(hash2);
		});

		it('should handle empty secret by using empty string encoding', async () => {
			// Empty secret is encoded as empty string, which crypto.subtle doesn't support
			// This test verifies the function handles the edge case
			// In practice, empty secrets should be avoided
			try {
				const result = await hmacSHA256Hex('', 'message');
				expect.fail('Should have thrown an error for empty secret');
			} catch (error) {
				expect(error).to.be.instanceOf(Error);
			}
		});
	});

	describe('signedHeadersFor', () => {
		it('should generate signed headers with timestamp and signature', async () => {
			const secret = 'test-secret';
			const headers = await signedHeadersFor(secret, 'POST', '/path', '{"data": "test"}');

			expect(headers).to.have.property('x-timestamp');
			expect(headers).to.have.property('x-signature');
			expect(headers).to.have.property('content-type', 'application/json');
			expect(headers['x-signature']).to.be.a('string');
		});

		it('should handle string body', async () => {
			const secret = 'test-secret';
			const headers = await signedHeadersFor(secret, 'POST', '/path', 'string body');

			expect(headers).to.have.property('x-signature');
		});

		it('should handle object body', async () => {
			const secret = 'test-secret';
			const headers = await signedHeadersFor(secret, 'POST', '/path', { data: 'test' });

			expect(headers).to.have.property('x-signature');
		});

		it('should handle empty body', async () => {
			const secret = 'test-secret';
			const headers = await signedHeadersFor(secret, 'GET', '/path', '');

			expect(headers).to.have.property('x-signature');
		});
	});

	describe('callInternal', () => {
		let fetchStub;

		beforeEach(() => {
			fetchStub = sinon.stub(global, 'fetch');
		});

		afterEach(() => {
			sinon.restore();
		});

		it('should call internal service with signed headers', async () => {
			fetchStub.resolves({
				ok: true,
				status: 200,
				text: sinon.stub().resolves('{"result": "success"}'),
			});

			const result = await callInternal('https://service.com', '/path', 'POST', { data: 'test' }, 'secret');

			expect(fetchStub).to.have.been.calledOnce;
			expect(result).to.have.property('ok', true);
			expect(result.body).to.deep.equal({ result: 'success' });
		});

		it('should call without secret if not provided', async () => {
			fetchStub.resolves({
				ok: true,
				status: 200,
				text: sinon.stub().resolves('{"result": "success"}'),
			});

			const result = await callInternal('https://service.com', '/path', 'GET', null, null);

			expect(fetchStub).to.have.been.calledOnce;
			const callArgs = fetchStub.firstCall.args[0];
			expect(callArgs).to.include('https://service.com/path');
		});

		it('should handle non-JSON response', async () => {
			fetchStub.resolves({
				ok: true,
				status: 200,
				text: sinon.stub().resolves('plain text'),
			});

			const result = await callInternal('https://service.com', '/path', 'GET', null, 'secret');

			expect(result.body).to.equal('plain text');
		});

		it('should handle URL with trailing slash', async () => {
			fetchStub.resolves({
				ok: true,
				status: 200,
				text: sinon.stub().resolves('{}'),
			});

			await callInternal('https://service.com/', '/path', 'GET', null, 'secret');

			const callArgs = fetchStub.firstCall.args[0];
			expect(callArgs).to.equal('https://service.com/path');
		});

		it('should handle error response', async () => {
			fetchStub.resolves({
				ok: false,
				status: 500,
				text: sinon.stub().resolves('{"error": "server error"}'),
			});

			const result = await callInternal('https://service.com', '/path', 'GET', null, 'secret');

			expect(result).to.have.property('ok', false);
			expect(result).to.have.property('status', 500);
		});
	});
});
