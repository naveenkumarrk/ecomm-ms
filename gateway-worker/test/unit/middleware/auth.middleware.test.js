/**
 * Unit tests for auth.middleware.js
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { extractUser, requireAuth, requireAdmin } from '../../../src/middleware/auth.middleware.js';
import * as jwtHelper from '../../../src/helpers/jwt.js';
import sinon from 'sinon';

describe('auth.middleware', () => {
	let env, request;

	beforeEach(() => {
		env = {
			JWT_SECRET: 'dGVzdC1zZWNyZXQ=',
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
			const mockUser = {
				sub: 'user123',
				role: 'user',
				exp: Math.floor(Date.now() / 1000) + 3600,
			};

			request.headers.get.withArgs('Authorization').returns('Bearer valid-token');

			const verifyJWTStub = sinon.stub(jwtHelper, 'verifyJWT').resolves(mockUser);

			const result = await extractUser(request, env);

			expect(verifyJWTStub).to.have.been.calledOnceWith('valid-token', env.JWT_SECRET);
			expect(result).to.deep.equal(mockUser);
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

			const verifyJWTStub = sinon.stub(jwtHelper, 'verifyJWT').resolves(null);

			const result = await extractUser(request, env);

			expect(result).to.be.null;
			expect(verifyJWTStub).to.have.been.calledOnce;
		});
	});

	describe('requireAuth', () => {
		it('should return user when token is valid', async () => {
			const mockUser = {
				sub: 'user123',
				role: 'user',
				exp: Math.floor(Date.now() / 1000) + 3600,
			};

			const extractUserStub = sinon.stub().resolves(mockUser);
			sinon.stub(jwtHelper, 'verifyJWT').resolves(mockUser);
			request.headers.get.withArgs('Authorization').returns('Bearer valid-token');

			// Mock extractUser by stubbing the module
			const authMiddleware = await import('../../../src/middleware/auth.middleware.js');
			const originalExtract = authMiddleware.extractUser;
			authMiddleware.extractUser = extractUserStub;

			const result = await requireAuth(request, env);

			expect(result).to.deep.equal(mockUser);

			authMiddleware.extractUser = originalExtract;
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
			const mockAdmin = {
				sub: 'admin123',
				role: 'admin',
				exp: Math.floor(Date.now() / 1000) + 3600,
			};

			request.headers.get.withArgs('Authorization').returns('Bearer admin-token');
			const verifyJWTStub = sinon.stub(jwtHelper, 'verifyJWT').resolves(mockAdmin);

			const result = await requireAdmin(request, env);

			expect(result).to.deep.equal(mockAdmin);
		});

		it('should return error response when user is not admin', async () => {
			const mockUser = {
				sub: 'user123',
				role: 'user',
				exp: Math.floor(Date.now() / 1000) + 3600,
			};

			request.headers.get.withArgs('Authorization').returns('Bearer user-token');
			const verifyJWTStub = sinon.stub(jwtHelper, 'verifyJWT').resolves(mockUser);

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
