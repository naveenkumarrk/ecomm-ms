// cart-do.js (Durable Object + proxy) - UPDATED to hide cartId in headers
import { Router } from "itty-router";

/* ============================================================
   SHARED HMAC SIGNING (single secret)
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
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-timestamp, x-signature, x-cart-id",
  };
}

async function handleOptions(request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
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
    return { ok: res.ok, status: res.status, body: txt ? JSON.parse(txt) : null };
  } catch {
    return { ok: res.ok, status: res.status, body: txt };
  }
}

const nowSec = () => Math.floor(Date.now() / 1000);

/* ============================================================
   CART DURABLE OBJECT
   (unchanged: your DO implementation kept as-is)
============================================================ */
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

    const existing = await this.state.storage.get("cart");

    this.cart = existing || {
      cartId: `cart_${crypto.randomUUID()}`,
      items: [],
      address: null,
      shippingOptions: null,
      shippingMethod: null,
      reservationId: null,
      paymentOrderId: null,
      summary: { subtotal: 0, shipping: 0, total: 0 },
      createdAt: nowSec(),
      updatedAt: nowSec(),
    };

    this._loaded = true;
  }

  async persist() {
    this.cart.updatedAt = nowSec();
    await this.state.storage.put("cart", this.cart);
  }

  recompute() {
    const subtotal = this.cart.items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    const shipping = this.cart.shippingMethod?.cost || 0;
    this.cart.summary = { subtotal, shipping, total: subtotal + shipping };
  }

  initRouter() {
    const r = this.router;

    /* ------------------------- init cart ------------------------- */
    r.post("/cart/init", async () => {
      await this.loadState();
      return this.json({ cartId: this.cart.cartId });
    });

    /* ------------------------- summary --------------------------- */
    r.get("/cart/summary", async () => {
      await this.loadState();
      this.recompute();
      return this.json(this.cart);
    });

    /* ------------------------- add item -------------------------- */
    r.post("/cart/add", async (req) => {
      await this.loadState();
      const payload = await req.json().catch(() => ({}));
      const { productId, variantId, quantity = 1 } = payload;

      if (!productId) return this.error("productId_required");

      // get product details
      const pRes = await fetch(
        `${this.env.PRODUCTS_SERVICE_URL}/products/${productId}`
      );
      if (!pRes.ok) return this.error("product_lookup_failed");

      const prod = await pRes.json();
      
      // Find the variant or use the first one
      const variant = prod.variants?.find(v => v.variantId === variantId) || prod.variants?.[0];
      if (!variant) return this.error("variant_not_found");
      
      const price = Number(variant.price || prod.metadata?.price || 0);

      const i = this.cart.items.findIndex((x) => 
        x.productId === productId && x.variantId === (variantId || variant.variantId)
      );
      
      if (i >= 0) {
        this.cart.items[i].qty += Number(quantity);
      } else {
        this.cart.items.push({
          productId,
          variantId: variantId || variant.variantId,
          qty: Number(quantity),
          unitPrice: price,
          title: prod.title,
          attributes: variant.attributes || {},
        });
      }

      this.cart.reservationId = null;
      this.cart.paymentOrderId = null;

      this.recompute();
      await this.persist();

      return this.json({ cart: this.cart });
    });

    /* ------------------------- update item -------------------------- */
    r.post("/cart/update", async (req) => {
      await this.loadState();
      const { productId, variantId, quantity } = await req.json();

      if (!productId || quantity === undefined) return this.error("productId_and_quantity_required");

      const i = this.cart.items.findIndex((x) => 
        x.productId === productId && x.variantId === variantId
      );

      if (i < 0) return this.error("item_not_found");

      if (quantity <= 0) {
        this.cart.items.splice(i, 1);
      } else {
        this.cart.items[i].qty = Number(quantity);
      }

      this.cart.reservationId = null;
      this.cart.paymentOrderId = null;

      this.recompute();
      await this.persist();

      return this.json({ cart: this.cart });
    });

    /* ------------------------- remove item -------------------------- */
    r.post("/cart/remove", async (req) => {
      await this.loadState();
      const { productId, variantId } = await req.json();

      if (!productId) return this.error("productId_required");

      const i = this.cart.items.findIndex((x) => 
        x.productId === productId && (!variantId || x.variantId === variantId)
      );

      if (i < 0) return this.error("item_not_found");

      this.cart.items.splice(i, 1);

      this.cart.reservationId = null;
      this.cart.paymentOrderId = null;

      this.recompute();
      await this.persist();

      return this.json({ cart: this.cart });
    });

    /* ------------------------- clear cart -------------------------- */
    r.post("/cart/clear", async (req) => {
      await this.loadState();
      this.cart.items = [];
      this.cart.reservationId = null;
      this.cart.paymentOrderId = null;
      this.recompute();
      await this.persist();
      return this.json({ cart: this.cart });
    });

    /* ------------------------- address --------------------------- */
    r.post("/cart/address", async (req) => {
      await this.loadState();
      const { address } = await req.json();
      if (!address) return this.error("address_required");

      this.cart.address = address;
      this.cart.shippingOptions = null;
      this.cart.shippingMethod = null;

      await this.persist();
      return this.json({ cart: this.cart });
    });

    /* ------------------------- shipping options ------------------ */
    r.get("/cart/shipping-options", async () => {
      await this.loadState();
      if (!this.cart.address) return this.error("address_required");

      // already cached
      if (this.cart.shippingOptions)
        return this.json({ shippingOptions: this.cart.shippingOptions });

      const payload = {
        items: this.cart.items,
        address: this.cart.address,
        subtotal: this.cart.summary.subtotal,
      };

      const res = await fetchWithInternalAuth(
        this.env.FULFILLMENT_SERVICE_URL,
        "/fulfillment/get-options",
        "POST",
        payload,
        this.env.INTERNAL_SECRET
      );

      if (!res.ok) return this.error("fulfillment_error", res.body);

      this.cart.shippingOptions = res.body.shippingOptions;
      await this.persist();

      return this.json({ shippingOptions: this.cart.shippingOptions });
    });

    /* ------------------------- select shipping ------------------- */
    r.post("/cart/shipping", async (req) => {
      await this.loadState();
      const { methodId } = await req.json();
      const option = this.cart.shippingOptions?.find((o) => o.methodId === methodId);

      if (!option) return this.error("invalid_shipping_method");

      this.cart.shippingMethod = option;
      this.recompute();
      await this.persist();

      return this.json({ cart: this.cart });
    });

    /* ------------------------- checkout start (reserve + pay) ---- */
    r.post("/checkout/start", async () => {
      await this.loadState();

      if (!this.cart.items.length) return this.error("cart_empty");
      if (!this.cart.address) return this.error("address_required");
      if (!this.cart.shippingMethod) return this.error("shipping_required");

      const reservationId = `res_${crypto.randomUUID()}`;

      // TRY INVENTORY RESERVE
      const invRes = await fetchWithInternalAuth(
        this.env.INVENTORY_SERVICE_URL,
        "/inventory/reserve",
        "POST",
        {
          reservationId,
          items: this.cart.items,
          cartId: this.cart.cartId,
          ttl: 900,
        },
        this.env.INTERNAL_SECRET
      );
      console.log("INVENTORY RESERVE RAW RESPONSE:", invRes);

      if (!invRes.ok) {
        return this.error("reservation_failed", invRes.body, invRes.status);
      }

      this.cart.reservationId = reservationId;

      // create mock payment
      const payRes = await fetchWithInternalAuth(
        this.env.PAYMENT_SERVICE_URL,
        "/payment/mock/create",
        "POST",
        {
          reservationId,
          amount: this.cart.summary.total,
          currency: this.env.DEFAULT_CURRENCY || "INR",
          metadata: {
            cartId: this.cart.cartId,
            address: this.cart.address,
            shippingMethod: this.cart.shippingMethod,
            items: this.cart.items,
          },
        },
        this.env.INTERNAL_SECRET
      );

      if (!payRes.ok) {
        await fetchWithInternalAuth(
          this.env.INVENTORY_SERVICE_URL,
          "/inventory/release",
          "POST",
          { reservationId },
          this.env.INTERNAL_SECRET
        );
        return this.error("payment_error", payRes.body);
      }

      const paymentId = payRes.body.paymentId;

      this.cart.paymentOrderId = paymentId;
      await this.persist();

      return this.json({
        reservationId,
        paypalOrderId: paymentId,
        paymentId,
        summary: this.cart.summary,
        approveUrl: payRes.body.approveUrl,
      });
    });

    /* fallback */
    r.all("*", () => new Response("Not found", { status: 404, headers: corsHeaders() }));
  }

  /* helpers */
  json(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 
        "Content-Type": "application/json",
        ...corsHeaders()
      }
    });
  }

  error(message, details = null, status = 400) {
    return this.json({ error: message, details }, status);
  }

  async fetch(req) {
    await this.loadState();
    // allow internal header override x-cart-id to map DO instance
    // the top-level proxy ensures x-cart-id is provided
    return this.router.fetch(req);
  }
}

/* ============================================================
   TOP-LEVEL PROXY (updated to use header-based cartId routing)
============================================================ */
const topRouter = Router();
topRouter.options("*", handleOptions);
topRouter.get("/health", () =>
  new Response(JSON.stringify({ ok: true, service: "cart-do" }), {
    headers: { 
      "Content-Type": "application/json",
      ...corsHeaders()
    }
  })
);

// NEW: route to DO based on x-cart-id header (hidden)
topRouter.all("*", async (req, env) => {
  try {
    // read cartId from header (proxy & client must set x-cart-id)
    // If missing, generate a new cartId here (hidden from URL)
    let cartId = req.headers.get("x-cart-id");
    if (!cartId) {
      cartId = `cart_${crypto.randomUUID()}`;
    }

    // Determine DO id from name (use the cartId as the name)
    const id = env.CART_DO.idFromName(cartId);
    const stub = env.CART_DO.get(id);

    // Forward the request to the DO, but ensure the header x-cart-id is present
    // Build new headers object merging existing headers and x-cart-id
    const newHeaders = new Headers(req.headers);
    newHeaders.set("x-cart-id", cartId);

    // Build forwarded Request - keep original method/url/body
    const forwarded = new Request(req.url, {
      method: req.method,
      headers: newHeaders,
      body: req.body,
      redirect: req.redirect,
    });

    const res = await stub.fetch(forwarded);

    // Clone response and attach x-cart-id to response headers (so client receives it once)
    const outHeaders = new Headers(res.headers);
    outHeaders.set("x-cart-id", cartId);
    // Ensure CORS headers present
    Object.entries(corsHeaders()).forEach(([k, v]) => outHeaders.set(k, v));

    const body = await res.arrayBuffer();
    return new Response(body, {
      status: res.status,
      headers: outHeaders
    });
  } catch (e) {
    console.error("Top router proxy error:", e);
    return new Response(JSON.stringify({ error: "proxy_error", details: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() }
    });
  }
});

export default {
  fetch: (req, env) => topRouter.fetch(req, env),
};
