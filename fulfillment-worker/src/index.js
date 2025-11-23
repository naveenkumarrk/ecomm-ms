/**
 * Fulfillment Worker - Main entry point
 */
import { Router } from 'itty-router';
import { setupFulfillmentRoutes } from './routes/fulfillment.routes.js';

const router = Router();

// Setup all routes
setupFulfillmentRoutes(router);

export default {
	fetch: (req, env) => router.fetch(req, env),
};
