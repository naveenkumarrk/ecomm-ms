/**
 * Unit tests for auth.handler.js
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { handleSignup, handleLogin, handleAdminSignup } from '../../../src/handlers/auth.handler.js';
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
			ADMIN_SECRET: 'adminsecret',
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

			// Mock DB operations
			env.DB.prepare = sinon.stub().callsFake((query) => {
				const stmt = {
					bind: sinon.stub().returnsThis(),
					first: sinon.stub(),
					run: sinon.stub().resolves({ success: true }),
				};

				if (query.includes('SELECT 1 FROM users WHERE email')) {
					// CHECK_EXISTS
					stmt.first.resolves(null);
				} else if (query.includes('INSERT INTO users')) {
					// CREATE
					stmt.run.resolves({ success: true });
				}

				return stmt;
			});

			const response = await handleSignup(request, env);
			const data = await response.json();

			expect(response.status).to.equal(201);
			expect(data).to.have.property('userId');
			expect(data).to.have.property('email', 'test@example.com');
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

		it('should handle internal errors', async () => {
			request.json.resolves({
				email: 'test@example.com',
				password: 'password123',
				name: 'Test User',
			});

			env.DB.prepare = sinon.stub().callsFake((query) => {
				const stmt = {
					bind: sinon.stub().returnsThis(),
					first: sinon.stub(),
					run: sinon.stub(),
				};

				if (query.includes('SELECT 1 FROM users WHERE email')) {
					stmt.first.resolves(null);
				} else if (query.includes('INSERT INTO users')) {
					stmt.run.rejects(new Error('Database error'));
				}

				return stmt;
			});

			const response = await handleSignup(request, env);
			const data = await response.json();

			expect(response.status).to.equal(500);
			expect(data).to.have.property('error', 'internal_error');
		});

		it('should handle invalid JSON', async () => {
			request.json.rejects(new Error('Invalid JSON'));

			const response = await handleSignup(request, env);
			const data = await response.json();

			expect(response.status).to.equal(400);
			expect(data).to.have.property('error', 'invalid_json');
		});

		it('should return 409 for existing email', async () => {
			request.json.resolves({
				email: 'existing@example.com',
				password: 'password123',
				name: 'Test User',
			});

			// Mock DB - user already exists
			env.DB.prepare = sinon.stub().callsFake((query) => {
				const stmt = {
					bind: sinon.stub().returnsThis(),
					first: sinon.stub(),
					run: sinon.stub(),
				};

				if (query.includes('SELECT 1 FROM users WHERE email')) {
					// CHECK_EXISTS - user exists
					stmt.first.resolves({ 1: 1 });
				}

				return stmt;
			});

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

			// Mock user data with hashed password
			// We need to create a real password hash for verification
			const { hashPassword } = await import('../../../src/helpers/password.js');
			const hashedPassword = await hashPassword('password123');

			const userData = {
				userId: 'user123',
				email: 'test@example.com',
				role: 'user',
				data: JSON.stringify({
					auth: { passwordHash: hashedPassword },
				}),
			};

			// Mock DB operations
			env.DB.prepare = sinon.stub().callsFake((query) => {
				const stmt = {
					bind: sinon.stub().returnsThis(),
					first: sinon.stub(),
					run: sinon.stub().resolves({ success: true }),
				};

				if (query.includes('SELECT * FROM users WHERE email')) {
					// FIND_BY_EMAIL
					stmt.first.resolves(userData);
				} else if (query.includes('INSERT INTO sessions')) {
					// CREATE session
					stmt.run.resolves({ success: true });
				}

				return stmt;
			});

			const response = await handleLogin(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.have.property('accessToken');
			expect(data).to.have.property('expiresIn', 3600);
		});

		it('should return 401 for invalid credentials', async () => {
			request.json.resolves({
				email: 'test@example.com',
				password: 'wrongpassword',
			});

			// Mock user data with correct password hash
			const { hashPassword } = await import('../../../src/helpers/password.js');
			const hashedPassword = await hashPassword('correctpassword');

			const userData = {
				userId: 'user123',
				email: 'test@example.com',
				role: 'user',
				data: JSON.stringify({
					auth: { passwordHash: hashedPassword },
				}),
			};

			// Mock DB - user exists but password is wrong
			env.DB.prepare = sinon.stub().callsFake((query) => {
				const stmt = {
					bind: sinon.stub().returnsThis(),
					first: sinon.stub(),
					run: sinon.stub(),
				};

				if (query.includes('SELECT * FROM users WHERE email')) {
					// FIND_BY_EMAIL
					stmt.first.resolves(userData);
				}

				return stmt;
			});

			const response = await handleLogin(request, env);
			const data = await response.json();

			expect(response.status).to.equal(401);
			expect(data).to.have.property('error', 'invalid_credentials');
		});

		it('should return 401 when user not found', async () => {
			request.json.resolves({
				email: 'notfound@example.com',
				password: 'password123',
			});

			// Mock DB - user not found
			env.DB.prepare = sinon.stub().callsFake((query) => {
				const stmt = {
					bind: sinon.stub().returnsThis(),
					first: sinon.stub(),
				};

				if (query.includes('SELECT * FROM users WHERE email')) {
					stmt.first.resolves(null);
				}

				return stmt;
			});

			const response = await handleLogin(request, env);
			const data = await response.json();

			expect(response.status).to.equal(401);
			expect(data).to.have.property('error', 'invalid_credentials');
		});

		it('should handle internal errors during login', async () => {
			request.json.resolves({
				email: 'test@example.com',
				password: 'password123',
			});

			env.DB.prepare = sinon.stub().callsFake((query) => {
				const stmt = {
					bind: sinon.stub().returnsThis(),
					first: sinon.stub(),
				};

				if (query.includes('SELECT * FROM users WHERE email')) {
					stmt.first.rejects(new Error('Database error'));
				}

				return stmt;
			});

			const response = await handleLogin(request, env);
			const data = await response.json();

			expect(response.status).to.equal(500);
			expect(data).to.have.property('error', 'internal_error');
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

			// Mock DB operations
			env.DB.prepare = sinon.stub().callsFake((query) => {
				const stmt = {
					bind: sinon.stub().returnsThis(),
					first: sinon.stub(),
					run: sinon.stub().resolves({ success: true }),
				};

				if (query.includes('SELECT 1 FROM users WHERE email')) {
					// CHECK_EXISTS - user doesn't exist
					stmt.first.resolves(null);
				} else if (query.includes('INSERT INTO users')) {
					// CREATE admin user
					stmt.run.resolves({ success: true });
				}

				return stmt;
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

		it('should use adminSecret from body if not in headers', async () => {
			request.json.resolves({
				email: 'admin@example.com',
				password: 'password123',
				name: 'Admin User',
				adminSecret: 'adminsecret',
			});

			request.headers.get.withArgs('x-admin-secret').returns(null);

			env.DB.prepare = sinon.stub().callsFake((query) => {
				const stmt = {
					bind: sinon.stub().returnsThis(),
					first: sinon.stub(),
					run: sinon.stub().resolves({ success: true }),
				};

				if (query.includes('SELECT 1 FROM users WHERE email')) {
					stmt.first.resolves(null);
				} else if (query.includes('INSERT INTO users')) {
					stmt.run.resolves({ success: true });
				}

				return stmt;
			});

			const response = await handleAdminSignup(request, env);
			const data = await response.json();

			expect(response.status).to.equal(201);
			expect(data).to.have.property('role', 'admin');
		});
	});

	describe('handleLogout', () => {
		it('should logout user successfully', async () => {
			const user = {
				sub: 'user123',
				sid: 'sess_123',
			};

			env.DB.prepare = sinon.stub().callsFake((query) => {
				const stmt = {
					bind: sinon.stub().returnsThis(),
					run: sinon.stub().resolves({ success: true }),
				};

				if (query.includes('UPDATE sessions SET revoked')) {
					stmt.run.resolves({ success: true });
				}

				return stmt;
			});

			const { handleLogout } = await import('../../../src/handlers/auth.handler.js');
			const response = await handleLogout(request, env, user);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.have.property('ok', true);
		});

		it('should handle logout without session ID', async () => {
			const user = { sub: 'user123' };

			const { handleLogout } = await import('../../../src/handlers/auth.handler.js');
			const response = await handleLogout(request, env, user);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.have.property('ok', true);
		});
	});
});
