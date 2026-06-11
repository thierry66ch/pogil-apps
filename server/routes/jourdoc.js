import { Hono } from 'hono'
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import heicConvert from 'heic-convert'
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

// Tri topologique : s'assure que les parents sont traités avant leurs enfants
// (format nom+parent uniquement — le format chemin est déjà ordonné par construction)
function topoSort(rows, nameKey, parentKey) {
  const processed = new Set([''])   // '' = pas de parent = racine
  const result = []
  let remaining = [...rows]
  while (remaining.length > 0) {
    const before = remaining.length
    const next = []
    for (const row of remaining) {
      const parent = (row[parentKey] ?? '').trim()
      if (processed.has(parent)) {
        result.push(row)
        processed.add((row[nameKey] ?? '').trim())
      } else {
        next.push(row)
      }
    }
    remaining = next
    if (remaining.length === before) {
      // Aucun progrès : dépendance circulaire ou parent introuvable → ajouter tel quel
      result.push(...remaining)
      break
    }
  }
  return result
}

// Recherche par nom+parent exact ; si trouvé avec un mauvais parent → UPDATE
function upsertObjet(wsId, nom, parentId, nomCourt, estIndividu, description, created, updated, skipped) {
  // 1. Correspondance exacte (nom + parent correct)
  const exact = parentId === null
    ? db.prepare('SELECT id FROM jd_objets WHERE workspace_id=? AND nom=? AND parent_id IS NULL').get(wsId, nom)
    : db.prepare('SELECT id FROM jd_objets WHERE workspace_id=? AND nom=? AND parent_id=?').get(wsId, nom, parentId)
  if (exact) { skipped.push(nom); return exact.id }

  // 2. Même nom, parent différent → mise à jour du parent
  const byName = db.prepare('SELECT id FROM jd_objets WHERE workspace_id=? AND nom=?').get(wsId, nom)
  if (byName) {
    db.prepare('UPDATE jd_objets SET parent_id=? WHERE id=?').run(parentId, byName.id)
    updated.push(nom); return byName.id
  }

  // 3. Création
  const r = db.prepare(
    'INSERT INTO jd_objets (workspace_id, parent_id, nom, nom_court, est_individu, description) VALUES (?,?,?,?,?,?)'
  ).run(wsId, parentId, nom, nomCourt || null, estIndividu ? 1 : 0, description || null)
  created.push(nom); return r.lastInsertRowid
}

function upsertTheme(wsId, nom, parentId, nomCourt, created, updated, skipped) {
  const exact = parentId === null
    ? db.prepare('SELECT id FROM jd_themes WHERE workspace_id=? AND nom=? AND parent_id IS NULL').get(wsId, nom)
    : db.prepare('SELECT id FROM jd_themes WHERE workspace_id=? AND nom=? AND parent_id=?').get(wsId, nom, parentId)
  if (exact) { skipped.push(nom); return exact.id }

  const byName = db.prepare('SELECT id FROM jd_themes WHERE workspace_id=? AND nom=?').get(wsId, nom)
  if (byName) {
    db.prepare('UPDATE jd_themes SET parent_id=? WHERE id=?').run(parentId, byName.id)
    updated.push(nom); return byName.id
  }

  const r = db.prepare(
    'INSERT INTO jd_themes (workspace_id, parent_id, nom, nom_court) VALUES (?,?,?,?)'
  ).run(wsId, parentId, nom, nomCourt || null)
  created.push(nom); return r.lastInsertRowid
}

jourdoc.post('/:wsId/import/objets', wsCheck, async (c) => {
  const wsId = c.get('wsId')
  const { csv } = await c.req.json()
  if (!csv?.trim()) return c.json({ error: 'CSV vide' }, 400)

  const { headers, rows } = parseCSV(csv)
  const created = [], updated = [], skipped = [], errors = []
  const pathCache = new Map()
  const nameCache = new Map()
  const hasPath = headers.includes('chemin') || headers.includes('path')

  if (hasPath) {
    // Format chemin : déjà ordonné (racine en premier) — pas besoin de tri topo
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
        const id = upsertObjet(wsId, nom, parentId,
          isLeaf ? row.nom_court : null,
          isLeaf && boolVal(row.est_individu),
          isLeaf ? row.description : null,
          created, updated, skipped)
        pathCache.set(cumPath, id)
        parentId = id
      }
    }
  } else {
    // Format nom + parent : tri topologique pour garantir que les parents existent
    const sorted = topoSort(rows, 'nom', 'parent')
    const existing = db.prepare('SELECT id, nom FROM jd_objets WHERE workspace_id=?').all(wsId)
    for (const o of existing) nameCache.set(o.nom, o.id)
    for (const row of sorted) {
      const nom = (row.nom || row.name || '').trim()
      if (!nom) continue
      const parentNom = (row.parent || '').trim()
      const parentId = parentNom ? (nameCache.get(parentNom) ?? null) : null
      const id = upsertObjet(wsId, nom, parentId, row.nom_court, boolVal(row.est_individu), row.description, created, updated, skipped)
      nameCache.set(nom, id)
    }
  }

  return c.json({ created: created.length, updated: updated.length, skipped: skipped.length, errors })
})

jourdoc.post('/:wsId/import/themes', wsCheck, async (c) => {
  const wsId = c.get('wsId')
  const { csv } = await c.req.json()
  if (!csv?.trim()) return c.json({ error: 'CSV vide' }, 400)

  const { headers, rows } = parseCSV(csv)
  const created = [], updated = [], skipped = [], errors = []
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
        const id = upsertTheme(wsId, nom, parentId, isLeaf ? row.nom_court : null, created, updated, skipped)
        pathCache.set(cumPath, id)
        parentId = id
      }
    }
  } else {
    const sorted = topoSort(rows, 'nom', 'parent')
    const existing = db.prepare('SELECT id, nom FROM jd_themes WHERE workspace_id=?').all(wsId)
    for (const t of existing) nameCache.set(t.nom, t.id)
    for (const row of sorted) {
      const nom = (row.nom || row.name || '').trim()
      if (!nom) continue
      const parentNom = (row.parent || '').trim()
      const parentId = parentNom ? (nameCache.get(parentNom) ?? null) : null
      const id = upsertTheme(wsId, nom, parentId, row.nom_court, created, updated, skipped)
      nameCache.set(nom, id)
    }
  }

  return c.json({ created: created.length, updated: updated.length, skipped: skipped.length, errors })
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
  const ws = db.prepare('SELECT id, name, COALESCE(jd_search_depth, 3) AS search_depth FROM workspaces WHERE id = ?').get(wsId)
  return c.json({ workspace: ws })
})

// PATCH /:wsId/search-depth — mettre à jour la profondeur de recherche
jourdoc.patch('/:wsId/search-depth', wsCheck, async (c) => {
  const wsId = c.get('wsId')
  const { depth } = await c.req.json()
  const d = Math.max(1, Math.min(10, Number(depth) || 3))
  db.prepare('UPDATE workspaces SET jd_search_depth=? WHERE id=?').run(d, wsId)
  return c.json({ ok: true, search_depth: d })
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
  const ws = db.prepare('SELECT COALESCE(jd_search_depth,3) AS d FROM workspaces WHERE id=?').get(wsId)
  const maxDepth = ws?.d ?? 3
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
    SELECT DISTINCT n.*, t.nom AS theme_nom
    FROM jd_notes n
    JOIN jd_note_objet no ON no.note_id = n.id
    LEFT JOIN jd_themes t ON t.id = n.theme_id
    WHERE no.objet_id IN (${placeholders}) AND n.workspace_id = ?
    ORDER BY n.date DESC, n.created_at DESC
  `).all(...ids, wsId)

  return c.json({ notes: withData(notes) })
})

// ── THEME NOTES (avec direction hiérarchique) ─────────────────
jourdoc.get('/:wsId/themes/:id/notes', (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  const direction = c.req.query('direction') ?? 'both'

  const ws = db.prepare('SELECT COALESCE(jd_search_depth,3) AS d FROM workspaces WHERE id=?').get(wsId)
  const maxDepth = ws?.d ?? 3
  const allThemes = db.prepare('SELECT id, parent_id FROM jd_themes WHERE workspace_id = ?').all(wsId)
  const ids = new Set([id])

  if (direction === 'down' || direction === 'both') {
    const depthMap = new Map([[id, 0]])
    let added = true
    while (added) {
      added = false
      for (const t of allThemes) {
        if (!ids.has(t.id) && ids.has(t.parent_id)) {
          const pd = depthMap.get(t.parent_id) ?? 0
          if (pd < maxDepth) { ids.add(t.id); depthMap.set(t.id, pd + 1); added = true }
        }
      }
    }
  }

  if (direction === 'up' || direction === 'both') {
    let current = id; let d = 0
    while (d < maxDepth) {
      const t = allThemes.find(x => x.id === current)
      if (!t || !t.parent_id) break
      ids.add(t.parent_id); current = t.parent_id; d++
    }
  }

  const idsArr = [...ids]
  const placeholders = idsArr.map(() => '?').join(',')
  const notes = db.prepare(`
    SELECT DISTINCT n.*, t.nom AS theme_nom
    FROM jd_notes n
    LEFT JOIN jd_themes t ON t.id = n.theme_id
    WHERE n.theme_id IN (${placeholders}) AND n.workspace_id = ?
    ORDER BY n.date DESC, n.created_at DESC
  `).all(...idsArr, wsId)

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
    SELECT DISTINCT n.*, t.nom AS theme_nom
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
const HEIC_EXTS    = new Set(['heic','heif'])
const MAX_DIM = 1600

// Détecte le vrai format depuis les magic bytes (ignore l'extension)
function detectMagicFormat(buf) {
  if (buf.length < 12) return null
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'jpeg'
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png'
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'webp'
  if (buf.slice(4, 8).toString('ascii') === 'ftyp') return 'heif'
  return null
}

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

// Traite l'image : convertit HEIC→JPEG et réduit à MAX_DIM si nécessaire
async function processImage(buffer, ext) {
  if (!IMAGE_EXTS.has(ext)) return { buf: buffer, outExt: ext, size: buffer.length }

  // iOS envoie souvent du JPEG avec extension .heic — détecter le vrai format
  const magic = detectMagicFormat(buffer)
  const isActuallyHeic = HEIC_EXTS.has(ext) && magic !== 'jpeg' && magic !== 'png' && magic !== 'webp'
  // Sortie toujours en .jpg pour tout fichier portant extension heic/heif
  const outExt = HEIC_EXTS.has(ext) ? 'jpg' : (ext === 'jpeg' ? 'jpg' : ext)

  try {
    const img = sharp(buffer)
    const meta = await img.metadata()
    const w = meta.width ?? 0
    const h = meta.height ?? 0
    const needsResize = w > MAX_DIM || h > MAX_DIM
    const needsConvert = isActuallyHeic
    if (!needsResize && !needsConvert) return { buf: buffer, outExt, size: buffer.length }
    let pipeline = needsResize
      ? img.resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
      : img
    if (needsConvert) pipeline = pipeline.jpeg({ quality: 90 })
    const out = await pipeline.withMetadata().toBuffer()
    return { buf: out, outExt, size: out.length }
  } catch {
    if (isActuallyHeic) {
      // Fallback WASM si sharp ne peut pas décoder le HEIC natif
      try {
        const jpegBuf = Buffer.from(await heicConvert({ buffer, format: 'JPEG', quality: 0.9 }))
        return { buf: jpegBuf, outExt: 'jpg', size: jpegBuf.length }
      } catch (e2) {
        console.error('[HEIC] heic-convert failed:', e2?.message)
      }
    }
    return { buf: buffer, outExt, size: buffer.length }
  }
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

    // 1. Date EXIF en priorité (lire depuis le buffer d'origine avant conversion)
    const exifDate = extractExifDate(rawBuf)
    const datePrise = exifDate ?? fallbackDate

    // 2. Conversion HEIC→JPEG + réduction si > MAX_DIM
    const { buf, outExt, size } = await processImage(rawBuf, ext)

    const filename = `${randomUUID()}.${outExt}`
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
    SELECT DISTINCT n.*, t.nom AS theme_nom
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

// ── TODOIST ──────────────────────────────────────────────────

const TODOIST_API = 'https://api.todoist.com/api/v1'

function todoistHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}
// Pour les appels sans corps (ex. close) : pas de Content-Type
function todoistAuthHeader(token) {
  return { Authorization: `Bearer ${token}` }
}
// Extrait le task peu importe la forme de la réponse API v1
function extractTask(data) {
  if (!data) return null
  if (data.id) return data
  if (data.task?.id) return data.task
  if (data.item?.id) return data.item
  if (Array.isArray(data.results) && data.results[0]?.id) return data.results[0]
  if (Array.isArray(data) && data[0]?.id) return data[0]
  return data
}

// Construit l'URL publique de la note à partir des headers de la requête
function notePublicUrl(c, wsId, noteId) {
  const proto = c.req.header('x-forwarded-proto') || 'https'
  const host  = c.req.header('x-forwarded-host') || c.req.header('host') || 'localhost'
  return `${proto}://${host}/jourdoc/${wsId}/notes/${noteId}`
}

// Horodatages des syncs par workspace (en mémoire — reset au redémarrage serveur)
const syncTimestamps = new Map()

// GET /:wsId/todoist — config du workspace (token masqué) + dernière sync
jourdoc.get('/:wsId/todoist', wsCheck, (c) => {
  const wsId = c.get('wsId')
  const ws = db.prepare('SELECT todoist_token, todoist_project_id, todoist_project_nom FROM workspaces WHERE id=?').get(wsId)
  return c.json({
    configured:  Boolean(ws?.todoist_token),
    project_id:  ws?.todoist_project_id  ?? null,
    project_nom: ws?.todoist_project_nom ?? null,
    last_sync_at: syncTimestamps.get(wsId) ?? null,
  })
})

// POST /:wsId/todoist/sync — synchronisation batch des tâches non complétées
jourdoc.post('/:wsId/todoist/sync', wsCheck, async (c) => {
  try {
    const wsId = c.get('wsId')
    const ws = db.prepare('SELECT todoist_token FROM workspaces WHERE id=?').get(wsId)
    if (!ws?.todoist_token) return c.json({ ok: false, error: 'Todoist non configuré' })

    const notes = db.prepare(
      'SELECT id, tache_todoist_id, tache_todoist_due FROM jd_notes WHERE workspace_id=? AND tache_todoist_id IS NOT NULL AND (tache_todoist_done IS NULL OR tache_todoist_done = 0)'
    ).all(wsId)

    let completed = 0, errors = 0
    for (const note of notes) {
      try {
        const res = await fetch(`${TODOIST_API}/tasks/${note.tache_todoist_id}?include_completed=true`, {
          headers: todoistAuthHeader(ws.todoist_token)
        })
        if (res.status === 404) {
          db.prepare('UPDATE jd_notes SET tache_todoist_done=1 WHERE id=?').run(note.id)
          completed++; continue
        }
        if (!res.ok) { errors++; continue }
        const task = extractTask(await res.json())
        const isDone = Boolean(task?.checked || task?.completed_at || task?.is_completed)
        const currentDue = task?.due?.date ?? null
        // Détection tâche récurrente : due date avancée sans complétion classique
        const isRecurring = !isDone && note.tache_todoist_due && currentDue && currentDue > note.tache_todoist_due
        const taskContent = task?.content ?? null
        if (isRecurring) {
          db.prepare('UPDATE jd_notes SET tache_todoist_due=?, tache_todoist_priority=?, tache_todoist_recurrence_done=1, tache_todoist_content=? WHERE id=?')
            .run(currentDue, task?.priority ?? null, taskContent, note.id)
          completed++
        } else {
          db.prepare('UPDATE jd_notes SET tache_todoist_due=?, tache_todoist_priority=?, tache_todoist_done=?, tache_todoist_content=? WHERE id=?')
            .run(currentDue, task?.priority ?? null, isDone ? 1 : 0, taskContent, note.id)
          if (isDone) completed++
        }
      } catch { errors++ }
    }

    const syncedAt = new Date().toISOString()
    syncTimestamps.set(wsId, syncedAt)
    return c.json({ ok: true, synced: notes.length, completed, errors, synced_at: syncedAt })
  } catch (e) {
    return c.json({ ok: false, error: String(e?.message ?? e) }, 500)
  }
})

// GET /:wsId/todoist/tasks — toutes les notes avec tâche Todoist liée
jourdoc.get('/:wsId/todoist/tasks', wsCheck, (c) => {
  const wsId = c.get('wsId')
  const notes = db.prepare(`
    SELECT n.id, n.titre, n.titre_alt, n.date, n.type, n.nature,
           n.tache_todoist_id, n.tache_todoist_done, n.tache_todoist_due,
           n.tache_todoist_priority, n.tache_todoist_recurrence_done,
           COALESCE(n.tache_todoist_consigne, 0) AS tache_todoist_consigne,
           n.tache_todoist_content,
           t.nom AS theme_nom
    FROM jd_notes n
    LEFT JOIN jd_themes t ON t.id = n.theme_id
    WHERE n.workspace_id = ? AND n.tache_todoist_id IS NOT NULL
    ORDER BY n.tache_todoist_done ASC, n.tache_todoist_recurrence_done DESC,
             n.tache_todoist_due ASC, n.date DESC
  `).all(wsId)
  const withObjets = notes.map(n => ({
    ...n,
    objets: db.prepare('SELECT o.id, o.nom FROM jd_note_objet no JOIN jd_objets o ON o.id = no.objet_id WHERE no.note_id = ?').all(n.id),
  }))
  return c.json({ notes: withObjets })
})

// PUT /:wsId/todoist — enregistrer token + projet
jourdoc.put('/:wsId/todoist', wsCheck, async (c) => {
  const wsId = c.get('wsId')
  const { token, project_id, project_nom } = await c.req.json()
  db.prepare('UPDATE workspaces SET todoist_token=?, todoist_project_id=?, todoist_project_nom=? WHERE id=?')
    .run(token?.trim() || null, project_id || null, project_nom || null, wsId)
  return c.json({ ok: true })
})

// POST /:wsId/todoist/projects — tester un token et retourner les projets
jourdoc.post('/:wsId/todoist/projects', wsCheck, async (c) => {
  const wsId = c.get('wsId')
  const body = await c.req.json().catch(() => ({}))
  // Utilise le token fourni (test) ou le token stocké ; trim() pour éviter les espaces de copier-coller
  let token = (body.token ?? '').trim()
  if (!token) {
    const ws = db.prepare('SELECT todoist_token FROM workspaces WHERE id=?').get(wsId)
    token = (ws?.todoist_token ?? '').trim()
  }
  if (!token) return c.json({ error: 'Aucun token' }, 400)
  try {
    const res = await fetch(`${TODOIST_API}/projects`, { headers: todoistHeaders(token) })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return c.json({ error: `Todoist a répondu HTTP ${res.status} — ${body.slice(0, 200) || 'pas de détail'}` }, 400)
    }
    const data = await res.json()
    // API v1 renvoie { results: [...], next_cursor } ; v2 renvoyait un tableau direct
    const list = Array.isArray(data) ? data : (data.results ?? data.items ?? [])
    return c.json({ projects: list.map(p => ({ id: p.id, name: p.name })) })
  } catch (e) {
    return c.json({ error: `Impossible de contacter Todoist : ${e.message}` }, 502)
  }
})

// POST /:wsId/notes/:id/todoist — créer une tâche Todoist
jourdoc.post('/:wsId/notes/:noteId/todoist', wsCheck, async (c) => {
  const wsId  = c.get('wsId')
  const noteId = Number(c.req.param('noteId'))
  const { due_date, priority = 2, recurrence, titre: titreTask } = await c.req.json()

  const ws   = db.prepare('SELECT todoist_token, todoist_project_id FROM workspaces WHERE id=?').get(wsId)
  if (!ws?.todoist_token) return c.json({ error: 'Todoist non configuré' }, 400)

  const note = db.prepare('SELECT titre, date FROM jd_notes WHERE id=? AND workspace_id=?').get(noteId, wsId)
  if (!note) return c.json({ error: 'Note introuvable' }, 404)

  const noteUrl = notePublicUrl(c, wsId, noteId)
  const dateStr = note.date ? `\nDate : ${note.date}` : ''
  const taskBody = {
    content:     titreTask?.trim() || note.titre,
    description: `Source : [${note.titre}](${noteUrl})${dateStr}`,
    project_id:  ws.todoist_project_id || undefined,
    priority:    Number(priority) || 2,
  }
  if (recurrence) taskBody.due_string = recurrence
  else if (due_date) taskBody.due_date = due_date

  try {
    const res = await fetch(`${TODOIST_API}/tasks`, {
      method: 'POST',
      headers: { ...todoistHeaders(ws.todoist_token), 'X-Request-Id': randomUUID() },
      body: JSON.stringify(taskBody),
    })
    if (!res.ok) {
      const err = await res.text()
      return c.json({ error: `Todoist: ${err}` }, 400)
    }
    const data = await res.json()
    // API v1 peut envelopper dans { task: {...} } ou retourner l'objet directement
    const task = data.id ? data : (data.task ?? data.item ?? data)
    const cachedDue = task.due?.date ?? due_date ?? null
    const taskContent = task.content ?? taskBody.content ?? null
    db.prepare('UPDATE jd_notes SET tache_todoist_id=?, tache_todoist_due=?, tache_todoist_priority=?, tache_todoist_done=0, tache_todoist_content=? WHERE id=?')
      .run(task.id, cachedDue, Number(priority) || 2, taskContent, noteId)
    return c.json({ task_id: task.id, url: `https://app.todoist.com/app/task/${task.id}` })
  } catch (e) {
    return c.json({ error: `Impossible de contacter Todoist : ${e.message}` }, 502)
  }
})

// POST /:wsId/notes/:noteId/todoist/link — lier une tâche Todoist existante via son URL ou ID
jourdoc.post('/:wsId/notes/:noteId/todoist/link', wsCheck, async (c) => {
  try {
    const wsId   = c.get('wsId')
    const noteId = Number(c.req.param('noteId'))
    const body   = await c.req.json().catch(() => ({}))
    const raw    = (body.task_url ?? '').trim()
    if (!raw) return c.json({ error: 'URL ou ID requis' }, 400)

    const ws = db.prepare('SELECT todoist_token FROM workspaces WHERE id=?').get(wsId)
    if (!ws?.todoist_token) return c.json({ error: 'Todoist non configuré' }, 400)

    // Extraire l'ID depuis une URL Todoist moderne :
    // https://app.todoist.com/app/task/nom-kebab-TASKID
    // L'ID réel est le dernier segment séparé par '-' contenant des majuscules (ex. 6cVrwR54r6Jhmr69)
    const slug = raw.includes('/task/')
      ? raw.split('/task/').pop().split('?')[0].split('/')[0].trim()
      : raw.trim()
    let taskId = slug
    if (slug.includes('-')) {
      const segs = slug.split('-')
      for (let i = segs.length - 1; i >= 0; i--) {
        if (/[A-Z]/.test(segs[i]) && segs[i].length >= 8) { taskId = segs[i]; break }
      }
    }
    if (!taskId) return c.json({ error: 'ID de tâche introuvable dans l\'URL' }, 400)

    const res = await fetch(`${TODOIST_API}/tasks/${taskId}`, { headers: todoistAuthHeader(ws.todoist_token) })
    if (!res.ok) return c.json({ error: `Tâche introuvable dans Todoist (${res.status})` }, 400)
    const task = extractTask(await res.json())
    const isDone = Boolean(task?.checked || task?.completed_at || task?.is_completed)
    db.prepare('UPDATE jd_notes SET tache_todoist_id=?, tache_todoist_content=?, tache_todoist_due=?, tache_todoist_priority=?, tache_todoist_done=? WHERE id=?')
      .run(taskId, task?.content ?? null, task?.due?.date ?? null, task?.priority ?? null, isDone ? 1 : 0, noteId)

    // Ajouter un commentaire sur la tâche Todoist avec le lien vers la note JourDoc
    const note = db.prepare('SELECT titre FROM jd_notes WHERE id=?').get(noteId)
    const noteUrl = notePublicUrl(c, wsId, noteId)
    await fetch(`${TODOIST_API}/comments`, {
      method: 'POST',
      headers: { ...todoistHeaders(ws.todoist_token), 'X-Request-Id': randomUUID() },
      body: JSON.stringify({ task_id: taskId, content: `📔 Note JourDoc : [${note?.titre ?? 'Note'}](${noteUrl})` }),
    }).catch(() => { /* on continue si le commentaire échoue */ })

    return c.json({ ok: true, task_id: taskId, content: task?.content, url: `https://app.todoist.com/app/task/${taskId}` })
  } catch (e) {
    return c.json({ error: String(e?.message ?? e) }, 500)
  }
})

// GET /:wsId/notes/:id/todoist — statut de la tâche (polling)
jourdoc.get('/:wsId/notes/:noteId/todoist', wsCheck, async (c) => {
  const wsId   = c.get('wsId')
  const noteId = Number(c.req.param('noteId'))

  const ws   = db.prepare('SELECT todoist_token FROM workspaces WHERE id=?').get(wsId)
  const note = db.prepare('SELECT tache_todoist_id FROM jd_notes WHERE id=? AND workspace_id=?').get(noteId, wsId)
  if (!note?.tache_todoist_id) return c.json({ linked: false })
  if (!ws?.todoist_token)      return c.json({ linked: true, error: 'Token manquant' })

  try {
    const taskId = note.tache_todoist_id
    // include_completed=true pour voir les tâches terminées qui ne retournent pas 404
    const res = await fetch(`${TODOIST_API}/tasks/${taskId}?include_completed=true`, {
      headers: todoistAuthHeader(ws.todoist_token)
    })
    if (res.status === 404) {
      return c.json({ linked: true, completed: true, task_id: taskId })
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return c.json({ linked: true, error: `Todoist ${res.status}: ${body.slice(0, 100)}` })
    }
    const data = await res.json()
    const task = extractTask(data)
    // API v1 : champ "checked" (booléen) + "completed_at" (timestamp) — pas "is_completed"
    const completed = Boolean(task?.checked || task?.completed_at || task?.is_completed)
    const dueDate = task?.due?.date ?? null
    const priority = task?.priority ?? null
    // Mise à jour du cache local
    db.prepare('UPDATE jd_notes SET tache_todoist_due=?, tache_todoist_priority=?, tache_todoist_done=? WHERE id=?')
      .run(dueDate, priority, completed ? 1 : 0, noteId)
    return c.json({
      linked:    true,
      completed,
      content:   task?.content  ?? null,
      due:       task?.due      ?? task?.deadline ?? null,
      priority,
      url:       `https://app.todoist.com/app/task/${task?.id ?? taskId}`,
      task_id:   task?.id ?? taskId,
    })
  } catch (e) {
    return c.json({ linked: true, error: `Impossible de contacter Todoist : ${e.message}` })
  }
})

// POST /:wsId/notes/:id/todoist/close — marquer la tâche comme terminée dans Todoist
jourdoc.post('/:wsId/notes/:noteId/todoist/close', wsCheck, async (c) => {
  const wsId   = c.get('wsId')
  const noteId = Number(c.req.param('noteId'))

  const ws   = db.prepare('SELECT todoist_token FROM workspaces WHERE id=?').get(wsId)
  const note = db.prepare('SELECT tache_todoist_id FROM jd_notes WHERE id=? AND workspace_id=?').get(noteId, wsId)
  if (!note?.tache_todoist_id) return c.json({ error: 'Aucune tâche liée' }, 400)
  if (!ws?.todoist_token)      return c.json({ error: 'Todoist non configuré' }, 400)

  try {
    const res = await fetch(`${TODOIST_API}/tasks/${note.tache_todoist_id}/close`, {
      method: 'POST',
      headers: todoistAuthHeader(ws.todoist_token),  // pas de Content-Type sur POST sans corps
    })
    // 200, 204, ou tout 2xx = succès
    if (res.ok || res.status === 204) {
      db.prepare('UPDATE jd_notes SET tache_todoist_done=1 WHERE id=?').run(noteId)
      return c.json({ ok: true })
    }
    const body = await res.text().catch(() => '')
    return c.json({ error: `Todoist ${res.status}: ${body.slice(0, 200) || 'pas de détail'}` }, 400)
  } catch (e) {
    return c.json({ error: `Impossible de contacter Todoist : ${e.message}` }, 502)
  }
})

// DELETE /:wsId/notes/:id/todoist — délier (et supprimer dans Todoist si souhaité)
jourdoc.delete('/:wsId/notes/:noteId/todoist', wsCheck, async (c) => {
  const wsId   = c.get('wsId')
  const noteId = Number(c.req.param('noteId'))
  const { delete_in_todoist = false } = await c.req.json().catch(() => ({}))

  const ws   = db.prepare('SELECT todoist_token FROM workspaces WHERE id=?').get(wsId)
  const note = db.prepare('SELECT tache_todoist_id FROM jd_notes WHERE id=? AND workspace_id=?').get(noteId, wsId)
  if (!note) return c.json({ error: 'Note introuvable' }, 404)

  if (delete_in_todoist && note.tache_todoist_id && ws?.todoist_token) {
    try {
      await fetch(`${TODOIST_API}/tasks/${note.tache_todoist_id}`, {
        method: 'DELETE', headers: todoistHeaders(ws.todoist_token)
      })
    } catch { /* on continue même si ça échoue */ }
  }

  db.prepare('UPDATE jd_notes SET tache_todoist_id=NULL, tache_todoist_due=NULL, tache_todoist_priority=NULL, tache_todoist_done=0 WHERE id=?').run(noteId)
  return c.json({ ok: true })
})

// GET /:wsId/notes/:noteId/todoist/details — date exécution + commentaires
jourdoc.get('/:wsId/notes/:noteId/todoist/details', wsCheck, async (c) => {
  const wsId   = c.get('wsId')
  const noteId = Number(c.req.param('noteId'))
  const ws   = db.prepare('SELECT todoist_token FROM workspaces WHERE id=?').get(wsId)
  const note = db.prepare('SELECT tache_todoist_id FROM jd_notes WHERE id=? AND workspace_id=?').get(noteId, wsId)
  if (!note?.tache_todoist_id) return c.json({ error: 'Aucune tâche liée' }, 400)
  if (!ws?.todoist_token) return c.json({ error: 'Token manquant' }, 400)
  const taskId = note.tache_todoist_id
  try {
    const [taskRes, commRes] = await Promise.all([
      fetch(`${TODOIST_API}/tasks/${taskId}?include_completed=true`, { headers: todoistAuthHeader(ws.todoist_token) }),
      fetch(`${TODOIST_API}/comments?task_id=${taskId}`, { headers: todoistAuthHeader(ws.todoist_token) }),
    ])
    const task = taskRes.ok ? extractTask(await taskRes.json()) : null
    const commData = commRes.ok ? await commRes.json() : null
    const comments = Array.isArray(commData) ? commData : (commData?.results ?? [])
    return c.json({
      completed_at: task?.completed_at ?? null,
      task_content: task?.content ?? null,
      task_id:      taskId,
      comments: comments.map(cm => ({ content: cm.content, posted_at: cm.posted_at })),
    })
  } catch (e) {
    return c.json({ error: `Impossible de contacter Todoist : ${e.message}` }, 502)
  }
})

// POST /:wsId/notes/:noteId/todoist/import — ajoute date+commentaires à la fin du contenu de la note
jourdoc.post('/:wsId/notes/:noteId/todoist/import', wsCheck, async (c) => {
  const wsId   = c.get('wsId')
  const noteId = Number(c.req.param('noteId'))
  const { completed_at, comments = [], task_title, task_id } = await c.req.json()
  const note = db.prepare('SELECT contenu FROM jd_notes WHERE id=? AND workspace_id=?').get(noteId, wsId)
  if (!note) return c.json({ error: 'Note introuvable' }, 404)

  function esc(s) {
    return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }

  const dateStr = completed_at
    ? new Date(completed_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  let append = `<hr><p><strong>✓ Tâche exécutée${dateStr ? ` le ${dateStr}` : ''}</strong></p>`
  if (task_title && task_id) {
    const taskUrl = `https://app.todoist.com/app/task/${esc(task_id)}`
    append += `<p>📌 <a href="${taskUrl}" target="_blank" rel="noopener noreferrer">${esc(task_title)}</a></p>`
  }
  for (const cm of comments) {
    const cmDate = cm.posted_at
      ? new Date(cm.posted_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })
      : ''
    // Échapper le contenu puis convertir les sauts de ligne en balises
    const safeContent = esc(cm.content ?? '').replace(/\n/g, '</p><p>')
    append += `<blockquote><p>${cmDate ? `<em>${cmDate}</em> — ` : ''}${safeContent}</p></blockquote>`
  }

  // S'assurer que le contenu existant est non-nul et terminer proprement avant d'ajouter
  const existing = note.contenu ?? ''
  const newContenu = existing + append
  // Récurrente → remet recurrence_done à 0 (retour en cours) ; terminée → marque consignée
  const taskMeta = db.prepare('SELECT tache_todoist_recurrence_done FROM jd_notes WHERE id=?').get(noteId)
  if (taskMeta?.tache_todoist_recurrence_done) {
    db.prepare('UPDATE jd_notes SET contenu=?, tache_todoist_recurrence_done=0 WHERE id=?').run(newContenu, noteId)
  } else {
    db.prepare('UPDATE jd_notes SET contenu=?, tache_todoist_consigne=1 WHERE id=?').run(newContenu, noteId)
  }
  return c.json({ ok: true, contenu: newContenu })
})

// ── EXPORT WORKSPACE ─────────────────────────────────────────
jourdoc.get('/:wsId/export', wsCheck, async (c) => {
  const wsId  = c.get('wsId')
  const { format = 'json', medias = '0' } = c.req.query()
  const withMedias = medias === '1'

  // Collecte des données
  const objets  = db.prepare('SELECT * FROM jd_objets  WHERE workspace_id=?').all(wsId)
  const themes  = db.prepare('SELECT * FROM jd_themes  WHERE workspace_id=?').all(wsId)
  const rawNotes = db.prepare('SELECT * FROM jd_notes  WHERE workspace_id=?').all(wsId)
  const rawMedias = db.prepare('SELECT * FROM jd_medias WHERE workspace_id=?').all(wsId)

  // Enrichissement des notes
  const notes = rawNotes.map(n => ({
    ...n,
    objets:  db.prepare('SELECT o.id,o.nom FROM jd_note_objet no JOIN jd_objets o ON o.id=no.objet_id WHERE no.note_id=?').all(n.id),
    medias:  db.prepare('SELECT m.id,m.nom_original,m.fichier,m.type_media,m.date_prise FROM jd_note_media nm JOIN jd_medias m ON m.id=nm.media_id WHERE nm.note_id=?').all(n.id),
    liens:   db.prepare('SELECT note_cible_id,type_lien FROM jd_note_note WHERE note_source_id=?').all(n.id),
  }))

  const wsName = db.prepare('SELECT name FROM workspaces WHERE id=?').get(wsId)?.name ?? `workspace-${wsId}`
  const slug = wsName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const date = new Date().toISOString().slice(0, 10)

  if (format === 'json') {
    const payload = JSON.stringify({ workspace: { id: wsId, name: wsName, exported_at: new Date().toISOString() }, objets, themes, notes, medias: rawMedias }, null, 2)
    c.header('Content-Type', 'application/json')
    c.header('Content-Disposition', `attachment; filename="${slug}-${date}.json"`)
    return c.body(payload)
  }

  // CSV + ZIP — bufferisé en mémoire pour compatibilité Hono
  const archiver = (await import('archiver')).default

  function toCsv(rows) {
    if (!rows.length) return ''
    const keys = Object.keys(rows[0])
    const esc = v => (v == null ? '' : /[,"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))
    return [keys.join(','), ...rows.map(r => keys.map(k => esc(r[k])).join(','))].join('\n')
  }

  const liens = rawNotes.flatMap(n =>
    db.prepare('SELECT note_source_id,note_cible_id,type_lien FROM jd_note_note WHERE note_source_id=?').all(n.id)
  )

  const archive = archiver('zip', { zlib: { level: 6 } })
  const chunks = []
  archive.on('data', chunk => chunks.push(Buffer.from(chunk)))

  const zipDone = new Promise((resolve, reject) => {
    archive.on('end', resolve)
    archive.on('error', reject)
  })

  archive.append(toCsv(objets),    { name: 'objets.csv' })
  archive.append(toCsv(themes),    { name: 'themes.csv' })
  archive.append(toCsv(rawNotes),  { name: 'notes.csv' })
  archive.append(toCsv(rawMedias), { name: 'medias.csv' })
  archive.append(toCsv(liens),     { name: 'liens_notes.csv' })

  if (withMedias) {
    for (const m of rawMedias) {
      try { archive.file(`./${m.fichier}`, { name: `medias/${m.nom_original ?? m.fichier.split('/').pop()}` }) } catch { /* manquant */ }
    }
  }

  archive.finalize()
  await zipDone

  const buffer = Buffer.concat(chunks)
  c.header('Content-Type', 'application/zip')
  c.header('Content-Disposition', `attachment; filename="${slug}-${date}.zip"`)
  return c.body(buffer)
})

// ── ANALYSE PLURIANNUELLE ─────────────────────────────────────
jourdoc.get('/:wsId/analyse', wsCheck, (c) => {
  const wsId = c.get('wsId')
  const { objet_id, objet_dir = 'both', theme_id, theme_dir = 'both', nature } = c.req.query()

  const wsConf = db.prepare('SELECT COALESCE(jd_search_depth,3) AS d FROM workspaces WHERE id=?').get(wsId)
  const maxDepth = wsConf?.d ?? 3

  function relatedIds(table, rootId, dir) {
    const all = db.prepare(`SELECT id, parent_id FROM ${table} WHERE workspace_id=?`).all(wsId)
    const ids = new Set([rootId])
    if (dir === 'down' || dir === 'both') {
      const dm = new Map([[rootId, 0]]); let added = true
      while (added) { added = false; for (const x of all) if (!ids.has(x.id) && ids.has(x.parent_id)) { const pd = dm.get(x.parent_id)??0; if (pd < maxDepth) { ids.add(x.id); dm.set(x.id, pd+1); added = true } } }
    }
    if (dir === 'up' || dir === 'both') {
      let cur = rootId; let d = 0
      while (d < maxDepth) { const t = all.find(x => x.id === cur); if (!t || !t.parent_id) break; ids.add(t.parent_id); cur = t.parent_id; d++ }
    }
    return ids
  }

  let sql = `SELECT n.id, n.date, n.nature, n.type, n.titre_alt, n.titre,
             (SELECT nom FROM jd_themes WHERE id = n.theme_id) AS theme_nom
             FROM jd_notes n WHERE n.workspace_id = ? AND n.date IS NOT NULL`
  const params = [wsId]

  if (objet_id) {
    const ids = relatedIds('jd_objets', Number(objet_id), objet_dir)
    const ph = [...ids].map(() => '?').join(',')
    sql += ` AND EXISTS (SELECT 1 FROM jd_note_objet no WHERE no.note_id=n.id AND no.objet_id IN (${ph}))`
    params.push(...ids)
  }
  if (theme_id) {
    const ids = relatedIds('jd_themes', Number(theme_id), theme_dir)
    const ph = [...ids].map(() => '?').join(',')
    sql += ` AND n.theme_id IN (${ph})`
    params.push(...ids)
  }
  // Documentation exclue systématiquement (intemporelle — pas de valeur pour l'analyse)
  if (nature && nature !== 'both') {
    sql += ` AND n.nature = ?`; params.push(nature)
  } else {
    sql += ` AND n.nature IS NOT NULL`
  }

  sql += ` ORDER BY n.date ASC`
  return c.json({ notes: db.prepare(sql).all(...params) })
})

export default jourdoc
