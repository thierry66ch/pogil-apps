PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS apps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  icon        TEXT,
  description TEXT,
  is_active   BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS workspaces (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id      INTEGER REFERENCES apps(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_by  INTEGER REFERENCES users(id),
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_app_access (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  app_id  INTEGER REFERENCES apps(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, app_id)
);

CREATE TABLE IF NOT EXISTS user_workspace_access (
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
  role         TEXT DEFAULT 'member',
  PRIMARY KEY (user_id, workspace_id)
);

CREATE TABLE IF NOT EXISTS admin (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  otp_code      TEXT,
  otp_expires   DATETIME
);

CREATE TABLE IF NOT EXISTS otp_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id   INTEGER REFERENCES admin(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
