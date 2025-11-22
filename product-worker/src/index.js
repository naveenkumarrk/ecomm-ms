// product-worker.js
import { Router } from "itty-router";

/* ---------------------------
   HMAC helper (for internal calls)
--------------------------- */
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
async function callInternal(url, path, method, body, secret) {
  const full = url.replace(/\/$/, '') + path;
  const bodyText = body ? JSON.stringify(body) : '';
  const headers = secret ? await signedHeadersFor(secret, method, new URL(full).pathname + new URL(full).search, bodyText) : { 'Content-Type': 'application/json' };
  const res = await fetch(full, { method, headers, body: bodyText || undefined });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null }; } catch { return { ok: res.ok, status: res.status, body: text }; }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-timestamp, x-signature",
  };
}

async function handleOptions(request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

/* ---------------------------
   Helpers
--------------------------- */
function jsonResponse(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...extra , ...corsHeaders()} });
}
function parseJSONSafe(v, fallback) { try { return v ? JSON.parse(v) : fallback } catch { return fallback } }

const router = Router();

// Handle OPTIONS requests for CORS
router.options("*", handleOptions);

/* GET /products?limit=20&offset=0 */
router.get("/products", async (req, env) => {
  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") || 20);
    const offset = Number(url.searchParams.get("offset") || 0);

    if (!env.DB) {
      console.error("DB binding not available");
      return jsonResponse({ error: "Database not available" }, 500);
    }

    let rows;
    try {
      rows = await env.DB.prepare("SELECT * FROM products LIMIT ? OFFSET ?").bind(limit, offset).all();
      console.log("Query successful, rows:", rows?.results?.length || 0);
    } catch (dbError) {
      console.error("Database query error:", dbError);
      return jsonResponse({ error: "Database query failed", details: dbError.message }, 500);
    }

    if (!rows || !rows.results) {
      console.log("No results from database");
      return jsonResponse([]);
    }
    
    // Get stock for all products
    const productsWithVariants = await Promise.all((rows.results || []).map(async (r) => {
    const metadata = parseJSONSafe(r.metadata, {});
    const price = metadata.price || 0;
    
    // Get stock from inventory if available
    let stock = 0;
    try {
      if (env.INVENTORY_SERVICE_URL && env.INTERNAL_SECRET) {
        const inv = await callInternal(env.INVENTORY_SERVICE_URL, "/inventory/product-stock", "POST", { productId: r.product_id }, env.INTERNAL_SECRET);
        if (inv.ok && inv.body) {
          stock = inv.body.stock ?? 0;
        }
      }
    } catch (e) {
      console.error('Error fetching stock:', e);
    }
    
    // Create a default variant from product data
    const variantId = `var_${r.product_id}`;
    const variants = [{
      variantId,
      code: r.sku || variantId,
      price: price,
      stock: stock,
      attributes: metadata.attributes || {}
    }];
    
    return {
      productId: r.product_id,
      sku: r.sku,
      title: r.title,
      description: r.description,
      category: r.category,
      images: parseJSONSafe(r.images, []),
      metadata: metadata,
      variants: variants,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
    }));
    
    return jsonResponse(productsWithVariants);
  } catch (error) {
    console.error("Products endpoint error:", error);
    return jsonResponse({ error: "Internal server error", details: error.message }, 500);
  }
});

/* GET /products/:id -> returns product metadata + stock merged by calling inventory */
router.get("/products/:id", async (req, env) => {
  const { id } = req.params;
  const row = await env.DB.prepare("SELECT * FROM products WHERE product_id = ?").bind(id).first();
  if (!row) return new Response("Not Found", { status: 404, headers: corsHeaders() });

  const metadata = parseJSONSafe(row.metadata, {});
  const price = metadata.price || 0;
  
  const product = {
    productId: row.product_id,
    sku: row.sku,
    title: row.title,
    description: row.description,
    category: row.category,
    images: parseJSONSafe(row.images, []),
    metadata: metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };

  // call inventory service for stock/reserved
  let stock = 0;
  let reserved = 0;
  try {
    if (env.INVENTORY_SERVICE_URL && env.INTERNAL_SECRET) {
      const inv = await callInternal(env.INVENTORY_SERVICE_URL, "/inventory/product-stock", "POST", { productId: id }, env.INTERNAL_SECRET);
      if (inv.ok && inv.body) {
        stock = inv.body.stock ?? 0;
        reserved = inv.body.reserved ?? 0;
      }
    }
  } catch (e) {
    console.error('Error fetching stock:', e);
  }
  
  product.stock = stock;
  product.reserved = reserved;
  
  // Create a default variant from product data
  const variantId = `var_${row.product_id}`;
  product.variants = [{
    variantId,
    code: row.sku || variantId,
    price: price,
    stock: stock,
    attributes: metadata.attributes || {}
  }];

  return jsonResponse(product);
});

/* POST /products (admin only - create) */
router.post("/products", async (req, env) => {
  // admin auth - uses ADMIN_SECRET
  const ts = req.headers.get("x-timestamp");
  const sig = req.headers.get("x-signature");
  if (!env.ADMIN_SECRET) return new Response("admin_secret_not_configured", { status: 500, headers: corsHeaders() });
  if (!ts || !sig) return new Response("unauthorized", { status: 401, headers: corsHeaders() });
  const bodyText = await req.clone().text();
  const msg = `${ts}|${req.method}|${new URL(req.url).pathname}|${bodyText}`;
  const expected = await hmacSHA256Hex(env.ADMIN_SECRET, msg);
  if (expected !== sig) return new Response("unauthorized", { status: 401, headers: corsHeaders() });

  const body = await req.json();
  const productId = body.productId || `pro_${crypto.randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);

  await env.DB.prepare(`
    INSERT INTO products (product_id, sku, title, description, category, images, metadata, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    productId,
    body.sku || null,
    body.title,
    body.description || null,
    body.category || null,
    JSON.stringify(body.images || []),
    JSON.stringify(body.metadata || {}),
    now,
    now
  ).run();

  return jsonResponse({ productId }, 201);
});

router.all("*", () => new Response("Not Found", { status: 404, headers: corsHeaders() }));

export default {
  fetch: (req, env) => router.fetch(req, env)
};
