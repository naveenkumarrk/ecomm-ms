/**
 * Product Worker - Main entry point
 */
import { Router } from 'itty-router';
import { setupProductRoutes } from './routes/product.routes.js';
import { jsonResponse, corsHeaders } from './helpers/response.js';

const router = Router();

// Setup all routes
setupProductRoutes(router);

// Catch all 404
router.all('*', () => jsonResponse({ error: 'not_found' }, 404));

export default {
	fetch: (req, env) => router.fetch(req, env),
};
