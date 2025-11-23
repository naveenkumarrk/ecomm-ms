/**
 * Gateway Worker - Main entry point
 */
import { Router } from 'itty-router';
import { setupRoutes } from './routes/index.js';
import { jsonRes } from './helpers/response.js';
import { GATEWAY_TIMEOUT } from './config/constants.js';

const router = Router();

// Setup all routes
setupRoutes(router);

// Export with timeout protection
export default {
	async fetch(req, env) {
		console.log('[GATEWAY] Request:', req.method, new URL(req.url).pathname);

		try {
			const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Gateway timeout')), GATEWAY_TIMEOUT));

			const responsePromise = router.fetch(req, env);
			const response = await Promise.race([responsePromise, timeoutPromise]);

			return response;
		} catch (error) {
			console.error('[GATEWAY] Fatal error:', error);
			return jsonRes(
				{
					error: 'gateway_timeout',
					message: error.message,
				},
				504,
			);
		}
	},
};
