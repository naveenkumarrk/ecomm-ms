/**
 * Unit tests for auth.middleware.js
 */
import { describe, it, beforeEach } from 'mocha';
import { verifyAdminAuth } from '../../../src/middleware/auth.middleware.js';
import sinon from 'sinon';

describe('auth.middleware', () => {
	let env, request;

	beforeEach(() => {
		env = {
			ADMIN_SECRET: 'admin-secret',
		};

		request = {
			url: 'https://example.com/products',
			method: 'POST',
			headers: {
				get: sinon.stub(),
			},
			clone: sinon.stub(),
		};
	});

	it('should return error if ADMIN_SECRET not configured', async () => {
		delete env.ADMIN_SECRET;

		const response = await verifyAdminAuth(request, env);
		const text = await response.text();

		expect(response.status).to.equal(500);
		expect(text).to.equal('admin_secret_not_configured');
	});

	it('should return 401 if timestamp missing', async () => {
		request.headers.get.withArgs('x-timestamp').returns(null);
		request.headers.get.withArgs('x-signature').returns('sig');

		const response = await verifyAdminAuth(request, env);
		const text = await response.text();

		expect(response.status).to.equal(401);
		expect(text).to.equal('unauthorized');
	});

	it('should return 401 if signature missing', async () => {
		request.headers.get.withArgs('x-timestamp').returns(Date.now().toString());
		request.headers.get.withArgs('x-signature').returns(null);

		const response = await verifyAdminAuth(request, env);
		const text = await response.text();

		expect(response.status).to.equal(401);
		expect(text).to.equal('unauthorized');
	});

	it('should return 401 if signature invalid', async () => {
		const ts = Date.now().toString();
		request.headers.get.withArgs('x-timestamp').returns(ts);
		request.headers.get.withArgs('x-signature').returns('invalid-sig');
		request.headers.get.withArgs('content-type').returns('application/json');
		request.clone.returns(request);
		request.text = sinon.stub().resolves('{}');

		const response = await verifyAdminAuth(request, env);
		const text = await response.text();

		expect(response.status).to.equal(401);
		expect(text).to.equal('unauthorized');
	});

	it('should return null if signature valid for JSON', async () => {
		const ts = Date.now().toString();
		const body = '{"data": "test"}';
		const msg = `${ts}|POST|/products|${body}`;

		// Generate valid signature
		const enc = new TextEncoder();
		const key = await crypto.subtle.importKey('raw', enc.encode('admin-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
		const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
		const signature = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');

		request.headers.get.withArgs('x-timestamp').returns(ts);
		request.headers.get.withArgs('x-signature').returns(signature);
		request.headers.get.withArgs('content-type').returns('application/json');
		request.clone.returns(request);
		request.text = sinon.stub().resolves(body);

		const response = await verifyAdminAuth(request, env);

		expect(response).to.be.null;
	});

	it('should handle multipart form data', async () => {
		const ts = Date.now().toString();
		const msg = `${ts}|POST|/products|`;
		const enc = new TextEncoder();
		const key = await crypto.subtle.importKey('raw', enc.encode('admin-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
		const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
		const signature = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');

		request.headers.get.withArgs('x-timestamp').returns(ts);
		request.headers.get.withArgs('x-signature').returns(signature);
		request.headers.get.withArgs('content-type').returns('multipart/form-data');

		const response = await verifyAdminAuth(request, env);

		expect(response).to.be.null;
	});

	it('should handle text extraction error', async () => {
		const ts = Date.now().toString();
		const msg = `${ts}|POST|/products|`;
		const enc = new TextEncoder();
		const key = await crypto.subtle.importKey('raw', enc.encode('admin-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
		const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
		const signature = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');

		request.headers.get.withArgs('x-timestamp').returns(ts);
		request.headers.get.withArgs('x-signature').returns(signature);
		request.headers.get.withArgs('content-type').returns('application/json');
		request.clone.returns(request);
		request.text = sinon.stub().rejects(new Error('Read error'));

		const response = await verifyAdminAuth(request, env);

		expect(response).to.be.null; // Should use empty string on error
	});
});
