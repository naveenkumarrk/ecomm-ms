// ============================================================================
// AUTH WORKER — FINAL VERSION (MATCHES GATEWAY SIGNATURE 100%)
// PBKDF2 + HMAC-SHA256 JWT (BASE64 SECRET) + Sessions + Addresses
// ============================================================================

import { Router } from "itty-router";

/* -------------------------------------------------------
   BASIC UTILITIES
------------------------------------------------------- */
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "*",
  "Access-Control-Allow-Headers": "*"
};

const epoch = () => Math.floor(Date.now() / 1000);

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors }
  });

/* -------------------------------------------------------
   PBKDF2 PASSWORD HASHING (SHA-256)
------------------------------------------------------- */
async function hashPassword(password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);

  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 20000 },
    key,
    256
  );

  const hash = new Uint8Array(bits);
  const saltHex = [...salt].map(b => b.toString(16).padStart(2, "0")).join("");
  const hashHex = [...hash].map(b => b.toString(16).padStart(2, "0")).join("");

  return `pbkdf2$20000$${saltHex}$${hashHex}`;
}

async function verifyPassword(encoded, password) {
  try {
    const [type, iterStr, saltHex, hashHex] = encoded.split("$");
    if (type !== "pbkdf2") return false;

    const iterations = Number(iterStr);
    const salt = new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));
    const expected = new Uint8Array(hashHex.match(/.{2}/g).map(h => parseInt(h, 16)));

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);

    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      key,
      expected.length * 8
    );

    const actual = new Uint8Array(bits);

    if (actual.length !== expected.length) return false;

    // Constant-time comparison
    let diff = 0;
    for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------
   JWT (HMAC-SHA256) — CORRECTED FOR BASE64 SECRET
------------------------------------------------------- */
function importKeyFromBase64(secretB64) {
  const raw = Uint8Array.from(atob(secretB64), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function b64urlEncode(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")  
    .replace(/\//g, "_")  
    .replace(/=+$/, "");
}

function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

async function signJWT(payload, secretB64, ttl = 86400) {
  const now = epoch();
  const exp = now + ttl;

  const header = { alg: "HS256", typ: "JWT" };
  const enc = new TextEncoder();

  const h = b64urlEncode(enc.encode(JSON.stringify(header)));
  const p = b64urlEncode(enc.encode(JSON.stringify({ ...payload, iat: now, exp })));

  const signingInput = `${h}.${p}`;
  const key = await importKeyFromBase64(secretB64);

  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signingInput));
  const s = b64urlEncode(new Uint8Array(sig));

  return `${signingInput}.${s}`;
}

async function verifyJWT(token, secretB64) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [h, p, s] = parts;
    const signingInput = `${h}.${p}`;

    const key = await importKeyFromBase64(secretB64);
    const enc = new TextEncoder();

    const sigBytes = b64urlDecode(s);
    const ok = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(signingInput));

    if (!ok) return null;

    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
    if (payload.exp < epoch()) return null;

    return payload;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------
   DB HELPERS (D1)
------------------------------------------------------- */
async function dbGet(env, sql, params = []) {
  return (await env.DB.prepare(sql).bind(...params).first()) || null;
}

async function dbRun(env, sql, params = []) {
  return await env.DB.prepare(sql).bind(...params).run();
}

function parseJSON(row) {
  try {
    return JSON.parse(row?.data || "{}");
  } catch {
    return {};
  }
}

function parseUser(row) {
  return parseJSON(row);
}

/* -------------------------------------------------------
   AUTH HELPERS
------------------------------------------------------- */
async function getUser(req, env) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;

  const secret = env.JWT_SECRET;
  if (!secret) {
    console.error("JWT_SECRET missing");
    return null;
  }

  const token = auth.slice(7);

  const payload = await verifyJWT(token, secret);
  if (!payload) return null;

  // validate session
  const session = await dbGet(env, "SELECT * FROM sessions WHERE id=? AND revoked=0", [payload.sid]);
  if (!session) return null;
  if (session.expires_at <= epoch()) return null;

  return payload;
}

async function requireAuth(req, env) {
  const u = await getUser(req, env);
  if (!u) return json({ error: "unauthorized", message: "Valid token required" }, 401);
  return u;
}

/* -------------------------------------------------------
   ROUTER
------------------------------------------------------- */
const router = Router();

router.get("/health", () => json({ ok: true, service: "auth-worker" }));

/* ---------------- SIGNUP ---------------- */
router.post("/auth/signup", async (req, env) => {
  const body = await req.json();

  if (!body.email || !body.password || !body.name)
    return json({ error: "missing_fields" }, 400);

  const email = body.email.toLowerCase().trim();

  const exists = await dbGet(env, "SELECT 1 FROM users WHERE email=?", [email]);
  if (exists) return json({ error: "email_exists" }, 409);

  const hashed = await hashPassword(body.password);

  const userId = "usr_" + crypto.randomUUID();
  const now = epoch();

  const data = {
    profile: { name: body.name },
    addresses: [],
    auth: { passwordHash: hashed }
  };

  await dbRun(
    env,
    `INSERT INTO users (userId,email,role,data,created_at,updated_at)
     VALUES (?,?,?,?,?,?)`,
    [userId, email, "user", JSON.stringify(data), now, now]
  );

  return json({ userId, email }, 201);
});

/* ---------------- ADMIN SIGNUP (Special endpoint for creating admin) ---------------- */
router.post("/auth/admin/signup", async (req, env) => {
  const body = await req.json();

  if (!body.email || !body.password || !body.name)
    return json({ error: "missing_fields" }, 400);

  // Check for admin secret to protect this endpoint
  const adminSecret = req.headers.get("x-admin-secret") || body.adminSecret;
  const expectedSecret = env.ADMIN_SECRET || "adminsecret";
  
  if (!adminSecret || adminSecret !== expectedSecret) {
    return json({ error: "unauthorized", message: "Admin creation secret required" }, 401);
  }

  const email = body.email.toLowerCase().trim();

  const exists = await dbGet(env, "SELECT 1 FROM users WHERE email=?", [email]);
  if (exists) return json({ error: "email_exists" }, 409);

  const hashed = await hashPassword(body.password);

  const userId = "usr_" + crypto.randomUUID();
  const now = epoch();

  const data = {
    profile: { name: body.name },
    addresses: [],
    auth: { passwordHash: hashed }
  };

  await dbRun(
    env,
    `INSERT INTO users (userId,email,role,data,created_at,updated_at)
     VALUES (?,?,?,?,?,?)`,
    [userId, email, "admin", JSON.stringify(data), now, now]
  );

  return json({ userId, email, role: "admin" }, 201);
});

/* ---------------- PROMOTE USER TO ADMIN (Admin only) ---------------- */
router.post("/auth/admin/promote", async (req, env) => {
  const u = await requireAuth(req, env);
  if (u instanceof Response) return u;

  // Check if current user is admin
  const currentUser = await dbGet(env, "SELECT role FROM users WHERE userId=?", [u.sub]);
  if (!currentUser || currentUser.role !== "admin") {
    return json({ error: "forbidden", message: "Admin access required" }, 403);
  }

  const body = await req.json();
  if (!body.email && !body.userId) {
    return json({ error: "missing_fields", message: "email or userId required" }, 400);
  }

  const identifier = body.userId || body.email.toLowerCase().trim();
  const user = await dbGet(
    env,
    body.userId ? "SELECT * FROM users WHERE userId=?" : "SELECT * FROM users WHERE email=?",
    [identifier]
  );

  if (!user) return json({ error: "user_not_found" }, 404);
  if (user.role === "admin") return json({ error: "already_admin" }, 400);

  await dbRun(
    env,
    "UPDATE users SET role=?, updated_at=? WHERE userId=?",
    ["admin", epoch(), user.userId]
  );

  return json({ userId: user.userId, email: user.email, role: "admin" });
});

/* ---------------- LOGIN ---------------- */
router.post("/auth/login", async (req, env) => {
  const body = await req.json();

  if (!body.email || !body.password)
    return json({ error: "missing_fields" }, 400);

  const email = body.email.toLowerCase().trim();
  const user = await dbGet(env, "SELECT * FROM users WHERE email=?", [email]);
  if (!user) return json({ error: "invalid_credentials" }, 401);

  const data = parseJSON(user);
  const ok = await verifyPassword(data.auth.passwordHash, body.password);
  if (!ok) return json({ error: "invalid_credentials" }, 401);

  const sid = "sess_" + crypto.randomUUID();
  const now = epoch();
  const ttl = Number(env.ACCESS_TOKEN_TTL || 86400);
  const exp = now + ttl;

  await dbRun(
    env,
    "INSERT INTO sessions (id,userId,created_at,expires_at,revoked) VALUES (?,?,?,?,0)",
    [sid, user.userId, now, exp]
  );

  const token = await signJWT({ sub: user.userId, sid, role: user.role }, env.JWT_SECRET, ttl);

  return json({ accessToken: token, expiresIn: ttl });
});

/* ---------------- ME ---------------- */
router.get("/auth/me", async (req, env) => {
  const u = await requireAuth(req, env);
  if (u instanceof Response) return u;

  const user = await dbGet(env, "SELECT * FROM users WHERE userId=?", [u.sub]);
  if (!user) return json({ error: "user_not_found" }, 404);

  const data = parseJSON(user);

  return json({
    userId: user.userId,
    email: user.email,
    role: user.role,
    profile: data.profile,
    addresses: data.addresses
  });
});

/* ---------------- LOGOUT ---------------- */
router.post("/auth/logout", async (req, env) => {
  const u = await getUser(req, env);
  if (u) {
    await dbRun(env, "UPDATE sessions SET revoked=1 WHERE id=?", [u.sid]);
  }
  return json({ ok: true });
});

/* ---------------- ADDRESS MGMT ---------------- */
router.get("/auth/addresses", async (req, env) => {
  const u = await requireAuth(req, env);
  if (u instanceof Response) return u;

  const row = await dbGet(env, "SELECT data FROM users WHERE userId=?", [u.sub]);
  const d = parseJSON(row);

  return json({ addresses: d.addresses || [] });
});

router.post("/auth/addresses", async (req, env) => {
  const u = await requireAuth(req, env);
  if (u instanceof Response) return u;

  const body = await req.json();
  if (!body.line1 || !body.city || !body.postal)
    return json({ error: "missing_fields" }, 400);

  const row = await dbGet(env, "SELECT * FROM users WHERE userId=?", [u.sub]);
  const d = parseJSON(row);

  const newAddr = { addressId: "addr_" + crypto.randomUUID(), ...body };
  d.addresses.push(newAddr);

  await dbRun(
    env,
    "UPDATE users SET data=?, updated_at=? WHERE userId=?",
    [JSON.stringify(d), epoch(), u.sub]
  );

  return json({ address: newAddr }, 201);
});

router.put("/auth/addresses/:id", async (req, env) => {
  const u = await requireAuth(req, env);
  if (u instanceof Response) return u;

  const body = await req.json();
  const addrId = req.params.id;

  const row = await dbGet(env, "SELECT * FROM users WHERE userId=?", [u.sub]);
  const data = parseUser(row);

  if (!data.addresses) data.addresses = [];

  const idx = data.addresses.findIndex(a => a.addressId === addrId);
  if (idx < 0) return json({ error: "address_not_found" }, 404);

  data.addresses[idx] = { ...data.addresses[idx], ...body };

  await dbRun(
    env,
    "UPDATE users SET data=?,updated_at=? WHERE userId=?",
    [JSON.stringify(data), epoch(), u.sub]
  );

  return json({ address: data.addresses[idx] });
});

router.delete("/auth/addresses/:id", async (req, env) => {
  const u = await requireAuth(req, env);
  if (u instanceof Response) return u;

  const addrId = req.params.id;

  const row = await dbGet(env, "SELECT * FROM users WHERE userId=?", [u.sub]);
  const data = parseUser(row);

  if (!data.addresses) data.addresses = [];

  const newList = data.addresses.filter(a => a.addressId !== addrId);

  if (newList.length === data.addresses.length)
    return json({ error: "address_not_found" }, 404);

  data.addresses = newList;

  await dbRun(
    env,
    "UPDATE users SET data=?,updated_at=? WHERE userId=?",
    [JSON.stringify(data), epoch(), u.sub]
  );

  return json({ ok: true });
});



/* -------------------------------------------------------
   CATCH ALL
------------------------------------------------------- */
router.all("*", () => json({ error: "not_found" }, 404));

/* -------------------------------------------------------
   EXPORT
------------------------------------------------------- */
export default {
  async fetch(req, env, ctx) {
    try {
      return await router.fetch(req, env, ctx);
    } catch (e) {
      console.error("AUTH WORKER ERROR:", e);
      return json({ error: "internal_error", message: e.message }, 500);
    }
  }
};
