import { DatabaseSync } from 'node:sqlite'
import { readFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH ?? 'data/pogil.db'

mkdirSync(dirname(DB_PATH), { recursive: true })

const db = new DatabaseSync(DB_PATH)

db.exec('PRAGMA journal_mode=WAL')
db.exec('PRAGMA foreign_keys=ON')

const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8')
db.exec(schema)

// Migrations incrémentales (idempotentes — SQLite lève une erreur si la colonne existe déjà)
for (const col of ['todoist_token TEXT', 'todoist_project_id TEXT', 'todoist_project_nom TEXT']) {
  try { db.exec(`ALTER TABLE workspaces ADD COLUMN ${col}`) } catch { /* déjà présente */ }
}
for (const col of ['tache_todoist_due TEXT', 'tache_todoist_priority INTEGER', 'tache_todoist_done INTEGER DEFAULT 0', 'tache_todoist_recurrence_done INTEGER DEFAULT 0', 'tache_todoist_consigne INTEGER DEFAULT 0']) {
  try { db.exec(`ALTER TABLE jd_notes ADD COLUMN ${col}`) } catch { /* déjà présente */ }
}

export default db
