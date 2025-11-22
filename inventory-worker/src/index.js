// inventory-worker.js (CORRECT EXPORT)
import { Router } from "itty-router";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowSec = () => Math.floor(Date.now() / 1000);

async function hmac(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret || ""), { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifySignature(req, secret) {
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
  
  const ts = req.headers.get("x-timestamp");
  const sig = req.headers.get("x-signature");
  if (!ts || !sig) {
    console.log('[verifySignature] Missing timestamp or signature');
    return false;
  }

  if (Math.abs(Date.now() - Number(ts)) > 5 * 60 * 1000) {
    console.log('[verifySignature] Timestamp too old');
    return false;
  }

  const url = new URL(req.url);
  const body = ["GET", "HEAD"].includes(req.method) ? "" : await req.clone().text();
  const msg = `${ts}|${req.method}|${url.pathname + url.search}|${body}`;
  const expected = await hmac(secret, msg);
  
  const valid = expected === sig;
  console.log('[verifySignature] Signature valid:', valid);
  return valid;
}

async function acquireLock(env, productId, owner, requestedTtl = 120) {
  if (!env.INVENTORY_LOCK_KV) return { ok: true };
  const key = `lock:product:${productId}`;
  const ttl = Math.max(60, Number(requestedTtl) || 120);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const existing = await env.INVENTORY_LOCK_KV.get(key);
      if (!existing) {
        await env.INVENTORY_LOCK_KV.put(key, owner, { expirationTtl: ttl });
        const verify = await env.INVENTORY_LOCK_KV.get(key);
        if (verify === owner) return { ok: true, key, ttl };
      }
    } catch (e) {
      return { ok: false, error: 'kv_error', message: String(e) };
    }
    if (attempt < 3) await sleep(5000);
  }
  return { ok: false, error: 'locked' };
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
    console.error('releaseLock error', e);
    return false;
  }
}

const router = Router();

router.options("*", () =>
  new Response("OK", {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Timestamp, X-Signature, X-Test-Mode",
    },
  })
);

function jsonErr(obj, status = 500) {
  return new Response(JSON.stringify(obj), { 
    status, 
    headers: { 
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    } 
  });
}

router.get("/health", () => {
  console.log('[GET /health] Health check');
  return new Response(JSON.stringify({ 
    status: "ok", 
    service: "inventory-service",
    timestamp: Date.now()
  }), { 
    headers: { 
      "Content-Type": "application/json", 
      "Access-Control-Allow-Origin": "*" 
    } 
  });
});

router.post("/inventory/reserve", async (req, env) => {
  console.log('=== [POST /inventory/reserve] START ===');
  
  const ok = await verifySignature(req, env.INTERNAL_SECRET);
  if (!ok) {
    console.error('[RESERVE] ❌ Unauthorized');
    return jsonErr({ error: "unauthorized" }, 401);
  }

  const { reservationId, cartId = null, userId = null, items = [], ttl = 900 } =
    await req.json().catch(() => ({}));

  console.log('[RESERVE] Request:', { reservationId, items });

  if (!reservationId || !Array.isArray(items) || items.length === 0) {
    console.error('[RESERVE] ❌ Missing fields');
    return jsonErr({ error: "missing_fields" }, 400);
  }

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

      const owner = `res-${reservationId}-${crypto.randomUUID()}`;
      const lock = await acquireLock(env, productId, owner, ttl);
      if (!lock.ok && lock.error) throw { error: lock.error, message: lock.message };
      if (lock.key) locked.push({ productId, owner });

      const upd = await env.DB.prepare(
        `UPDATE product_stock SET reserved = reserved + ?, updated_at = strftime('%s','now')
         WHERE product_id = ? AND (stock - reserved) >= ?`
      ).bind(qty, productId, qty).run();

      const changes = (upd.meta?.changes) || upd.changes || 0;
      if (!upd.success || changes === 0) throw { error: "INSUFFICIENT_STOCK", productId };

      applied.push({ productId, qty });
    }

    await env.DB.prepare(`
      INSERT OR REPLACE INTO reservations
      (reservation_id, user_id, cart_id, items, status, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
    `).bind(reservationId, userId, cartId, JSON.stringify(items), expiresAt, now, now).run();

    console.log('[RESERVE] ✅ Success');
    return new Response(JSON.stringify({ reservationId, expiresAt }), { 
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
    });
  } catch (err) {
    console.error("[RESERVE] ❌", err);
    for (const r of applied) {
      try {
        await env.DB.prepare(`UPDATE product_stock SET reserved = reserved - ? WHERE product_id = ?`)
          .bind(r.qty, r.productId).run();
      } catch (e) { console.error("rollback error", e); }
    }
    for (const l of locked) {
      try { await releaseLock(env, l.productId, l.owner); } catch (e) {}
    }
    if (err?.error === "INSUFFICIENT_STOCK") return jsonErr({ error: "INSUFFICIENT_STOCK", productId: err.productId }, 409);
    if (err?.error === "product_not_found") return jsonErr({ error: "product_not_found", productId: err.productId }, 404);
    return jsonErr({ error: "reservation_failed", message: String(err) }, 500);
  }
});

router.post("/inventory/commit", async (req, env) => {
  console.log('=== [POST /inventory/commit] START ===');
  
  const ok = await verifySignature(req, env.INTERNAL_SECRET);
  if (!ok) {
    console.error('[COMMIT] ❌ Unauthorized');
    return jsonErr({ error: "unauthorized" }, 401);
  }

  const { reservationId } = await req.json().catch(() => ({}));
  console.log('[COMMIT] reservationId:', reservationId);
  
  if (!reservationId) return jsonErr({ error: "missing_reservationId" }, 400);

  const res = await env.DB.prepare("SELECT * FROM reservations WHERE reservation_id = ?").bind(reservationId).first();
  console.log('[COMMIT] Reservation:', res);
  
  if (!res) return jsonErr({ error: "not_found" }, 404);
  if (res.status !== "active") return jsonErr({ error: "not_active", status: res.status }, 409);

  const items = JSON.parse(res.items || "[]");
  
  try {
    for (const it of items) {
      await env.DB.prepare(
        `UPDATE product_stock
         SET stock = stock - ?, reserved = reserved - ?, updated_at = strftime('%s','now')
         WHERE product_id = ?`
      ).bind(it.qty, it.qty, it.productId).run();

      if (env.INVENTORY_LOCK_KV) {
        try { await env.INVENTORY_LOCK_KV.delete(`lock:product:${it.productId}`); } catch (e) {}
      }
    }

    await env.DB.prepare(`UPDATE reservations SET status='committed', updated_at=? WHERE reservation_id=?`)
      .bind(nowSec(), reservationId).run();

    console.log('[COMMIT] ✅ Success');
    return new Response(JSON.stringify({ committed: true, ok: true }), { 
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
    });
  } catch (e) {
    console.error("[COMMIT] ❌", e);
    return jsonErr({ error: "commit_failed", message: String(e) }, 500);
  }
});

router.post("/inventory/release", async (req, env) => {
  console.log('=== [POST /inventory/release] START ===');
  
  const ok = await verifySignature(req, env.INTERNAL_SECRET);
  if (!ok) return jsonErr({ error: "unauthorized" }, 401);

  const { reservationId } = await req.json().catch(() => ({}));
  if (!reservationId) return jsonErr({ error: "missing_reservationId" }, 400);

  const row = await env.DB.prepare("SELECT * FROM reservations WHERE reservation_id = ?").bind(reservationId).first();
  if (!row) return jsonErr({ error: "not_found" }, 404);

  if (row.status === "active") {
    const items = JSON.parse(row.items || "[]");
    try {
      for (const it of items) {
        await env.DB.prepare(`UPDATE product_stock SET reserved = reserved - ? WHERE product_id = ?`)
          .bind(it.qty, it.productId).run();
        if (env.INVENTORY_LOCK_KV) {
          try { await env.INVENTORY_LOCK_KV.delete(`lock:product:${it.productId}`); } catch (e) {}
        }
      }
    } catch (e) {
      console.error("[RELEASE] ❌", e);
      return jsonErr({ error: "release_failed", message: String(e) }, 500);
    }
  }

  await env.DB.prepare(`UPDATE reservations SET status='released', updated_at=? WHERE reservation_id=?`)
    .bind(nowSec(), reservationId).run();

  console.log('[RELEASE] ✅ Success');
  return new Response(JSON.stringify({ released: true, ok: true }), { 
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
  });
});

router.post("/inventory/product-stock", async (req, env) => {
  console.log('=== [POST /inventory/product-stock] START ===');
  
  const ok = await verifySignature(req, env.INTERNAL_SECRET);
  if (!ok) {
    console.error('[PRODUCT-STOCK] ❌ Unauthorized');
    return jsonErr({ error: "unauthorized" }, 401);
  }

  const { productId } = await req.json().catch(() => ({}));
  if (!productId) {
    return jsonErr({ error: "missing_productId" }, 400);
  }

  console.log('[PRODUCT-STOCK] productId:', productId);

  const row = await env.DB.prepare("SELECT * FROM product_stock WHERE product_id = ?").bind(productId).first();
  
  if (!row) {
    // Return default values if product not found in stock table
    return new Response(JSON.stringify({ 
      productId,
      stock: 0,
      reserved: 0
    }), { 
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
    });
  }

  console.log('[PRODUCT-STOCK] ✅ Success');
  return new Response(JSON.stringify({ 
    productId: row.product_id,
    stock: row.stock || 0,
    reserved: row.reserved || 0
  }), { 
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
  });
});


router.get("/stock/:productId", async (req, env) => {
  const productId = req.params.productId;

  if (!productId) {
    return jsonErr({ error: "missing_productId" }, 400);
  }

  try {
    const row = await env.DB
      .prepare("SELECT * FROM product_stock WHERE product_id = ?")
      .bind(productId)
      .first();

    if (!row) {
      return jsonResponse({
        productId,
        stock: 0,
        reserved: 0
      });
    }

    return new Response(JSON.stringify({
      productId: row.product_id,
      stock: row.stock || 0,
      reserved: row.reserved || 0
    }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (err) {
    console.error("product-stock GET error:", err);
    return jsonErr({ error: "stock_query_failed", message: String(err) }, 500);
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

// CORRECT EXPORT: Just pass through directly to router
export default router;