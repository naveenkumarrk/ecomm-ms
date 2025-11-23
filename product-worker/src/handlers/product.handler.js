/**
 * Product request handlers
 */
import { jsonResponse } from '../helpers/response.js';
import { nowSec } from '../helpers/utils.js';
import { verifyAdminAuth } from '../middleware/auth.middleware.js';
import { getProducts, getProductById, createProduct, updateProduct } from '../db/queries.js';
import { enrichProductsWithStock, enrichProductWithStock } from '../services/product.service.js';
import { uploadImageToR2, handleImageUpload } from '../services/r2.service.js';
import { createProductSchema, updateProductSchema, getProductsQuerySchema } from '../validators/product.validator.js';
import { DEFAULT_PRODUCT_LIMIT, DEFAULT_PRODUCT_OFFSET } from '../config/constants.js';

/**
 * Validate request body against Joi schema
 */
function validateBody(schema) {
	return async (req, env) => {
		try {
			const body = await req.json().catch(() => ({}));
			const { error, value } = schema.validate(body, { abortEarly: false });
			if (error) {
				const errors = error.details.map((d) => d.message).join(', ');
				return jsonResponse({ error: 'validation_error', details: errors }, 400);
			}
			req.validatedBody = value;
			return null;
		} catch (err) {
			return jsonResponse({ error: 'invalid_json' }, 400);
		}
	};
}

/**
 * GET /products - Get all products
 */
export async function getProductsHandler(req, env) {
	try {
		if (!env.DB) {
			console.error('DB binding not available');
			return jsonResponse({ error: 'Database not available' }, 500);
		}

		const url = new URL(req.url);
		const limit = Number(url.searchParams.get('limit') || DEFAULT_PRODUCT_LIMIT);
		const offset = Number(url.searchParams.get('offset') || DEFAULT_PRODUCT_OFFSET);

		// Validate query parameters
		const { error: queryError } = getProductsQuerySchema.validate({ limit, offset });
		if (queryError) {
			return jsonResponse({ error: 'validation_error', details: queryError.details[0].message }, 400);
		}

		let rows;
		try {
			rows = await getProducts(env, limit, offset);
			console.log('Query successful, rows:', rows?.results?.length || 0);
		} catch (dbError) {
			console.error('Database query error:', dbError);
			return jsonResponse({ error: 'Database query failed', details: dbError.message }, 500);
		}

		if (!rows || !rows.results) {
			console.log('No results from database');
			return jsonResponse([]);
		}

		const productsWithVariants = await enrichProductsWithStock(env, rows.results);
		return jsonResponse(productsWithVariants);
	} catch (error) {
		console.error('Products endpoint error:', error);
		return jsonResponse({ error: 'Internal server error', details: error.message }, 500);
	}
}

/**
 * GET /products/:id - Get product by ID
 */
export async function getProductByIdHandler(req, env) {
	try {
		const { id } = req.params;
		const row = await getProductById(env, id);

		if (!row) {
			return jsonResponse({ error: 'Product not found' }, 404);
		}

		const product = await enrichProductWithStock(env, row);
		return jsonResponse(product);
	} catch (error) {
		console.error('Get product by ID error:', error);
		return jsonResponse({ error: 'Internal server error', details: error.message }, 500);
	}
}

/**
 * POST /products/images/upload - Upload image to R2
 */
export async function uploadImageHandler(req, env) {
	const authError = await verifyAdminAuth(req, env);
	if (authError) return authError;

	if (!env.PRODUCT_IMAGES) {
		return jsonResponse({ error: 'R2 bucket not configured' }, 500);
	}

	if (!env.R2_PUBLIC_URL) {
		return jsonResponse({ error: 'R2 public URL not configured' }, 500);
	}

	try {
		const result = await handleImageUpload(req, env);
		return jsonResponse(result, 201);
	} catch (error) {
		console.error('Image upload error:', error);
		return jsonResponse({ error: 'Upload failed', details: error.message }, 500);
	}
}

/**
 * POST /products - Create product
 */
export async function createProductHandler(req, env) {
	const authError = await verifyAdminAuth(req, env);
	if (authError) return authError;

	try {
		const contentType = req.headers.get('content-type') || '';
		const isMultipart = contentType.includes('multipart/form-data');

		let productData;
		let imageFiles = [];
		let imageUrls = [];

		if (isMultipart) {
			const formData = await req.formData();

			// Extract product data from form fields
			const productJson = formData.get('product') || formData.get('data');
			if (productJson) {
				productData = typeof productJson === 'string' ? JSON.parse(productJson) : {};
			} else {
				productData = {
					productId: formData.get('productId') || undefined,
					sku: formData.get('sku') || undefined,
					title: formData.get('title') || undefined,
					description: formData.get('description') || undefined,
					category: formData.get('category') || undefined,
					metadata: formData.get('metadata') ? JSON.parse(formData.get('metadata')) : undefined,
				};
			}

			// Extract image files
			const files = formData.getAll('images') || formData.getAll('files') || formData.getAll('image');
			imageFiles = files.filter((f) => f instanceof File);

			// Extract existing image URLs if provided
			const urlsField = formData.get('imageUrls');
			if (urlsField) {
				imageUrls = typeof urlsField === 'string' ? JSON.parse(urlsField) : [];
			}
		} else {
			productData = await req.json();
			if (productData.images) {
				imageUrls = Array.isArray(productData.images) ? productData.images : [productData.images];
			}
		}

		// Validate product data (skip validation for multipart as it's complex)
		if (!isMultipart) {
			const { error, value } = createProductSchema.validate(productData, { abortEarly: false });
			if (error) {
				const errors = error.details.map((d) => d.message).join(', ');
				return jsonResponse({ error: 'validation_error', details: errors }, 400);
			}
			productData = value;
		}

		const productId = productData.productId || `pro_${crypto.randomUUID()}`;
		const now = nowSec();

		// Upload image files to R2 if any
		if (imageFiles.length > 0) {
			const uploadedUrls = await Promise.all(imageFiles.map((file) => uploadImageToR2(file, env)));
			imageUrls = [...imageUrls, ...uploadedUrls];
		}

		// Ensure images is an array
		const images = Array.isArray(imageUrls) ? imageUrls : imageUrls.length > 0 ? imageUrls : [];

		await createProduct(env, {
			productId,
			sku: productData.sku,
			title: productData.title,
			description: productData.description,
			category: productData.category,
			images,
			metadata: productData.metadata,
			now,
		});

		return jsonResponse({ productId, images }, 201);
	} catch (error) {
		console.error('Product creation error:', error);
		return jsonResponse({ error: 'Creation failed', details: error.message }, 500);
	}
}

/**
 * PUT /products/:id - Update product
 */
export async function updateProductHandler(req, env) {
	const authError = await verifyAdminAuth(req, env);
	if (authError) return authError;

	const { id } = req.params;
	const now = nowSec();

	// Check if product exists
	const existing = await getProductById(env, id);
	if (!existing) {
		return jsonResponse({ error: 'Product not found' }, 404);
	}

	try {
		const contentType = req.headers.get('content-type') || '';
		const isMultipart = contentType.includes('multipart/form-data');

		let updateData;
		let imageFiles = [];
		let imageUrls = [];

		if (isMultipart) {
			const formData = await req.formData();

			const dataJson = formData.get('product') || formData.get('data');
			if (dataJson) {
				updateData = typeof dataJson === 'string' ? JSON.parse(dataJson) : {};
			} else {
				updateData = {};
				if (formData.has('sku')) updateData.sku = formData.get('sku');
				if (formData.has('title')) updateData.title = formData.get('title');
				if (formData.has('description')) updateData.description = formData.get('description');
				if (formData.has('category')) updateData.category = formData.get('category');
				if (formData.has('metadata')) updateData.metadata = JSON.parse(formData.get('metadata'));
			}

			const files = formData.getAll('images') || formData.getAll('files') || formData.getAll('image');
			imageFiles = files.filter((f) => f instanceof File);

			const urlsField = formData.get('imageUrls');
			if (urlsField) {
				imageUrls = typeof urlsField === 'string' ? JSON.parse(urlsField) : [];
			}
		} else {
			updateData = await req.json();
			if (updateData.images !== undefined) {
				imageUrls = Array.isArray(updateData.images) ? updateData.images : [updateData.images];
			}

			// Validate update data
			const { error, value } = updateProductSchema.validate(updateData, { abortEarly: false });
			if (error) {
				const errors = error.details.map((d) => d.message).join(', ');
				return jsonResponse({ error: 'validation_error', details: errors }, 400);
			}
			updateData = value;
		}

		// Upload image files to R2 if any
		if (imageFiles.length > 0) {
			const uploadedUrls = await Promise.all(imageFiles.map((file) => uploadImageToR2(file, env)));
			imageUrls = [...imageUrls, ...uploadedUrls];
		}

		// Build update query dynamically
		const updates = [];
		const values = [];

		if (updateData.sku !== undefined) {
			updates.push('sku = ?');
			values.push(updateData.sku);
		}
		if (updateData.title !== undefined) {
			updates.push('title = ?');
			values.push(updateData.title);
		}
		if (updateData.description !== undefined) {
			updates.push('description = ?');
			values.push(updateData.description);
		}
		if (updateData.category !== undefined) {
			updates.push('category = ?');
			values.push(updateData.category);
		}
		if (imageUrls.length > 0 || updateData.images !== undefined) {
			const images = Array.isArray(imageUrls) ? imageUrls : imageUrls.length > 0 ? imageUrls : [];
			updates.push('images = ?');
			values.push(JSON.stringify(images));
		}
		if (updateData.metadata !== undefined) {
			updates.push('metadata = ?');
			values.push(JSON.stringify(updateData.metadata));
		}

		if (updates.length === 0) {
			return jsonResponse({ error: 'No fields to update' }, 400);
		}

		updates.push('updated_at = ?');
		values.push(now);
		values.push(id);

		await updateProduct(env, id, updates, values);

		return jsonResponse({ productId: id, updated: true });
	} catch (error) {
		console.error('Product update error:', error);
		return jsonResponse({ error: 'Update failed', details: error.message }, 500);
	}
}
