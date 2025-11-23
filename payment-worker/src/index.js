/**
 * Payment Worker - Main entry point
 */
import { Router } from 'itty-router';
import { setupPaymentRoutes } from './routes/payment.routes.js';

const router = Router();

// Setup all routes
setupPaymentRoutes(router);

export default {
	fetch: (req, env) => router.fetch(req, env),
};
