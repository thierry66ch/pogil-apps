#!/usr/bin/env node
/**
 * Seed de démonstration JourDoc.
 * Usage : npm run seed
 * Idempotent : relancer ne duplique pas les données existantes.
 */
import { readFileSync, mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'

// ── Charger .env ──────────────────────────────────────────────
try {
  const env = readFileSync('.env', 'utf8')
  for (const line of env.split('\n')) {
    const [key, ...rest] = line.split('=')
    if (key && !key.startsWith('#') && rest.length) {
      process.env[key.trim()] ??= rest.join('=').trim()
    }
  }
} catch { /* pas de .env */ }

const DB_PATH = process.env.DB_PATH ?? 'data/pogil.db'
mkdirSync(dirname(DB_PATH), { recursive: true })

const db = new DatabaseSync(DB_PATH)
db.exec('PRAGMA journal_mode=WAL')
db.exec('PRAGMA foreign_keys=ON')

const schema = readFileSync(
  new URL('./db/schema.sql', import.meta.url).pathname, 'utf8'
)
db.exec(schema)

// ── Helpers ───────────────────────────────────────────────────
function upsertApp({ slug, name, icon, description }) {
  const existing = db.prepare('SELECT id FROM apps WHERE slug = ?').get(slug)
  if (existing) { console.log(`  app "${slug}" déjà présente (id ${existing.id})`); return existing.id }
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO apps (slug, name, icon, description, is_active) VALUES (?,?,?,?,1)'
  ).run(slug, name, icon, description)
  console.log(`  app "${slug}" créée (id ${lastInsertRowid})`)
  return lastInsertRowid
}

function upsertWorkspace(appId, name, userId) {
  const existing = db.prepare('SELECT id FROM workspaces WHERE app_id=? AND name=?').get(appId, name)
  if (existing) { console.log(`  workspace "${name}" déjà présent (id ${existing.id})`); return existing.id }
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO workspaces (app_id, name, created_by) VALUES (?,?,?)'
  ).run(appId, name, userId ?? null)
  console.log(`  workspace "${name}" créé (id ${lastInsertRowid})`)
  return lastInsertRowid
}

function grantAccess(userId, appId, wsId, role = 'owner') {
  db.prepare('INSERT OR IGNORE INTO user_app_access (user_id, app_id) VALUES (?,?)').run(userId, appId)
  db.prepare('INSERT OR IGNORE INTO user_workspace_access (user_id, workspace_id, role) VALUES (?,?,?)').run(userId, wsId, role)
}

function insertObjets(wsId, items) {
  const nomToId = {}
  for (const o of items) {
    const existing = db.prepare('SELECT id FROM jd_objets WHERE workspace_id=? AND nom=?').get(wsId, o.nom)
    if (existing) { nomToId[o.key] = existing.id; continue }
    const parentId = o.parentKey ? nomToId[o.parentKey] : null
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO jd_objets (workspace_id, parent_id, nom, nom_court, est_individu) VALUES (?,?,?,?,?)'
    ).run(wsId, parentId, o.nom, o.court ?? null, o.individu ? 1 : 0)
    nomToId[o.key] = lastInsertRowid
  }
  console.log(`  ${Object.keys(nomToId).length} objets`)
  return nomToId
}

function insertThemes(wsId, items) {
  const keyToId = {}
  for (const t of items) {
    const existing = db.prepare('SELECT id FROM jd_themes WHERE workspace_id=? AND nom=?').get(wsId, t.nom)
    if (existing) { keyToId[t.key] = existing.id; continue }
    const parentId = t.parentKey ? keyToId[t.parentKey] : null
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO jd_themes (workspace_id, parent_id, nom, nom_court) VALUES (?,?,?,?)'
    ).run(wsId, parentId, t.nom, t.court ?? null)
    keyToId[t.key] = lastInsertRowid
  }
  console.log(`  ${Object.keys(keyToId).length} thèmes`)
  return keyToId
}

function insertNote(wsId, { type, nature, themeId, titre, titreAlt, contenu, date, objetIds = [] }) {
  const existing = db.prepare('SELECT id FROM jd_notes WHERE workspace_id=? AND titre=?').get(wsId, titre)
  if (existing) { return existing.id }
  const { lastInsertRowid } = db.prepare(
    `INSERT INTO jd_notes (workspace_id, type, nature, theme_id, titre, titre_alt, contenu, date)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(wsId, type, nature ?? null, themeId ?? null, titre, titreAlt ?? null, contenu ?? null, date ?? null)
  for (const oid of objetIds) {
    db.prepare('INSERT OR IGNORE INTO jd_note_objet (note_id, objet_id) VALUES (?,?)').run(lastInsertRowid, oid)
  }
  return lastInsertRowid
}

function today(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

// ── Utilisateur de test ────────────────────────────────────────
console.log('\n▸ Utilisateur de test')
let testUser = db.prepare("SELECT id FROM users WHERE username='test'").get()
if (!testUser) {
  const hash = await bcrypt.hash('test1234', 10)
  const { lastInsertRowid } = db.prepare(
    "INSERT INTO users (username, email, password_hash) VALUES ('test','test@pogil.ch',?)"
  ).run(hash)
  testUser = { id: lastInsertRowid }
  console.log(`  utilisateur "test" créé (id ${testUser.id})`)
} else {
  console.log(`  utilisateur "test" déjà présent (id ${testUser.id})`)
}
const userId = testUser.id

// ── App + Workspace Jardin ─────────────────────────────────────
console.log('\n▸ App JourDoc')
const appId = upsertApp({ slug: 'jourdoc', name: 'JourDoc', icon: '📔', description: 'Bloc-notes hiérarchique' })

console.log('\n▸ Workspace Jardin')
const wsJardin = upsertWorkspace(appId, 'Jardin', userId)
grantAccess(userId, appId, wsJardin)
console.log(`  accès accordé à "test"`)

// ── Objets ────────────────────────────────────────────────────
console.log('\n▸ Objets (Jardin)')
const objets = insertObjets(wsJardin, [
  { key: 'arb',  nom: 'Arbres',               court: 'arb',  individu: false },
  { key: 'fru',  nom: 'Arbres fruitiers',      court: 'fru',  individu: false, parentKey: 'arb' },
  { key: 'pom',  nom: 'Pommiers',              court: 'pom',  individu: false, parentKey: 'fru' },
  { key: 'gol',  nom: 'Pommier Golden',        court: 'gol',  individu: true,  parentKey: 'pom' },
  { key: 'gal',  nom: 'Pommier Gala',          court: 'gal',  individu: true,  parentKey: 'pom' },
  { key: 'pru',  nom: 'Pruniers',              court: 'pru',  individu: false, parentKey: 'fru' },
  { key: 'rci',  nom: 'Prunier Reine-Claude',  court: 'rci',  individu: true,  parentKey: 'pru' },
  { key: 'pot',  nom: 'Potager',               court: 'pot',  individu: false },
  { key: 'tom',  nom: 'Tomates',               court: 'tom',  individu: false, parentKey: 'pot' },
  { key: 'cdb',  nom: 'Tomate Cœur de Bœuf',  court: 'cdb',  individu: true,  parentKey: 'tom' },
  { key: 'sal',  nom: 'Salades',               court: 'sal',  individu: false, parentKey: 'pot' },
  { key: 'bat',  nom: 'Batavia',               court: 'bat',  individu: true,  parentKey: 'sal' },
])

// ── Thèmes ────────────────────────────────────────────────────
console.log('\n▸ Thèmes (Jardin)')
const themes = insertThemes(wsJardin, [
  { key: 'ins',   nom: 'Installation',                court: 'ins'  },
  { key: 'sem',   nom: 'Semer',                       court: 'sem',  parentKey: 'ins' },
  { key: 'pla',   nom: 'Planter',                     court: 'pla',  parentKey: 'ins' },
  { key: 'rep',   nom: 'Repiquer',                    court: 'rep',  parentKey: 'ins' },
  { key: 'ent',   nom: 'Entretien',                   court: 'ent'  },
  { key: 'tai',   nom: 'Taille',                      court: 'tai',  parentKey: 'ent' },
  { key: 'arr',   nom: 'Arrosage',                    court: 'arr',  parentKey: 'ent' },
  { key: 'but',   nom: 'Buttage',                     court: 'but',  parentKey: 'ent' },
  { key: 'tra',   nom: 'Traitement',                  court: 'tra'  },
  { key: 'taf',   nom: 'Traitement antifongique',     court: 'taf',  parentKey: 'tra' },
  { key: 'tins',  nom: 'Traitement insecticide',      court: 'tins', parentKey: 'tra' },
  { key: 'rec',   nom: 'Récolte',                     court: 'rec'  },
  { key: 'cui',   nom: 'Cueillette',                  court: 'cui',  parentKey: 'rec' },
  { key: 'arr2',  nom: 'Récolte-arrachage',           court: 'rar',  parentKey: 'rec' },
  { key: 'obs',   nom: 'Observation',                 court: 'obs'  },
  { key: 'mal',   nom: 'Maladie',                     court: 'mal',  parentKey: 'obs' },
  { key: 'flo',   nom: 'Floraison',                   court: 'flo',  parentKey: 'obs' },
])

// ── Notes de démonstration ─────────────────────────────────────
console.log('\n▸ Notes de démonstration')
const noteCount0 = db.prepare('SELECT COUNT(*) AS n FROM jd_notes WHERE workspace_id=?').get(wsJardin).n
if (noteCount0 > 0) {
  console.log(`  ${noteCount0} notes déjà présentes — skip`)
} else {
  insertNote(wsJardin, {
    type: 'journal', nature: 'observation', themeId: themes.mal,
    titre: 'Pommier Golden, Pommier Gala → Maladie (tavelure)',
    titreAlt: 'Pom/Gol, Pom/Gal → Mal',
    contenu: 'Taches brun-olive sur les feuilles des deux pommiers. Début de tavelure probable suite aux pluies de la semaine.',
    date: today(-3),
    objetIds: [objets.gol, objets.gal],
  })
  insertNote(wsJardin, {
    type: 'journal', nature: 'activite', themeId: themes.taf,
    titre: 'Pommier Golden, Pommier Gala → Traitement antifongique',
    titreAlt: 'Pom/Gol, Pom/Gal → TrAntif',
    contenu: 'Application de bouillie bordelaise. Traitement préventif et curatif contre la tavelure. 5L dilués à 1%.',
    date: today(-1),
    objetIds: [objets.gol, objets.gal],
  })
  insertNote(wsJardin, {
    type: 'journal', nature: 'activite', themeId: themes.tai,
    titre: 'Pruniers → Taille',
    titreAlt: 'Pru → Tai',
    contenu: 'Taille de formation. Suppression des branches croisées et des gourmands. Coupe des bouts de branches de 1/3.',
    date: today(-1),
    objetIds: [objets.pru],
  })
  insertNote(wsJardin, {
    type: 'journal', nature: 'activite', themeId: themes.sem,
    titre: 'Tomates → Semer',
    titreAlt: 'Tom → Sem',
    contenu: 'Semis en terrine, 3 graines par alvéole. Substrat tourbe + perlite. Mise en germoir à 22°C.',
    date: today(-10),
    objetIds: [objets.cdb],
  })
  insertNote(wsJardin, {
    type: 'journal', nature: 'observation', themeId: themes.flo,
    titre: 'Pommiers → Floraison',
    titreAlt: 'Pom → Flo',
    contenu: 'Début de floraison sur Pommier Golden et Gala. Belle journée ensoleillée, nombreuses abeilles présentes.',
    date: today(-5),
    objetIds: [objets.pom],
  })
  insertNote(wsJardin, {
    type: 'documentation', nature: null, themeId: themes.taf,
    titre: 'Bouillie bordelaise — fiche technique',
    contenu: 'Fongicide à base de sulfate de cuivre. Dose : 2 à 5 g/L selon culture. Ne pas appliquer par vent fort ni pluie imminente. Attendre 3 semaines entre deux applications. Homologué agriculture biologique.',
    source_url: null,
    date: null,
    objetIds: [objets.arb],
  })
  console.log(`  6 notes créées`)
}

// ── Récapitulatif ─────────────────────────────────────────────
console.log('\n══════════════════════════════════════')
console.log('✓ Seed terminé')
console.log(`  App     : jourdoc (id ${appId})`)
console.log(`  Workspace : Jardin (id ${wsJardin})`)
console.log(`  URL     : https://apps.pogil.ch/jourdoc/${wsJardin}`)
console.log('  Login   : test / test1234')
console.log('══════════════════════════════════════\n')
