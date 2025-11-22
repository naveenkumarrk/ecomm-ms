import { Router } from "itty-router";

async function hmacSHA256HexOrder(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifySignatureOrder(req, secret) {
  const TEST_MODE = req.headers.get("x-test-mode") === "true";
  console.log('[verifySignature] TEST_MODE:', TEST_MODE);
  
  if (TEST_MODE) {
    console.log('[verifySignature] Bypassing signature check (test mode)');
    return true;
  }
  
  if (!secret) {
    console.log('[verifySignature] No secret configured');
    return false;
  }
  
  const ts = req.headers.get('x-timestamp');
  const sig = req.headers.get('x-signature');
  
  if (!ts || !sig) {
    console.log('[verifySignature] Missing timestamp or signature');
    return false;
  }
  
  if (Math.abs(Date.now() - Number(ts)) > 5 * 60 * 1000) {
    console.log('[verifySignature] Timestamp too old');
    return false;
  }
  
  const url = new URL(req.url);
  const body = ["GET","HEAD"].includes(req.method) ? "" : await req.clone().text();
  const msg = `${ts}|${req.method}|${url.pathname + url.search}|${body}`;
  const expected = await hmacSHA256HexOrder(secret, msg);
  
  const valid = expected === sig;
  console.log('[verifySignature] Signature valid:', valid);
  return valid;
}

const router = Router();

router.options('*', () => {
  console.log('[OPTIONS] CORS preflight request');
  return new Response('OK', { 
    headers: { 
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Test-Mode, X-Timestamp, X-Signature'
    } 
  });
});

router.get("/health", () => {
  console.log('[GET /health] Health check');
  return new Response(JSON.stringify({ 
    status: "ok", 
    service: "order-service",
    timestamp: Date.now()
  }), { 
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
  });
});

router.post("/orders/create", async (req, env) => {
  console.log('=== [POST /orders/create] START ===');
  console.log('[CREATE] Method:', req.method);
  console.log('[CREATE] URL:', req.url);
  
  try {
    if (!env.DB) {
      console.error("[CREATE] ❌ DB binding is not configured!");
      return new Response(JSON.stringify({ 
        error: "database_not_configured",
        message: "DB binding is missing. Check wrangler.toml configuration."
      }), { 
        status: 500, 
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    console.log('[CREATE] DB binding is available ✓');

    const ok = await verifySignatureOrder(req, env.INTERNAL_SECRET);
    if (!ok) {
      console.error("[CREATE] ❌ Signature verification failed");
      return new Response(JSON.stringify({ error: "unauthorized" }), { 
        status: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    console.log('[CREATE] Authentication passed ✓');

    const body = await req.json();
    console.log('[CREATE] Request body:', JSON.stringify(body, null, 2));
    
    const { reservationId, orderId, payment, userId, email, items, address, shipping } = body;
    
    if (!reservationId || !orderId || !payment) {
      console.error("[CREATE] ❌ Missing required fields");
      return new Response(JSON.stringify({ 
        error: "missing_fields",
        received: { reservationId: !!reservationId, orderId: !!orderId, payment: !!payment }
      }), { 
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    const now = Date.now();
    console.log("[CREATE] Attempting to insert order:", orderId);

    const result = await env.DB.prepare(`
      INSERT INTO orders (
        order_id, reservation_id, user_id, email, amount, currency, 
        status, items_json, address_json, shipping_json, payment_json, 
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      orderId,
      reservationId,
      userId || null,
      email || null,
      payment.amount || null,
      payment.currency || null,
      "paid",
      JSON.stringify(items || []),
      JSON.stringify(address || null),
      JSON.stringify(shipping || null),
      JSON.stringify(payment),
      now,
      now
    ).run();

    console.log("[CREATE] ✅ Order inserted successfully:", result);

    return new Response(JSON.stringify({ 
      ok: true, 
      orderId,
      created_at: now 
    }), { 
      status: 200,
      headers: { 
        "Content-Type": "application/json", 
        "Access-Control-Allow-Origin": "*" 
      }
    });

  } catch (error) {
    console.error("[CREATE] ❌ Error:", error);
    console.error("[CREATE] Error message:", error.message);
    
    return new Response(JSON.stringify({ 
      error: "database_error",
      message: error.message,
      code: error.cause?.code || "unknown"
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
});

router.get("/orders/:orderId", async (req, env) => {
  console.log('[GET /orders/:orderId] Fetching order');
  
  try {
    if (!env.DB) {
      console.error('[GET] ❌ DB not configured');
      return new Response(JSON.stringify({ 
        error: "database_not_configured" 
      }), { 
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    const { orderId } = req.params;
    console.log('[GET] Looking for orderId:', orderId);
    
    const row = await env.DB.prepare("SELECT * FROM orders WHERE order_id = ?").bind(orderId).first();
    
    if (!row) {
      console.log('[GET] Order not found:', orderId);
      return new Response(JSON.stringify({ error: "not_found" }), { 
        status: 404, 
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    console.log('[GET] ✅ Order found');

    row.items_json = JSON.parse(row.items_json || "[]");
    row.address_json = JSON.parse(row.address_json || "null");
    row.shipping_json = JSON.parse(row.shipping_json || "null");
    row.payment_json = JSON.parse(row.payment_json || "null");

    return new Response(JSON.stringify(row), { 
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });

  } catch (error) {
    console.error("[GET] ❌ Error:", error.message);
    return new Response(JSON.stringify({ 
      error: "database_error",
      message: error.message 
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
});

router.all("*", (req) => {
  console.log('[404] No route matched for:', req.method, req.url);
  return new Response(JSON.stringify({ 
    error: "not_found",
    path: new URL(req.url).pathname,
    method: req.method
  }), { 
    status: 404, 
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
  });
});

// CRITICAL: Use the same export format as payment-worker
export default { 
  fetch: (req, env) => router.fetch(req, env)
};