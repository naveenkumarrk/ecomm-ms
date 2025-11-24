/**
 * Order routes
 */
import { Router } from 'itty-router';
import { jsonResponse, corsHeaders } from '../helpers/response.js';
import {
	createOrderHandler,
	getOrderByIdHandler,
	getUserOrdersHandler,
	listAllOrdersHandler,
	updateOrderStatusHandler,
} from '../handlers/order.handler.js';

export function setupOrderRoutes(router) {
	// CORS
	router.options('*', () => new Response('OK', { headers: corsHeaders() }));

	// Health check
	router.get('/health', () => jsonResponse({ status: 'ok', service: 'order-service' }));

	// Main order endpoints
	router.post('/orders/create', createOrderHandler);
	router.get('/orders/:orderId', getOrderByIdHandler);
	router.get('/orders/user/:userId', getUserOrdersHandler);

	// Admin endpoints
	router.get('/debug/list-orders', listAllOrdersHandler);
	router.put('/orders/:orderId/status', updateOrderStatusHandler);

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
