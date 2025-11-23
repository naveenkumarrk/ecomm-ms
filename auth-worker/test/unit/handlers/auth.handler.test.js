/**
 * Unit tests for auth.handler.js
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { handleSignup, handleLogin, handleAdminSignup } from '../../../src/handlers/auth.handler.js';
import * as authService from '../../../src/services/auth.service.js';
import sinon from 'sinon';

describe('auth.handler', () => {
	let env, request;

	beforeEach(() => {
		env = {
			DB: {
				prepare: sinon.stub().returns({
					bind: sinon.stub().returnsThis(),
					first: sinon.stub(),
					run: sinon.stub(),
				}),
			},
			JWT_SECRET: btoa('test-secret'),
			ACCESS_TOKEN_TTL: 3600,
		};

		request = {
			headers: {
				get: sinon.stub(),
			},
			json: sinon.stub(),
		};
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('handleSignup', () => {
		it('should create a new user successfully', async () => {
			request.json.resolves({
				email: 'test@example.com',
				password: 'password123',
				name: 'Test User',
			});

			const createUserStub = sinon.stub(authService, 'createUser').resolves({
				userId: 'user123',
				email: 'test@example.com',
				role: 'user',
			});

			const response = await handleSignup(request, env);
			const data = await response.json();

			expect(response.status).to.equal(201);
			expect(data).to.have.property('userId', 'user123');
			expect(createUserStub).to.have.been.calledOnce;
		});

		it('should return 400 for validation errors', async () => {
			request.json.resolves({
				email: 'invalid-email',
				password: 'short',
			});

			const response = await handleSignup(request, env);
			const data = await response.json();

			expect(response.status).to.equal(400);
			expect(data).to.have.property('error', 'validation_error');
		});

		it('should return 409 for existing email', async () => {
			request.json.resolves({
				email: 'existing@example.com',
				password: 'password123',
				name: 'Test User',
			});

			const createUserStub = sinon.stub(authService, 'createUser').rejects(new Error('email_exists'));

			const response = await handleSignup(request, env);
			const data = await response.json();

			expect(response.status).to.equal(409);
			expect(data).to.have.property('error', 'email_exists');
		});
	});

	describe('handleLogin', () => {
		it('should login user successfully', async () => {
			request.json.resolves({
				email: 'test@example.com',
				password: 'password123',
			});

			const loginUserStub = sinon.stub(authService, 'loginUser').resolves({
				accessToken: 'token123',
				expiresIn: 3600,
			});

			const response = await handleLogin(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.have.property('accessToken', 'token123');
			expect(loginUserStub).to.have.been.calledOnce;
		});

		it('should return 401 for invalid credentials', async () => {
			request.json.resolves({
				email: 'test@example.com',
				password: 'wrongpassword',
			});

			const loginUserStub = sinon.stub(authService, 'loginUser').rejects(new Error('invalid_credentials'));

			const response = await handleLogin(request, env);
			const data = await response.json();

			expect(response.status).to.equal(401);
			expect(data).to.have.property('error', 'invalid_credentials');
		});
	});

	describe('handleAdminSignup', () => {
		it('should create admin user with valid secret', async () => {
			request.json.resolves({
				email: 'admin@example.com',
				password: 'password123',
				name: 'Admin User',
			});

			request.headers.get.withArgs('x-admin-secret').returns('adminsecret');

			const createUserStub = sinon.stub(authService, 'createUser').resolves({
				userId: 'admin123',
				email: 'admin@example.com',
				role: 'admin',
			});

			const response = await handleAdminSignup(request, env);
			const data = await response.json();

			expect(response.status).to.equal(201);
			expect(data).to.have.property('role', 'admin');
		});

		it('should return 401 for invalid admin secret', async () => {
			request.json.resolves({
				email: 'admin@example.com',
				password: 'password123',
				name: 'Admin User',
			});

			request.headers.get.withArgs('x-admin-secret').returns('wrong-secret');

			const response = await handleAdminSignup(request, env);
			const data = await response.json();

			expect(response.status).to.equal(401);
			expect(data).to.have.property('error', 'unauthorized');
		});
	});
});
