// order-worker/index.js
import { Router } from "itty-router";

/* -------------------------
   HMAC helpers (same)
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
   Router
--------------------------*/
const router = Router();
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-Timestamp, X-Signature, X-Dev-Mode" };
router.options("*", () => new Response("OK", { headers: CORS }));

function jsonErr(obj, status = 500) { return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } }); }

router.get("/health", () => new Response(JSON.stringify({ status: "ok", service: "order-service" }), { headers: { "Content-Type": "application/json", ...CORS } }));

router.post("/orders/create", async (req, env) => {
  console.log("[ORDERS.CREATE] start");
  const ok = await verifySignature(req, env.INTERNAL_SECRET, env);
  if (!ok) return jsonErr({ error: "unauthorized" }, 401);

  const payload = await req.json().catch(() => ({}));
  const { reservationId, orderId, payment, userId, email, items = [], address = null, shipping = null } = payload;

  if (!reservationId || !orderId || !payment) return jsonErr({ error: "missing_fields", received: { reservationId: !!reservationId, orderId: !!orderId, payment: !!payment } }, 400);

  try {
    if (!env.DB) return jsonErr({ error: "database_not_configured" }, 500);

    // check existing by orderId or reservationId
    const existing = await env.DB.prepare("SELECT order_id FROM orders WHERE order_id = ? OR reservation_id = ?").bind(orderId, reservationId).first();
    if (existing) return new Response(JSON.stringify({ ok: true, orderId: existing.order_id, message: "order_already_exists" }), { status: 200, headers: { "Content-Type": "application/json", ...CORS } });

    const now = Date.now();
    const result = await env.DB.prepare(`
      INSERT INTO orders (order_id, reservation_id, user_id, email, amount, currency, status, items_json, address_json, shipping_json, payment_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(orderId, reservationId, userId || null, email || null, payment.amount || null, payment.currency || null, "paid", JSON.stringify(items || []), JSON.stringify(address || null), JSON.stringify(shipping || null), JSON.stringify(payment), now, now).run();

    // verify
    const verify = await env.DB.prepare("SELECT order_id FROM orders WHERE order_id = ?").bind(orderId).first();
    if (!verify) return jsonErr({ error: "insertion_verification_failed", orderId }, 500);

    return new Response(JSON.stringify({ ok: true, orderId, created_at: now }), { status: 200, headers: { "Content-Type": "application/json", ...CORS } });
  } catch (err) {
    console.error("order create error", err);
    return jsonErr({ error: "database_error", message: String(err) }, 500);
  }
});

router.get("/orders/:orderId", async (req, env) => {
  try {
    if (!env.DB) return jsonErr({ error: "database_not_configured" }, 500);
    const { orderId } = req.params;
    const row = await env.DB.prepare("SELECT * FROM orders WHERE order_id = ?").bind(orderId).first();
    if (!row) return jsonErr({ error: "not_found" }, 404);
    row.items_json = JSON.parse(row.items_json || "[]");
    row.address_json = JSON.parse(row.address_json || "null");
    row.shipping_json = JSON.parse(row.shipping_json || "null");
    row.payment_json = JSON.parse(row.payment_json || "null");
    return new Response(JSON.stringify(row), { status: 200, headers: { "Content-Type": "application/json", ...CORS } });
  } catch (err) {
    console.error("get order error", err);
    return jsonErr({ error: "database_error", message: String(err) }, 500);
  }
});

router.get("/debug/list-orders", async (req, env) => {
  if (!env.DB) return jsonErr({ error: "database_not_configured" }, 500);
  const rows = await env.DB.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 20").all();
  return new Response(JSON.stringify({ count: rows.results.length, orders: rows.results }), { status: 200, headers: { "Content-Type": "application/json", ...CORS } });
});

router.all("*", (req) => jsonErr({ error: "not_found", path: new URL(req.url).pathname, method: req.method }, 404));

export default { fetch: (req, env) => router.fetch(req, env) };
