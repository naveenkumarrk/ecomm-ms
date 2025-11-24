/**
 * Unit tests for auth.validator.js
 */
import { describe, it } from 'mocha';
import { signupSchema, loginSchema, adminSignupSchema, promoteUserSchema } from '../../../src/validators/auth.validator.js';

describe('auth.validator', () => {
	describe('signupSchema', () => {
		it('should validate a valid signup', () => {
			const validSignup = {
				email: 'test@example.com',
				password: 'password123',
				name: 'Test User',
			};

			const { error } = signupSchema.validate(validSignup);
			expect(error).to.be.undefined;
		});

		it('should require email', () => {
			const invalidSignup = {
				password: 'password123',
				name: 'Test User',
			};

			const { error } = signupSchema.validate(invalidSignup);
			expect(error).to.exist;
			expect(error.details[0].path).to.include('email');
		});

		it('should validate email format', () => {
			const invalidSignup = {
				email: 'invalid-email',
				password: 'password123',
				name: 'Test User',
			};

			const { error } = signupSchema.validate(invalidSignup);
			expect(error).to.exist;
			expect(error.details[0].message).to.include('email');
		});

		it('should require password with min 8 characters', () => {
			const invalidSignup = {
				email: 'test@example.com',
				password: 'short',
				name: 'Test User',
			};

			const { error } = signupSchema.validate(invalidSignup);
			expect(error).to.exist;
			expect(error.details[0].message).to.include('at least 8 characters');
		});

		it('should require name with min 2 characters', () => {
			const invalidSignup = {
				email: 'test@example.com',
				password: 'password123',
				name: 'A',
			};

			const { error } = signupSchema.validate(invalidSignup);
			expect(error).to.exist;
			expect(error.details[0].message).to.include('at least 2 characters');
		});

		it('should validate name max length', () => {
			const invalidSignup = {
				email: 'test@example.com',
				password: 'password123',
				name: 'A'.repeat(101),
			};

			const { error } = signupSchema.validate(invalidSignup);
			expect(error).to.exist;
			expect(error.details[0].message).to.include('not exceed 100 characters');
		});
	});

	describe('loginSchema', () => {
		it('should validate a valid login', () => {
			const validLogin = {
				email: 'test@example.com',
				password: 'password123',
			};

			const { error } = loginSchema.validate(validLogin);
			expect(error).to.be.undefined;
		});

		it('should require email', () => {
			const invalidLogin = {
				password: 'password123',
			};

			const { error } = loginSchema.validate(invalidLogin);
			expect(error).to.exist;
			expect(error.details[0].path).to.include('email');
		});

		it('should require password', () => {
			const invalidLogin = {
				email: 'test@example.com',
			};

			const { error } = loginSchema.validate(invalidLogin);
			expect(error).to.exist;
			expect(error.details[0].path).to.include('password');
		});
	});

	describe('adminSignupSchema', () => {
		it('should validate a valid admin signup', () => {
			const validAdminSignup = {
				email: 'admin@example.com',
				password: 'password123',
				name: 'Admin User',
			};

			const { error } = adminSignupSchema.validate(validAdminSignup);
			expect(error).to.be.undefined;
		});

		it('should allow optional adminSecret', () => {
			const validAdminSignup = {
				email: 'admin@example.com',
				password: 'password123',
				name: 'Admin User',
				adminSecret: 'secret',
			};

			const { error } = adminSignupSchema.validate(validAdminSignup);
			expect(error).to.be.undefined;
		});
	});

	describe('promoteUserSchema', () => {
		it('should validate with email', () => {
			const validPromote = {
				email: 'user@example.com',
			};

			const { error } = promoteUserSchema.validate(validPromote);
			expect(error).to.be.undefined;
		});

		it('should validate with userId', () => {
			const validPromote = {
				userId: 'user123',
			};

			const { error } = promoteUserSchema.validate(validPromote);
			expect(error).to.be.undefined;
		});

		it('should require either email or userId', () => {
			const invalidPromote = {};

			const { error } = promoteUserSchema.validate(invalidPromote);
			expect(error).to.exist;
			expect(error.details[0].message).to.include('Either email or userId is required');
		});
	});
});
