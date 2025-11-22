// mock-payment-worker.js (with extensive debugging)
import { Router } from "itty-router";

/* HMAC helpers */
async function hmacSHA256Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function signedHeadersFor(secret, method, path, body = '') {
  const ts = Date.now().toString();
  const bodyText = typeof body === 'string' ? body : JSON.stringify(body || {});
  const msg = `${ts}|${method.toUpperCase()}|${path}|${bodyText}`;
  const signature = await hmacSHA256Hex(secret, msg);
  return { 'x-timestamp': ts, 'x-signature': signature, 'content-type': 'application/json' };
}

async function internalCall(url, path, method, body, secret) {
  console.log(`[internalCall] Starting call to ${path}`);
  console.log(`[internalCall] URL: ${url}`);
  console.log(`[internalCall] Method: ${method}`);
  console.log(`[internalCall] Body:`, JSON.stringify(body));
  
  if (!url) {
    console.error('[internalCall] URL not configured!');
    return { ok: false, status: 503, body: { error: 'service_not_configured' } };
  }
  
  const full = url.replace(/\/$/, '') + path;
  console.log(`[internalCall] Full URL: ${full}`);
  
  const bodyText = body ? JSON.stringify(body) : '';
  const headers = secret 
    ? await signedHeadersFor(secret, method, new URL(full).pathname + new URL(full).search, bodyText)
    : { 'Content-Type': 'application/json' };

  headers["x-test-mode"] = "true";
  
  console.log(`[internalCall] Headers:`, JSON.stringify(headers));

  try {
    console.log(`[internalCall] Making fetch request...`);
    const res = await fetch(full, { method, headers, body: bodyText || undefined });
    console.log(`[internalCall] Response status: ${res.status}`);
    
    const txt = await res.text();
    console.log(`[internalCall] Response text:`, txt);
    
    try { 
      const parsed = txt ? JSON.parse(txt) : null;
      console.log(`[internalCall] Parsed response:`, JSON.stringify(parsed));
      return { ok: res.ok, status: res.status, body: parsed }; 
    } catch { 
      console.log(`[internalCall] Could not parse as JSON, returning as text`);
      return { ok: res.ok, status: res.status, body: txt }; 
    }
  } catch (err) {
    console.error(`[internalCall] Fetch error:`, err.message);
    return { ok: false, status: 503, body: { error: 'service_unavailable', message: String(err) } };
  }
}

/* helpers */
function nowMs() { return Date.now(); }
function nowSec() { return Math.floor(Date.now()/1000); }

const router = Router();

router.options('*', () => new Response("OK", { headers: { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Methods":"GET, POST, OPTIONS", "Access-Control-Allow-Headers":"Content-Type, X-Timestamp, X-Signature, X-Test-Mode" } }));

/**
 * POST /payment/mock/create
 * INTERNAL only (signed)
 * body: { reservationId, amount, currency, metadata }
 */
router.post('/payment/mock/create', async (req, env) => {
  console.log('[CREATE] Payment creation started');
  
  const ok = await (async () => {
    const ts = req.headers.get('x-timestamp');
    const sig = req.headers.get('x-signature');
    if (!env.INTERNAL_SECRET) return false;
    if (!ts || !sig) return false;
    if (Math.abs(Date.now() - Number(ts)) > 5*60*1000) return false;
    const url = new URL(req.url);
    const body = ["GET","HEAD"].includes(req.method) ? "" : await req.clone().text();
    const msg = `${ts}|${req.method}|${url.pathname + url.search}|${body}`;
    const expected = await hmacSHA256Hex(env.INTERNAL_SECRET, msg);
    return expected === sig;
  })();

  if (!ok) {
    console.log('[CREATE] Authentication failed');
    return new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const body = await req.json().catch(() => ({}));
  const { reservationId, amount, currency = 'USD', metadata = {} } = body;
  
  console.log('[CREATE] Payment data:', { reservationId, amount, currency });
  
  if (!reservationId || amount == null) {
    console.log('[CREATE] Missing required fields');
    return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400, headers: { 'Content-Type':'application/json' } });
  }

  const paymentId = `mockpay_${crypto.randomUUID()}`;
  const createdAt = nowMs();

  const paymentRecord = {
    paymentId,
    reservationId,
    amount,
    currency,
    status: 'pending',
    createdAt,
    metadata
  };

  console.log('[CREATE] Payment record:', paymentRecord);

  // store in KV for quick lookup
  if (env.PAYMENT_KV) {
    console.log('[CREATE] Storing in KV...');
    await env.PAYMENT_KV.put(`payment:${paymentId}`, JSON.stringify(paymentRecord), { expirationTtl: 60 * 60 * 24 });
  } else {
    console.log('[CREATE] PAYMENT_KV not available');
  }

  // optionally persist in DB
  if (env.DB) {
    console.log('[CREATE] Storing in DB...');
    try {
      await env.DB.prepare(`INSERT INTO payments (payment_id, reservation_id, provider, provider_order_id, amount, currency, status, raw_provider, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(paymentId, reservationId, 'mock', paymentId, amount, currency, 'pending', JSON.stringify(paymentRecord), nowMs(), nowMs())
        .run();
      console.log('[CREATE] DB insert successful');
    } catch (e) { 
      console.error('[CREATE] DB insert failed:', e.message, 'Code:', e.cause?.code); 
    }
  } else {
    console.log('[CREATE] DB not available');
  }

  const approveUrl = `${env.BASE_URL || ''}/simulate-payment?paymentId=${paymentId}`;
  console.log('[CREATE] Payment created successfully:', paymentId);

  return new Response(JSON.stringify({ paymentId, approveUrl }), { headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" }});
});

/**
 * POST /payment/mock/capture
 * public (simulate success/failure)
 */
router.post('/payment/mock/capture', async (req, env) => {
  console.log('=== CAPTURE STARTED ===');
  
  const body = await req.json().catch(() => ({}));
  const { paymentId, reservationId, simulate = 'success', userId = null, email = null } = body;
  
  console.log('[CAPTURE] Input:', { paymentId, reservationId, simulate, userId, email });
  
  if (!paymentId || !reservationId) {
    console.log('[CAPTURE] Missing required fields');
    return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400, headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' } });
  }

  // Check environment variables
  console.log('[CAPTURE] Environment check:');
  console.log('  - ORDER_SERVICE_URL:', env.ORDER_SERVICE_URL || 'NOT SET');
  console.log('  - INVENTORY_SERVICE_URL:', env.INVENTORY_SERVICE_URL || 'NOT SET');
  console.log('  - INTERNAL_SECRET:', env.INTERNAL_SECRET ? 'SET' : 'NOT SET');
  console.log('  - DB:', env.DB ? 'SET' : 'NOT SET');
  console.log('  - PAYMENT_KV:', env.PAYMENT_KV ? 'SET' : 'NOT SET');

  // load payment info
  let payment = null;
  if (env.PAYMENT_KV) {
    console.log('[CAPTURE] Looking up payment in KV...');
    const raw = await env.PAYMENT_KV.get(`payment:${paymentId}`);
    if (raw) {
      payment = JSON.parse(raw);
      console.log('[CAPTURE] Payment found in KV:', payment);
    } else {
      console.log('[CAPTURE] Payment not found in KV');
    }
  }
  
  if (!payment && env.DB) {
    console.log('[CAPTURE] Looking up payment in DB...');
    try {
      const row = await env.DB.prepare("SELECT * FROM payments WHERE payment_id = ?").bind(paymentId).first();
      if (row) {
        payment = { 
          paymentId: row.payment_id, 
          reservationId: row.reservation_id, 
          amount: row.amount, 
          currency: row.currency, 
          status: row.status, 
          metadata: row.raw_provider ? JSON.parse(row.raw_provider).metadata : {}
        };
        console.log('[CAPTURE] Payment found in DB:', payment);
      } else {
        console.log('[CAPTURE] Payment not found in DB');
      }
    } catch (e) { 
      console.error('[CAPTURE] DB lookup failed:', e.message); 
    }
  }
  
  if (!payment) {
    console.log('[CAPTURE] Using default payment object');
    payment = { paymentId, reservationId, status: 'pending', metadata: {} };
  }

  if (simulate === 'success') {
    console.log('[CAPTURE] === SIMULATING SUCCESS ===');
    
    // commit inventory
    let invRes = { ok: false };
    if (env.INVENTORY_SERVICE_URL && env.INTERNAL_SECRET) {
      console.log('[CAPTURE] Calling inventory service to commit...');
      invRes = await internalCall(env.INVENTORY_SERVICE_URL, "/inventory/commit", "POST", { reservationId }, env.INTERNAL_SECRET);
      console.log('[CAPTURE] Inventory commit result:', invRes);
    } else {
      console.log('[CAPTURE] Skipping inventory commit (service not configured)');
    }

    // create order
    const orderId = `ord_${crypto.randomUUID()}`;
    console.log('[CAPTURE] Generated orderId:', orderId);
    
    let createOrderRes = { ok: false };
    if (env.ORDER_SERVICE_URL && env.INTERNAL_SECRET) {
      console.log('[CAPTURE] Preparing order payload...');
      const orderPayload = {
        reservationId,
        orderId,
        payment: { 
          provider: 'mock', 
          paymentId, 
          status: 'captured', 
          amount: payment.amount, 
          currency: payment.currency 
        },
        userId,
        email,
        items: payment.metadata?.items || null,
        address: payment.metadata?.address || null,
        shipping: payment.metadata?.shippingMethod || null
      };
      console.log('[CAPTURE] Order payload:', JSON.stringify(orderPayload, null, 2));
      
      console.log('[CAPTURE] Calling order service...');
      createOrderRes = await internalCall(env.ORDER_SERVICE_URL, "/orders/create", "POST", orderPayload, env.INTERNAL_SECRET);
      console.log('[CAPTURE] Order creation result:', JSON.stringify(createOrderRes, null, 2));
      
      if (!createOrderRes.ok) {
        console.error('[CAPTURE] ❌ ORDER CREATION FAILED!');
        console.error('[CAPTURE] Status:', createOrderRes.status);
        console.error('[CAPTURE] Body:', createOrderRes.body);
      } else {
        console.log('[CAPTURE] ✅ Order created successfully');
      }
    } else {
      console.log('[CAPTURE] Cannot create order - ORDER_SERVICE_URL or INTERNAL_SECRET not set');
    }

    // update payment state
    const now = nowMs();
    if (env.PAYMENT_KV) {
      console.log('[CAPTURE] Updating payment status in KV...');
      await env.PAYMENT_KV.put(`payment:${paymentId}`, JSON.stringify({ ...payment, status: 'captured', captureAt: now, orderId }), { expirationTtl: 60*60*24*7 });
    }
    
    if (env.DB) {
      console.log('[CAPTURE] Updating payment status in DB...');
      try {
        await env.DB.prepare("UPDATE payments SET status = ?, provider_capture_id = ?, raw_provider = ?, updated_at = ? WHERE payment_id = ?")
          .bind('captured', `cap_${crypto.randomUUID()}`, JSON.stringify({ simulated: true }), now, paymentId).run();
        console.log('[CAPTURE] DB update successful');
      } catch (e) { 
        console.error('[CAPTURE] DB update failed:', e.message); 
      }
    }

    console.log('[CAPTURE] === CAPTURE COMPLETE ===');
    
    return new Response(JSON.stringify({
      ok: true,
      result: 'captured',
      orderCreated: createOrderRes.ok,
      orderResponse: createOrderRes.body,
      inventoryCommitted: invRes.ok,
      orderId
    }), { headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" }});
    
  } else {
    console.log('[CAPTURE] === SIMULATING FAILURE ===');
    
    // failure simulation -> release inventory
    let invRel = { ok: false };
    if (env.INVENTORY_SERVICE_URL && env.INTERNAL_SECRET) {
      console.log('[CAPTURE] Releasing inventory...');
      invRel = await internalCall(env.INVENTORY_SERVICE_URL, "/inventory/release", "POST", { reservationId }, env.INTERNAL_SECRET);
      console.log('[CAPTURE] Inventory release result:', invRel);
    }

    // update payment state -> failed
    const now = nowMs();
    if (env.PAYMENT_KV) {
      await env.PAYMENT_KV.put(`payment:${paymentId}`, JSON.stringify({ ...payment, status: 'failed', failedAt: now }), { expirationTtl: 60*60*24 });
    }
    if (env.DB) {
      try {
        await env.DB.prepare("UPDATE payments SET status = ?, raw_provider = ?, updated_at = ? WHERE payment_id = ?")
          .bind('failed', JSON.stringify({ simulated: true }), now, paymentId).run();
      } catch (e) { 
        console.error('[CAPTURE] DB update failed:', e.message); 
      }
    }

    console.log('[CAPTURE] === FAILURE SIMULATION COMPLETE ===');

    return new Response(JSON.stringify({ ok: false, result: 'failed', inventoryReleased: invRel.ok }), { status: 200, headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" }});
  }
});

router.get('/health', () => new Response(JSON.stringify({ status: 'ok', service: 'mock-payment', timestamp: Date.now() }), { headers: { "Content-Type":"application/json", "Access-Control-Allow-Origin":"*" } }));

router.all('*', () => new Response('Not Found', { status: 404 }));

export default { fetch: (req, env) => router.fetch(req, env) };