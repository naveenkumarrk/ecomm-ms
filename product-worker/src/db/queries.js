/**
 * Database query functions with OpenTelemetry instrumentation
 */
import { instrumentDbQuery } from '../helpers/tracing.js';

export async function getProducts(env, limit, offset) {
	const query = 'SELECT * FROM products LIMIT ? OFFSET ?';
	return await instrumentDbQuery('db.query.getProducts', query, async () => {
		return await env.DB.prepare(query).bind(limit, offset).all();
	});
}

export async function getProductById(env, productId) {
	const query = 'SELECT * FROM products WHERE product_id = ?';
	return await instrumentDbQuery('db.query.getProductById', query, async () => {
		return await env.DB.prepare(query).bind(productId).first();
	});
}

export async function createProduct(env, productData) {
	const { productId, sku, title, description, category, images, metadata, now } = productData;
	const query = `INSERT INTO products (product_id, sku, title, description, category, images, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

	return await instrumentDbQuery('db.query.createProduct', query, async () => {
		return await env.DB.prepare(query)
			.bind(
				productId,
				sku || null,
				title,
				description || null,
				category || null,
				JSON.stringify(images),
				JSON.stringify(metadata || {}),
				now,
				now,
			)
			.run();
	});
}

export async function updateProduct(env, productId, updates, values) {
	const query = `UPDATE products SET ${updates.join(', ')} WHERE product_id = ?`;
	return await instrumentDbQuery('db.query.updateProduct', query, async () => {
		return await env.DB.prepare(query)
			.bind(...values)
			.run();
	});
}
