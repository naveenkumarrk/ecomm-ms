DROP TABLE IF EXISTS users;
CREATE TABLE users (
  userId TEXT PRIMARY KEY,              -- usr_xxx (UUID)
  email TEXT UNIQUE NOT NULL,           -- always lowercase
  role TEXT NOT NULL DEFAULT 'user',    -- 'user' or 'admin'
  data TEXT NOT NULL,                   -- JSON: { profile: {}, addresses: [], auth: {passwordHash} }
  created_at INTEGER NOT NULL,          -- epoch seconds
  updated_at INTEGER NOT NULL           -- epoch seconds
);

CREATE INDEX idx_users_email ON users(email);

DROP TABLE IF EXISTS sessions;
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                  -- sess_xxx
  userId TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,   -- 0=active, 1=revoked
  FOREIGN KEY (userId) REFERENCES users(userId)
);

CREATE INDEX idx_sessions_user ON sessions(userId);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);


INSERT INTO users (userId, email, role, data, created_at, updated_at)
VALUES (
  'usr_admin_001',
  'admin@example.com',
  'admin',
  '{"profile":{"name":"Admin User"},"addresses":[],"auth":{"passwordHash":"argon2id$your_hashed_password_here"}}',
  strftime('%s','now'),
  strftime('%s','now')
);