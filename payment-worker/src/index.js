// payment-worker/index.js - FINAL AUTH-INTEGRATED VERSION
import { Router } from "itty-router";

/* -------------------------
   HMAC / Signature helpers
--------------------------*/
async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret || ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a = "", b = "") {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySignature(req, secret, env) {
  const dev = req.headers.get("x-dev-mode");
  if (dev && env.DEV_SECRET && dev === env.DEV_SECRET) {
    console.log("[verifySignature] dev bypass used");
    return true;
  }
  if (!secret) return false;
  const ts = req.headers.get("x-timestamp");
  const sig = req.headers.get("x-signature");
  if (!ts || !sig) return false;
  const t = Number(ts);
  if (Number.isNaN(t)) return false;
  if (Math.abs(Date.now() - t) > 5 * 60 * 1000) return false;
  const url = new URL(req.url);
  const path = url.pathname + url.search;
  const body = ["GET", "HEAD"].includes(req.method) ? "" : await req.clone().text().catch(() => "");
  const msg = `${ts}|${req.method}|${path}|${body}`;
  const expected = await hmacHex(secret, msg);
  return constantTimeEqual(expected, sig);
}

/* -------------------------
   Service Call with HMAC
--------------------------*/
async function signedHeadersFor(secret, method, path, body = "") {
  const ts = Date.now().toString();
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  const msg = `${ts}|${method.toUpperCase()}|${path}|${bodyStr}`;
  const signature = await hmacHex(secret, msg);
  return { 
    "x-timestamp": ts, 
    "x-signature": signature, 
    "content-type": "application/json" 
  };
}

async function internalCall(serviceBinding, path, method = "POST", body = null, secret, userContext = null) {
  const bodyText = body ? JSON.stringify(body) : "";
  const headers = await signedHeadersFor(secret, method, path, bodyText);

  // Add user context if available
  if (userContext) {
    headers["x-user-id"] = userContext.userId;
    headers["x-user-role"] = userContext.role;
  }

  console.log(`[internalCall] Calling ${method} ${path}`);

  try {
    if (!serviceBinding) {
      console.error("[internalCall] Service binding is null/undefined");
      return { ok: false, status: 503, body: { error: "service_binding_not_configured" } };
    }

    if (typeof serviceBinding.fetch !== "function") {
      console.error("[internalCall] Service binding does not have fetch method");
      return { ok: false, status: 503, body: { error: "invalid_service_binding" } };
    }

    const req = new Request(`https://internal${path}`, { 
      method, 
      headers, 
      body: bodyText || undefined 
    });
    
    const res = await serviceBinding.fetch(req);
    const txt = await res.text();
    
    console.log(`[internalCall] Response: ${res.status}`, txt.substring(0, 200));
    
    try { 
      return { ok: res.ok, status: res.status, body: txt ? JSON.parse(txt) : null }; 
    } catch { 
      return { ok: res.ok, status: res.status, body: txt }; 
    }
  } catch (err) {
    console.error(`[internalCall] Error:`, err.message, err.stack);
    return { ok: false, status: 503, body: { error: "service_unavailable", message: String(err) } };
  }
}

/* -------------------------
   PayPal helpers
--------------------------*/
let _paypalTokenCache = { token: null, expiresAt: 0 };

async function getPaypalAccessToken(env) {
  const now = Date.now();
  if (_paypalTokenCache.token && _paypalTokenCache.expiresAt > now + 5000) {
    return _paypalTokenCache.token;
  }
  
  const clientId = env.PAYPAL_CLIENT_ID;
  const secret = env.PAYPAL_SECRET;
  const base = (env.PAYPAL_API || "").replace(/\/$/, "");
  const creds = btoa(`${clientId}:${secret}`);
  
  const res = await fetch(`${base}/v1/oauth2/token`, { 
    method: "POST", 
    headers: { 
      "Authorization": `Basic ${creds}`, 
      "Content-Type": "application/x-www-form-urlencoded" 
    }, 
    body: "grant_type=client_credentials" 
  });
  
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`paypal_token_error: ${res.status} ${txt}`);
  }
  
  const data = await res.json();
  const token = data.access_token;
  const expiresIn = Number(data.expires_in || 3600) * 1000;
  _paypalTokenCache = { token, expiresAt: Date.now() + expiresIn };
  
  return token;
}

/* -------------------------
   Extract User Context
--------------------------*/
function extractUserContext(req) {
  const userId = req.headers.get("x-user-id");
  const role = req.headers.get("x-user-role");
  if (!userId) return null;
  return { userId, role: role || 'user' };
}

/* -------------------------
   Router
--------------------------*/
const router = Router();
const CORS = { 
  "Access-Control-Allow-Origin": "*", 
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS", 
  "Access-Control-Allow-Headers": "Content-Type, X-Timestamp, X-Signature, X-Dev-Mode, X-User-Id, X-User-Role", 
  "Access-Control-Max-Age": "86400" 
};

router.options("*", () => new Response("OK", { headers: CORS }));

/* -------------------------
   CREATE PAYMENT ORDER
--------------------------*/
router.post("/payment/paypal/create", async (req, env) => {
  console.log("[PAYMENT.CREATE] Starting payment creation");
  
  const ok = await verifySignature(req, env.INTERNAL_SECRET, env);
  if (!ok) {
    console.log("[PAYMENT.CREATE] Signature verification failed");
    return new Response(
      JSON.stringify({ error: "unauthenticated" }), 
      { status: 401, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }

  const raw = await req.clone().text();
  const body = raw ? JSON.parse(raw) : {};
  const { reservationId, amount, currency = "USD", returnUrl, userId, metadata } = body;
  
  if (!reservationId || amount == null) {
    return new Response(
      JSON.stringify({ error: "missing_fields", required: ["reservationId", "amount"] }), 
      { status: 400, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }

  // Validate userId is present
  if (!userId) {
    console.log("[PAYMENT.CREATE] userId missing in request");
    return new Response(
      JSON.stringify({ error: "user_required", message: "Payment requires authenticated user" }), 
      { status: 400, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }

  try {
    const token = await getPaypalAccessToken(env);
    const base = (env.PAYPAL_API || "").replace(/\/$/, "");
    const formattedAmount = parseFloat(amount).toFixed(2);

    console.log("[PAYMENT.CREATE] Creating PayPal order for", { reservationId, amount: formattedAmount, userId });

    const createRes = await fetch(`${base}/v2/checkout/orders`, {
      method: "POST",
      headers: { 
        "Authorization": `Bearer ${token}`, 
        "Content-Type": "application/json", 
        "PayPal-Request-Id": reservationId 
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{ 
          amount: { 
            currency_code: currency, 
            value: formattedAmount 
          }, 
          custom_id: reservationId 
        }],
        application_context: { 
          return_url: returnUrl || env.BASE_RETURN_URL, 
          cancel_url: env.BASE_CANCEL_URL, 
          user_action: "PAY_NOW" 
        }
      })
    });

    const cr = await createRes.json();
    
    if (!createRes.ok) {
      console.error("[PAYMENT.CREATE] PayPal order creation failed", cr);
      return new Response(
        JSON.stringify({ error: "paypal_create_failed", details: cr }), 
        { status: 502, headers: { "Content-Type": "application/json", ...CORS } }
      );
    }

    const links = cr.links || [];
    const approve = (links.find(l => l.rel === "approve") || {}).href || null;
    const orderID = cr.id;

    console.log("[PAYMENT.CREATE] PayPal order created", { orderID, reservationId });

    // Store in KV
    if (env.PAYMENT_KV) {
      const paymentData = { 
        reservationId, 
        userId, 
        amount, 
        currency, 
        metadata, 
        paypalOrderId: orderID, 
        status: "pending", 
        createdAt: Date.now() 
      };
      await env.PAYMENT_KV.put(
        `payment:${orderID}`, 
        JSON.stringify(paymentData), 
        { expirationTtl: 3600 }
      );
      console.log("[PAYMENT.CREATE] Payment data stored in KV");
    }

    // Store in DB
    if (env.DB) {
      try {
        const paymentId = `pay_${crypto.randomUUID()}`;
        await env.DB.prepare(`
          INSERT INTO payments (
            payment_id, reservation_id, paypal_order_id, user_id, amount, currency, 
            status, metadata_json, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          paymentId, 
          reservationId, 
          orderID, 
          userId, 
          amount, 
          currency, 
          "pending", 
          JSON.stringify(metadata || {}), 
          Date.now(), 
          Date.now()
        ).run();
        console.log("[PAYMENT.CREATE] Payment record created in DB", { paymentId });
      } catch (dbErr) { 
        console.error("[PAYMENT.CREATE] DB insert failed", dbErr); 
      }
    }

    return new Response(
      JSON.stringify({ 
        paymentId: orderID,
        paypalOrderId: orderID, 
        approveUrl: approve, 
        raw: cr 
      }), 
      { headers: { "Content-Type": "application/json", ...CORS } }
    );
  } catch (err) {
    console.error("[PAYMENT.CREATE] Error", err);
    return new Response(
      JSON.stringify({ error: "server_error", message: String(err) }), 
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }
});

/* -------------------------
   CAPTURE PAYMENT
--------------------------*/
router.post("/payment/paypal/capture", async (req, env) => {
  console.log("[PAYMENT.CAPTURE] Starting capture process");
  
  const raw = await req.clone().text();
  const body = raw ? JSON.parse(raw) : {};
  const { paypalOrderId, reservationId } = body;
  
  console.log("[PAYMENT.CAPTURE] Request data:", { paypalOrderId, reservationId });
  
  if (!paypalOrderId || !reservationId) {
    return new Response(
      JSON.stringify({ error: "missing_fields", required: ["paypalOrderId", "reservationId"] }), 
      { status: 400, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }

  // Extract user context
  const userContext = extractUserContext(req);
  if (!userContext) {
    console.log("[PAYMENT.CAPTURE] User context missing");
    return new Response(
      JSON.stringify({ error: "user_required", message: "Capture requires authenticated user" }), 
      { status: 401, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }

  let capJson = null;
  let paymentData = null;

  try {
    // Fetch payment data
    if (env.PAYMENT_KV) {
      const stored = await env.PAYMENT_KV.get(`payment:${paypalOrderId}`);
      if (stored) paymentData = JSON.parse(stored);
    }
    
    if (!paymentData && env.DB) {
      try {
        const row = await env.DB.prepare(
          "SELECT * FROM payments WHERE paypal_order_id = ?"
        ).bind(paypalOrderId).first();
        
        if (row) {
          paymentData = { 
            reservationId: row.reservation_id, 
            userId: row.user_id, 
            amount: row.amount, 
            currency: row.currency, 
            metadata: JSON.parse(row.metadata_json || "{}") 
          };
        }
      } catch (dbErr) { 
        console.error("[PAYMENT.CAPTURE] DB lookup failed", dbErr); 
      }
    }
    
    if (!paymentData) {
      console.error("[PAYMENT.CAPTURE] Payment data not found");
      return new Response(
        JSON.stringify({ error: "payment_not_found" }), 
        { status: 404, headers: { "Content-Type": "application/json", ...CORS } }
      );
    }

    // Verify user owns this payment
    if (paymentData.userId !== userContext.userId) {
      console.error("[PAYMENT.CAPTURE] User mismatch", { 
        paymentUserId: paymentData.userId, 
        requestUserId: userContext.userId 
      });
      return new Response(
        JSON.stringify({ error: "forbidden", message: "Payment does not belong to user" }), 
        { status: 403, headers: { "Content-Type": "application/json", ...CORS } }
      );
    }

    console.log("[PAYMENT.CAPTURE] Payment data found", { 
      reservationId: paymentData.reservationId, 
      userId: paymentData.userId 
    });

    // Capture via PayPal
    const token = await getPaypalAccessToken(env);
    const base = (env.PAYPAL_API || "").replace(/\/$/, "");
    
    console.log("[PAYMENT.CAPTURE] Calling PayPal capture API");
    const capRes = await fetch(`${base}/v2/checkout/orders/${paypalOrderId}/capture`, { 
      method: "POST", 
      headers: { 
        "Authorization": `Bearer ${token}`, 
        "Content-Type": "application/json" 
      } 
    });

    capJson = await capRes.json();
    
    if (!capRes.ok) {
      console.error("[PAYMENT.CAPTURE] PayPal capture failed", capJson);
      
      // Release inventory on failure
      if (env.INVENTORY_SERVICE && env.INTERNAL_SECRET) {
        console.log("[PAYMENT.CAPTURE] Releasing inventory");
        try { 
          await internalCall(
            env.INVENTORY_SERVICE, 
            "/inventory/release", 
            "POST", 
            { reservationId }, 
            env.INTERNAL_SECRET
          ); 
        } catch (e) { 
          console.error("[PAYMENT.CAPTURE] Release failed", e); 
        }
      }
      
      return new Response(
        JSON.stringify({ error: "capture_failed", details: capJson }), 
        { status: 502, headers: { "Content-Type": "application/json", ...CORS } }
      );
    }

    // Verify capture in PayPal response
    const purchaseUnits = capJson.purchase_units || [];
    let captured = false;
    let captureId = null;
    
    for (const pu of purchaseUnits) {
      const captures = (pu.payments || {}).captures || [];
      for (const c of captures) {
        if (c.status && (c.status === "COMPLETED" || c.status === "PENDING")) { 
          captured = true; 
          captureId = c.id; 
          break; 
        }
      }
      if (captured) break;
    }
    
    if (!captured) {
      console.error("[PAYMENT.CAPTURE] No valid capture in PayPal response");
      
      // Release inventory
      if (env.INVENTORY_SERVICE && env.INTERNAL_SECRET) {
        console.log("[PAYMENT.CAPTURE] Releasing inventory");
        try { 
          await internalCall(
            env.INVENTORY_SERVICE, 
            "/inventory/release", 
            "POST", 
            { reservationId }, 
            env.INTERNAL_SECRET
          ); 
        } catch (e) { 
          console.error("[PAYMENT.CAPTURE] Release failed", e); 
        }
      }
      
      return new Response(
        JSON.stringify({ error: "not_captured", details: capJson }), 
        { status: 400, headers: { "Content-Type": "application/json", ...CORS } }
      );
    }

    console.log("[PAYMENT.CAPTURE] PayPal capture successful, captureId:", captureId);
    
    const orderId = `ord_${crypto.randomUUID()}`;

    // Commit inventory
    console.log("[PAYMENT.CAPTURE] Committing inventory");
    if (env.INVENTORY_SERVICE && env.INTERNAL_SECRET) {
      const invRes = await internalCall(
        env.INVENTORY_SERVICE, 
        "/inventory/commit", 
        "POST", 
        { reservationId }, 
        env.INTERNAL_SECRET,
        userContext
      );
      
      console.log("[PAYMENT.CAPTURE] Inventory commit response:", invRes);
      
      if (!invRes.ok) {
        console.error("[PAYMENT.CAPTURE] Inventory commit failed", invRes);
        
        // Store failed commit for manual resolution
        if (env.PAYMENT_KV) {
          await env.PAYMENT_KV.put(
            `failed:${paypalOrderId}`, 
            JSON.stringify({ 
              paypalOrderId, 
              reservationId, 
              captureId, 
              error: "inventory_commit_failed", 
              timestamp: Date.now(), 
              paymentData 
            }), 
            { expirationTtl: 86400 * 7 }
          );
        }
      } else {
        console.log("[PAYMENT.CAPTURE] Inventory committed successfully");
      }
    } else {
      console.warn("[PAYMENT.CAPTURE] INVENTORY_SERVICE binding or INTERNAL_SECRET not configured");
    }

    // Create order
    console.log("[PAYMENT.CAPTURE] Creating order");
    if (env.ORDER_SERVICE && env.INTERNAL_SECRET) {
      const orderPayload = { 
        reservationId, 
        orderId, 
        payment: { 
          provider: "paypal", 
          paypalOrderId, 
          captureId, 
          amount: paymentData.amount, 
          currency: paymentData.currency, 
          raw: capJson 
        }, 
        items: paymentData.metadata?.items || [], 
        address: paymentData.metadata?.address || null, 
        shipping: paymentData.metadata?.shippingMethod || null, 
        userId: paymentData.userId, 
        email: paymentData.metadata?.email || null 
      };
      
      const ordRes = await internalCall(
        env.ORDER_SERVICE, 
        "/orders/create", 
        "POST", 
        orderPayload, 
        env.INTERNAL_SECRET,
        userContext
      );
      
      console.log("[PAYMENT.CAPTURE] Order creation response:", ordRes);
      
      if (!ordRes.ok) {
        console.error("[PAYMENT.CAPTURE] Order creation failed", ordRes);
        
        // Store failed order for manual resolution
        if (env.PAYMENT_KV) {
          await env.PAYMENT_KV.put(
            `order_failed:${paypalOrderId}`, 
            JSON.stringify({ 
              paypalOrderId, 
              orderId, 
              reservationId, 
              captureId, 
              error: "order_creation_failed", 
              response: ordRes.body, 
              timestamp: Date.now(), 
              payload: orderPayload 
            }), 
            { expirationTtl: 86400 * 7 }
          );
        }
      } else {
        console.log("[PAYMENT.CAPTURE] Order created successfully");
      }
    } else {
      console.warn("[PAYMENT.CAPTURE] ORDER_SERVICE binding or INTERNAL_SECRET not configured");
    }

    // Update payment record
    if (env.DB) {
      try {
        await env.DB.prepare(
          "UPDATE payments SET status = 'captured', paypal_capture_id = ?, raw_paypal = ?, updated_at = ? WHERE paypal_order_id = ?"
        ).bind(captureId, JSON.stringify(capJson), Date.now(), paypalOrderId).run();
        
        console.log("[PAYMENT.CAPTURE] Payment record updated");
      } catch (dbErr) { 
        console.error("[PAYMENT.CAPTURE] DB update failed", dbErr); 
      }
    }

    // Clean up KV
    if (env.PAYMENT_KV) {
      await env.PAYMENT_KV.delete(`payment:${paypalOrderId}`);
    }

    console.log("[PAYMENT.CAPTURE] Capture process completed successfully");
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        orderId, 
        paypalOrderId, 
        captureId, 
        status: "captured", 
        raw: capJson 
      }), 
      { headers: { "Content-Type": "application/json", ...CORS } }
    );
  } catch (err) {
    console.error("[PAYMENT.CAPTURE] Error", err);
    
    // Release inventory on error
    if (env.INVENTORY_SERVICE && env.INTERNAL_SECRET) {
      console.log("[PAYMENT.CAPTURE] Releasing inventory due to error");
      try { 
        await internalCall(
          env.INVENTORY_SERVICE, 
          "/inventory/release", 
          "POST", 
          { reservationId }, 
          env.INTERNAL_SECRET
        ); 
      } catch (e) { 
        console.error("[PAYMENT.CAPTURE] Release failed", e); 
      }
    }
    
    return new Response(
      JSON.stringify({ error: "server_error", message: String(err) }), 
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }
});

/* -------------------------
   VERIFY PAYMENT
--------------------------*/
router.get("/payment/paypal/verify/:orderId", async (req, env) => {
  try {
    const token = await getPaypalAccessToken(env);
    const base = (env.PAYPAL_API || "").replace(/\/$/, "");
    const res = await fetch(`${base}/v2/checkout/orders/${req.params.orderId}`, { 
      method: "GET", 
      headers: { 
        "Authorization": `Bearer ${token}`, 
        "Content-Type": "application/json" 
      } 
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), { 
      status: res.status, 
      headers: { "Content-Type": "application/json", ...CORS } 
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "verify_failed", message: String(err) }), 
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }
});

router.get("/health", () => 
  new Response(JSON.stringify({ status: "ok", service: "payment-worker" }), { 
    headers: { "Content-Type": "application/json", ...CORS } 
  })
);

router.all("*", () => new Response("Not Found", { status: 404, headers: CORS }));

export default { fetch: (req, env) => router.fetch(req, env) };