import { Hono } from 'hono'
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import ExifReader from 'exifreader'
import db from '../db/db.js'
import { authMiddleware } from '../middleware/authMiddleware.js'

const jourdoc = new Hono()

jourdoc.use('*', authMiddleware)

// Vérifie que l'utilisateur a accès au workspace
function wsCheck(c, next) {
  const userId = c.get('userId')
  const wsId = Number(c.req.param('wsId'))
  if (!wsId) return c.json({ error: 'Invalid workspace' }, 400)
  const ok = db.prepare(
    'SELECT 1 FROM user_workspace_access WHERE user_id = ? AND workspace_id = ?'
  ).get(userId, wsId)
  if (!ok) return c.json({ error: 'Forbidden' }, 403)
  c.set('wsId', wsId)
  return next()
}

// ── IMPORT CSV ───────────────────────────────────────────────

function parseCSV(raw) {
  let text = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw   // strip BOM
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
    .filter(l => l.trim() && !l.trim().startsWith('#'))
  if (lines.length < 2) return { headers: [], rows: [] }
  const sep = lines[0].includes(';') ? ';' : ','
  const split = line => line.split(sep).map(c => c.trim().replace(/^["'](.*)["']$/, '$1'))
  const headers = split(lines[0]).map(h => h.toLowerCase())
  const rows = lines.slice(1)
    .map(line => Object.fromEntries(headers.map((h, i) => [h, split(line)[i] ?? ''])))
    .filter(r => Object.values(r).some(v => v.trim()))
  return { headers, rows }
}

function boolVal(s) {
  return ['1','true','oui','yes','x'].includes((s ?? '').toLowerCase().trim())
}

function findOrCreateObjet(wsId, nom, parentId, nomCourt, estIndividu, description, created, skipped) {
  const existing = parentId === null
    ? db.prepare('SELECT id FROM jd_objets WHERE workspace_id=? AND nom=? AND parent_id IS NULL').get(wsId, nom)
    : db.prepare('SELECT id FROM jd_objets WHERE workspace_id=? AND nom=? AND parent_id=?').get(wsId, nom, parentId)
  if (existing) { skipped.push(nom); return existing.id }
  const r = db.prepare(
    'INSERT INTO jd_objets (workspace_id, parent_id, nom, nom_court, est_individu, description) VALUES (?,?,?,?,?,?)'
  ).run(wsId, parentId, nom, nomCourt || null, estIndividu ? 1 : 0, description || null)
  created.push(nom)
  return r.lastInsertRowid
}

function findOrCreateTheme(wsId, nom, parentId, nomCourt, created, skipped) {
  const existing = parentId === null
    ? db.prepare('SELECT id FROM jd_themes WHERE workspace_id=? AND nom=? AND parent_id IS NULL').get(wsId, nom)
    : db.prepare('SELECT id FROM jd_themes WHERE workspace_id=? AND nom=? AND parent_id=?').get(wsId, nom, parentId)
  if (existing) { skipped.push(nom); return existing.id }
  const r = db.prepare(
    'INSERT INTO jd_themes (workspace_id, parent_id, nom, nom_court) VALUES (?,?,?,?)'
  ).run(wsId, parentId, nom, nomCourt || null)
  created.push(nom)
  return r.lastInsertRowid
}

jourdoc.post('/:wsId/import/objets', async (c) => {
  const wsId = c.get('wsId')
  const { csv } = await c.req.json()
  if (!csv?.trim()) return c.json({ error: 'CSV vide' }, 400)

  const { headers, rows } = parseCSV(csv)
  const created = [], skipped = [], errors = []
  const pathCache = new Map()   // chemin complet → id
  const nameCache = new Map()   // nom → id (format nom+parent)
  const hasPath = headers.includes('chemin') || headers.includes('path')

  if (hasPath) {
    for (const row of rows) {
      const chemin = (row.chemin || row.path || '').trim()
      if (!chemin) continue
      const parts = chemin.split('/').map(p => p.trim()).filter(Boolean)
      let parentId = null, cumPath = ''
      for (let i = 0; i < parts.length; i++) {
        const nom = parts[i]
        cumPath = cumPath ? `${cumPath}/${nom}` : nom
        if (pathCache.has(cumPath)) { parentId = pathCache.get(cumPath); continue }
        const isLeaf = i === parts.length - 1
        const id = findOrCreateObjet(wsId, nom, parentId,
          isLeaf ? row.nom_court : null,
          isLeaf && boolVal(row.est_individu),
          isLeaf ? row.description : null,
          created, skipped)
        pathCache.set(cumPath, id)
        parentId = id
      }
    }
  } else {
    // Format nom + parent (nom du parent direct)
    const existing = db.prepare('SELECT id, nom FROM jd_objets WHERE workspace_id=?').all(wsId)
    for (const o of existing) nameCache.set(o.nom, o.id)
    for (const row of rows) {
      const nom = (row.nom || row.name || '').trim()
      if (!nom) continue
      const parentNom = (row.parent || '').trim()
      const parentId = parentNom ? (nameCache.get(parentNom) ?? null) : null
      const id = findOrCreateObjet(wsId, nom, parentId, row.nom_court, boolVal(row.est_individu), row.description, created, skipped)
      nameCache.set(nom, id)
    }
  }

  return c.json({ created: created.length, skipped: skipped.length, errors, details: { created, skipped } })
})

jourdoc.post('/:wsId/import/themes', async (c) => {
  const wsId = c.get('wsId')
  const { csv } = await c.req.json()
  if (!csv?.trim()) return c.json({ error: 'CSV vide' }, 400)

  const { headers, rows } = parseCSV(csv)
  const created = [], skipped = [], errors = []
  const pathCache = new Map()
  const nameCache = new Map()
  const hasPath = headers.includes('chemin') || headers.includes('path')

  if (hasPath) {
    for (const row of rows) {
      const chemin = (row.chemin || row.path || '').trim()
      if (!chemin) continue
      const parts = chemin.split('/').map(p => p.trim()).filter(Boolean)
      let parentId = null, cumPath = ''
      for (let i = 0; i < parts.length; i++) {
        const nom = parts[i]
        cumPath = cumPath ? `${cumPath}/${nom}` : nom
        if (pathCache.has(cumPath)) { parentId = pathCache.get(cumPath); continue }
        const isLeaf = i === parts.length - 1
        const id = findOrCreateTheme(wsId, nom, parentId, isLeaf ? row.nom_court : null, created, skipped)
        pathCache.set(cumPath, id)
        parentId = id
      }
    }
  } else {
    const existing = db.prepare('SELECT id, nom FROM jd_themes WHERE workspace_id=?').all(wsId)
    for (const t of existing) nameCache.set(t.nom, t.id)
    for (const row of rows) {
      const nom = (row.nom || row.name || '').trim()
      if (!nom) continue
      const parentNom = (row.parent || '').trim()
      const parentId = parentNom ? (nameCache.get(parentNom) ?? null) : null
      const id = findOrCreateTheme(wsId, nom, parentId, row.nom_court, created, skipped)
      nameCache.set(nom, id)
    }
  }

  return c.json({ created: created.length, skipped: skipped.length, errors, details: { created, skipped } })
})

// ── WORKSPACES (non scoped) ──────────────────────────────────

// Vérifie que l'utilisateur est owner du workspace
function ownerCheck(c, next) {
  const userId = c.get('userId')
  const wsId = c.get('wsId') ?? Number(c.req.param('wsId'))
  const access = db.prepare('SELECT role FROM user_workspace_access WHERE user_id=? AND workspace_id=?').get(userId, wsId)
  if (access?.role !== 'owner') return c.json({ error: 'Owner requis' }, 403)
  return next()
}

// Lister les workspaces JourDoc de l'utilisateur
jourdoc.get('/workspaces', (c) => {
  const userId = c.get('userId')
  const ws = db.prepare(`
    SELECT w.id, w.name, uwa.role, w.created_at
    FROM workspaces w
    JOIN user_workspace_access uwa ON uwa.workspace_id = w.id
    JOIN apps a ON a.id = w.app_id
    WHERE uwa.user_id = ? AND a.slug = 'jourdoc'
    ORDER BY w.name
  `).all(userId)
  return c.json({ workspaces: ws })
})

// Créer un nouveau workspace JourDoc
jourdoc.post('/workspaces', async (c) => {
  const userId = c.get('userId')
  const { name } = await c.req.json()
  if (!name?.trim()) return c.json({ error: 'Nom requis' }, 400)
  const app = db.prepare("SELECT id FROM apps WHERE slug = 'jourdoc'").get()
  if (!app) return c.json({ error: 'App jourdoc introuvable' }, 404)
  const r = db.prepare('INSERT INTO workspaces (app_id, name, created_by) VALUES (?,?,?)').run(app.id, name.trim(), userId)
  db.prepare('INSERT INTO user_workspace_access (user_id, workspace_id, role) VALUES (?,?,?)').run(userId, r.lastInsertRowid, 'owner')
  // Accès app si pas encore accordé
  db.prepare('INSERT OR IGNORE INTO user_app_access (user_id, app_id) VALUES (?,?)').run(userId, app.id)
  return c.json({ id: r.lastInsertRowid, name: name.trim() }, 201)
})

jourdoc.use('/:wsId/*', wsCheck)

// Met à jour le flag `lie` d'un média selon ses liaisons actuelles
function refreshLie(mediaId) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM jd_note_media WHERE media_id = ?').get(mediaId).n
  db.prepare('UPDATE jd_medias SET lie = ? WHERE id = ?').run(n > 0 ? 1 : 0, mediaId)
}

// Enrichit une liste de notes avec objets + médias liés
function withData(notes) {
  return notes.map(note => {
    const objets = db.prepare(
      'SELECT o.id, o.nom, o.nom_court FROM jd_note_objet no JOIN jd_objets o ON o.id = no.objet_id WHERE no.note_id = ?'
    ).all(note.id)
    const medias = db.prepare(
      'SELECT m.id, m.type_media, m.nom_original, m.fichier FROM jd_note_media nm JOIN jd_medias m ON m.id = nm.media_id WHERE nm.note_id = ? ORDER BY m.created_at LIMIT 6'
    ).all(note.id)
    return { ...note, objets, medias }
  })
}

// ── Info + settings workspace ─────────────────────────────────

// Renommer le workspace (owner)
jourdoc.patch('/:wsId', wsCheck, ownerCheck, async (c) => {
  const wsId = c.get('wsId')
  const { name } = await c.req.json()
  if (!name?.trim()) return c.json({ error: 'Nom requis' }, 400)
  db.prepare('UPDATE workspaces SET name=? WHERE id=?').run(name.trim(), wsId)
  return c.json({ ok: true, name: name.trim() })
})

// Supprimer le workspace (owner — cascade sur toutes les données JourDoc)
jourdoc.delete('/:wsId', wsCheck, ownerCheck, (c) => {
  const wsId = c.get('wsId')
  db.prepare('DELETE FROM workspaces WHERE id=?').run(wsId)
  return c.json({ ok: true })
})

// Membres du workspace
jourdoc.get('/:wsId/members', (c) => {
  const wsId = c.get('wsId')
  const members = db.prepare(`
    SELECT u.id, u.username, u.email, uwa.role
    FROM user_workspace_access uwa JOIN users u ON u.id = uwa.user_id
    WHERE uwa.workspace_id = ? ORDER BY uwa.role DESC, u.username
  `).all(wsId)
  return c.json({ members })
})

// Ajouter un membre (owner)
jourdoc.post('/:wsId/members', ownerCheck, async (c) => {
  const wsId = c.get('wsId')
  const { identifier, role = 'member' } = await c.req.json()
  if (!identifier) return c.json({ error: 'identifier requis' }, 400)
  const user = db.prepare('SELECT id, username FROM users WHERE username=? OR email=?').get(identifier, identifier)
  if (!user) return c.json({ error: 'Utilisateur introuvable' }, 404)
  db.prepare('INSERT OR IGNORE INTO user_workspace_access (user_id, workspace_id, role) VALUES (?,?,?)').run(user.id, wsId, role)
  const app = db.prepare("SELECT id FROM apps WHERE slug='jourdoc'").get()
  if (app) db.prepare('INSERT OR IGNORE INTO user_app_access (user_id, app_id) VALUES (?,?)').run(user.id, app.id)
  return c.json({ ok: true, user: { id: user.id, username: user.username } }, 201)
})

// Changer le rôle d'un membre (owner)
jourdoc.put('/:wsId/members/:uid', ownerCheck, async (c) => {
  const wsId = c.get('wsId')
  const uid = Number(c.req.param('uid'))
  const { role } = await c.req.json()
  if (!['owner','member'].includes(role)) return c.json({ error: 'Rôle invalide' }, 400)
  db.prepare('UPDATE user_workspace_access SET role=? WHERE user_id=? AND workspace_id=?').run(role, uid, wsId)
  return c.json({ ok: true })
})

// Retirer un membre (owner peut retirer tout le monde; membre se retire lui-même)
jourdoc.delete('/:wsId/members/:uid', async (c) => {
  const wsId = c.get('wsId')
  const userId = c.get('userId')
  const uid = Number(c.req.param('uid'))
  if (uid !== userId) {
    const access = db.prepare('SELECT role FROM user_workspace_access WHERE user_id=? AND workspace_id=?').get(userId, wsId)
    if (access?.role !== 'owner') return c.json({ error: 'Forbidden' }, 403)
  }
  db.prepare('DELETE FROM user_workspace_access WHERE user_id=? AND workspace_id=?').run(uid, wsId)
  return c.json({ ok: true })
})

jourdoc.get('/:wsId', (c) => {
  const wsId = c.get('wsId')
  const ws = db.prepare('SELECT id, name FROM workspaces WHERE id = ?').get(wsId)
  return c.json({ workspace: ws })
})

// ── OBJETS ───────────────────────────────────────────────────

jourdoc.get('/:wsId/objets', (c) => {
  const wsId = c.get('wsId')
  const objets = db.prepare(
    'SELECT id, parent_id, nom, nom_court, est_individu, description FROM jd_objets WHERE workspace_id = ? ORDER BY nom'
  ).all(wsId)
  return c.json({ objets })
})

jourdoc.post('/:wsId/objets', async (c) => {
  const wsId = c.get('wsId')
  const { parent_id, nom, nom_court, est_individu = 0, description } = await c.req.json()
  if (!nom) return c.json({ error: 'nom requis' }, 400)
  const result = db.prepare(
    'INSERT INTO jd_objets (workspace_id, parent_id, nom, nom_court, est_individu, description) VALUES (?,?,?,?,?,?)'
  ).run(wsId, parent_id ?? null, nom, nom_court ?? null, est_individu ? 1 : 0, description ?? null)
  return c.json({ id: result.lastInsertRowid }, 201)
})

jourdoc.put('/:wsId/objets/:id', async (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  const { parent_id, nom, nom_court, est_individu, description } = await c.req.json()
  db.prepare(
    'UPDATE jd_objets SET parent_id=?, nom=?, nom_court=?, est_individu=?, description=? WHERE id=? AND workspace_id=?'
  ).run(parent_id ?? null, nom, nom_court ?? null, est_individu ? 1 : 0, description ?? null, id, wsId)
  return c.json({ ok: true })
})

jourdoc.delete('/:wsId/objets/:id', (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  db.prepare('DELETE FROM jd_objets WHERE id=? AND workspace_id=?').run(id, wsId)
  return c.json({ ok: true })
})

// Notes d'un objet avec recherche récursive (±3 niveaux)
jourdoc.get('/:wsId/objets/:id/notes', (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  const direction = c.req.query('direction') ?? 'both'
  const maxDepth = 3
  let ids = []

  if (direction === 'down' || direction === 'both') {
    const rows = db.prepare(`
      WITH RECURSIVE desc(id, depth) AS (
        SELECT id, 0 FROM jd_objets WHERE id = ? AND workspace_id = ?
        UNION ALL
        SELECT o.id, d.depth + 1 FROM jd_objets o
        JOIN desc d ON o.parent_id = d.id WHERE d.depth < ?
      )
      SELECT id FROM desc
    `).all(id, wsId, maxDepth)
    ids.push(...rows.map(r => r.id))
  }

  if (direction === 'up' || direction === 'both') {
    const rows = db.prepare(`
      WITH RECURSIVE anc(id, parent_id, depth) AS (
        SELECT id, parent_id, 0 FROM jd_objets WHERE id = ? AND workspace_id = ?
        UNION ALL
        SELECT o.id, o.parent_id, a.depth + 1 FROM jd_objets o
        JOIN anc a ON o.id = a.parent_id WHERE a.depth < ?
      )
      SELECT id FROM anc
    `).all(id, wsId, maxDepth)
    ids.push(...rows.map(r => r.id))
  }

  ids = [...new Set(ids)]
  if (ids.length === 0) return c.json({ notes: [] })

  const placeholders = ids.map(() => '?').join(',')
  const notes = db.prepare(`
    SELECT DISTINCT n.id, n.type, n.nature, n.titre, n.titre_alt, n.date, n.contenu, n.theme_id,
      n.created_at, t.nom AS theme_nom
    FROM jd_notes n
    JOIN jd_note_objet no ON no.note_id = n.id
    LEFT JOIN jd_themes t ON t.id = n.theme_id
    WHERE no.objet_id IN (${placeholders}) AND n.workspace_id = ?
    ORDER BY n.date DESC, n.created_at DESC
  `).all(...ids, wsId)

  return c.json({ notes: withData(notes) })
})

// ── THEMES ───────────────────────────────────────────────────

jourdoc.get('/:wsId/themes', (c) => {
  const wsId = c.get('wsId')
  const themes = db.prepare(
    'SELECT id, parent_id, nom, nom_court FROM jd_themes WHERE workspace_id = ? ORDER BY nom'
  ).all(wsId)
  return c.json({ themes })
})

jourdoc.post('/:wsId/themes', async (c) => {
  const wsId = c.get('wsId')
  const { parent_id, nom, nom_court } = await c.req.json()
  if (!nom) return c.json({ error: 'nom requis' }, 400)
  const result = db.prepare(
    'INSERT INTO jd_themes (workspace_id, parent_id, nom, nom_court) VALUES (?,?,?,?)'
  ).run(wsId, parent_id ?? null, nom, nom_court ?? null)
  return c.json({ id: result.lastInsertRowid }, 201)
})

jourdoc.put('/:wsId/themes/:id', async (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  const { parent_id, nom, nom_court } = await c.req.json()
  db.prepare(
    'UPDATE jd_themes SET parent_id=?, nom=?, nom_court=? WHERE id=? AND workspace_id=?'
  ).run(parent_id ?? null, nom, nom_court ?? null, id, wsId)
  return c.json({ ok: true })
})

jourdoc.delete('/:wsId/themes/:id', (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  db.prepare('DELETE FROM jd_themes WHERE id=? AND workspace_id=?').run(id, wsId)
  return c.json({ ok: true })
})

// ── NOTES ────────────────────────────────────────────────────

// Recherche plein-texte sur les notes (pour le picker de liaison)
jourdoc.get('/:wsId/notes/search', (c) => {
  const wsId = c.get('wsId')
  const q = c.req.query('q') ?? ''
  const exclude = Number(c.req.query('exclude') ?? 0)
  const like = `%${q}%`
  const notes = db.prepare(`
    SELECT id, titre, titre_alt, type, nature, date, theme_id,
      (SELECT nom FROM jd_themes WHERE id = theme_id) AS theme_nom
    FROM jd_notes
    WHERE workspace_id = ? AND id != ?
      AND (titre LIKE ? OR titre_alt LIKE ?)
    ORDER BY date DESC, created_at DESC
    LIMIT 25
  `).all(wsId, exclude || -1, like, like)
  return c.json({ notes })
})

jourdoc.get('/:wsId/notes', (c) => {
  const wsId = c.get('wsId')
  const { type, nature, date_from, date_to, objet_id } = c.req.query()

  let sql = `
    SELECT DISTINCT n.id, n.type, n.nature, n.titre, n.titre_alt, n.date,
      n.source_url, n.tache_todoist_id, n.created_at, n.theme_id,
      t.nom AS theme_nom
    FROM jd_notes n
    LEFT JOIN jd_themes t ON t.id = n.theme_id
  `
  const params = []
  if (objet_id) sql += ' JOIN jd_note_objet no ON no.note_id = n.id'

  sql += ' WHERE n.workspace_id = ?'
  params.push(wsId)

  if (type)      { sql += ' AND n.type = ?';      params.push(type) }
  if (nature)    { sql += ' AND n.nature = ?';    params.push(nature) }
  if (date_from) { sql += ' AND n.date >= ?';     params.push(date_from) }
  if (date_to)   { sql += ' AND n.date <= ?';     params.push(date_to) }
  if (objet_id)  { sql += ' AND no.objet_id = ?'; params.push(Number(objet_id)) }
  if (c.req.query('theme_id')) { sql += ' AND n.theme_id = ?'; params.push(Number(c.req.query('theme_id'))) }

  sql += ' ORDER BY n.date DESC, n.created_at DESC'

  const notes = db.prepare(sql).all(...params)
  return c.json({ notes: withData(notes) })
})

jourdoc.get('/:wsId/notes/:id', (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  const note = db.prepare(
    `SELECT n.*, t.nom AS theme_nom FROM jd_notes n
     LEFT JOIN jd_themes t ON t.id = n.theme_id
     WHERE n.id = ? AND n.workspace_id = ?`
  ).get(id, wsId)
  if (!note) return c.json({ error: 'Not found' }, 404)

  const objets = db.prepare(
    'SELECT o.id, o.nom, o.nom_court FROM jd_note_objet no JOIN jd_objets o ON o.id = no.objet_id WHERE no.note_id = ?'
  ).all(id)

  const medias = db.prepare(
    'SELECT m.id, m.type_media, m.nom_original, m.fichier FROM jd_note_media nm JOIN jd_medias m ON m.id = nm.media_id WHERE nm.note_id = ? ORDER BY m.created_at'
  ).all(id)

  const liens = db.prepare(
    `SELECT nn.note_cible_id AS id, nn.type_lien, n.titre, n.titre_alt, n.type, n.nature, n.date, n.created_at
     FROM jd_note_note nn JOIN jd_notes n ON n.id = nn.note_cible_id
     WHERE nn.note_source_id = ? ORDER BY n.date ASC, n.created_at ASC`
  ).all(id)

  const liensEntrants = db.prepare(
    `SELECT nn.note_source_id AS id, nn.type_lien, n.titre, n.titre_alt, n.type, n.nature, n.date, n.created_at
     FROM jd_note_note nn JOIN jd_notes n ON n.id = nn.note_source_id
     WHERE nn.note_cible_id = ? ORDER BY n.date ASC, n.created_at ASC`
  ).all(id)

  return c.json({ note: { ...note, objets, medias, liens, liensEntrants } })
})

jourdoc.post('/:wsId/notes', async (c) => {
  const wsId = c.get('wsId')
  const { type = 'journal', nature, theme_id, titre, titre_alt, contenu, date, source_url, objet_ids = [], media_ids = [] } = await c.req.json()
  if (!titre) return c.json({ error: 'titre requis' }, 400)

  const result = db.prepare(
    `INSERT INTO jd_notes (workspace_id, type, nature, theme_id, titre, titre_alt, contenu, date, source_url)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(wsId, type, nature ?? null, theme_id ?? null, titre, titre_alt ?? null, contenu ?? null, date ?? null, source_url ?? null)

  const noteId = result.lastInsertRowid

  for (const objetId of objet_ids) {
    db.prepare('INSERT OR IGNORE INTO jd_note_objet (note_id, objet_id) VALUES (?,?)').run(noteId, objetId)
  }
  for (const mediaId of media_ids) {
    db.prepare('INSERT OR IGNORE INTO jd_note_media (note_id, media_id) VALUES (?,?)').run(noteId, mediaId)
    refreshLie(mediaId)
  }

  return c.json({ id: noteId }, 201)
})

jourdoc.put('/:wsId/notes/:id', async (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  const { type, nature, theme_id, titre, titre_alt, contenu, date, source_url, objet_ids, media_ids } = await c.req.json()

  db.prepare(
    `UPDATE jd_notes SET type=?, nature=?, theme_id=?, titre=?, titre_alt=?, contenu=?, date=?, source_url=?
     WHERE id=? AND workspace_id=?`
  ).run(type, nature ?? null, theme_id ?? null, titre, titre_alt ?? null, contenu ?? null, date ?? null, source_url ?? null, id, wsId)

  if (objet_ids !== undefined) {
    db.prepare('DELETE FROM jd_note_objet WHERE note_id = ?').run(id)
    for (const objetId of objet_ids) {
      db.prepare('INSERT OR IGNORE INTO jd_note_objet (note_id, objet_id) VALUES (?,?)').run(id, objetId)
    }
  }

  if (media_ids !== undefined) {
    const old = db.prepare('SELECT media_id FROM jd_note_media WHERE note_id = ?').all(id).map(r => r.media_id)
    db.prepare('DELETE FROM jd_note_media WHERE note_id = ?').run(id)
    for (const mediaId of media_ids) {
      db.prepare('INSERT OR IGNORE INTO jd_note_media (note_id, media_id) VALUES (?,?)').run(id, mediaId)
    }
    for (const mediaId of [...new Set([...old, ...media_ids])]) refreshLie(mediaId)
  }

  return c.json({ ok: true })
})

// POST /:wsId/notes/:id/liens — créer un lien
jourdoc.post('/:wsId/notes/:id/liens', async (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  const { note_cible_id, type_lien } = await c.req.json()
  if (!note_cible_id || note_cible_id === id) return c.json({ error: 'Invalid target' }, 400)
  const target = db.prepare('SELECT id FROM jd_notes WHERE id = ? AND workspace_id = ?').get(note_cible_id, wsId)
  if (!target) return c.json({ error: 'Not found' }, 404)
  db.prepare('INSERT OR IGNORE INTO jd_note_note (note_source_id, note_cible_id, type_lien) VALUES (?,?,?)')
    .run(id, note_cible_id, type_lien ?? null)
  return c.json({ ok: true }, 201)
})

// DELETE /:wsId/notes/:id/liens/:cibleId — supprimer un lien
jourdoc.delete('/:wsId/notes/:id/liens/:cibleId', (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  const cibleId = Number(c.req.param('cibleId'))
  db.prepare('DELETE FROM jd_note_note WHERE note_source_id = ? AND note_cible_id = ?').run(id, cibleId)
  return c.json({ ok: true })
})

jourdoc.delete('/:wsId/notes/:id', (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  db.prepare('DELETE FROM jd_notes WHERE id=? AND workspace_id=?').run(id, wsId)
  return c.json({ ok: true })
})

// ── MÉDIAS ───────────────────────────────────────────────────

const ALLOWED_EXTS = new Set(['jpg','jpeg','png','gif','webp','heic','heif','avif','pdf'])
const IMAGE_EXTS   = new Set(['jpg','jpeg','png','gif','webp','heic','heif','avif'])
const MAX_DIM = 1600

// Extrait la date de prise depuis les métadonnées EXIF (format ISO YYYY-MM-DD)
function extractExifDate(buffer) {
  try {
    const tags = ExifReader.load(buffer, { expanded: false })
    const raw = (tags['DateTimeOriginal'] ?? tags['DateTime'] ?? tags['DateTimeDigitized'])?.description
    if (raw && /^\d{4}:\d{2}:\d{2}/.test(raw)) {
      return raw.slice(0, 10).replace(/:/g, '-')
    }
  } catch { /* pas d'EXIF lisible */ }
  return null
}

// Réduit l'image à MAX_DIM px sur le grand côté, préserve les métadonnées EXIF
async function resizeImage(buffer, ext) {
  if (!IMAGE_EXTS.has(ext)) return { buf: buffer, size: buffer.length }
  try {
    const img = sharp(buffer)
    const meta = await img.metadata()
    const w = meta.width ?? 0
    const h = meta.height ?? 0
    if (w <= MAX_DIM && h <= MAX_DIM) return { buf: buffer, size: buffer.length }
    const out = await img
      .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
      .withMetadata()
      .toBuffer()
    return { buf: out, size: out.length }
  } catch { /* Sharp ne supporte pas ce format (ex. HEIC sans libheif) */ }
  return { buf: buffer, size: buffer.length }
}

jourdoc.post('/:wsId/medias', async (c) => {
  const wsId = c.get('wsId')
  const body = await c.req.parseBody({ all: true })

  const raw = body['files'] ?? body['file']
  const files = Array.isArray(raw) ? raw : raw ? [raw] : []
  if (files.length === 0) return c.json({ error: 'Aucun fichier' }, 400)

  const fallbackDate = (typeof body.date_prise === 'string' && body.date_prise)
    || new Date().toISOString().slice(0, 10)

  const dir = `uploads/jourdoc/${wsId}`
  mkdirSync(dir, { recursive: true })

  const results = []
  for (const file of files) {
    if (!file || typeof file === 'string') continue
    const ext = (file.name.split('.').pop() ?? '').toLowerCase()
    if (!ALLOWED_EXTS.has(ext)) continue

    const typeMedia = ext === 'pdf' ? 'pdf' : 'photo'
    const rawBuf = Buffer.from(await file.arrayBuffer())

    // 1. Date EXIF en priorité
    const exifDate = extractExifDate(rawBuf)
    const datePrise = exifDate ?? fallbackDate

    // 2. Réduction si image > 1600 px
    const { buf, size } = await resizeImage(rawBuf, ext)

    const filename = `${randomUUID()}.${ext}`
    const filepath = `${dir}/${filename}`
    writeFileSync(filepath, buf)

    const r = db.prepare(
      'INSERT INTO jd_medias (workspace_id, fichier, nom_original, type_media, mime_type, taille, date_prise) VALUES (?,?,?,?,?,?,?)'
    ).run(wsId, filepath, file.name, typeMedia, file.type || null, size, datePrise)

    results.push({ id: r.lastInsertRowid, fichier: filepath, nom_original: file.name, type_media: typeMedia, date_prise: datePrise })
  }

  if (results.length === 0) return c.json({ error: 'Aucun fichier valide' }, 400)
  return c.json({ medias: results }, 201)
})

jourdoc.get('/:wsId/medias', (c) => {
  const wsId = c.get('wsId')
  const { date_from, date_to, type_media, lie } = c.req.query()

  let sql = 'SELECT * FROM jd_medias WHERE workspace_id = ?'
  const params = [wsId]

  if (date_from)   { sql += ' AND date_prise >= ?'; params.push(date_from) }
  if (date_to)     { sql += ' AND date_prise <= ?'; params.push(date_to) }
  if (type_media)  { sql += ' AND type_media = ?';  params.push(type_media) }
  if (lie !== undefined) { sql += ' AND lie = ?'; params.push(lie === '1' || lie === 'true' ? 1 : 0) }

  sql += ' ORDER BY date_prise DESC, created_at DESC'
  return c.json({ medias: db.prepare(sql).all(...params) })
})

jourdoc.delete('/:wsId/medias/:id', (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  const media = db.prepare('SELECT * FROM jd_medias WHERE id=? AND workspace_id=?').get(id, wsId)
  if (!media) return c.json({ error: 'Not found' }, 404)

  try { unlinkSync(media.fichier) } catch { /* fichier déjà absent */ }
  db.prepare('DELETE FROM jd_medias WHERE id=?').run(id)
  return c.json({ ok: true })
})

// Médias liés à une note
jourdoc.get('/:wsId/notes/:id/medias', (c) => {
  const wsId = c.get('wsId')
  const noteId = Number(c.req.param('id'))
  const medias = db.prepare(
    'SELECT m.* FROM jd_note_media nm JOIN jd_medias m ON m.id = nm.media_id WHERE nm.note_id = ? AND m.workspace_id = ? ORDER BY m.created_at'
  ).all(noteId, wsId)
  return c.json({ medias })
})

// Notes liées à un média
jourdoc.get('/:wsId/medias/:id/notes', (c) => {
  const wsId = c.get('wsId')
  const mediaId = Number(c.req.param('id'))
  const notes = db.prepare(`
    SELECT DISTINCT n.id, n.type, n.nature, n.titre, n.titre_alt, n.date, n.contenu, n.theme_id,
      t.nom AS theme_nom
    FROM jd_notes n
    JOIN jd_note_media nm ON nm.note_id = n.id
    LEFT JOIN jd_themes t ON t.id = n.theme_id
    WHERE nm.media_id = ? AND n.workspace_id = ?
    ORDER BY n.date DESC, n.created_at DESC
  `).all(mediaId, wsId)
  return c.json({ notes: withData(notes) })
})

// Remplacer les médias liés à une note
jourdoc.put('/:wsId/notes/:id/medias', async (c) => {
  const wsId = c.get('wsId')
  const noteId = Number(c.req.param('id'))
  const { media_ids = [] } = await c.req.json()

  const old = db.prepare('SELECT media_id FROM jd_note_media WHERE note_id = ?').all(noteId).map(r => r.media_id)
  db.prepare('DELETE FROM jd_note_media WHERE note_id = ?').run(noteId)
  for (const mediaId of media_ids) {
    db.prepare('INSERT OR IGNORE INTO jd_note_media (note_id, media_id) VALUES (?,?)').run(noteId, mediaId)
  }
  for (const mediaId of [...new Set([...old, ...media_ids])]) refreshLie(mediaId)

  return c.json({ ok: true })
})

export default jourdoc
