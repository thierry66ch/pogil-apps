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

-- ── JourDoc ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jd_objets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id    INTEGER REFERENCES jd_objets(id) ON DELETE SET NULL,
  nom          TEXT NOT NULL,
  nom_court    TEXT,
  est_individu BOOLEAN NOT NULL DEFAULT 0,
  description  TEXT,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jd_themes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  parent_id    INTEGER REFERENCES jd_themes(id) ON DELETE SET NULL,
  nom          TEXT NOT NULL,
  nom_court    TEXT,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jd_notes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id     INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type             TEXT NOT NULL DEFAULT 'journal' CHECK(type IN ('journal','documentation')),
  nature           TEXT CHECK(nature IN ('observation','activite')),
  theme_id         INTEGER REFERENCES jd_themes(id) ON DELETE SET NULL,
  titre            TEXT NOT NULL,
  titre_alt        TEXT,
  contenu          TEXT,
  date             TEXT,
  source_url       TEXT,
  tache_todoist_id TEXT,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jd_note_objet (
  note_id  INTEGER NOT NULL REFERENCES jd_notes(id) ON DELETE CASCADE,
  objet_id INTEGER NOT NULL REFERENCES jd_objets(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, objet_id)
);

CREATE TABLE IF NOT EXISTS jd_note_note (
  note_source_id INTEGER NOT NULL REFERENCES jd_notes(id) ON DELETE CASCADE,
  note_cible_id  INTEGER NOT NULL REFERENCES jd_notes(id) ON DELETE CASCADE,
  type_lien      TEXT,
  PRIMARY KEY (note_source_id, note_cible_id)
);

CREATE TRIGGER IF NOT EXISTS jd_notes_updated_at
AFTER UPDATE ON jd_notes BEGIN
  UPDATE jd_notes SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE INDEX IF NOT EXISTS idx_jd_objets_ws     ON jd_objets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jd_objets_parent ON jd_objets(parent_id);
CREATE INDEX IF NOT EXISTS idx_jd_themes_ws     ON jd_themes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jd_notes_ws      ON jd_notes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_jd_notes_date    ON jd_notes(date);
CREATE INDEX IF NOT EXISTS idx_jd_no_note       ON jd_note_objet(note_id);
CREATE INDEX IF NOT EXISTS idx_jd_no_objet      ON jd_note_objet(objet_id);
