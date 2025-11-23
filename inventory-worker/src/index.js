/**
 * Inventory Worker - Main entry point
 */
import { Router } from 'itty-router';
import { setupInventoryRoutes } from './routes/inventory.routes.js';

const router = Router();

// Setup all routes
setupInventoryRoutes(router);

export default {
	fetch: (req, env) => router.fetch(req, env),
};
