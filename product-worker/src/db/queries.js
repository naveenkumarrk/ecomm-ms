/**
 * Database query functions
 */

export async function getProducts(env, limit, offset) {
	return await env.DB.prepare('SELECT * FROM products LIMIT ? OFFSET ?').bind(limit, offset).all();
}

export async function getProductById(env, productId) {
	return await env.DB.prepare('SELECT * FROM products WHERE product_id = ?').bind(productId).first();
}

export async function createProduct(env, productData) {
	const { productId, sku, title, description, category, images, metadata, now } = productData;
	return await env.DB.prepare(
		`INSERT INTO products (product_id, sku, title, description, category, images, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	)
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
}

export async function updateProduct(env, productId, updates, values) {
	return await env.DB.prepare(`UPDATE products SET ${updates.join(', ')} WHERE product_id = ?`)
		.bind(...values)
		.run();
}
