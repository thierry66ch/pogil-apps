import { Hono } from 'hono'
import db from '../db/db.js'
import { authMiddleware } from '../middleware/authMiddleware.js'

const portal = new Hono()

portal.use('*', authMiddleware)

// GET /api/me/apps
portal.get('/apps', (c) => {
  const userId = c.get('userId')

  const user = db.prepare('SELECT id, username, email FROM users WHERE id = ?').get(userId)
  const apps = db.prepare(`
    SELECT a.slug, a.name, a.icon, a.description
    FROM apps a
    JOIN user_app_access uaa ON uaa.app_id = a.id
    WHERE uaa.user_id = ? AND a.is_active = TRUE
  `).all(userId)

  return c.json({ user, apps })
})

// GET /api/me/apps/:slug/workspaces
portal.get('/apps/:slug/workspaces', (c) => {
  const userId = c.get('userId')
  const { slug } = c.req.param()

  const app = db.prepare('SELECT id FROM apps WHERE slug = ? AND is_active = TRUE').get(slug)
  if (!app) return c.json({ error: 'Not found' }, 404)

  const hasAccess = db.prepare(
    'SELECT 1 FROM user_app_access WHERE user_id = ? AND app_id = ?'
  ).get(userId, app.id)
  if (!hasAccess) return c.json({ error: 'Forbidden' }, 403)

  const workspaces = db.prepare(`
    SELECT w.id, w.name, uwa.role
    FROM workspaces w
    JOIN user_workspace_access uwa ON uwa.workspace_id = w.id
    WHERE uwa.user_id = ? AND w.app_id = ?
  `).all(userId, app.id)

  return c.json({ workspaces })
})

export default portal
