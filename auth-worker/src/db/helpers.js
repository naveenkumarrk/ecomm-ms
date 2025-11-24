/**
 * Database helper functions
 */

/**
 * Execute a SELECT query and return first result
 */
export async function dbGet(env, sql, params = []) {
	return (
		(await env.DB.prepare(sql)
			.bind(...params)
			.first()) || null
	);
}

/**
 * Execute a query (INSERT, UPDATE, DELETE)
 */
export async function dbRun(env, sql, params = []) {
	return await env.DB.prepare(sql)
		.bind(...params)
		.run();
}

/**
 * Execute a SELECT query and return all results
 */
export async function dbAll(env, sql, params = []) {
	const result = await env.DB.prepare(sql)
		.bind(...params)
		.all();
	return result?.results || [];
}
