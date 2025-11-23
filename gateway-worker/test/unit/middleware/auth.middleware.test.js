/**
 * Unit tests for auth.middleware.js
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { extractUser, requireAuth, requireAdmin } from '../../../src/middleware/auth.middleware.js';
import sinon from 'sinon';

// Helper to create a valid JWT token for testing
async function createTestJWT(payload, secretBase64) {
	const header = { alg: 'HS256', typ: 'JWT' };
	const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
	const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

	const rawKey = Uint8Array.from(atob(secretBase64), (c) => c.charCodeAt(0));
	const cryptoKey = await crypto.subtle.importKey('raw', rawKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(`${headerB64}.${payloadB64}`));
	const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
		.replace(/=/g, '')
		.replace(/\+/g, '-')
		.replace(/\//g, '_');

	return `${headerB64}.${payloadB64}.${sigB64}`;
}

describe('auth.middleware', () => {
	let env, request;

	beforeEach(() => {
		env = {
			JWT_SECRET: 'dGVzdC1zZWNyZXQ=', // base64 encoded 'test-secret'
		};

		request = {
			headers: {
				get: sinon.stub(),
			},
		};
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('extractUser', () => {
		it('should extract user from valid JWT token', async () => {
			const payload = {
				sub: 'user123',
				role: 'user',
				exp: Math.floor(Date.now() / 1000) + 3600,
			};

			const token = await createTestJWT(payload, env.JWT_SECRET);
			request.headers.get.withArgs('Authorization').returns(`Bearer ${token}`);

			const result = await extractUser(request, env);

			expect(result).to.deep.equal(payload);
		});

		it('should return null when no Authorization header', async () => {
			request.headers.get.withArgs('Authorization').returns(null);

			const result = await extractUser(request, env);

			expect(result).to.be.null;
		});

		it("should return null when Authorization header doesn't start with Bearer", async () => {
			request.headers.get.withArgs('Authorization').returns('Invalid token');

			const result = await extractUser(request, env);

			expect(result).to.be.null;
		});

		it('should return null when JWT verification fails', async () => {
			request.headers.get.withArgs('Authorization').returns('Bearer invalid-token');

			const result = await extractUser(request, env);

			expect(result).to.be.null;
		});
	});

	describe('requireAuth', () => {
		it('should return user when token is valid', async () => {
			const payload = {
				sub: 'user123',
				role: 'user',
				exp: Math.floor(Date.now() / 1000) + 3600,
			};

			const token = await createTestJWT(payload, env.JWT_SECRET);
			request.headers.get.withArgs('Authorization').returns(`Bearer ${token}`);

			const result = await requireAuth(request, env);

			expect(result).to.deep.equal(payload);
		});

		it('should return error response when token is invalid', async () => {
			request.headers.get.withArgs('Authorization').returns(null);

			const result = await requireAuth(request, env);

			expect(result).to.be.instanceOf(Response);
			const data = await result.json();
			expect(data).to.have.property('error', 'unauthorized');
			expect(result.status).to.equal(401);
		});
	});

	describe('requireAdmin', () => {
		it('should return user when user is admin', async () => {
			const payload = {
				sub: 'admin123',
				role: 'admin',
				exp: Math.floor(Date.now() / 1000) + 3600,
			};

			const token = await createTestJWT(payload, env.JWT_SECRET);
			request.headers.get.withArgs('Authorization').returns(`Bearer ${token}`);

			const result = await requireAdmin(request, env);

			expect(result).to.deep.equal(payload);
		});

		it('should return error response when user is not admin', async () => {
			const payload = {
				sub: 'user123',
				role: 'user',
				exp: Math.floor(Date.now() / 1000) + 3600,
			};

			const token = await createTestJWT(payload, env.JWT_SECRET);
			request.headers.get.withArgs('Authorization').returns(`Bearer ${token}`);

			const result = await requireAdmin(request, env);

			expect(result).to.be.instanceOf(Response);
			const data = await result.json();
			expect(data).to.have.property('error', 'forbidden');
			expect(result.status).to.equal(403);
		});

		it('should return error response when no user', async () => {
			request.headers.get.withArgs('Authorization').returns(null);

			const result = await requireAdmin(request, env);

			expect(result).to.be.instanceOf(Response);
			const data = await result.json();
			expect(data).to.have.property('error', 'forbidden');
			expect(result.status).to.equal(403);
		});
	});
});
