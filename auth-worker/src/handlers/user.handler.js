/**
 * User route handlers
 */
import { json, jsonError } from '../helpers/response.js';
import { getUserProfile, promoteUserToAdmin, isAdmin } from '../services/user.service.js';
import { promoteUserSchema } from '../validators/auth.validator.js';

/**
 * Validate request body
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

			req.validatedBody = value;
			return null;
		} catch (err) {
			return jsonError('invalid_json', 'Invalid JSON in request body', 400);
		}
	};
}

/**
 * Get current user profile
 */
export async function handleGetMe(req, env, user) {
	try {
		const profile = await getUserProfile(env, user.sub);
		return json(profile);
	} catch (error) {
		if (error.message === 'user_not_found') {
			return jsonError('user_not_found', 'User not found', 404);
		}
		console.error('Get me error:', error);
		return jsonError('internal_error', error.message, 500);
	}
}

/**
 * Promote user to admin
 */
export async function handlePromoteUser(req, env, currentUser) {
	// Check if current user is admin
	const isUserAdmin = await isAdmin(env, currentUser.sub);
	if (!isUserAdmin) {
		return jsonError('forbidden', 'Admin access required', 403);
	}

	const validation = await validate(promoteUserSchema)(req);
	if (validation) return validation;

	try {
		const result = await promoteUserToAdmin(env, req.validatedBody);
		return json(result);
	} catch (error) {
		if (error.message === 'user_not_found') {
			return jsonError('user_not_found', 'User not found', 404);
		}
		if (error.message === 'already_admin') {
			return jsonError('already_admin', 'User is already an admin', 400);
		}
		console.error('Promote user error:', error);
		return jsonError('internal_error', error.message, 500);
	}
}
