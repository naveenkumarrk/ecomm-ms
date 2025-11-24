/**
 * Authentication service - business logic for auth operations
 */
import { hashPassword, verifyPassword } from '../helpers/password.js';
import { signJWT } from '../helpers/jwt.js';
import { dbGet, dbRun } from '../db/helpers.js';
import { USER_QUERIES, SESSION_QUERIES } from '../db/queries.js';
import { parseJSON } from '../helpers/utils.js';
import { normalizeEmail, generateUserId, generateSessionId, epoch } from '../helpers/utils.js';
import { DEFAULT_TOKEN_TTL, ROLES } from '../config/constants.js';

/**
 * Create a new user account
 */
export async function createUser(env, { email, password, name, role = ROLES.USER }) {
	const normalizedEmail = normalizeEmail(email);

	// Check if user exists
	const exists = await dbGet(env, USER_QUERIES.CHECK_EXISTS, [normalizedEmail]);
	if (exists) {
		throw new Error('email_exists');
	}

	const hashed = await hashPassword(password);
	const userId = generateUserId();
	const now = epoch();

	const data = {
		profile: { name },
		addresses: [],
		auth: { passwordHash: hashed },
	};

	await dbRun(env, USER_QUERIES.CREATE, [userId, normalizedEmail, role, JSON.stringify(data), now, now]);

	return { userId, email: normalizedEmail, role };
}

/**
 * Authenticate user and create session
 */
export async function loginUser(env, { email, password }) {
	const normalizedEmail = normalizeEmail(email);
	const user = await dbGet(env, USER_QUERIES.FIND_BY_EMAIL, [normalizedEmail]);

	if (!user) {
		throw new Error('invalid_credentials');
	}

	const data = parseJSON(user);
	const ok = await verifyPassword(data.auth.passwordHash, password);

	if (!ok) {
		throw new Error('invalid_credentials');
	}

	// Create session
	const sid = generateSessionId();
	const now = epoch();
	const ttl = Number(env.ACCESS_TOKEN_TTL || DEFAULT_TOKEN_TTL);
	const exp = now + ttl;

	await dbRun(env, SESSION_QUERIES.CREATE, [sid, user.userId, now, exp]);

	// Generate token
	const token = await signJWT({ sub: user.userId, sid, role: user.role }, env.JWT_SECRET, ttl);

	return { accessToken: token, expiresIn: ttl };
}

/**
 * Revoke user session
 */
export async function logoutUser(env, sessionId) {
	if (sessionId) {
		await dbRun(env, SESSION_QUERIES.REVOKE, [sessionId]);
	}
	return { ok: true };
}
