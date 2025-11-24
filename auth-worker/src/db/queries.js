/**
 * Database queries
 */

export const USER_QUERIES = {
	FIND_BY_EMAIL: 'SELECT * FROM users WHERE email=?',
	FIND_BY_ID: 'SELECT * FROM users WHERE userId=?',
	CHECK_EXISTS: 'SELECT 1 FROM users WHERE email=?',
	GET_ROLE: 'SELECT role FROM users WHERE userId=?',
	CREATE: `INSERT INTO users (userId,email,role,data,created_at,updated_at) VALUES (?,?,?,?,?,?)`,
	UPDATE_DATA: 'UPDATE users SET data=?, updated_at=? WHERE userId=?',
	UPDATE_ROLE: 'UPDATE users SET role=?, updated_at=? WHERE userId=?',
};

export const SESSION_QUERIES = {
	CREATE: 'INSERT INTO sessions (id,userId,created_at,expires_at,revoked) VALUES (?,?,?,?,0)',
	FIND_BY_ID: 'SELECT * FROM sessions WHERE id=? AND revoked=0',
	REVOKE: 'UPDATE sessions SET revoked=1 WHERE id=?',
};
