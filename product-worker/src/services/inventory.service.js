/**
 * Inventory service integration
 */
import { callInternal } from '../helpers/hmac.js';

export async function getProductStock(env, productId) {
	if (!env.INVENTORY_SERVICE_URL || !env.INTERNAL_SECRET) {
		return { stock: 0, reserved: 0 };
	}

	try {
		const inv = await callInternal(env.INVENTORY_SERVICE_URL, '/inventory/product-stock', 'POST', { productId }, env.INTERNAL_SECRET);
		if (inv.ok && inv.body) {
			return {
				stock: inv.body.stock ?? 0,
				reserved: inv.body.reserved ?? 0,
			};
		}
	} catch (e) {
		console.error('Error fetching stock:', e);
	}

	return { stock: 0, reserved: 0 };
}
