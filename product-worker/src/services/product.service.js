/**
 * Product business logic service
 */
import { parseJSONSafe } from '../helpers/utils.js';
import { getProductStock } from './inventory.service.js';

export function transformProductRow(row, stock = 0, reserved = 0) {
	const metadata = parseJSONSafe(row.metadata, {});
	const price = metadata.price || 0;
	const variantId = `var_${row.product_id}`;

	return {
		productId: row.product_id,
		sku: row.sku,
		title: row.title,
		description: row.description,
		category: row.category,
		images: parseJSONSafe(row.images, []),
		metadata: metadata,
		stock: stock,
		reserved: reserved,
		variants: [
			{
				variantId,
				code: row.sku || variantId,
				price: price,
				stock: stock,
				attributes: metadata.attributes || {},
			},
		],
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export async function enrichProductWithStock(env, productRow) {
	const stockData = await getProductStock(env, productRow.product_id);
	return transformProductRow(productRow, stockData.stock, stockData.reserved);
}

export async function enrichProductsWithStock(env, productRows) {
	return await Promise.all(productRows.map((row) => enrichProductWithStock(env, row)));
}
