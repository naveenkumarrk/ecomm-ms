/**
 * Order Worker - Main entry point
 */
import { Router } from 'itty-router';
import { setupOrderRoutes } from './routes/order.routes.js';

const router = Router();

// Setup all routes
setupOrderRoutes(router);

export default {
	fetch: (req, env) => router.fetch(req, env),
};
