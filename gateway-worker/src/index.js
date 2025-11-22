// gateway-worker.js
import { Router } from "itty-router";

/* -------------------------------------------------------
   HELPER: Service Caller (Supports Bindings & URLs)
   Fixes Error 1042
------------------------------------------------------- */
async function callService(envTarget, path, method = "GET", body = null, headers = {}) {
  try {
    const bodyText = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      "Content-Type": "application/json",
      "x-test-mode": "true",
      ...headers
    };

    // CASE A: Service Binding (Preferred)
    if (envTarget && typeof envTarget.fetch === 'function') {
      const res = await envTarget.fetch(new Request(`https://internal${path}`, {
        method, headers: reqHeaders, body: bodyText
      }));
      const txt = await res.text();
      try { return { ok: res.ok, status: res.status, body: JSON.parse(txt) }; }
      catch { return { ok: res.ok, status: res.status, body: txt }; }
    }

    // CASE B: URL String
    if (typeof envTarget === 'string' && envTarget.startsWith('http')) {
      const fullUrl = envTarget.replace(/\/$/, "") + path;
      const res = await fetch(fullUrl, { method, headers: reqHeaders, body: bodyText });
      const txt = await res.text();
      try { return { ok: res.ok, status: res.status, body: JSON.parse(txt) }; }
      catch { return { ok: res.ok, status: res.status, body: txt }; }
    }

    return { ok: false, status: 500, body: { error: "service_binding_missing" } };
  } catch (err) {
    console.error("Gateway Call Error:", err);
    return { ok: false, status: 500, body: { error: "gateway_internal_error", details: err.message } };
  }
}

/* -------------------------------------------------------
   CART DO HELPERS
------------------------------------------------------- */
function getCartStub(env, cartId) {
  try {
    if (!env.CART_DO) throw new Error("CART_DO binding not found");
    const id = env.CART_DO.idFromName(cartId);
    return env.CART_DO.get(id);
  } catch (e) {
    console.error("DO Stub Error:", e);
    return null;
  }
}

async function fetchDO(stub, path, method = "GET", body = null, cartId) {
  if (!stub) return { status: 500, body: { error: "cart_do_unavailable" } };
  try {
    // IMPORTANT: Pass x-cart-id header so DO knows who it is
    const res = await stub.fetch(`https://cart${path}`, {
      method,
      headers: { 
        "Content-Type": "application/json",
        "x-cart-id": cartId 
      },
      body: body ? JSON.stringify(body) : null
    });
    const txt = await res.text();
    try { return { status: res.status, body: JSON.parse(txt) }; } 
    catch { return { status: res.status, body: txt }; }
  } catch (e) {
    return { status: 500, body: { error: "do_fetch_failed", message: e.message } };
  }
}

/* -------------------------------------------------------
   ROUTER
------------------------------------------------------- */
const router = Router();
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Test-Mode"
};

router.options("*", () => new Response("OK", { headers: corsHeaders }));
const jsonRes = (data, status = 200) => 
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

/* --- PRODUCTS --- */
router.get("/api/products", async (req, env) => {
  const url = new URL(req.url);
  const target = env.PRODUCTS_SERVICE || env.PRODUCTS_SERVICE_URL;
  const res = await callService(target, `/products?limit=${url.searchParams.get("limit")||20}`);
  return jsonRes(res.body, res.status);
});

router.get("/api/products/:id", async (req, env) => {
  const target = env.PRODUCTS_SERVICE || env.PRODUCTS_SERVICE_URL;
  const res = await callService(target, `/products/${req.params.id}`);
  return jsonRes(res.body, res.status);
});

/* --- CART --- */
router.post("/api/cart/init", async (req, env) => {
  // 1. Generate ID in Gateway
  const cartId = `cart_${crypto.randomUUID()}`;
  const stub = getCartStub(env, cartId);

  // 2. Call DO (It will grab ID from header and persist)
  const res = await fetchDO(stub, "/cart/init", "POST", {}, cartId);
  
  // 3. Ensure we return the generated cartId
  return jsonRes({ ...res.body, cartId }, res.status);
});

router.get("/api/cart/:cartId", async (req, env) => {
  const { cartId } = req.params;
  const stub = getCartStub(env, cartId);
  const res = await fetchDO(stub, "/cart/summary", "GET", null, cartId);
  return jsonRes(res.body, res.status);
});

router.post("/api/cart/:cartId/add", async (req, env) => {
  const body = await req.json();
  const { cartId } = req.params;
  const stub = getCartStub(env, cartId);
  const res = await fetchDO(stub, "/cart/add", "POST", body, cartId);
  return jsonRes(res.body, res.status);
});

router.post("/api/cart/:cartId/update", async (req, env) => {
  const body = await req.json();
  const { cartId } = req.params;
  const stub = getCartStub(env, cartId);
  const res = await fetchDO(stub, "/cart/update", "POST", body, cartId);
  return jsonRes(res.body, res.status);
});

router.post("/api/cart/:cartId/address", async (req, env) => {
  const body = await req.json();
  const { cartId } = req.params;
  const stub = getCartStub(env, cartId);
  const res = await fetchDO(stub, "/cart/address", "POST", body, cartId);
  return jsonRes(res.body, res.status);
});

router.get("/api/cart/:cartId/shipping-options", async (req, env) => {
  const { cartId } = req.params;
  const stub = getCartStub(env, cartId);
  const res = await fetchDO(stub, "/cart/shipping-options", "GET", null, cartId);
  return jsonRes(res.body, res.status);
});

router.post("/api/cart/:cartId/shipping", async (req, env) => {
  const body = await req.json();
  const { cartId } = req.params;
  const stub = getCartStub(env, cartId);
  const res = await fetchDO(stub, "/cart/shipping", "POST", body, cartId);
  return jsonRes(res.body, res.status);
});


router.post("/api/cart/:cartId/clear", async (req, env) => {
  const { cartId } = req.params;
  const stub = getCartStub(env, cartId);

  const res = await fetchDO(stub, "/cart/clear", "POST", {}, cartId);

  return jsonRes(res.body, res.status);
});


/* --- CHECKOUT --- */
router.post("/api/checkout/start", async (req, env) => {
  const body = await req.json();
  const cartId = body.cartId || req.headers.get("x-cart-id");
  
  if (cartId && env.CART_DO) {
      // If Checkout logic is inside DO, route there:
      const stub = getCartStub(env, cartId);
      const res = await fetchDO(stub, "/checkout/start", "POST", body, cartId);
      return jsonRes(res.body, res.status);
  } else {
      // If Checkout is a separate worker service:
      const target = env.CART_SERVICE || env.CART_SERVICE_URL; 
      const res = await callService(target, "/checkout/start", "POST", body);
      return jsonRes(res.body, res.status);
  }
});

router.post("/api/checkout/capture", async (req, env) => {
  const body = await req.json();
  const target = env.PAYMENT_SERVICE || env.PAYMENT_SERVICE_URL;
  const res = await callService(target, "/payment/paypal/capture", "POST", body);
  return jsonRes(res.body, res.status);
});

router.get("/api/orders/:orderId", async (req, env) => {
  const target = env.ORDER_SERVICE || env.ORDER_SERVICE_URL;
  const res = await callService(target, `/orders/${req.params.orderId}`);
  return jsonRes(res.body, res.status);
});

router.all("*", () => jsonRes({ error: "not_found" }, 404));

export default {
  fetch: (req, env) => router.fetch(req, env)
};