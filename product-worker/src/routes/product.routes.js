/**
 * Product routes
 */
import { Router } from 'itty-router';
import { handleOptions } from '../helpers/response.js';
import {
	getProductsHandler,
	getProductByIdHandler,
	uploadImageHandler,
	createProductHandler,
	updateProductHandler,
} from '../handlers/product.handler.js';

export function setupProductRoutes(router) {
	// Handle OPTIONS requests for CORS
	router.options('*', handleOptions);

	// Public routes
	router.get('/products', getProductsHandler);
	router.get('/products/:id', getProductByIdHandler);

	// Admin routes
	router.post('/products/images/upload', uploadImageHandler);
	router.post('/products', createProductHandler);
	router.put('/products/:id', updateProductHandler);

	return router;
}
