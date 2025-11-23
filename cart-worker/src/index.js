// cart-do.js - Cart Durable Object (Option A: use GATEWAY for auth/address lookups)
import { Router } from "itty-router";

/* ============================================================
   SHARED HELPERS
============================================================ */

async function hmac(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret || ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-timestamp, x-signature, x-cart-id, x-user-id, x-user-role"
  };
}

async function handleOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

async function fetchWithInternalAuth(baseUrl, path, method, body, secret) {
  const url = baseUrl.replace(/\/$/, "") + path;
  const ts = Date.now().toString();
  const bodyText = body ? JSON.stringify(body) : "";
  const msg = `${ts}|${method}|${path}|${bodyText}`;
  const signature = await hmac(secret, msg);

  const headers = {
    "x-timestamp": ts,
    "x-signature": signature,
    "content-type": "application/json"
  };

  const res = await fetch(url, {
    method,
    headers,
    body: bodyText || undefined
  });

  const txt = await res.text();
  try {
    return {
      ok: res.ok,
      status: res.status,
      body: txt ? JSON.parse(txt) : null
    };
  } catch {
    return { ok: res.ok, status: res.status, body: txt };
  }
}

const nowSec = () => Math.floor(Date.now() / 1000);

/* ============================================================
   CART DURABLE OBJECT
============================================================ */
export class CartDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.router = Router();
    this._loaded = false;
    this.initRouter();
  }

  /* --------------------------
     Load & Persist
  --------------------------- */
  async loadState() {
    if (this._loaded) return;

    const existing = await this.state.storage.get("cart");

    this.cart =
      existing || {
        cartId: `cart_${crypto.randomUUID()}`,
        userId: null,
        items: [],
        addressId: null,
        shippingOptions: null,
        shippingMethod: null,
        reservationId: null,
        paymentOrderId: null,
        coupon: null,
        discount: 0,
        discountType: null,
        summary: { subtotal: 0, discount: 0, shipping: 0, total: 0 },
        createdAt: nowSec(),
        updatedAt: nowSec()
      };

    this._loaded = true;
  }

  async persist() {
    this.cart.updatedAt = nowSec();
    await this.state.storage.put("cart", this.cart, { expirationTtl: 86400 }); // 24 hrs TTL
  }

  /* --------------------------
     Summary Computation
  --------------------------- */
  recompute() {
    const subtotal = this.cart.items.reduce(
      (s, i) => s + Number(i.unitPrice || 0) * Number(i.qty || 0),
      0
    );

    let discount = this.cart.discount || 0;
    discount = Math.min(discount, subtotal);

    const shipping = (this.cart.shippingMethod && Number(this.cart.shippingMethod.cost || 0)) || 0;

    this.cart.summary = {
      subtotal,
      discount,
      shipping,
      total: Math.max(0, subtotal - discount + shipping)
    };
  }

  /* --------------------------
     Extract User Context
  --------------------------- */
  extractUserContext(req) {
    const userId = req.headers.get("x-user-id") || req.headers.get("x-userid") || null;
    const userRole = req.headers.get("x-user-role") || req.headers.get("x-userrole") || null;
    if (!userId) return null;
    return { userId, role: userRole || "user" };
  }

  /* ============================================================
     ROUTES
  ============================================================= */
  initRouter() {
    const r = this.router;

    /* INIT */
    r.post("/cart/init", async (req) => {
      await this.loadState();
      const headerId = req.headers.get("x-cart-id");
      if (headerId) this.cart.cartId = headerId;

      // Associate cart with user if logged in (gateway should set x-user-id)
      const userCtx = this.extractUserContext(req);
      if (userCtx) this.cart.userId = userCtx.userId;

      await this.persist();
      return this.json({ cartId: this.cart.cartId, userId: this.cart.userId });
    });

    /* SUMMARY */
    r.get("/cart/summary", async () => {
      await this.loadState();
      this.recompute();
      return this.json(this.cart);
    });

    /* ADD ITEM */
    r.post("/cart/add", async req => {
      await this.loadState();
      const payload = await req.json().catch(() => ({}));
      const { productId, variantId, quantity = 1 } = payload;

      if (!productId) return this.error("productId_required");

      // Resolve product via PRODUCTS_SERVICE_URL (best-effort)
      try {
        const pRes = await fetch(`${this.env.PRODUCTS_SERVICE_URL.replace(/\/$/, "")}/products/${productId}`);
        if (!pRes.ok) {
          console.warn("product lookup returned non-ok", pRes.status);
        }
        var prod = pRes.ok ? await pRes.json() : null;
      } catch (e) {
        console.warn("product lookup failed", e);
        var prod = null;
      }

      // fallback price/variant if product fetch failed
      if (!prod) {
        const price = payload.unitPrice || 0;
        const i = this.cart.items.findIndex(x => x.productId === productId && x.variantId === variantId);
        if (i >= 0) this.cart.items[i].qty += Number(quantity);
        else this.cart.items.push({
          productId,
          variantId: variantId || null,
          qty: Number(quantity),
          unitPrice: Number(price),
          title: payload.title || "Unknown product",
          attributes: payload.attributes || {}
        });
      } else {
        const variant = prod.variants?.find(v => v.variantId === variantId) || prod.variants?.[0] || null;
        if (!variant && !variantId) {
          // continue — allow adding product without variants
        }
        const price = Number(variant?.price ?? prod.metadata?.price ?? 0);
        const chosenVariantId = variant ? variant.variantId : (variantId || null);
        const i = this.cart.items.findIndex(
          x => x.productId === productId && x.variantId === chosenVariantId
        );
        if (i >= 0) this.cart.items[i].qty += Number(quantity);
        else this.cart.items.push({
          productId,
          variantId: chosenVariantId,
          qty: Number(quantity),
          unitPrice: price,
          title: prod.title || payload.title || "Product",
          attributes: variant?.attributes || {}
        });
      }

      this.cart.reservationId = null;
      this.cart.paymentOrderId = null;

      this.recompute();
      await this.persist();

      return this.json({ cart: this.cart });
    });

    /* UPDATE ITEM */
    r.post("/cart/update", async req => {
      await this.loadState();
      const { productId, variantId, quantity } = await req.json().catch(() => ({}));

      if (!productId || quantity == null) return this.error("productId_and_quantity_required");

      const i = this.cart.items.findIndex(
        x => x.productId === productId && x.variantId === variantId
      );

      if (i < 0) return this.error("item_not_found");

      if (Number(quantity) <= 0) this.cart.items.splice(i, 1);
      else this.cart.items[i].qty = Number(quantity);

      this.cart.reservationId = null;
      this.cart.paymentOrderId = null;

      this.recompute();
      await this.persist();

      return this.json({ cart: this.cart });
    });

    /* REMOVE ITEM */
    r.post("/cart/remove", async req => {
      await this.loadState();
      const { productId, variantId } = await req.json().catch(() => ({}));

      if (!productId) return this.error("productId_required");

      const i = this.cart.items.findIndex(
        x => x.productId === productId && (!variantId || x.variantId === variantId)
      );

      if (i < 0) return this.error("item_not_found");

      this.cart.items.splice(i, 1);

      this.cart.reservationId = null;
      this.cart.paymentOrderId = null;

      this.recompute();
      await this.persist();

      return this.json({ cart: this.cart });
    });

    /* CLEAR CART */
    r.post("/cart/clear", async (req) => {
      await this.loadState();

      const id = this.cart.cartId;
      const userId = this.cart.userId;

      this.cart = {
        cartId: id,
        userId: userId,
        items: [],
        addressId: null,
        shippingOptions: null,
        shippingMethod: null,
        reservationId: null,
        paymentOrderId: null,
        coupon: null,
        discount: 0,
        discountType: null,
        summary: { subtotal: 0, discount: 0, shipping: 0, total: 0 },
        createdAt: nowSec(),
        updatedAt: nowSec()
      };

      await this.persist();
      return this.json({ cart: this.cart });
    });

    /* SET ADDRESS - stores addressId reference */
    r.post("/cart/address", async req => {
      await this.loadState();
      const { addressId } = await req.json().catch(() => ({}));

      if (!addressId) return this.error("addressId_required");

      this.cart.addressId = addressId;
      this.cart.shippingOptions = null;
      this.cart.shippingMethod = null;

      await this.persist();
      return this.json({ cart: this.cart });
    });

    /* SHIPPING OPTIONS - fetches full address from GATEWAY (/api/addresses) */
    r.get("/cart/shipping-options", async (req) => {
      await this.loadState();

      // ensure summary is up-to-date
      this.recompute();

      if (!this.cart.addressId) return this.error("address_required");

      // require a user present because we fetch their address list from gateway
      const userCtx = this.extractUserContext(req);
      if (!userCtx) {
        return this.error("user_required", null, 401);
      }

      // forward Authorization header (passed by gateway) to the gateway addresses endpoint
      const authToken = req.headers.get("Authorization") || req.headers.get("authorization") || null;
      if (!authToken) return this.error("authorization_required", null, 401);

      // build gateway addresses URL
      if (!this.env.GATEWAY_URL) {
        console.error("GATEWAY_URL not configured in env");
        return this.error("gateway_not_configured", null, 500);
      }

      let address = null;
      try {
        const addrRes = await fetch(
          `${this.env.GATEWAY_URL.replace(/\/$/, "")}/api/addresses`,
          { headers: { "Authorization": authToken } }
        );

        if (addrRes.ok) {
          const addrJson = await addrRes.json();
          // gateway should return { addresses: [...] }
          address = (addrJson && Array.isArray(addrJson.addresses)) ? addrJson.addresses.find(a => a.addressId === this.cart.addressId) : null;
        } else {
          console.warn("address fetch returned non-ok", addrRes.status);
        }
      } catch (e) {
        console.error("Failed to fetch address from gateway:", e);
      }

      if (!address) return this.error("address_not_found");

      // Prepare payload for fulfillment
      const payload = {
        items: this.cart.items,
        address: address,
        subtotal: this.cart.summary.subtotal,
        couponCode: this.cart.coupon
      };

      const res = await fetchWithInternalAuth(
        this.env.FULFILLMENT_SERVICE_URL,
        "/fulfillment/get-options",
        "POST",
        payload,
        this.env.INTERNAL_SECRET
      );

      if (!res.ok) {
        console.error("fulfillment service failed", res);
        return this.error("fulfillment_error", res.body || null, res.status || 502);
      }

      // expected res.body.shippingOptions
      this.cart.shippingOptions = res.body.shippingOptions || null;

      // persist updated cart (shippingOptions)
      await this.persist();

      return this.json({ shippingOptions: this.cart.shippingOptions });
    });

    /* SELECT SHIPPING */
    r.post("/cart/shipping", async req => {
      await this.loadState();
      const { methodId } = await req.json().catch(() => ({}));

      if (!methodId) return this.error("methodId_required");

      const option = (this.cart.shippingOptions || []).find(o => o.methodId === methodId);
      if (!option) return this.error("invalid_shipping_method");

      this.cart.shippingMethod = option;
      this.recompute();

      await this.persist();
      return this.json({ cart: this.cart });
    });

    /* COUPON APPLY */
    r.post("/cart/coupon/apply", async req => {
      await this.loadState();
      const { code } = await req.json().catch(() => ({}));
      if (!code) return this.error("coupon_required");

      const raw = await this.env.DISCOUNT_KV.get(`discount:${code}`);
      if (!raw) return this.error("invalid_coupon");

      const coupon = JSON.parse(raw);
      const subtotal = this.cart.items.reduce((s, i) => s + i.unitPrice * i.qty, 0);

      if (coupon.minCart && subtotal < coupon.minCart) return this.error("min_cart_not_met", { min: coupon.minCart });

      this.cart.coupon = code;
      this.cart.discountType = coupon.type;

      if (coupon.type === "percent") {
        this.cart.discount = Math.round(subtotal * (coupon.value / 100));
      } else if (coupon.type === "flat") {
        this.cart.discount = Math.min(subtotal, coupon.value);
      } else {
        this.cart.discount = 0;
      }

      this.recompute();
      await this.persist();

      return this.json({ cart: this.cart });
    });

    /* REMOVE COUPON */
    r.post("/cart/coupon/remove", async () => {
      await this.loadState();
      this.cart.coupon = null;
      this.cart.discount = 0;
      this.cart.discountType = null;
      this.recompute();
      await this.persist();
      return this.json({ cart: this.cart });
    });

    /* CHECKOUT START (requires auth & shipping) */
    r.post("/checkout/start", async (req) => {
      await this.loadState();

      this.recompute();

      if (!this.cart.items.length) return this.error("cart_empty");
      if (!this.cart.addressId) return this.error("address_required");
      if (!this.cart.shippingMethod) return this.error("shipping_required");

      const userCtx = this.extractUserContext(req);
      if (!userCtx) return this.error("authentication_required", null, 401);

      // forward Authorization header to gateway to fetch address & me
      const authToken = req.headers.get("Authorization");
      if (!authToken) return this.error("authorization_required", null, 401);

      // fetch address from gateway
      let address = null;
      let userEmail = null;
      try {
        const addrRes = await fetch(`${this.env.GATEWAY_URL.replace(/\/$/, "")}/api/addresses`, { headers: { Authorization: authToken } });
        if (addrRes.ok) {
          const addrJson = await addrRes.json();
          address = addrJson.addresses?.find(a => a.addressId === this.cart.addressId) || null;
        }
        const meRes = await fetch(`${this.env.GATEWAY_URL.replace(/\/$/, "")}/api/auth/me`, { headers: { Authorization: authToken } });
        if (meRes.ok) {
          const meJson = await meRes.json();
          userEmail = meJson.email || null;
        }
      } catch (e) {
        console.error("Failed to fetch user/address from gateway during checkout:", e);
      }

      if (!address) return this.error("address_not_found");

      const reservationId = `res_${crypto.randomUUID()}`;

      // Reserve inventory
      const invRes = await fetchWithInternalAuth(
        this.env.INVENTORY_SERVICE_URL,
        "/inventory/reserve",
        "POST",
        {
          reservationId,
          items: this.cart.items,
          cartId: this.cart.cartId,
          userId: userCtx.userId,
          ttl: 900
        },
        this.env.INTERNAL_SECRET
      );

      if (!invRes.ok) return this.error("reservation_failed", invRes.body, invRes.status);

      this.cart.reservationId = reservationId;

      // Create payment order
      const payRes = await fetchWithInternalAuth(
        this.env.PAYMENT_SERVICE_URL,
        "/payment/paypal/create",
        "POST",
        {
          reservationId,
          amount: this.cart.summary.total,
          currency: this.env.DEFAULT_CURRENCY || "USD",
          userId: userCtx.userId,
          metadata: {
            cartId: this.cart.cartId,
            coupon: this.cart.coupon,
            discount: this.cart.discount,
            discountType: this.cart.discountType,
            address: address,
            shippingMethod: this.cart.shippingMethod,
            items: this.cart.items,
            email: userEmail
          }
        },
        this.env.INTERNAL_SECRET
      );

      if (!payRes.ok) {
        // release inventory if payment creation failed
        await fetchWithInternalAuth(
          this.env.INVENTORY_SERVICE_URL,
          "/inventory/release",
          "POST",
          { reservationId },
          this.env.INTERNAL_SECRET
        );

        return this.error("payment_error", payRes.body, payRes.status);
      }

      const paymentId = payRes.body.paymentId;
      this.cart.paymentOrderId = paymentId;

      await this.persist();

      return this.json({
        reservationId,
        paypalOrderId: paymentId,
        paymentId,
        summary: this.cart.summary,
        approveUrl: payRes.body.approveUrl
      });
    });

    r.all("*", () => new Response("Not found", { status: 404, headers: corsHeaders() }));
  }

  /* Helpers */
  json(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders() }
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

/* ============================================================
   TOP LEVEL PROXY
   - keeps existing logic that injects x-cart-id
============================================================ */
import { Router as TopRouter } from "itty-router"; // top-level router for proxy
const topRouter = TopRouter();
topRouter.options("*", handleOptions);

topRouter.get("/health", () =>
  new Response(JSON.stringify({ ok: true, service: "cart-do" }), {
    headers: { "Content-Type": "application/json", ...corsHeaders() }
  })
);

topRouter.all("*", async (req, env) => {
  try {
    let cartId = req.headers.get("x-cart-id");
    if (!cartId) cartId = `cart_${crypto.randomUUID()}`;

    const id = env.CART_DO.idFromName(cartId);
    const stub = env.CART_DO.get(id);

    const newHeaders = new Headers(req.headers);
    newHeaders.set("x-cart-id", cartId);

    // also forward Authorization header (gateway should set this)
    // new Request must have a proper URL path — use internal placeholder
    const forwardedUrl = new URL(req.url);
    // replace origin so DO router receives only path — but stub.fetch will still get full URL
    const forwarded = new Request(forwardedUrl.href, {
      method: req.method,
      headers: newHeaders,
      body: req.body,
      redirect: req.redirect
    });

    const res = await stub.fetch(forwarded, { waitUntil: false });

    const outHeaders = new Headers(res.headers);
    outHeaders.set("x-cart-id", cartId);
    Object.entries(corsHeaders()).forEach(([k, v]) => outHeaders.set(k, v));

    const body = await res.arrayBuffer();

    return new Response(body, { status: res.status, headers: outHeaders });
  } catch (e) {
    console.error("Top router error:", e);
    return new Response(JSON.stringify({ error: "proxy_error", details: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() }
    });
  }
});

export default {
  fetch: (req, env) => topRouter.fetch(req, env)
};
