/**
 * Product service integration
 */

export async function fetchProduct(productId, productsServiceUrl) {
	try {
		const pRes = await fetch(`${productsServiceUrl.replace(/\/$/, '')}/products/${productId}`);
		if (!pRes.ok) {
			console.warn('product lookup returned non-ok', pRes.status);
			return null;
		}
		return await pRes.json();
	} catch (e) {
		console.warn('product lookup failed', e);
		return null;
	}
}

export function getProductVariant(prod, variantId) {
	if (!prod || !prod.variants) return null;
	return prod.variants.find((v) => v.variantId === variantId) || prod.variants[0] || null;
}

export function getProductPrice(prod, variant) {
	if (variant) return Number(variant.price ?? 0);
	return Number(prod.metadata?.price ?? 0);
}
