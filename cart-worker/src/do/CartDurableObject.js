/**
 * Cart Durable Object
 */
import { Router } from 'itty-router';
import { setupCartRoutes } from '../routes/cart.routes.js';
import { createEmptyCart } from '../helpers/utils.js';
import { CART_TTL } from '../config/constants.js';
import { corsHeaders } from '../helpers/response.js';

export class CartDurableObject {
	constructor(state, env) {
		this.state = state;
		this.env = env;
		this.router = Router();
		this._loaded = false;
		this.initRouter();
	}

	async loadState() {
		if (this._loaded) return;

		const existing = await this.state.storage.get('cart');

		this.cart = existing || createEmptyCart(`cart_${crypto.randomUUID()}`, null);

		this._loaded = true;
	}

	async persist() {
		this.cart.updatedAt = Math.floor(Date.now() / 1000);
		await this.state.storage.put('cart', this.cart, { expirationTtl: CART_TTL });
	}

	extractUserContext(req) {
		const userId = req.headers.get('x-user-id') || req.headers.get('x-userid') || null;
		const userRole = req.headers.get('x-user-role') || req.headers.get('x-userrole') || null;
		if (!userId) return null;
		return { userId, role: userRole || 'user' };
	}

	initRouter() {
		setupCartRoutes(this.router, this);
	}

	json(body, status = 200) {
		return new Response(JSON.stringify(body), {
			status,
			headers: { 'Content-Type': 'application/json', ...corsHeaders() },
		});
	}

	error(message, details = null, status = 400) {
		return this.json({ error: message, details }, status);
	}

	async fetch(req) {
		await this.loadState();
		return this.router.fetch(req);
	}
}
