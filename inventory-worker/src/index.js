// inventory-worker/index.js - FINAL AUTH-INTEGRATED VERSION
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
        if (verify === owner) {
          console.log(`[acquireLock] Lock acquired for ${productId} by ${owner}`);
          return { ok: true, key, ttl };
        }
      } else if (existing === owner) {
        console.log(`[acquireLock] Lock already held by ${owner}`);
        return { ok: true, key, ttl };
      } else if (existing.startsWith("res-")) {
        // Check if reservation is still active
        try {
          const oldResId = existing.replace("res-", "");
          const row = await env.DB.prepare(
            "SELECT status, expires_at FROM reservations WHERE reservation_id = ?"
          ).bind(oldResId).first();
          
          if (!row || row.status !== "active" || row.expires_at < nowSec()) {
            console.log(`[acquireLock] Stealing expired lock from ${existing}`);
            await env.INVENTORY_LOCK_KV.delete(key);
            await env.INVENTORY_LOCK_KV.put(key, owner, { expirationTtl: ttl });
            const verify2 = await env.INVENTORY_LOCK_KV.get(key);
            if (verify2 === owner) return { ok: true, key, ttl };
          }
        } catch (e) {
          console.error("[acquireLock] Error checking reservation", e);
        }
      }
    } catch (e) {
      console.error("[acquireLock] KV error", e);
      return { ok: false, error: "kv_error", message: String(e) };
    }

    if (attempt < 3) {
      console.log(`[acquireLock] Lock held by another, retrying ${attempt}/3`);
      await sleep(2000);
    }
  }

  console.error(`[acquireLock] Failed to acquire lock for ${productId}`);
  return { ok: false, error: "locked", message: "product locked by another reservation" };
}

async function releaseLock(env, productId, owner) {
  if (!env.INVENTORY_LOCK_KV) return true;
  const key = `lock:product:${productId}`;
  try {
    const existing = await env.INVENTORY_LOCK_KV.get(key);
    if (existing === owner) {
      await env.INVENTORY_LOCK_KV.delete(key);
      console.log(`[releaseLock] Lock released for ${productId}`);
      return true;
    }
    console.warn(`[releaseLock] Lock not owned by ${owner}, current: ${existing}`);
    return false;
  } catch (e) {
    console.error("[releaseLock] error", e);
    return false;
  }
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
   Router + endpoints
--------------------------*/
const router = Router();
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Timestamp, X-Signature, X-Dev-Mode, X-User-Id, X-User-Role",
};

router.options("*", () => new Response("OK", { headers: CORS }));

function jsonErr(obj, status = 500) {
  return new Response(JSON.stringify(obj), { 
    status, 
    headers: { "Content-Type": "application/json", ...CORS } 
  });
}

router.get("/health", () => 
  new Response(JSON.stringify({ 
    status: "ok", 
    service: "inventory-service", 
    ts: Date.now() 
  }), { 
    headers: { "Content-Type": "application/json", ...CORS } 
  })
);

/* -------------------------
   RESERVE INVENTORY
--------------------------*/
router.post("/inventory/reserve", async (req, env) => {
  console.log("[INVENTORY.RESERVE] Starting reservation");
  
  const ok = await verifySignature(req, env.INTERNAL_SECRET, env);
  if (!ok) {
    console.log("[INVENTORY.RESERVE] Signature verification failed");
    return jsonErr({ error: "unauthorized" }, 401);
  }

  const payload = await req.json().catch(() => ({}));
  const { reservationId, cartId = null, userId = null, items = [], ttl = 900 } = payload;

  console.log("[INVENTORY.RESERVE] Request:", { reservationId, userId, itemCount: items.length });

  if (!reservationId || !Array.isArray(items) || items.length === 0) {
    return jsonErr({ error: "missing_fields", received: { reservationId: !!reservationId, items: items.length } }, 400);
  }

  const now = nowSec();
  const expiresAt = now + Number(ttl || 900);
  const locked = [];
  const applied = [];

  try {
    // Process each item
    for (const it of items) {
      const productId = it.productId;
      const qty = Number(it.qty || 0);
      
      if (!productId || qty <= 0) {
        throw { error: "invalid_item", productId };
      }

      console.log(`[INVENTORY.RESERVE] Processing ${productId}, qty: ${qty}`);

      // Check stock
      const row = await env.DB.prepare(
        "SELECT * FROM product_stock WHERE product_id = ?"
      ).bind(productId).first();
      
      if (!row) {
        console.error(`[INVENTORY.RESERVE] Product not found: ${productId}`);
        throw { error: "product_not_found", productId };
      }

      const available = (row.stock || 0) - (row.reserved || 0);
      console.log(`[INVENTORY.RESERVE] ${productId} - stock: ${row.stock}, reserved: ${row.reserved}, available: ${available}`);
      
      if (available < qty) {
        console.error(`[INVENTORY.RESERVE] Insufficient stock for ${productId}`);
        throw { error: "INSUFFICIENT_STOCK", productId, available, requested: qty };
      }

      // Acquire lock
      const owner = `res-${reservationId}`;
      const lock = await acquireLock(env, productId, owner, ttl);
      
      if (!lock.ok) {
        console.error(`[INVENTORY.RESERVE] Failed to acquire lock for ${productId}`);
        throw { error: lock.error || "locked", message: lock.message };
      }

      if (lock.key) locked.push({ productId, owner });

      // Reserve stock
      const upd = await env.DB.prepare(`
        UPDATE product_stock 
        SET reserved = reserved + ?, updated_at = strftime('%s','now') 
        WHERE product_id = ? AND (stock - reserved) >= ?
      `).bind(qty, productId, qty).run();

      const changes = (upd.meta?.changes) || upd.changes || 0;
      
      if (!upd.success || changes === 0) {
        console.error(`[INVENTORY.RESERVE] Failed to reserve stock for ${productId}`);
        throw { error: "INSUFFICIENT_STOCK", productId };
      }

      console.log(`[INVENTORY.RESERVE] Reserved ${qty} of ${productId}`);
      applied.push({ productId, qty });
    }

    // Create reservation record
    await env.DB.prepare(`
      INSERT OR REPLACE INTO reservations (
        reservation_id, user_id, cart_id, items, status, expires_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
    `).bind(
      reservationId, 
      userId, 
      cartId, 
      JSON.stringify(items), 
      expiresAt, 
      now, 
      now
    ).run();

    console.log(`[INVENTORY.RESERVE] Reservation created: ${reservationId}`);

    return new Response(
      JSON.stringify({ 
        reservationId, 
        expiresAt, 
        items: applied 
      }), 
      { headers: { "Content-Type": "application/json", ...CORS } }
    );
  } catch (err) {
    console.error("[INVENTORY.RESERVE] Error, rolling back", err);
    
    // Rollback applied reservations
    for (const r of applied) {
      try { 
        await env.DB.prepare(
          `UPDATE product_stock SET reserved = reserved - ? WHERE product_id = ?`
        ).bind(r.qty, r.productId).run(); 
        console.log(`[INVENTORY.RESERVE] Rolled back ${r.productId}`);
      } catch (e) { 
        console.error(`[INVENTORY.RESERVE] Rollback error for ${r.productId}`, e); 
      }
    }
    
    // Release locks
    for (const l of locked) {
      try { 
        await releaseLock(env, l.productId, l.owner); 
      } catch (e) { 
        console.error(`[INVENTORY.RESERVE] Release error for ${l.productId}`, e); 
      }
    }

    if (err && typeof err === "object") {
      if (err.error === "INSUFFICIENT_STOCK") {
        return jsonErr({ 
          error: "INSUFFICIENT_STOCK", 
          productId: err.productId,
          available: err.available,
          requested: err.requested
        }, 409);
      }
      if (err.error === "product_not_found") {
        return jsonErr({ error: "product_not_found", productId: err.productId }, 404);
      }
      if (err.error === "locked") {
        return jsonErr({ error: "product_locked", message: err.message || "locked" }, 409);
      }
    }

    return jsonErr({ 
      error: "reservation_failed", 
      message: String(err), 
      details: err 
    }, 500);
  }
});

/* -------------------------
   COMMIT RESERVATION
--------------------------*/
router.post("/inventory/commit", async (req, env) => {
  console.log("[INVENTORY.COMMIT] Starting commit");
  
  const ok = await verifySignature(req, env.INTERNAL_SECRET, env);
  if (!ok) {
    console.log("[INVENTORY.COMMIT] Signature verification failed");
    return jsonErr({ error: "unauthorized" }, 401);
  }

  const { reservationId } = await req.json().catch(() => ({}));
  
  if (!reservationId) {
    return jsonErr({ error: "missing_reservationId" }, 400);
  }

  console.log(`[INVENTORY.COMMIT] Committing reservation: ${reservationId}`);

  const res = await env.DB.prepare(
    "SELECT * FROM reservations WHERE reservation_id = ?"
  ).bind(reservationId).first();
  
  if (!res) {
    console.error(`[INVENTORY.COMMIT] Reservation not found: ${reservationId}`);
    return jsonErr({ error: "not_found" }, 404);
  }
  
  if (res.status !== "active") {
    console.error(`[INVENTORY.COMMIT] Reservation not active: ${res.status}`);
    return jsonErr({ error: "not_active", status: res.status }, 409);
  }

  const items = JSON.parse(res.items || "[]");

  try {
    // Deduct stock and reserved
    for (const it of items) {
      console.log(`[INVENTORY.COMMIT] Committing ${it.productId}, qty: ${it.qty}`);
      
      await env.DB.prepare(`
        UPDATE product_stock 
        SET stock = stock - ?, reserved = reserved - ?, updated_at = strftime('%s','now') 
        WHERE product_id = ?
      `).bind(it.qty, it.qty, it.productId).run();
      
      // Release lock
      if (env.INVENTORY_LOCK_KV) {
        try { 
          await env.INVENTORY_LOCK_KV.delete(`lock:product:${it.productId}`); 
          console.log(`[INVENTORY.COMMIT] Lock released for ${it.productId}`);
        } catch (e) { 
          console.error(`[INVENTORY.COMMIT] Unlock error for ${it.productId}`, e); 
        }
      }
    }
    
    // Update reservation status
    await env.DB.prepare(
      `UPDATE reservations SET status='committed', updated_at=? WHERE reservation_id=?`
    ).bind(nowSec(), reservationId).run();
    
    console.log(`[INVENTORY.COMMIT] Reservation committed: ${reservationId}`);
    
    return new Response(
      JSON.stringify({ committed: true, reservationId }), 
      { headers: { "Content-Type": "application/json", ...CORS } }
    );
  } catch (e) {
    console.error("[INVENTORY.COMMIT] Error", e);
    return jsonErr({ error: "commit_failed", message: String(e) }, 500);
  }
});

/* -------------------------
   RELEASE RESERVATION
--------------------------*/
router.post("/inventory/release", async (req, env) => {
  console.log("[INVENTORY.RELEASE] Starting release");
  
  const ok = await verifySignature(req, env.INTERNAL_SECRET, env);
  if (!ok) {
    console.log("[INVENTORY.RELEASE] Signature verification failed");
    return jsonErr({ error: "unauthorized" }, 401);
  }

  const { reservationId } = await req.json().catch(() => ({}));
  
  if (!reservationId) {
    return jsonErr({ error: "missing_reservationId" }, 400);
  }

  console.log(`[INVENTORY.RELEASE] Releasing reservation: ${reservationId}`);

  const row = await env.DB.prepare(
    "SELECT * FROM reservations WHERE reservation_id = ?"
  ).bind(reservationId).first();
  
  if (!row) {
    console.error(`[INVENTORY.RELEASE] Reservation not found: ${reservationId}`);
    return jsonErr({ error: "not_found" }, 404);
  }

  // Only release if active
  if (row.status === "active") {
    const items = JSON.parse(row.items || "[]");
    
    try {
      for (const it of items) {
        console.log(`[INVENTORY.RELEASE] Releasing ${it.productId}, qty: ${it.qty}`);
        
        await env.DB.prepare(
          `UPDATE product_stock SET reserved = reserved - ? WHERE product_id = ?`
        ).bind(it.qty, it.productId).run();
        
        // Release lock
        if (env.INVENTORY_LOCK_KV) {
          try { 
            await env.INVENTORY_LOCK_KV.delete(`lock:product:${it.productId}`); 
            console.log(`[INVENTORY.RELEASE] Lock released for ${it.productId}`);
          } catch (e) { 
            console.error(`[INVENTORY.RELEASE] Unlock error for ${it.productId}`, e); 
          }
        }
      }
    } catch (e) {
      console.error("[INVENTORY.RELEASE] Error", e);
      return jsonErr({ error: "release_failed", message: String(e) }, 500);
    }
  } else {
    console.log(`[INVENTORY.RELEASE] Reservation already ${row.status}`);
  }

  // Update reservation status
  await env.DB.prepare(
    `UPDATE reservations SET status='released', updated_at=? WHERE reservation_id=?`
  ).bind(nowSec(), reservationId).run();
  
  console.log(`[INVENTORY.RELEASE] Reservation released: ${reservationId}`);
  
  return new Response(
    JSON.stringify({ released: true, reservationId }), 
    { headers: { "Content-Type": "application/json", ...CORS } }
  );
});

/* -------------------------
   GET PRODUCT STOCK (Internal)
--------------------------*/
router.post("/inventory/product-stock", async (req, env) => {
  const ok = await verifySignature(req, env.INTERNAL_SECRET, env);
  if (!ok) return jsonErr({ error: "unauthorized" }, 401);
  
  const { productId } = await req.json().catch(() => ({}));
  
  if (!productId) {
    return jsonErr({ error: "missing_productId" }, 400);
  }
  
  const row = await env.DB.prepare(
    "SELECT * FROM product_stock WHERE product_id = ?"
  ).bind(productId).first();
  
  if (!row) {
    return new Response(
      JSON.stringify({ productId, stock: 0, reserved: 0 }), 
      { headers: { "Content-Type": "application/json", ...CORS } }
    );
  }
  
  return new Response(
    JSON.stringify({ 
      productId: row.product_id, 
      stock: row.stock || 0, 
      reserved: row.reserved || 0 
    }), 
    { headers: { "Content-Type": "application/json", ...CORS } }
  );
});

/* -------------------------
   DEBUG ENDPOINTS
--------------------------*/
router.get("/debug/locks/:productId", async (req, env) => {
  if (!env.INVENTORY_LOCK_KV) {
    return jsonErr({ error: "KV not configured" }, 500);
  }
  
  try {
    const key = `lock:product:${req.params.productId}`;
    const lock = await env.INVENTORY_LOCK_KV.get(key);
    return new Response(
      JSON.stringify({ productId: req.params.productId, lock }), 
      { headers: { "Content-Type": "application/json", ...CORS } }
    );
  } catch (e) { 
    return jsonErr({ error: "lock_check_failed", message: String(e) }, 500); 
  }
});

router.get("/debug/product/:productId", async (req, env) => {
  const productId = req.params.productId;

  if (!productId) {
    return jsonErr({ error: "missing_productId" }, 400);
  }

  let stockRow = null;
  let lockValue = null;
  let reservation = null;

  try {
    // Fetch stock
    stockRow = await env.DB
      .prepare("SELECT * FROM product_stock WHERE product_id = ?")
      .bind(productId)
      .first();

    // Fetch lock
    if (env.INVENTORY_LOCK_KV) {
      const key = `lock:product:${productId}`;
      lockValue = await env.INVENTORY_LOCK_KV.get(key);

      // Fetch reservation if locked
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

router.all("*", (req) => 
  jsonErr({ 
    error: "not_found", 
    path: new URL(req.url).pathname, 
    method: req.method 
  }, 404)
);

export default { fetch: (req, env) => router.fetch(req, env) };