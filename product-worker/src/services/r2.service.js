/**
 * R2 storage service for product images
 */
import { MAX_IMAGE_SIZE, CACHE_CONTROL } from '../config/constants.js';

export async function uploadImageToR2(imageFile, env) {
	if (!env.PRODUCT_IMAGES || !env.R2_PUBLIC_URL) {
		throw new Error('R2 not configured');
	}

	const imageData = await imageFile.arrayBuffer();
	if (imageData.byteLength > MAX_IMAGE_SIZE) {
		throw new Error('File too large. Maximum size is 10MB');
	}

	const fileName = imageFile.name || `image_${crypto.randomUUID()}`;
	const filePath = `products/${Date.now()}_${crypto.randomUUID()}_${fileName}`;
	const mimeType = imageFile.type || 'image/jpeg';

	await env.PRODUCT_IMAGES.put(filePath, imageData, {
		httpMetadata: {
			contentType: mimeType,
			cacheControl: CACHE_CONTROL,
		},
	});

	return `${env.R2_PUBLIC_URL}/${filePath}`;
}

export async function handleImageUpload(req, env) {
	const contentType = req.headers.get('content-type') || '';
	let imageData;
	let fileName;
	let mimeType;

	if (contentType.includes('multipart/form-data')) {
		const formData = await req.formData();
		const file = formData.get('file') || formData.get('image');

		if (!file || !(file instanceof File)) {
			throw new Error('No file provided');
		}

		imageData = await file.arrayBuffer();
		fileName = file.name || `image_${crypto.randomUUID()}`;
		mimeType = file.type || 'image/jpeg';
	} else {
		// Direct binary upload
		imageData = await req.arrayBuffer();
		const contentTypeHeader = req.headers.get('content-type');
		mimeType = contentTypeHeader || 'image/jpeg';

		// Generate filename from timestamp
		const ext = mimeType.includes('png') ? 'png' : mimeType.includes('gif') ? 'gif' : 'jpg';
		fileName = `image_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
	}

	if (!imageData || imageData.byteLength === 0) {
		throw new Error('Empty file');
	}

	if (imageData.byteLength > MAX_IMAGE_SIZE) {
		throw new Error('File too large. Maximum size is 10MB');
	}

	const filePath = `products/${Date.now()}_${crypto.randomUUID()}_${fileName}`;

	await env.PRODUCT_IMAGES.put(filePath, imageData, {
		httpMetadata: {
			contentType: mimeType,
			cacheControl: CACHE_CONTROL,
		},
	});

	return {
		url: `${env.R2_PUBLIC_URL}/${filePath}`,
		path: filePath,
		size: imageData.byteLength,
		contentType: mimeType,
	};
}
