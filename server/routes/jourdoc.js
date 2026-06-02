import { Hono } from 'hono'
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

jourdoc.use('/:wsId/*', wsCheck)

// ── Info workspace ────────────────────────────────────────────

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
    const descendants = db.prepare(`
      WITH RECURSIVE desc(id, depth) AS (
        SELECT id, 0 FROM jd_objets WHERE id = ? AND workspace_id = ?
        UNION ALL
        SELECT o.id, d.depth + 1 FROM jd_objets o
        JOIN desc d ON o.parent_id = d.id WHERE d.depth < ?
      )
      SELECT id FROM desc
    `).all(id, wsId, maxDepth)
    ids.push(...descendants.map(r => r.id))
  }

  if (direction === 'up' || direction === 'both') {
    const ancestors = db.prepare(`
      WITH RECURSIVE anc(id, parent_id, depth) AS (
        SELECT id, parent_id, 0 FROM jd_objets WHERE id = ? AND workspace_id = ?
        UNION ALL
        SELECT o.id, o.parent_id, a.depth + 1 FROM jd_objets o
        JOIN anc a ON o.id = a.parent_id WHERE a.depth < ?
      )
      SELECT id FROM anc
    `).all(id, wsId, maxDepth)
    ids.push(...ancestors.map(r => r.id))
  }

  ids = [...new Set(ids)]
  if (ids.length === 0) return c.json({ notes: [] })

  const placeholders = ids.map(() => '?').join(',')
  const notes = db.prepare(`
    SELECT DISTINCT n.id, n.type, n.nature, n.titre, n.titre_alt, n.date, n.contenu, n.theme_id,
      t.nom AS theme_nom
    FROM jd_notes n
    JOIN jd_note_objet no ON no.note_id = n.id
    LEFT JOIN jd_themes t ON t.id = n.theme_id
    WHERE no.objet_id IN (${placeholders}) AND n.workspace_id = ?
    ORDER BY n.date DESC, n.created_at DESC
  `).all(...ids, wsId)

  // Ajouter les objets liés à chaque note
  const withObjets = notes.map(note => {
    const objets = db.prepare(
      'SELECT o.id, o.nom, o.nom_court FROM jd_note_objet no JOIN jd_objets o ON o.id = no.objet_id WHERE no.note_id = ?'
    ).all(note.id)
    return { ...note, objets }
  })

  return c.json({ notes: withObjets })
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

  if (objet_id) {
    sql += ' JOIN jd_note_objet no ON no.note_id = n.id'
  }

  sql += ' WHERE n.workspace_id = ?'
  params.push(wsId)

  if (type)      { sql += ' AND n.type = ?';      params.push(type) }
  if (nature)    { sql += ' AND n.nature = ?';    params.push(nature) }
  if (date_from) { sql += ' AND n.date >= ?';     params.push(date_from) }
  if (date_to)   { sql += ' AND n.date <= ?';     params.push(date_to) }
  if (objet_id)  { sql += ' AND no.objet_id = ?'; params.push(Number(objet_id)) }

  sql += ' ORDER BY n.date DESC, n.created_at DESC'

  const notes = db.prepare(sql).all(...params)

  const withObjets = notes.map(note => {
    const objets = db.prepare(
      'SELECT o.id, o.nom, o.nom_court FROM jd_note_objet no JOIN jd_objets o ON o.id = no.objet_id WHERE no.note_id = ?'
    ).all(note.id)
    return { ...note, objets }
  })

  return c.json({ notes: withObjets })
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

  const liens = db.prepare(
    `SELECT nn.note_cible_id AS id, nn.type_lien, n.titre, n.type, n.nature, n.date
     FROM jd_note_note nn JOIN jd_notes n ON n.id = nn.note_cible_id
     WHERE nn.note_source_id = ?`
  ).all(id)

  return c.json({ note: { ...note, objets, liens } })
})

jourdoc.post('/:wsId/notes', async (c) => {
  const wsId = c.get('wsId')
  const { type = 'journal', nature, theme_id, titre, titre_alt, contenu, date, source_url, objet_ids = [] } = await c.req.json()
  if (!titre) return c.json({ error: 'titre requis' }, 400)

  const result = db.prepare(
    `INSERT INTO jd_notes (workspace_id, type, nature, theme_id, titre, titre_alt, contenu, date, source_url)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(wsId, type, nature ?? null, theme_id ?? null, titre, titre_alt ?? null, contenu ?? null, date ?? null, source_url ?? null)

  const noteId = result.lastInsertRowid

  for (const objetId of objet_ids) {
    db.prepare('INSERT OR IGNORE INTO jd_note_objet (note_id, objet_id) VALUES (?,?)').run(noteId, objetId)
  }

  return c.json({ id: noteId }, 201)
})

jourdoc.put('/:wsId/notes/:id', async (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  const { type, nature, theme_id, titre, titre_alt, contenu, date, source_url, objet_ids } = await c.req.json()

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

  return c.json({ ok: true })
})

jourdoc.delete('/:wsId/notes/:id', (c) => {
  const wsId = c.get('wsId')
  const id = Number(c.req.param('id'))
  db.prepare('DELETE FROM jd_notes WHERE id=? AND workspace_id=?').run(id, wsId)
  return c.json({ ok: true })
})

export default jourdoc
