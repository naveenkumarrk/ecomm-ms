// inventory-worker/index.js
import { Router } from "itty-router";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowSec = () => Math.floor(Date.now() / 1000);

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
  // Dev bypass: x-dev-mode must equal env.DEV_SECRET
  const dev = req.headers.get("x-dev-mode");
  if (dev && env.DEV_SECRET && dev === env.DEV_SECRET) {
    console.log("[verifySignature] dev bypass used");
    return true;
  }

  if (!secret) {
    console.warn("[verifySignature] no INTERNAL_SECRET configured");
    return false;
  }

  const ts = req.headers.get("x-timestamp");
  const sig = req.headers.get("x-signature");
  if (!ts || !sig) {
    console.warn("[verifySignature] missing headers");
    return false;
  }
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
   KV lock helpers
--------------------------*/
async function acquireLock(env, productId, owner, requestedTtl = 900) {
  if (!env.INVENTORY_LOCK_KV) return { ok: true };
  const key = `lock:product:${productId}`;
  const ttl = Math.max(60, Number(requestedTtl) || 900);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const existing = await env.INVENTORY_LOCK_KV.get(key);
      if (!existing) {
        await env.INVENTORY_LOCK_KV.put(key, owner, { expirationTtl: ttl });
        const verify = await env.INVENTORY_LOCK_KV.get(key);
        if (verify === owner) return { ok: true, key, ttl };
      } else if (existing === owner) {
        return { ok: true, key, ttl };
      } else if (existing.startsWith("res-")) {
        // If other reservation, check if that reservation is still active
        try {
          const oldResId = existing;
          const row = await env.DB.prepare("SELECT status, expires_at FROM reservations WHERE reservation_id = ?").bind(oldResId).first();
          if (!row || row.status !== "active" || row.expires_at < nowSec()) {
            // steal
            await env.INVENTORY_LOCK_KV.delete(key);
            await env.INVENTORY_LOCK_KV.put(key, owner, { expirationTtl: ttl });
            const verify2 = await env.INVENTORY_LOCK_KV.get(key);
            if (verify2 === owner) return { ok: true, key, ttl };
          }
        } catch (e) {
          // on DB error, just continue retrying
        }
      }
    } catch (e) {
      return { ok: false, error: "kv_error", message: String(e) };
    }

    if (attempt < 3) await sleep(2000);
  }

  return { ok: false, error: "locked", message: "product locked by another reservation" };
}

async function releaseLock(env, productId, owner) {
  if (!env.INVENTORY_LOCK_KV) return true;
  const key = `lock:product:${productId}`;
  try {
    const existing = await env.INVENTORY_LOCK_KV.get(key);
    if (existing === owner) {
      await env.INVENTORY_LOCK_KV.delete(key);
      return true;
    }
    return false;
  } catch (e) {
    console.error("releaseLock error", e);
    return false;
  }
}

/* -------------------------
   Router + endpoints
--------------------------*/
const router = Router();
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Timestamp, X-Signature, X-Dev-Mode",
};

router.options("*", () => new Response("OK", { headers: CORS }));

function jsonErr(obj, status = 500) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

router.get("/health", () => new Response(JSON.stringify({ status: "ok", service: "inventory-service", ts: Date.now() }), { headers: { "Content-Type": "application/json", ...CORS } }));

router.post("/inventory/reserve", async (req, env) => {
  console.log("[RESERVE] start");
  const ok = await verifySignature(req, env.INTERNAL_SECRET, env);
  if (!ok) return jsonErr({ error: "unauthorized" }, 401);

  const payload = await req.json().catch(() => ({}));
  const { reservationId, cartId = null, userId = null, items = [], ttl = 900 } = payload;

  if (!reservationId || !Array.isArray(items) || items.length === 0) return jsonErr({ error: "missing_fields" }, 400);

  const now = nowSec();
  const expiresAt = now + Number(ttl || 900);
  const locked = [];
  const applied = [];

  try {
    for (const it of items) {
      const productId = it.productId;
      const qty = Number(it.qty || 0);
      if (!productId || qty <= 0) throw { error: "invalid_item", productId };

      const row = await env.DB.prepare("SELECT * FROM product_stock WHERE product_id = ?").bind(productId).first();
      if (!row) throw { error: "product_not_found", productId };

      const available = (row.stock || 0) - (row.reserved || 0);
      if (available < qty) throw { error: "INSUFFICIENT_STOCK", productId };

      const owner = `res-${reservationId}`;
      const lock = await acquireLock(env, productId, owner, ttl);
      if (!lock.ok) throw { error: lock.error || "locked", message: lock.message };

      if (lock.key) locked.push({ productId, owner });

      const upd = await env.DB.prepare(
        `UPDATE product_stock SET reserved = reserved + ?, updated_at = strftime('%s','now') WHERE product_id = ? AND (stock - reserved) >= ?`
      ).bind(qty, productId, qty).run();

      const changes = (upd.meta?.changes) || upd.changes || 0;
      if (!upd.success || changes === 0) throw { error: "INSUFFICIENT_STOCK", productId };

      applied.push({ productId, qty });
    }

    await env.DB.prepare(`
      INSERT OR REPLACE INTO reservations (reservation_id, user_id, cart_id, items, status, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
    `).bind(reservationId, userId, cartId, JSON.stringify(items), expiresAt, now, now).run();

    return new Response(JSON.stringify({ reservationId, expiresAt }), { headers: { "Content-Type": "application/json", ...CORS } });
  } catch (err) {
    // rollback
    for (const r of applied) {
      try { await env.DB.prepare(`UPDATE product_stock SET reserved = reserved - ? WHERE product_id = ?`).bind(r.qty, r.productId).run(); } catch (e) { console.error("rollback error", e); }
    }
    for (const l of locked) {
      try { await releaseLock(env, l.productId, l.owner); } catch (e) { console.error("release error", e); }
    }

    if (err && typeof err === "object") {
      if (err.error === "INSUFFICIENT_STOCK") return jsonErr({ error: "INSUFFICIENT_STOCK", productId: err.productId }, 409);
      if (err.error === "product_not_found") return jsonErr({ error: "product_not_found", productId: err.productId }, 404);
      if (err.error === "locked") return jsonErr({ error: "product_locked", message: err.message || "locked" }, 409);
    }

    return jsonErr({ error: "reservation_failed", message: String(err), details: err }, 500);
  }
});

router.post("/inventory/commit", async (req, env) => {
  const ok = await verifySignature(req, env.INTERNAL_SECRET, env);
  if (!ok) return jsonErr({ error: "unauthorized" }, 401);

  const { reservationId } = await req.json().catch(() => ({}));
  if (!reservationId) return jsonErr({ error: "missing_reservationId" }, 400);

  const res = await env.DB.prepare("SELECT * FROM reservations WHERE reservation_id = ?").bind(reservationId).first();
  if (!res) return jsonErr({ error: "not_found" }, 404);
  if (res.status !== "active") return jsonErr({ error: "not_active", status: res.status }, 409);

  const items = JSON.parse(res.items || "[]");

  try {
    for (const it of items) {
      await env.DB.prepare(`UPDATE product_stock SET stock = stock - ?, reserved = reserved - ?, updated_at = strftime('%s','now') WHERE product_id = ?`).bind(it.qty, it.qty, it.productId).run();
      if (env.INVENTORY_LOCK_KV) try { await env.INVENTORY_LOCK_KV.delete(`lock:product:${it.productId}`); } catch (e) { console.error("unlock commit error", e); }
    }
    await env.DB.prepare(`UPDATE reservations SET status='committed', updated_at=? WHERE reservation_id=?`).bind(nowSec(), reservationId).run();
    return new Response(JSON.stringify({ committed: true }), { headers: { "Content-Type": "application/json", ...CORS } });
  } catch (e) {
    console.error("commit error", e);
    return jsonErr({ error: "commit_failed", message: String(e) }, 500);
  }
});

router.post("/inventory/release", async (req, env) => {
  const ok = await verifySignature(req, env.INTERNAL_SECRET, env);
  if (!ok) return jsonErr({ error: "unauthorized" }, 401);

  const { reservationId } = await req.json().catch(() => ({}));
  if (!reservationId) return jsonErr({ error: "missing_reservationId" }, 400);

  const row = await env.DB.prepare("SELECT * FROM reservations WHERE reservation_id = ?").bind(reservationId).first();
  if (!row) return jsonErr({ error: "not_found" }, 404);

  if (row.status === "active") {
    const items = JSON.parse(row.items || "[]");
    try {
      for (const it of items) {
        await env.DB.prepare(`UPDATE product_stock SET reserved = reserved - ? WHERE product_id = ?`).bind(it.qty, it.productId).run();
        if (env.INVENTORY_LOCK_KV) try { await env.INVENTORY_LOCK_KV.delete(`lock:product:${it.productId}`); } catch (e) { console.error("unlock release error", e); }
      }
    } catch (e) {
      console.error("release error", e);
      return jsonErr({ error: "release_failed", message: String(e) }, 500);
    }
  }

  await env.DB.prepare(`UPDATE reservations SET status='released', updated_at=? WHERE reservation_id=?`).bind(nowSec(), reservationId).run();
  return new Response(JSON.stringify({ released: true }), { headers: { "Content-Type": "application/json", ...CORS } });
});

// product-stock endpoint
router.post("/inventory/product-stock", async (req, env) => {
  const ok = await verifySignature(req, env.INTERNAL_SECRET, env);
  if (!ok) return jsonErr({ error: "unauthorized" }, 401);
  const { productId } = await req.json().catch(() => ({}));
  if (!productId) return jsonErr({ error: "missing_productId" }, 400);
  const row = await env.DB.prepare("SELECT * FROM product_stock WHERE product_id = ?").bind(productId).first();
  if (!row) return new Response(JSON.stringify({ productId, stock: 0, reserved: 0 }), { headers: { "Content-Type": "application/json", ...CORS } });
  return new Response(JSON.stringify({ productId: row.product_id, stock: row.stock || 0, reserved: row.reserved || 0 }), { headers: { "Content-Type": "application/json", ...CORS } });
});

// debug locks
router.get("/debug/locks/:productId", async (req, env) => {
  if (!env.INVENTORY_LOCK_KV) return jsonErr({ error: "KV not configured" }, 500);
  try {
    const key = `lock:product:${req.params.productId}`;
    const lock = await env.INVENTORY_LOCK_KV.get(key);
    return new Response(JSON.stringify({ productId: req.params.productId, lock }), { headers: { "Content-Type": "application/json", ...CORS } });
  } catch (e) { return jsonErr({ error: "lock_check_failed", message: String(e) }, 500); }
});

/* ----------------------------------------------------
   DEBUG: Full inventory state for a product
   GET /debug/product/:productId
----------------------------------------------------*/
router.get("/debug/product/:productId", async (req, env) => {
  const productId = req.params.productId;

  if (!productId) {
    return jsonErr({ error: "missing_productId" }, 400);
  }

  let stockRow = null;
  let lockValue = null;
  let reservation = null;

  try {
    // 1) Fetch stock + reserved
    stockRow = await env.DB
      .prepare("SELECT * FROM product_stock WHERE product_id = ?")
      .bind(productId)
      .first();

    // 2) Fetch lock if KV is configured
    if (env.INVENTORY_LOCK_KV) {
      const key = `lock:product:${productId}`;
      lockValue = await env.INVENTORY_LOCK_KV.get(key);

      // 3) If lock belongs to a reservation, fetch reservation info
      if (lockValue && lockValue.startsWith("res-")) {
        const reservationId = lockValue.replace("res-", "");
        reservation = await env.DB
          .prepare("SELECT * FROM reservations WHERE reservation_id = ?")
          .bind(reservationId)
          .first();
      }
    }
  } catch (err) {
    return jsonErr({ error: "debug_query_failed", message: String(err) }, 500);
  }

  return new Response(
    JSON.stringify({
      productId,
      stock: stockRow?.stock ?? 0,
      reserved: stockRow?.reserved ?? 0,
      lock: lockValue || null,
      reservation,
    }),
    { headers: { "Content-Type": "application/json", ...CORS } }
  );
});


router.all("*", (req) => jsonErr({ error: "not_found", path: new URL(req.url).pathname, method: req.method }, 404));

export default { fetch: (req, env) => router.fetch(req, env) };
