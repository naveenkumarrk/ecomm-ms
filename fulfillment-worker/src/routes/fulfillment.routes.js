/**
 * Fulfillment routes
 */
import { Router } from 'itty-router';
import { jsonResponse, corsHeaders } from '../helpers/response.js';
import { getShippingOptionsHandler, allocateHandler, shipHandler } from '../handlers/fulfillment.handler.js';

export function setupFulfillmentRoutes(router) {
	// CORS
	router.options('*', () => new Response('OK', { headers: corsHeaders() }));

	// Health check
	router.get('/health', () => jsonResponse({ status: 'ok', service: 'fulfillment-worker' }));

	// Main fulfillment endpoints
	router.post('/fulfillment/get-options', getShippingOptionsHandler);
	router.post('/fulfillment/allocate', allocateHandler);
	router.post('/fulfillment/ship', shipHandler);

	// 404
	router.all('*', () => new Response('Not Found', { status: 404, headers: corsHeaders() }));

	return router;
}
