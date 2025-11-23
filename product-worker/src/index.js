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

/* POST /products/images/upload (admin only - upload image to R2) */
router.post("/products/images/upload", async (req, env) => {
  // admin auth - uses ADMIN_SECRET
  const ts = req.headers.get("x-timestamp");
  const sig = req.headers.get("x-signature");
  if (!env.ADMIN_SECRET) return new Response("admin_secret_not_configured", { status: 500, headers: corsHeaders() });
  if (!ts || !sig) return new Response("unauthorized", { status: 401, headers: corsHeaders() });
  
  // For file uploads, verify signature without body (multipart boundaries make body verification unreliable)
  // Alternative: verify with empty body for file uploads
  const contentType = req.headers.get("content-type") || "";
  const isMultipart = contentType.includes("multipart/form-data");
  
  // For multipart, verify signature with empty body; for direct binary, use body hash
  const bodyText = isMultipart ? "" : await req.clone().text();
  const msg = `${ts}|${req.method}|${new URL(req.url).pathname}|${bodyText}`;
  const expected = await hmacSHA256Hex(env.ADMIN_SECRET, msg);
  if (expected !== sig) return new Response("unauthorized", { status: 401, headers: corsHeaders() });

  if (!env.PRODUCT_IMAGES) {
    return jsonResponse({ error: "R2 bucket not configured" }, 500);
  }

  if (!env.R2_PUBLIC_URL) {
    return jsonResponse({ error: "R2 public URL not configured" }, 500);
  }

  try {
    // Handle multipart/form-data or direct binary upload
    const contentType = req.headers.get("content-type") || "";
    
    let imageData;
    let fileName;
    let mimeType;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") || formData.get("image");
      
      if (!file || !(file instanceof File)) {
        return jsonResponse({ error: "No file provided" }, 400);
      }

      imageData = await file.arrayBuffer();
      fileName = file.name || `image_${crypto.randomUUID()}`;
      mimeType = file.type || "image/jpeg";
    } else {
      // Direct binary upload
      imageData = await req.arrayBuffer();
      const contentTypeHeader = req.headers.get("content-type");
      mimeType = contentTypeHeader || "image/jpeg";
      
      // Generate filename from timestamp
      const ext = mimeType.includes("png") ? "png" : mimeType.includes("gif") ? "gif" : "jpg";
      fileName = `image_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`;
    }

    if (!imageData || imageData.byteLength === 0) {
      return jsonResponse({ error: "Empty file" }, 400);
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (imageData.byteLength > maxSize) {
      return jsonResponse({ error: "File too large. Maximum size is 10MB" }, 400);
    }

    // Generate unique file path
    const filePath = `products/${Date.now()}_${crypto.randomUUID()}_${fileName}`;

    // Upload to R2
    await env.PRODUCT_IMAGES.put(filePath, imageData, {
      httpMetadata: {
        contentType: mimeType,
        cacheControl: "public, max-age=31536000", // 1 year cache
      },
    });

    // Return public URL
    const publicUrl = `${env.R2_PUBLIC_URL}/${filePath}`;

    return jsonResponse({ 
      url: publicUrl,
      path: filePath,
      size: imageData.byteLength,
      contentType: mimeType
    }, 201);
  } catch (error) {
    console.error("Image upload error:", error);
    return jsonResponse({ error: "Upload failed", details: error.message }, 500);
  }
});

/* Helper function to upload image to R2 */
async function uploadImageToR2(imageFile, env) {
  if (!env.PRODUCT_IMAGES || !env.R2_PUBLIC_URL) {
    throw new Error("R2 not configured");
  }

  const imageData = await imageFile.arrayBuffer();
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (imageData.byteLength > maxSize) {
    throw new Error("File too large. Maximum size is 10MB");
  }

  const fileName = imageFile.name || `image_${crypto.randomUUID()}`;
  const filePath = `products/${Date.now()}_${crypto.randomUUID()}_${fileName}`;
  const mimeType = imageFile.type || "image/jpeg";

  await env.PRODUCT_IMAGES.put(filePath, imageData, {
    httpMetadata: {
      contentType: mimeType,
      cacheControl: "public, max-age=31536000",
    },
  });

  return `${env.R2_PUBLIC_URL}/${filePath}`;
}

/* POST /products (admin only - create) */
router.post("/products", async (req, env) => {
  // admin auth - uses ADMIN_SECRET
  const ts = req.headers.get("x-timestamp");
  const sig = req.headers.get("x-signature");
  if (!env.ADMIN_SECRET) return new Response("admin_secret_not_configured", { status: 500, headers: corsHeaders() });
  if (!ts || !sig) return new Response("unauthorized", { status: 401, headers: corsHeaders() });
  
  const contentType = req.headers.get("content-type") || "";
  const isMultipart = contentType.includes("multipart/form-data");
  
  // For signature verification
  const bodyText = isMultipart ? "" : await req.clone().text();
  const msg = `${ts}|${req.method}|${new URL(req.url).pathname}|${bodyText}`;
  const expected = await hmacSHA256Hex(env.ADMIN_SECRET, msg);
  if (expected !== sig) return new Response("unauthorized", { status: 401, headers: corsHeaders() });

  try {
    let productData;
    let imageFiles = [];
    let imageUrls = [];

    if (isMultipart) {
      // Handle multipart/form-data (with file uploads)
      const formData = await req.formData();
      
      // Extract product data from form fields
      const productJson = formData.get("product") || formData.get("data");
      if (productJson) {
        productData = typeof productJson === "string" ? JSON.parse(productJson) : {};
      } else {
        // Build product data from individual form fields
        productData = {
          productId: formData.get("productId") || undefined,
          sku: formData.get("sku") || undefined,
          title: formData.get("title") || undefined,
          description: formData.get("description") || undefined,
          category: formData.get("category") || undefined,
          metadata: formData.get("metadata") ? JSON.parse(formData.get("metadata")) : undefined
        };
      }

      // Extract image files
      const files = formData.getAll("images") || formData.getAll("files") || formData.getAll("image");
      imageFiles = files.filter(f => f instanceof File);
      
      // Extract existing image URLs if provided
      const urlsField = formData.get("imageUrls");
      if (urlsField) {
        imageUrls = typeof urlsField === "string" ? JSON.parse(urlsField) : [];
      }
    } else {
      // Handle JSON body
      productData = await req.json();
      // If images are provided as URLs in JSON
      if (productData.images) {
        imageUrls = Array.isArray(productData.images) ? productData.images : [productData.images];
      }
    }

    const productId = productData.productId || `pro_${crypto.randomUUID()}`;
    const now = Math.floor(Date.now() / 1000);

    // Upload image files to R2 if any
    if (imageFiles.length > 0) {
      const uploadedUrls = await Promise.all(
        imageFiles.map(file => uploadImageToR2(file, env))
      );
      imageUrls = [...imageUrls, ...uploadedUrls];
    }

    // Ensure images is an array
    const images = Array.isArray(imageUrls) ? imageUrls : (imageUrls.length > 0 ? imageUrls : []);

    await env.DB.prepare(`
      INSERT INTO products (product_id, sku, title, description, category, images, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      productId,
      productData.sku || null,
      productData.title,
      productData.description || null,
      productData.category || null,
      JSON.stringify(images),
      JSON.stringify(productData.metadata || {}),
      now,
      now
    ).run();

    return jsonResponse({ productId, images }, 201);
  } catch (error) {
    console.error("Product creation error:", error);
    return jsonResponse({ error: "Creation failed", details: error.message }, 500);
  }
});

/* PUT /products/:id (admin only - update) */
router.put("/products/:id", async (req, env) => {
  // admin auth - uses ADMIN_SECRET
  const ts = req.headers.get("x-timestamp");
  const sig = req.headers.get("x-signature");
  if (!env.ADMIN_SECRET) return new Response("admin_secret_not_configured", { status: 500, headers: corsHeaders() });
  if (!ts || !sig) return new Response("unauthorized", { status: 401, headers: corsHeaders() });
  
  const contentType = req.headers.get("content-type") || "";
  const isMultipart = contentType.includes("multipart/form-data");
  
  // For signature verification
  const bodyText = isMultipart ? "" : await req.clone().text();
  const msg = `${ts}|${req.method}|${new URL(req.url).pathname}|${bodyText}`;
  const expected = await hmacSHA256Hex(env.ADMIN_SECRET, msg);
  if (expected !== sig) return new Response("unauthorized", { status: 401, headers: corsHeaders() });

  const { id } = req.params;
  const now = Math.floor(Date.now() / 1000);

  // Check if product exists
  const existing = await env.DB.prepare("SELECT * FROM products WHERE product_id = ?").bind(id).first();
  if (!existing) {
    return jsonResponse({ error: "Product not found" }, 404);
  }

  try {
    let updateData;
    let imageFiles = [];
    let imageUrls = [];

    if (isMultipart) {
      // Handle multipart/form-data (with file uploads)
      const formData = await req.formData();
      
      // Extract update data from form fields
      const dataJson = formData.get("product") || formData.get("data");
      if (dataJson) {
        updateData = typeof dataJson === "string" ? JSON.parse(dataJson) : {};
      } else {
        // Build update data from individual form fields
        updateData = {};
        if (formData.has("sku")) updateData.sku = formData.get("sku");
        if (formData.has("title")) updateData.title = formData.get("title");
        if (formData.has("description")) updateData.description = formData.get("description");
        if (formData.has("category")) updateData.category = formData.get("category");
        if (formData.has("metadata")) updateData.metadata = JSON.parse(formData.get("metadata"));
      }

      // Extract image files
      const files = formData.getAll("images") || formData.getAll("files") || formData.getAll("image");
      imageFiles = files.filter(f => f instanceof File);
      
      // Extract existing image URLs if provided
      const urlsField = formData.get("imageUrls");
      if (urlsField) {
        imageUrls = typeof urlsField === "string" ? JSON.parse(urlsField) : [];
      }
    } else {
      // Handle JSON body
      updateData = await req.json();
      // If images are provided as URLs in JSON
      if (updateData.images !== undefined) {
        imageUrls = Array.isArray(updateData.images) ? updateData.images : [updateData.images];
      }
    }

    // Upload image files to R2 if any
    if (imageFiles.length > 0) {
      const uploadedUrls = await Promise.all(
        imageFiles.map(file => uploadImageToR2(file, env))
      );
      imageUrls = [...imageUrls, ...uploadedUrls];
    }

    // Build update query dynamically based on provided fields
    const updates = [];
    const values = [];

    if (updateData.sku !== undefined) {
      updates.push("sku = ?");
      values.push(updateData.sku);
    }
    if (updateData.title !== undefined) {
      updates.push("title = ?");
      values.push(updateData.title);
    }
    if (updateData.description !== undefined) {
      updates.push("description = ?");
      values.push(updateData.description);
    }
    if (updateData.category !== undefined) {
      updates.push("category = ?");
      values.push(updateData.category);
    }
    if (imageUrls.length > 0 || updateData.images !== undefined) {
      const images = Array.isArray(imageUrls) ? imageUrls : (imageUrls.length > 0 ? imageUrls : []);
      updates.push("images = ?");
      values.push(JSON.stringify(images));
    }
    if (updateData.metadata !== undefined) {
      updates.push("metadata = ?");
      values.push(JSON.stringify(updateData.metadata));
    }

    if (updates.length === 0) {
      return jsonResponse({ error: "No fields to update" }, 400);
    }

    updates.push("updated_at = ?");
    values.push(now);
    values.push(id);

    await env.DB.prepare(`
      UPDATE products 
      SET ${updates.join(", ")}
      WHERE product_id = ?
    `).bind(...values).run();

    return jsonResponse({ productId: id, updated: true });
  } catch (error) {
    console.error("Product update error:", error);
    return jsonResponse({ error: "Update failed", details: error.message }, 500);
  }
});

router.all("*", () => new Response("Not Found", { status: 404, headers: corsHeaders() }));

export default {
  fetch: (req, env) => router.fetch(req, env)
};
