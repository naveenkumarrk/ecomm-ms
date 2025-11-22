// fulfillment-worker.js (updated - full file)
// Handles shipping option calculation, allocation and shipping endpoints.
// - 3 shipping methods: standard, express, priority
// - free standard shipping threshold
// - weight surcharge
// - coupon-based shipping discounts
// - preserves auth / TEST_MODE logic

import { Router } from 'itty-router';

// ---------- Helpers ----------
function nowSec() { return Math.floor(Date.now() / 1000); }
function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Timestamp, X-Signature, X-Test-Mode",
    ...extra
  };
}

// HMAC helpers (Web Crypto)
async function hmacSHA256Hex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function verifySignature(request, secret, maxSkewMs = 5 * 60 * 1000) {
  if (!secret) return false;
  const TEST_MODE = request.headers.get('x-test-mode') === 'true';
  if (TEST_MODE) return true;

  const ts = request.headers.get('x-timestamp');
  const sig = request.headers.get('x-signature');
  if (!ts || !sig) return false;
  const t = Number(ts);
  if (Number.isNaN(t)) return false;
  if (Math.abs(Date.now() - t) > maxSkewMs) return false;
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  const path = url.pathname + url.search;
  let bodyText = '';
  if (method !== 'GET' && method !== 'HEAD') {
    try { bodyText = await request.clone().text(); } catch {}
  }
  const msg = `${ts}|${method}|${path}|${bodyText}`;
  const expected = await hmacSHA256Hex(secret, msg);
  // constant-time-ish compare
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

// ---------- Small utilities ----------
const DEFAULT_STANDARD_RATE = 40;
const DEFAULT_EXPRESS_RATE = 90;
const DEFAULT_PRIORITY_RATE = 150;
const DEFAULT_FREE_MIN = 1000;        // default free shipping threshold (₹1000)
const DEFAULT_EXPRESS_DISCOUNT_MIN = 2500; // optional express discount threshold
const DEFAULT_EXPRESS_DISCOUNT_PERCENT = 20; // default express discount % when threshold met

function formatDateDaysFromNow(days) {
  const d = new Date(Date.now() + days * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

// ---------- DB helpers ----------
async function fetchWarehouses(env) {
  try {
    const res = await env.DB.prepare("SELECT * FROM warehouses ORDER BY priority ASC").all();
    return (res && res.results) ? res.results.map(r => ({
      warehouseId: r.warehouse_id,
      name: r.name,
      zone: r.zone,
      pincode: r.pincode,
      handlingHours: r.handling_hours,
      cutoffHour: r.cutoff_hour,
      priority: r.priority
    })) : [];
  } catch (e) {
    console.error('fetchWarehouses error', e);
    return [];
  }
}

async function getPincodeZone(env, pincode) {
  if (!pincode) return null;
  try {
    const raw = await env.PINCODE_KV.get(`pincode:${pincode}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.zone || null;
  } catch (e) {
    console.error('getPincodeZone error', e);
    return null;
  }
}

// ---------- Router ----------
const router = Router();

// handle CORS preflight
router.options('*', () => new Response('OK', { headers: corsHeaders() }));

/**
 * POST /fulfillment/get-options
 * Request body:
 * {
 *   items: [{ productId, variantId, qty, unitPrice, attributes: { weight } }],
 *   address: { pincode, city, ... },
 *   couponCode?: string,
 *   subtotal?: number
 * }
 *
 * Response:
 * { shippingOptions: [ { methodId, title, cost, eta, transitDays, warehouseId } ], subtotalWeight, discountApplied }
 */
router.post('/fulfillment/get-options', async (req, env) => {
  const TEST_MODE = env.TEST_MODE === '1' || env.TEST_MODE === 'true';
  if (!TEST_MODE) {
    const ok = await verifySignature(req, env.INTERNAL_SECRET);
    if (!ok) return new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401, headers: corsHeaders({ 'Content-Type': 'application/json' }) });
  }

  const body = await req.json().catch(() => ({}));
  const { items = [], address = {}, couponCode = null, subtotal = 0 } = body;

  if (!items || items.length === 0) {
    return new Response(JSON.stringify({ error: 'items_required' }), { status: 400, headers: corsHeaders({ 'Content-Type': 'application/json' }) });
  }

  // compute total weight (kg) — fallback to 0.5 kg minimum
  let totalWeight = 0;
  for (const it of items) {
    const qty = Number(it.qty || 1);
    const w = Number((it.attributes && it.attributes.weight) || it.weight || 0);
    totalWeight += Math.max(0, w) * qty;
  }
  if (totalWeight <= 0) totalWeight = 0.5;

  // rates from env or defaults
  const STANDARD_RATE = Number(env.STANDARD_RATE || DEFAULT_STANDARD_RATE);
  const EXPRESS_RATE = Number(env.EXPRESS_RATE || DEFAULT_EXPRESS_RATE);
  const PRIORITY_RATE = Number(env.PRIORITY_RATE || DEFAULT_PRIORITY_RATE);
  const FREE_MIN = Number(env.FREE_SHIPPING_MIN || DEFAULT_FREE_MIN);

  // express discount config (optional)
  const EXPRESS_DISCOUNT_MIN = Number(env.EXPRESS_DISCOUNT_MIN || DEFAULT_EXPRESS_DISCOUNT_MIN);
  const EXPRESS_DISCOUNT_PERCENT = Number(env.EXPRESS_DISCOUNT_PERCENT || DEFAULT_EXPRESS_DISCOUNT_PERCENT);

  // find zone from PINCODE_KV
  const pincode = (address && (address.pincode || address.postal || address.zip)) || null;
  const zone = await getPincodeZone(env, pincode) || 'OTHER';

  // choose a warehouse: try to find warehouse in same zone, else first warehouse
  const warehouses = await fetchWarehouses(env);
  let chosenWarehouse = warehouses.find(w => (w.zone || '').toUpperCase() === (zone || '').toUpperCase());
  if (!chosenWarehouse) chosenWarehouse = warehouses[0] || null;

  // transitDays mapping per zone (simple)
  const zoneTransit = {
    MUM: 1, DEL: 2, CHN: 2, BLR: 1, OTHER: 3
  };
  const baseDays = zoneTransit[zone] || zoneTransit['OTHER'];

  // compute transit days based on handling + baseDays
  const handlingDays = chosenWarehouse ? Math.ceil((chosenWarehouse.handlingHours || 24) / 24) : 1;
  const transitDays = handlingDays + baseDays;

  const stdEta = formatDateDaysFromNow(transitDays);
  const exprDays = Math.max(1, Math.floor(transitDays / 2));
  const expEta = formatDateDaysFromNow(exprDays);

  // base cost: apply weight surcharge
  const weightSurcharge = Math.max(0, Math.round((totalWeight - 1) * 10)); // small per-kg add
  let standardCost = Math.max(0, STANDARD_RATE + weightSurcharge);
  let expressCost  = Math.max(0, EXPRESS_RATE  + Math.round(weightSurcharge * 1.5));
  let priorityCost = Math.max(0, PRIORITY_RATE + Math.round(weightSurcharge * 2.0));

  // discountApplied object will describe what discount was applied (if any)
  let discountApplied = null;

  // ===== FREE SHIPPING / THRESHOLD RULES =====
  // If subtotal >= FREE_MIN -> free standard, optional express discount, priority not free by default
  if ((subtotal || 0) >= FREE_MIN) {
    standardCost = 0;
    // apply express discount (configurable percent)
    expressCost = Math.max(0, Math.round(expressCost * (1 - EXPRESS_DISCOUNT_PERCENT / 100)));
    // keep priority as-is (or optionally partially discounted)
    discountApplied = {
      type: 'threshold_free_standard',
      freeStandard: true,
      expressDiscountPercent: EXPRESS_DISCOUNT_PERCENT,
      freeThreshold: FREE_MIN
    };
  } else {
    // If subtotal meets express discount minimum, give express discount
    if ((subtotal || 0) >= EXPRESS_DISCOUNT_MIN) {
      expressCost = Math.max(0, Math.round(expressCost * (1 - EXPRESS_DISCOUNT_PERCENT / 100)));
      discountApplied = {
        type: 'express_threshold_discount',
        expressDiscountPercent: EXPRESS_DISCOUNT_PERCENT,
        expressThreshold: EXPRESS_DISCOUNT_MIN
      };
    }
  }

  // ===== COUPON-BASED SHIPPING LOGIC =====
  // couponCode can be used to modify shipping rates.
  // Supported coupon types (stored in DISCOUNT_KV):
  // - percent_shipping { type: 'percent_shipping', value: 10 }
  // - flat_shipping    { type: 'flat_shipping', value: 50 }
  // - free_shipping    { type: 'free_shipping' }  // makes standard & express free
  if (couponCode) {
    try {
      const raw = await env.DISCOUNT_KV.get(`discount:${couponCode}`);
      if (raw) {
        const disc = JSON.parse(raw);

        if (disc.type === 'percent_shipping' && disc.value) {
          standardCost = Math.max(0, Math.round(standardCost * (1 - disc.value / 100)));
          expressCost  = Math.max(0, Math.round(expressCost  * (1 - disc.value / 100)));
          priorityCost = Math.max(0, Math.round(priorityCost * (1 - disc.value / 100)));

          discountApplied = Object.assign({}, discountApplied || {}, { coupon: couponCode, couponType: disc.type, couponValue: disc.value });
        } else if (disc.type === 'flat_shipping' && disc.value) {
          standardCost = Math.max(0, standardCost - disc.value);
          expressCost  = Math.max(0, expressCost  - disc.value);
          priorityCost = Math.max(0, priorityCost - disc.value);

          discountApplied = Object.assign({}, discountApplied || {}, { coupon: couponCode, couponType: disc.type, couponValue: disc.value });
        } else if (disc.type === 'free_shipping') {
          // Make standard & express free; priority 50% off (optional)
          standardCost = 0;
          expressCost = 0;
          priorityCost = Math.max(0, Math.round(priorityCost * 0.5));

          discountApplied = Object.assign({}, discountApplied || {}, { coupon: couponCode, couponType: disc.type });
        } else {
          // coupon exists but not shipping related — no-op here (cart DO handles subtotal discount)
          discountApplied = Object.assign({}, discountApplied || {}, { coupon: couponCode, couponType: disc.type || 'unknown' });
        }

        // if coupon has an expiry or minCart, we could validate it here as well,
        // but canonical validation should already be done by Cart DO when coupon is applied.
      }
    } catch (e) {
      console.error('Coupon read error', e);
    }
  }

  // finalize options
  const options = [];
  const whId = chosenWarehouse ? chosenWarehouse.warehouseId : null;

  options.push({
    methodId: 'standard',
    title: 'Standard Delivery',
    cost: Math.max(0, Math.round(standardCost)),
    eta: stdEta,
    transitDays,
    warehouseId: whId
  });

  options.push({
    methodId: 'express',
    title: 'Express Delivery',
    cost: Math.max(0, Math.round(expressCost)),
    eta: expEta,
    transitDays: exprDays,
    warehouseId: whId
  });

  options.push({
    methodId: 'priority',
    title: 'Priority Delivery',
    cost: Math.max(0, Math.round(priorityCost)),
    eta: formatDateDaysFromNow(1),
    transitDays: 1,
    warehouseId: whId
  });

  return new Response(JSON.stringify({ shippingOptions: options, subtotalWeight: totalWeight, discountApplied }), {
    headers: corsHeaders({ 'Content-Type': 'application/json' })
  });
});

/**
 * POST /fulfillment/allocate
 * Very lightweight allocation plan: picks top warehouse and returns items -> single allocation
 * body: { orderId, reservationId, items, address, methodId }
 */
router.post('/fulfillment/allocate', async (req, env) => {
  const TEST_MODE = env.TEST_MODE === '1' || env.TEST_MODE === 'true';
  if (!TEST_MODE) {
    const ok = await verifySignature(req, env.INTERNAL_SECRET);
    if (!ok) return new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401, headers: corsHeaders({ 'Content-Type': 'application/json' }) });
  }

  const body = await req.json().catch(() => ({}));
  const { items = [], address = {}, orderId, reservationId } = body;
  if (!items || items.length === 0) return new Response(JSON.stringify({ error: 'items_required' }), { status: 400, headers: corsHeaders({ 'Content-Type': 'application/json' }) });

  const pincode = address?.pincode;
  const zone = await getPincodeZone(env, pincode) || 'OTHER';
  const warehouses = await fetchWarehouses(env);
  let chosenWarehouse = warehouses.find(w => (w.zone || '').toUpperCase() === (zone || '').toUpperCase());
  if (!chosenWarehouse) chosenWarehouse = warehouses[0] || null;

  const estimatedPickupAt = Date.now() + ((chosenWarehouse?.handlingHours || 24) * 3600 * 1000);

  const allocation = [{
    warehouseId: chosenWarehouse ? chosenWarehouse.warehouseId : null,
    items: items.map(it => ({ variantId: it.variantId, qty: it.qty })),
    estimatedPickupAt
  }];

  return new Response(JSON.stringify({ allocation }), { headers: corsHeaders({ 'Content-Type': 'application/json' }) });
});

/**
 * POST /fulfillment/ship
 * Mark shipped - simple endpoint; you can extend to persist shipments
 * body: { orderId, allocation: [{ warehouseId, tracking, carrier, eta }], shippedAt }
 */
router.post('/fulfillment/ship', async (req, env) => {
  const TEST_MODE = env.TEST_MODE === '1' || env.TEST_MODE === 'true';
  if (!TEST_MODE) {
    const ok = await verifySignature(req, env.INTERNAL_SECRET);
    if (!ok) return new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401, headers: corsHeaders({ 'Content-Type': 'application/json' }) });
  }

  const body = await req.json().catch(() => ({}));
  const { orderId, allocation = [], shippedAt = Date.now() } = body;
  if (!orderId) return new Response(JSON.stringify({ error: 'orderId_required' }), { status: 400, headers: corsHeaders({ 'Content-Type': 'application/json' }) });

  // In real app: persist to DB, notify user, create tracking, call courier APIs
  return new Response(JSON.stringify({ ok: true, orderId, allocation, shippedAt }), {
    headers: corsHeaders({ 'Content-Type': 'application/json' })
  });
});

router.get('/health', () => {
  return new Response(JSON.stringify({ status: 'ok', service: 'fulfillment-worker' }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
});

router.all('*', () => new Response('Not Found', { status: 404, headers: corsHeaders() }));

export default {
  fetch: (req, env) => router.fetch(req, env)
};
