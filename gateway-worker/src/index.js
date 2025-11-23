// gateway-worker.js - FIXED FOR ERROR 1042
import { Router } from "itty-router";

/* -------------------------------------------------------
   JWT Verification
------------------------------------------------------- */
async function verifyJWT(token, secretBase64) {
  try {
    const [h, p, s] = token.split(".");
    if (!h || !p || !s) return null;

    const rawKey = Uint8Array.from(atob(secretBase64), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      rawKey,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signature = Uint8Array.from(
      atob(s.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0)
    );

    const valid = await crypto.subtle.verify(
      "HMAC",
      cryptoKey,
      signature,
      new TextEncoder().encode(`${h}.${p}`)
    );

    if (!valid) return null;

    const payload = JSON.parse(
      decodeURIComponent(
        atob(p.replace(/-/g, "+").replace(/_/g, "/"))
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      )
    );

    const epoch = Math.floor(Date.now() / 1000);
    if (payload.exp < epoch) return null;

    return payload;
  } catch (error) {
    console.error("verifyJWT error:", error);
    return null;
  }
}

/* -------------------------------------------------------
   Auth Middleware
------------------------------------------------------- */
async function extractUser(req, env) {
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return null;
    
    const token = auth.slice(7);
    const payload = await verifyJWT(token, env.JWT_SECRET);
    
    return payload;
  } catch (error) {
    console.error("extractUser error:", error);
    return null;
  }
}

async function requireAuth(req, env) {
  const user = await extractUser(req, env);
  if (!user) {
    return new Response(
      JSON.stringify({ error: "unauthorized", message: "Valid token required" }), 
      { status: 401, headers: corsHeaders }
    );
  }
  return user;
}

async function requireAdmin(req, env) {
  const user = await extractUser(req, env);
  if (!user || user.role !== 'admin') {
    return new Response(
      JSON.stringify({ error: "forbidden", message: "Admin access required" }), 
      { status: 403, headers: corsHeaders }
    );
  }
  return user;
}

/* -------------------------------------------------------
   IMPROVED Service Caller - Handles Both Bindings & URLs
------------------------------------------------------- */
async function callService(serviceName, path, method = "GET", body = null, headers = {}, userContext = null, env, timeout = 20000) {
  console.log(`[GATEWAY] Calling ${serviceName} ${method} ${path}`);
  
  try {
    const bodyText = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      "Content-Type": "application/json",
      ...headers
    };

    // Pass user context to internal services
    if (userContext) {
      reqHeaders["x-user-id"] = userContext.sub;
      reqHeaders["x-user-role"] = userContext.role;
      reqHeaders["x-session-id"] = userContext.sid;
    }

    // Determine target - try service binding first, then URL
    let fetchPromise;
    const serviceBinding = env[serviceName];
    const serviceUrl = env[`${serviceName}_URL`];

    // Try Service Binding first
    if (serviceBinding && typeof serviceBinding.fetch === 'function') {
      console.log(`[GATEWAY] Using service binding for ${serviceName}`);
      fetchPromise = serviceBinding.fetch(new Request(`https://internal${path}`, {
        method, 
        headers: reqHeaders, 
        body: bodyText
      }));
    }
    // Fallback to URL
    else if (serviceUrl && serviceUrl.startsWith('http')) {
      console.log(`[GATEWAY] Using URL for ${serviceName}: ${serviceUrl}`);
      const fullUrl = serviceUrl.replace(/\/$/, "") + path;
      fetchPromise = fetch(fullUrl, { 
        method, 
        headers: reqHeaders, 
        body: bodyText 
      });
    }
    else {
      console.error(`[GATEWAY] No valid target for ${serviceName}`);
      return { 
        ok: false, 
        status: 502, 
        body: { 
          error: "service_not_configured", 
          service: serviceName,
          message: `Neither binding nor URL available for ${serviceName}`
        } 
      };
    }

    // Add timeout protection
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Service call timeout after ${timeout}ms`)), timeout)
    );

    const res = await Promise.race([fetchPromise, timeoutPromise]);
    
    console.log(`[GATEWAY] ${serviceName} responded with status: ${res.status}`);
    
    const txt = await res.text();
    
    try { 
      return { ok: res.ok, status: res.status, body: JSON.parse(txt) }; 
    } catch { 
      return { ok: res.ok, status: res.status, body: txt }; 
    }

  } catch (err) {
    console.error(`[GATEWAY] ${serviceName} Error:`, err.message);
    return { 
      ok: false, 
      status: 504, 
      body: { 
        error: "gateway_timeout", 
        message: err.message,
        service: serviceName,
        path: path
      } 
    };
  }
}

/* -------------------------------------------------------
   Cart DO Helpers
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

async function fetchDO(stub, path, method = "GET", body = null, cartId, userContext = null, authHeader = null, timeout = 20000) {
  if (!stub) return { status: 500, body: { error: "cart_do_unavailable" } };
  
  try {
    const headers = { 
      "Content-Type": "application/json",
      "x-cart-id": cartId 
    };
    
    if (userContext) {
      headers["x-user-id"] = userContext.sub;
      headers["x-user-role"] = userContext.role;
    }

    if (authHeader) {
      headers["Authorization"] = authHeader;
    }
    
    const fetchPromise = stub.fetch(`https://cart${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Cart DO timeout after ${timeout}ms`)), timeout)
    );

    const res = await Promise.race([fetchPromise, timeoutPromise]);
    const txt = await res.text();
    
    try { 
      return { status: res.status, body: JSON.parse(txt) }; 
    } catch { 
      return { status: res.status, body: txt }; 
    }
  } catch (e) {
    console.error("fetchDO error:", e);
    return { status: 504, body: { error: "cart_timeout", message: e.message } };
  }
}

/* -------------------------------------------------------
   HMAC Helpers
------------------------------------------------------- */
async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret || ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function signedHeadersFor(secret, method, path, body = "") {
  const ts = Date.now().toString();
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body || {});
  const msg = `${ts}|${method.toUpperCase()}|${path}|${bodyStr}`;
  const signature = await hmacHex(secret, msg);
  return { 
    "x-timestamp": ts, 
    "x-signature": signature, 
    "content-type": "application/json" 
  };
}

/* -------------------------------------------------------
   Router
------------------------------------------------------- */
const router = Router();
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

router.options("*", () => new Response("OK", { headers: corsHeaders }));
const jsonRes = (data, status = 200) => 
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

/* -------------------------------------------------------
   HEALTH CHECK
------------------------------------------------------- */
router.get("/", () => jsonRes({ status: "ok", service: "gateway" }));
router.get("/health", () => jsonRes({ status: "ok", service: "gateway" }));

/* -------------------------------------------------------
   PUBLIC AUTH ROUTES
------------------------------------------------------- */
router.post("/api/auth/signup", async (req, env) => {
  console.log("[GATEWAY] /api/auth/signup called");
  
  try {
    const body = await req.json().catch(() => null);
    
    if (!body) {
      return jsonRes({ error: "invalid_json" }, 400);
    }

    const res = await callService("AUTH_SERVICE", "/auth/signup", "POST", body, {}, null, env, 15000);
    return jsonRes(res.body, res.status);
    
  } catch (error) {
    console.error("[GATEWAY] /api/auth/signup error:", error);
    return jsonRes({ 
      error: "gateway_error", 
      message: error.message 
    }, 500);
  }
});

router.post("/api/auth/login", async (req, env) => {
  console.log("[GATEWAY] /api/auth/login called");
  
  try {
    const body = await req.json().catch(() => null);
    
    if (!body) {
      return jsonRes({ error: "invalid_json" }, 400);
    }

    const res = await callService("AUTH_SERVICE", "/auth/login", "POST", body, {}, null, env, 15000);
    return jsonRes(res.body, res.status);
    
  } catch (error) {
    console.error("[GATEWAY] /api/auth/login error:", error);
    return jsonRes({ error: "gateway_error", message: error.message }, 500);
  }
});

/* -------------------------------------------------------
   ADMIN CREATION ROUTES
------------------------------------------------------- */
router.post("/api/auth/admin/signup", async (req, env) => {
  console.log("[GATEWAY] /api/auth/admin/signup called");
  
  try {
    const body = await req.json().catch(() => null);
    
    if (!body) {
      return jsonRes({ error: "invalid_json" }, 400);
    }

    // Forward admin secret header if provided
    const headers = {};
    const adminSecret = req.headers.get("x-admin-secret");
    if (adminSecret) {
      headers["x-admin-secret"] = adminSecret;
    }

    const res = await callService("AUTH_SERVICE", "/auth/admin/signup", "POST", body, headers, null, env, 15000);
    return jsonRes(res.body, res.status);
    
  } catch (error) {
    console.error("[GATEWAY] /api/auth/admin/signup error:", error);
    return jsonRes({ error: "gateway_error", message: error.message }, 500);
  }
});

router.post("/api/auth/admin/promote", async (req, env) => {
  const user = await requireAdmin(req, env);
  if (user instanceof Response) return user;

  try {
    const body = await req.json().catch(() => null);
    
    if (!body) {
      return jsonRes({ error: "invalid_json" }, 400);
    }

    const res = await callService("AUTH_SERVICE", "/auth/admin/promote", "POST", body, {
      "Authorization": req.headers.get("Authorization")
    }, user, env, 15000);
    return jsonRes(res.body, res.status);
    
  } catch (error) {
    console.error("[GATEWAY] /api/auth/admin/promote error:", error);
    return jsonRes({ error: "gateway_error", message: error.message }, 500);
  }
});

/* -------------------------------------------------------
   PRODUCT ROUTES
------------------------------------------------------- */
router.get("/api/products", async (req, env) => {
  const url = new URL(req.url);
  const res = await callService("PRODUCTS_SERVICE", `/products?limit=${url.searchParams.get("limit")||20}&offset=${url.searchParams.get("offset")||0}`, "GET", null, {}, null, env, 10000);
  return jsonRes(res.body, res.status);
});

router.get("/api/products/:id", async (req, env) => {
  const res = await callService("PRODUCTS_SERVICE", `/products/${req.params.id}`, "GET", null, {}, null, env, 10000);
  return jsonRes(res.body, res.status);
});

/* -------------------------------------------------------
   AUTHENTICATED USER ROUTES
------------------------------------------------------- */
router.get("/api/auth/me", async (req, env) => {
  const user = await requireAuth(req, env);
  if (user instanceof Response) return user;

  const res = await callService("AUTH_SERVICE", "/auth/me", "GET", null, {
    "Authorization": req.headers.get("Authorization")
  }, null, env, 10000);
  return jsonRes(res.body, res.status);
});

router.post("/api/auth/logout", async (req, env) => {
  const user = await requireAuth(req, env);
  if (user instanceof Response) return user;

  const res = await callService("AUTH_SERVICE", "/auth/logout", "POST", null, {
    "Authorization": req.headers.get("Authorization")
  }, null, env, 10000);
  return jsonRes(res.body, res.status);
});

/* -------------------------------------------------------
   ADDRESS MANAGEMENT
------------------------------------------------------- */
router.get("/api/addresses", async (req, env) => {
  const user = await requireAuth(req, env);
  if (user instanceof Response) return user;

  const res = await callService("AUTH_SERVICE", "/auth/addresses", "GET", null, {
    "Authorization": req.headers.get("Authorization")
  }, null, env, 10000);
  return jsonRes(res.body, res.status);
});

router.post("/api/addresses", async (req, env) => {
  const user = await requireAuth(req, env);
  if (user instanceof Response) return user;

  const body = await req.json();
  const res = await callService("AUTH_SERVICE", "/auth/addresses", "POST", body, {
    "Authorization": req.headers.get("Authorization")
  }, null, env, 10000);
  return jsonRes(res.body, res.status);
});

router.put("/api/addresses/:id", async (req, env) => {
  const user = await requireAuth(req, env);
  if (user instanceof Response) return user;

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return jsonRes({ error: "invalid_json" }, 400);
    }

    const res = await callService("AUTH_SERVICE", `/auth/addresses/${req.params.id}`, "PUT", body, {
      "Authorization": req.headers.get("Authorization")
    }, user, env, 10000);
    return jsonRes(res.body, res.status);
  } catch (error) {
    console.error("[GATEWAY] /api/addresses/:id PUT error:", error);
    return jsonRes({ error: "gateway_error", message: error.message }, 500);
  }
});

router.delete("/api/addresses/:id", async (req, env) => {
  const user = await requireAuth(req, env);
  if (user instanceof Response) return user;

  try {
    const res = await callService("AUTH_SERVICE", `/auth/addresses/${req.params.id}`, "DELETE", null, {
      "Authorization": req.headers.get("Authorization")
    }, user, env, 10000);
    return jsonRes(res.body, res.status);
  } catch (error) {
    console.error("[GATEWAY] /api/addresses/:id DELETE error:", error);
    return jsonRes({ error: "gateway_error", message: error.message }, 500);
  }
});

/* -------------------------------------------------------
   CART ROUTES (Auth Optional)
------------------------------------------------------- */
router.post("/api/cart/init", async (req, env) => {
  const user = await extractUser(req, env);
  
  const cartId = `cart_${crypto.randomUUID()}`;
  const stub = getCartStub(env, cartId);
  const res = await fetchDO(stub, "/cart/init", "POST", {}, cartId, user);
  
  return jsonRes({ ...res.body, cartId }, res.status);
});

router.get("/api/cart/:cartId", async (req, env) => {
  const user = await extractUser(req, env);
  const { cartId } = req.params;
  const stub = getCartStub(env, cartId);
  const res = await fetchDO(stub, "/cart/summary", "GET", null, cartId, user);
  return jsonRes(res.body, res.status);
});

router.post("/api/cart/:cartId/add", async (req, env) => {
  const user = await extractUser(req, env);
  const body = await req.json();
  const { cartId } = req.params;
  const stub = getCartStub(env, cartId);
  const res = await fetchDO(stub, "/cart/add", "POST", body, cartId, user);
  return jsonRes(res.body, res.status);
});

router.post("/api/cart/:cartId/update", async (req, env) => {
  try {
    const user = await extractUser(req, env);
    const body = await req.json().catch(() => null);
    if (!body) {
      return jsonRes({ error: "invalid_json" }, 400);
    }

    const { cartId } = req.params;
    const stub = getCartStub(env, cartId);
    if (!stub) {
      return jsonRes({ error: "cart_do_unavailable" }, 500);
    }

    const res = await fetchDO(stub, "/cart/update", "POST", body, cartId, user);
    return jsonRes(res.body, res.status);
  } catch (error) {
    console.error("[GATEWAY] /api/cart/:cartId/update error:", error);
    return jsonRes({ error: "gateway_error", message: error.message }, 500);
  }
});

router.post("/api/cart/:cartId/remove", async (req, env) => {
  try {
    const user = await extractUser(req, env);
    const body = await req.json().catch(() => null);
    if (!body) {
      return jsonRes({ error: "invalid_json" }, 400);
    }

    const { cartId } = req.params;
    const stub = getCartStub(env, cartId);
    if (!stub) {
      return jsonRes({ error: "cart_do_unavailable" }, 500);
    }

    const res = await fetchDO(stub, "/cart/remove", "POST", body, cartId, user);
    return jsonRes(res.body, res.status);
  } catch (error) {
    console.error("[GATEWAY] /api/cart/:cartId/remove error:", error);
    return jsonRes({ error: "gateway_error", message: error.message }, 500);
  }
});

router.post("/api/cart/:cartId/clear", async (req, env) => {
  const user = await extractUser(req, env);
  const { cartId } = req.params;
  const stub = getCartStub(env, cartId);
  const res = await fetchDO(stub, "/cart/clear", "POST", {}, cartId, user);
  return jsonRes(res.body, res.status);
});

router.post("/api/cart/:cartId/address", async (req, env) => {
  const user = await extractUser(req, env);
  const body = await req.json();
  const { cartId } = req.params;
  const stub = getCartStub(env, cartId);
  const res = await fetchDO(stub, "/cart/address", "POST", body, cartId, user);
  return jsonRes(res.body, res.status);
});

router.get("/api/cart/:cartId/shipping-options", async (req, env) => {
  const user = await extractUser(req, env);
  const { cartId } = req.params;
  const stub = getCartStub(env, cartId);
  const authHeader = req.headers.get("Authorization");
  const res = await fetchDO(stub, "/cart/shipping-options", "GET", null, cartId, user, authHeader);
  return jsonRes(res.body, res.status);
});

router.post("/api/cart/:cartId/shipping", async (req, env) => {
  const user = await extractUser(req, env);
  const body = await req.json();
  const { cartId } = req.params;
  const stub = getCartStub(env, cartId);
  const res = await fetchDO(stub, "/cart/shipping", "POST", body, cartId, user);
  return jsonRes(res.body, res.status);
});

router.post("/api/cart/:cartId/coupon/apply", async (req, env) => {
  const user = await extractUser(req, env);
  const body = await req.json();
  const { cartId } = req.params;
  const stub = getCartStub(env, cartId);
  const res = await fetchDO(stub, "/cart/coupon/apply", "POST", body, cartId, user);
  return jsonRes(res.body, res.status);
});

router.post("/api/cart/:cartId/coupon/remove", async (req, env) => {
  const user = await extractUser(req, env);
  const { cartId } = req.params;
  const stub = getCartStub(env, cartId);
  const res = await fetchDO(stub, "/cart/coupon/remove", "POST", {}, cartId, user);
  return jsonRes(res.body, res.status);
});

/* -------------------------------------------------------
   CHECKOUT (Requires Auth)
------------------------------------------------------- */
router.post("/api/checkout/start", async (req, env) => {
  const user = await requireAuth(req, env);
  if (user instanceof Response) return user;

  const body = await req.json();
  const cartId = body.cartId || req.headers.get("x-cart-id");
  
  if (cartId && env.CART_DO) {
    const stub = getCartStub(env, cartId);
    const authHeader = req.headers.get("Authorization");
    const res = await fetchDO(stub, "/checkout/start", "POST", body, cartId, user, authHeader);
    return jsonRes(res.body, res.status);
  } else {
    const res = await callService("CART_SERVICE", "/checkout/start", "POST", body, {}, user, env);
    return jsonRes(res.body, res.status);
  }
});

router.post("/api/checkout/capture", async (req, env) => {
  const user = await requireAuth(req, env);
  if (user instanceof Response) return user;

  const body = await req.json();
  
  const headers = {
    "x-user-id": user.sub,
    "x-user-role": user.role
  };
  
  const res = await callService("PAYMENT_SERVICE", "/payment/paypal/capture", "POST", body, headers, user, env);
  return jsonRes(res.body, res.status);
});

/* -------------------------------------------------------
   ORDER ROUTES (Auth Required)
------------------------------------------------------- */
router.get("/api/orders", async (req, env) => {
  const user = await requireAuth(req, env);
  if (user instanceof Response) return user;

  const res = await callService("ORDER_SERVICE", `/orders/user/${user.sub}`, "GET", null, {}, user, env);
  return jsonRes(res.body, res.status);
});

router.get("/api/orders/:orderId", async (req, env) => {
  const user = await requireAuth(req, env);
  if (user instanceof Response) return user;

  const res = await callService("ORDER_SERVICE", `/orders/${req.params.orderId}`, "GET", null, {}, user, env);
  
  if (res.ok && res.body.user_id !== user.sub && user.role !== 'admin') {
    return jsonRes({ error: "forbidden" }, 403);
  }
  
  return jsonRes(res.body, res.status);
});

/* -------------------------------------------------------
   ADMIN ROUTES
------------------------------------------------------- */
router.post("/api/admin/products/images/upload", async (req, env) => {
  const user = await requireAdmin(req, env);
  if (user instanceof Response) return user;

  try {
    // For file uploads, we need to forward the request directly
    const contentType = req.headers.get("content-type") || "";
    const isMultipart = contentType.includes("multipart/form-data");
    
    // Get the raw body for signature generation
    // For multipart, use empty body for signature
    const bodyText = isMultipart ? "" : await req.clone().arrayBuffer().then(ab => new TextDecoder().decode(ab));
    
    const path = "/products/images/upload";
    const headers = await signedHeadersFor(env.ADMIN_SECRET || env.INTERNAL_SECRET, "POST", path, bodyText);
    
    // Forward the request with the file
    const serviceBinding = env.PRODUCTS_SERVICE;
    const serviceUrl = env.PRODUCTS_SERVICE_URL;
    
    // Build headers object
    const forwardedHeaders = new Headers(req.headers);
    Object.entries(headers).forEach(([key, value]) => {
      forwardedHeaders.set(key, value);
    });
    
    let response;
    if (serviceBinding && typeof serviceBinding.fetch === 'function') {
      // Use service binding
      const forwardedReq = new Request(`https://internal${path}`, {
        method: req.method,
        headers: forwardedHeaders,
        body: req.body
      });
      response = await serviceBinding.fetch(forwardedReq);
    } else if (serviceUrl && serviceUrl.startsWith('http')) {
      // Use URL
      const fullUrl = serviceUrl.replace(/\/$/, "") + path;
      response = await fetch(fullUrl, {
        method: req.method,
        headers: forwardedHeaders,
        body: req.body
      });
    } else {
      return jsonRes({ error: "service_not_configured" }, 502);
    }
    
    const responseBody = await response.json().catch(() => ({ error: "Invalid response" }));
    return jsonRes(responseBody, response.status);
  } catch (error) {
    console.error("[GATEWAY] Image upload error:", error);
    return jsonRes({ error: "gateway_error", message: error.message }, 500);
  }
});

router.post("/api/admin/products", async (req, env) => {
  const user = await requireAdmin(req, env);
  if (user instanceof Response) return user;

  try {
    const contentType = req.headers.get("content-type") || "";
    const isMultipart = contentType.includes("multipart/form-data");
    const path = "/products";
    
    // For signature generation
    let bodyText = "";
    if (isMultipart) {
      bodyText = ""; // Empty for multipart (boundary makes it unreliable)
    } else {
      bodyText = await req.clone().text();
    }
    
    const headers = await signedHeadersFor(env.ADMIN_SECRET || env.INTERNAL_SECRET, "POST", path, bodyText);
    
    // Forward request with proper content type
    const serviceBinding = env.PRODUCTS_SERVICE;
    const serviceUrl = env.PRODUCTS_SERVICE_URL;
    
    const forwardedHeaders = new Headers(req.headers);
    Object.entries(headers).forEach(([key, value]) => {
      forwardedHeaders.set(key, value);
    });
    
    let response;
    if (serviceBinding && typeof serviceBinding.fetch === 'function') {
      const forwardedReq = new Request(`https://internal${path}`, {
        method: req.method,
        headers: forwardedHeaders,
        body: req.body
      });
      response = await serviceBinding.fetch(forwardedReq);
    } else if (serviceUrl && serviceUrl.startsWith('http')) {
      const fullUrl = serviceUrl.replace(/\/$/, "") + path;
      response = await fetch(fullUrl, {
        method: req.method,
        headers: forwardedHeaders,
        body: req.body
      });
    } else {
      return jsonRes({ error: "service_not_configured" }, 502);
    }
    
    const responseBody = await response.json().catch(() => ({ error: "Invalid response" }));
    return jsonRes(responseBody, response.status);
  } catch (error) {
    console.error("[GATEWAY] Product creation error:", error);
    return jsonRes({ error: "gateway_error", message: error.message }, 500);
  }
});

router.put("/api/admin/products/:id", async (req, env) => {
  const user = await requireAdmin(req, env);
  if (user instanceof Response) return user;

  const body = await req.json();
  const path = `/products/${req.params.id}`;
  const headers = await signedHeadersFor(env.ADMIN_SECRET || env.INTERNAL_SECRET, "PUT", path, body);
  
  const res = await callService("PRODUCTS_SERVICE", path, "PUT", body, headers, user, env);
  return jsonRes(res.body, res.status);
});

router.delete("/api/admin/products/:id", async (req, env) => {
  const user = await requireAdmin(req, env);
  if (user instanceof Response) return user;

  const path = `/products/${req.params.id}`;
  const headers = await signedHeadersFor(env.ADMIN_SECRET || env.INTERNAL_SECRET, "DELETE", path, "");
  
  const res = await callService("PRODUCTS_SERVICE", path, "DELETE", null, headers, user, env);
  return jsonRes(res.body, res.status);
});

router.get("/api/admin/orders", async (req, env) => {
  const user = await requireAdmin(req, env);
  if (user instanceof Response) return user;

  const res = await callService("ORDER_SERVICE", "/debug/list-orders", "GET", null, {}, user, env);
  return jsonRes(res.body, res.status);
});

router.put("/api/admin/orders/:orderId/status", async (req, env) => {
  const user = await requireAdmin(req, env);
  if (user instanceof Response) return user;

  const body = await req.json();
  const path = `/orders/${req.params.orderId}/status`;
  const headers = await signedHeadersFor(env.INTERNAL_SECRET, "PUT", path, body);
  
  const res = await callService("ORDER_SERVICE", path, "PUT", body, headers, user, env);
  return jsonRes(res.body, res.status);
});

router.post("/api/admin/inventory/update", async (req, env) => {
  const user = await requireAdmin(req, env);
  if (user instanceof Response) return user;

  const body = await req.json();
  const path = "/inventory/admin/update";
  const headers = await signedHeadersFor(env.INTERNAL_SECRET, "POST", path, body);
  
  const res = await callService("INVENTORY_SERVICE", path, "POST", body, headers, user, env);
  return jsonRes(res.body, res.status);
});

router.get("/api/admin/inventory/:productId", async (req, env) => {
  const user = await requireAdmin(req, env);
  if (user instanceof Response) return user;

  const res = await callService("INVENTORY_SERVICE", `/debug/product/${req.params.productId}`, "GET", null, {}, user, env);
  return jsonRes(res.body, res.status);
});

router.post("/api/admin/coupons", async (req, env) => {
  const user = await requireAdmin(req, env);
  if (user instanceof Response) return user;

  const body = await req.json();
  const { code, type, value, expiresAt, minCart } = body;

  if (!code || !type) {
    return jsonRes({ error: "missing_fields" }, 400);
  }

  try {
    await env.DISCOUNT_KV.put(
      `discount:${code}`,
      JSON.stringify({ type, value, expiresAt, minCart }),
      expiresAt ? { expirationTtl: Math.floor((expiresAt - Date.now()) / 1000) } : {}
    );
    return jsonRes({ ok: true, code });
  } catch (error) {
    return jsonRes({ error: "coupon_creation_failed", message: error.message }, 500);
  }
});

router.delete("/api/admin/coupons/:code", async (req, env) => {
  const user = await requireAdmin(req, env);
  if (user instanceof Response) return user;

  try {
    await env.DISCOUNT_KV.delete(`discount:${req.params.code}`);
    return jsonRes({ ok: true });
  } catch (error) {
    return jsonRes({ error: "coupon_deletion_failed", message: error.message }, 500);
  }
});

// Catch all
router.all("*", () => jsonRes({ error: "not_found" }, 404));

// EXPORT WITH TIMEOUT PROTECTION
export default {
  async fetch(req, env) {
    console.log("[GATEWAY] Request:", req.method, new URL(req.url).pathname);
    
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Gateway timeout")), 25000)
      );

      const responsePromise = router.fetch(req, env);
      const response = await Promise.race([responsePromise, timeoutPromise]);
      
      return response;
    } catch (error) {
      console.error("[GATEWAY] Fatal error:", error);
      return jsonRes({ 
        error: "gateway_timeout", 
        message: error.message 
      }, 504);
    }
  }
};