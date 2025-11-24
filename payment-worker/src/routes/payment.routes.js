/**
 * Payment routes
 */
import { Router } from 'itty-router';
import { jsonResponse, corsHeaders } from '../helpers/response.js';
import { createPaymentHandler, capturePaymentHandler, verifyPaymentHandler } from '../handlers/payment.handler.js';

export function setupPaymentRoutes(router) {
	// CORS
	router.options('*', () => new Response('OK', { headers: corsHeaders() }));

	// Health check
	router.get('/health', () => jsonResponse({ status: 'ok', service: 'payment-worker' }));

	// Main payment endpoints
	router.post('/payment/paypal/create', createPaymentHandler);
	router.post('/payment/paypal/capture', capturePaymentHandler);
	router.get('/payment/paypal/verify/:orderId', verifyPaymentHandler);

	// 404
	router.all('*', () => new Response('Not Found', { status: 404, headers: corsHeaders() }));

	return router;
}
