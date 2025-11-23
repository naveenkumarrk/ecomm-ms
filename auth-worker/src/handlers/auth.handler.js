/**
 * Authentication route handlers
 */
import { json, jsonError } from '../helpers/response.js';
import { createUser, loginUser, logoutUser } from '../services/auth.service.js';
import { signupSchema, loginSchema, adminSignupSchema } from '../validators/auth.validator.js';
import { ROLES } from '../config/constants.js';

/**
 * Validate request body against Joi schema
 */
function validate(schema) {
	return async (req) => {
		try {
			const body = await req.json();
			const { error, value } = schema.validate(body, { abortEarly: false });

			if (error) {
				const errors = error.details.map((d) => d.message).join(', ');
				return jsonError('validation_error', errors, 400);
			}

			// Store validated data in request
			req.validatedBody = value;
			return null;
		} catch (err) {
			return jsonError('invalid_json', 'Invalid JSON in request body', 400);
		}
	};
}

/**
 * Signup handler
 */
export async function handleSignup(req, env) {
	const validation = await validate(signupSchema)(req);
	if (validation) return validation;

	try {
		const result = await createUser(env, req.validatedBody);
		return json(result, 201);
	} catch (error) {
		if (error.message === 'email_exists') {
			return jsonError('email_exists', 'Email already registered', 409);
		}
		console.error('Signup error:', error);
		return jsonError('internal_error', error.message, 500);
	}
}

/**
 * Admin signup handler
 */
export async function handleAdminSignup(req, env) {
	const validation = await validate(adminSignupSchema)(req);
	if (validation) return validation;

	// Check admin secret
	const adminSecret = req.headers.get('x-admin-secret') || req.validatedBody.adminSecret;
	const expectedSecret = env.ADMIN_SECRET || 'adminsecret';

	if (!adminSecret || adminSecret !== expectedSecret) {
		return jsonError('unauthorized', 'Admin creation secret required', 401);
	}

	try {
		const result = await createUser(env, { ...req.validatedBody, role: ROLES.ADMIN });
		return json({ ...result, role: ROLES.ADMIN }, 201);
	} catch (error) {
		if (error.message === 'email_exists') {
			return jsonError('email_exists', 'Email already registered', 409);
		}
		console.error('Admin signup error:', error);
		return jsonError('internal_error', error.message, 500);
	}
}

/**
 * Login handler
 */
export async function handleLogin(req, env) {
	const validation = await validate(loginSchema)(req);
	if (validation) return validation;

	try {
		const result = await loginUser(env, req.validatedBody);
		return json(result);
	} catch (error) {
		if (error.message === 'invalid_credentials') {
			return jsonError('invalid_credentials', 'Invalid email or password', 401);
		}
		console.error('Login error:', error);
		return jsonError('internal_error', error.message, 500);
	}
}

/**
 * Logout handler
 */
export async function handleLogout(req, env, user) {
	try {
		const result = await logoutUser(env, user?.sid);
		return json(result);
	} catch (error) {
		console.error('Logout error:', error);
		return jsonError('internal_error', error.message, 500);
	}
}
