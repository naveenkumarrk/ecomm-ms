/**
 * User service - business logic for user operations
 */
import { dbGet, dbRun } from '../db/helpers.js';
import { USER_QUERIES } from '../db/queries.js';
import { parseUser, normalizeEmail, epoch } from '../helpers/utils.js';
import { ROLES } from '../config/constants.js';

/**
 * Get user by ID
 */
export async function getUserById(env, userId) {
	const user = await dbGet(env, USER_QUERIES.FIND_BY_ID, [userId]);
	if (!user) {
		throw new Error('user_not_found');
	}
	return user;
}

/**
 * Get user profile data
 */
export async function getUserProfile(env, userId) {
	const user = await getUserById(env, userId);
	const data = parseUser(user);

	return {
		userId: user.userId,
		email: user.email,
		role: user.role,
		profile: data.profile,
		addresses: data.addresses,
	};
}

/**
 * Promote user to admin
 */
export async function promoteUserToAdmin(env, { email, userId }) {
	const identifier = userId || normalizeEmail(email);
	const user = await dbGet(env, userId ? USER_QUERIES.FIND_BY_ID : USER_QUERIES.FIND_BY_EMAIL, [identifier]);

	if (!user) {
		throw new Error('user_not_found');
	}

	if (user.role === ROLES.ADMIN) {
		throw new Error('already_admin');
	}

	await dbRun(env, USER_QUERIES.UPDATE_ROLE, [ROLES.ADMIN, epoch(), user.userId]);

	return { userId: user.userId, email: user.email, role: ROLES.ADMIN };
}

/**
 * Check if user is admin
 */
export async function isAdmin(env, userId) {
	const user = await dbGet(env, USER_QUERIES.GET_ROLE, [userId]);
	return user && user.role === ROLES.ADMIN;
}
