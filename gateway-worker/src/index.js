  import { Router as GatewayRouter } from "itty-router";

  function getCartStubGateway(env, cartId) {
    try {
      const id = env.CART_DO.idFromName(cartId);
      return env.CART_DO.get(id);
    } catch (e) {
      return null;
    }
  }

  async function fetchDOGateway(stub, path, init = {}) {
    if (!stub) return { ok: false, status: 500, body: { error: 'cart_do_unavailable' } };
    const res = await stub.fetch("https://cart" + path, init);
    if (!res) return { ok: false, status: 502, body: { error: 'cart_do_no_response' } };
    const txt = await res.text();
    try { return { ok: res.ok, status: res.status, body: txt ? JSON.parse(txt) : null }; } catch { return { ok: res.ok, status: res.status, body: txt }; }
  }

  async function callServiceGateway(url, path, method = 'GET', body = null) {
    try {
      if (!url) {
        console.error("Service URL not configured");
        return { ok: false, status: 500, body: { error: "Service URL not configured" } };
      }
      const fullUrl = url.replace(/\/$/, '') + path;
      console.log("Calling service URL:", fullUrl);
      const bodyText = body ? JSON.stringify(body) : '';
      const headers = { 'Content-Type': 'application/json', 'x-test-mode': 'true' };
      const res = await fetch(fullUrl, { method, headers, body: bodyText || undefined });
      const txt = await res.text();
      console.log("Service response status:", res.status);
      console.log("Service response text (first 500 chars):", txt.substring(0, 500));
      
      // Check if response is an error
      if (!res.ok) {
        console.error("Service returned error:", res.status, txt);
        try {
          const errorBody = txt ? JSON.parse(txt) : { error: txt || "Unknown error" };
          return { ok: false, status: res.status, body: errorBody };
        } catch {
          return { ok: false, status: res.status, body: { error: txt || "Unknown error" } };
        }
      }
      
      try { 
        const parsed = txt ? JSON.parse(txt) : null;
        return { ok: true, status: res.status, body: parsed }; 
      } catch (parseError) { 
        console.error("Parse error:", parseError, "Response text:", txt.substring(0, 200));
        return { ok: false, status: 500, body: { error: "Failed to parse response", details: txt.substring(0, 200) } }; 
      }
    } catch (error) {
      console.error("Service call error:", error);
      return { ok: false, status: 500, body: { error: error.message || "Service unavailable" } };
    }
  }

  const gatewayRouter = GatewayRouter();

  gatewayRouter.options('*', () => new Response('OK', { headers: { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-Test-Mode' } }));

  // Products
  gatewayRouter.get("/api/products", async (req, env) => {
    try {
      const url = new URL(req.url);
      const limit = url.searchParams.get("limit") || "20";
      const offset = url.searchParams.get("offset") || "0";
      const res = await callServiceGateway(env.PRODUCTS_SERVICE_URL, `/products?limit=${limit}&offset=${offset}`);
      if (!res.ok) {
        console.error("Product service error:", res.body);
        return new Response(JSON.stringify({ error: res.body || "Service error" }), { 
          status: res.status || 500, 
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
      return new Response(JSON.stringify(res.body), { 
        status: res.status, 
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    } catch (error) {
      console.error("Gateway error:", error);
      return new Response(JSON.stringify({ error: error.message || "Internal error" }), { 
        status: 500, 
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
  });

  gatewayRouter.get("/api/products/:id", async (req, env) => {
    const { id } = req.params;
    const res = await callServiceGateway(env.PRODUCTS_SERVICE_URL, `/products/${id}`);
    return new Response(JSON.stringify(res.body), { status: res.status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }});
  });

  // Cart
  gatewayRouter.post("/api/cart/init", async (request, env) => {
    const body = await request.json().catch(() => ({}));
    const cartId = body.cartId || `cart_${crypto.randomUUID()}`;
    const stub = getCartStubGateway(env, cartId);
    const res = await fetchDOGateway(stub, "/cart/init", { method: "POST" });
    return new Response(JSON.stringify({ cartId, ...res.body }), { status: res.status, headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" }});
  });

  gatewayRouter.get("/api/cart/:cartId", async (request, env) => {
    const { cartId } = request.params;
    const stub = getCartStubGateway(env, cartId);
    const res = await fetchDOGateway(stub, "/cart/summary");
    return new Response(JSON.stringify(res.body), { status: res.status, headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" }});
  });

  gatewayRouter.post("/api/cart/:cartId/add", async (request, env) => {
    const { cartId } = request.params;
    const body = await request.json();
    const stub = getCartStubGateway(env, cartId);
    const res = await fetchDOGateway(stub, "/cart/add", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type":"application/json" } });
    return new Response(JSON.stringify(res.body), { status: res.status, headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" }});
  });

  gatewayRouter.post("/api/cart/:cartId/update", async (request, env) => {
    const { cartId } = request.params;
    const body = await request.json();
    const stub = getCartStubGateway(env, cartId);
    const res = await fetchDOGateway(stub, "/cart/update", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type":"application/json" } });
    return new Response(JSON.stringify(res.body), { status: res.status, headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" }});
  });

  gatewayRouter.post("/api/cart/:cartId/remove", async (request, env) => {
    const { cartId } = request.params;
    const body = await request.json();
    const stub = getCartStubGateway(env, cartId);
    const res = await fetchDOGateway(stub, "/cart/remove", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type":"application/json" } });
    return new Response(JSON.stringify(res.body), { status: res.status, headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" }});
  });

  gatewayRouter.post("/api/cart/:cartId/address", async (request, env) => {
    const { cartId } = request.params;
    const body = await request.json();
    const stub = getCartStubGateway(env, cartId);
    const res = await fetchDOGateway(stub, "/cart/address", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type":"application/json" } });
    return new Response(JSON.stringify(res.body), { status: res.status, headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" }});
  });

  gatewayRouter.get("/api/cart/:cartId/shipping-options", async (request, env) => {
    const { cartId } = request.params;
    const stub = getCartStubGateway(env, cartId);

    const res = await fetchDOGateway(stub, "/cart/shipping-options", {
      method: "GET"
    });

    return new Response(JSON.stringify(res.body), {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  });

  gatewayRouter.post("/api/cart/:cartId/shipping", async (request, env) => {
    const { cartId } = request.params;
    const body = await request.json();

    const stub = getCartStubGateway(env, cartId);

    const res = await fetchDOGateway(stub, "/cart/shipping", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    });

    return new Response(JSON.stringify(res.body), {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  });


  gatewayRouter.post("/api/checkout/start", async (request, env) => {
    const body = await request.json();
    const { cartId } = body;
    if (!cartId) return new Response(JSON.stringify({ error: "cartId_required" }), { status: 400, headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" }});
    const stub = getCartStubGateway(env, cartId);
    const res = await fetchDOGateway(stub, "/checkout/start", { method: "POST" });
    return new Response(JSON.stringify(res.body), { status: res.status, headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" }});
  });

  gatewayRouter.post("/api/checkout/capture", async (request, env) => {
    const body = await request.json();
    console.log("PAYMENT_SERVICE_URL =", env.PAYMENT_SERVICE_URL);
    const res = await callServiceGateway(env.PAYMENT_SERVICE_URL, "/payment/mock/capture", "POST", body);
    return new Response(JSON.stringify(res.body), { status: res.status, headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" }});
  });

  // Orders p
  gatewayRouter.get("/api/orders/:orderId", async (request, env) => {
    const { orderId } = request.params;
    const res = await callServiceGateway(env.ORDER_SERVICE_URL, `/orders/${orderId}`);
    return new Response(JSON.stringify(res.body), { status: res.status, headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" }});
  });

  gatewayRouter.get("/api/health", () => new Response(JSON.stringify({ status: "ok", service: "api-gateway", timestamp: Date.now() }), { headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" } }));

  gatewayRouter.all("*", () => new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" } }));

  export default { fetch: (req, env) => gatewayRouter.fetch(req, env) };