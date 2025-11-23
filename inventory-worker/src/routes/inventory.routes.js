/**
 * Inventory routes
 */
import { Router } from 'itty-router';
import { jsonResponse, corsHeaders } from '../helpers/response.js';
import {
	reserveHandler,
	commitHandler,
	releaseHandler,
	getProductStockHandler,
	debugProductHandler,
	debugLockHandler,
} from '../handlers/inventory.handler.js';

export function setupInventoryRoutes(router) {
	// CORS
	router.options('*', () => new Response('OK', { headers: corsHeaders() }));

	// Health check
	router.get('/health', () =>
		jsonResponse({
			status: 'ok',
			service: 'inventory-service',
			ts: Date.now(),
		}),
	);

	// Main inventory endpoints
	router.post('/inventory/reserve', reserveHandler);
	router.post('/inventory/commit', commitHandler);
	router.post('/inventory/release', releaseHandler);
	router.post('/inventory/product-stock', getProductStockHandler);

	// Debug endpoints
	router.get('/debug/product/:productId', debugProductHandler);
	router.get('/debug/locks/:productId', debugLockHandler);

	// 404
	router.all('*', (req) =>
		jsonResponse(
			{
				error: 'not_found',
				path: new URL(req.url).pathname,
				method: req.method,
			},
			404,
		),
	);

	return router;
}
