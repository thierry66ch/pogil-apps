import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import nodemailer from 'nodemailer'
import db from '../db/db.js'
import { adminMiddleware } from '../middleware/adminMiddleware.js'

const admin = new Hono()

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

async function sendOtpEmail(to, otp) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject: 'Code OTP — pogil admin',
    text: `Votre code OTP : ${otp}\n\nValide 10 minutes.`,
  })
}

// POST /api/admin/login  — étape 1 : mot de passe
admin.post('/login', async (c) => {
  const { email, password } = await c.req.json()

  const adminUser = db.prepare('SELECT * FROM admin WHERE email = ?').get(email)
  if (!adminUser) return c.json({ error: 'Invalid credentials' }, 401)

  const valid = await bcrypt.compare(password, adminUser.password_hash)
  if (!valid) return c.json({ error: 'Invalid credentials' }, 401)

  const otp = generateOtp()
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  db.prepare('UPDATE admin SET otp_code = ?, otp_expires = ? WHERE id = ?')
    .run(otp, expires, adminUser.id)

  try {
    await sendOtpEmail(email, otp)
  } catch (err) {
    // En dev : affiche l'OTP dans le terminal si l'email échoue
    console.warn('[DEV] Échec envoi email OTP:', err.message)
    console.warn(`[DEV] OTP pour ${email} : ${otp}`)
  }

  return c.json({ ok: true })
})

// POST /api/admin/verify-otp  — étape 2 : OTP
admin.post('/verify-otp', async (c) => {
  const { email, otp } = await c.req.json()

  const adminUser = db.prepare('SELECT * FROM admin WHERE email = ?').get(email)
  if (!adminUser) return c.json({ error: 'Invalid OTP' }, 401)

  const now = new Date().toISOString()
  if (adminUser.otp_code !== otp || adminUser.otp_expires < now) {
    return c.json({ error: 'Invalid or expired OTP' }, 401)
  }

  db.prepare('UPDATE admin SET otp_code = NULL, otp_expires = NULL WHERE id = ?')
    .run(adminUser.id)

  const token = jwt.sign(
    { sub: adminUser.id, role: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '4h' }
  )
  return c.json({ token })
})

// Routes protégées par le middleware admin
admin.use('/users*', adminMiddleware)
admin.use('/settings*', adminMiddleware)

// POST /api/admin/settings/request-otp  — demande un OTP pour valider le changement
admin.post('/settings/request-otp', async (c) => {
  const adminId = c.get('adminId')
  const adminUser = db.prepare('SELECT * FROM admin WHERE id = ?').get(adminId)
  if (!adminUser) return c.json({ error: 'Not found' }, 404)

  const otp = generateOtp()
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  db.prepare('UPDATE admin SET otp_code = ?, otp_expires = ? WHERE id = ?')
    .run(otp, expires, adminId)

  try {
    await sendOtpEmail(adminUser.email, otp)
  } catch (err) {
    console.warn('[DEV] Échec envoi email OTP:', err.message)
    console.warn(`[DEV] OTP pour ${adminUser.email} : ${otp}`)
  }

  return c.json({ ok: true })
})

// POST /api/admin/settings/confirm  — valide l'OTP et applique les changements
admin.post('/settings/confirm', async (c) => {
  const adminId = c.get('adminId')
  const { otp, newEmail, newPassword } = await c.req.json()

  const adminUser = db.prepare('SELECT * FROM admin WHERE id = ?').get(adminId)
  if (!adminUser) return c.json({ error: 'Not found' }, 404)

  const now = new Date().toISOString()
  if (adminUser.otp_code !== otp || adminUser.otp_expires < now) {
    return c.json({ error: 'Invalid or expired OTP' }, 401)
  }

  db.prepare('UPDATE admin SET otp_code = NULL, otp_expires = NULL WHERE id = ?').run(adminId)

  if (newEmail) {
    db.prepare('UPDATE admin SET email = ? WHERE id = ?').run(newEmail, adminId)
  }
  if (newPassword) {
    const password_hash = await bcrypt.hash(newPassword, 12)
    db.prepare('UPDATE admin SET password_hash = ? WHERE id = ?').run(password_hash, adminId)
  }

  return c.json({ ok: true })
})

// GET /api/admin/apps — liste toutes les apps pour les checkboxes d'accès
admin.get('/apps', (c) => {
  const apps = db.prepare('SELECT id, slug, name, icon FROM apps WHERE is_active = 1').all()
  return c.json({ apps })
})

// GET /api/admin/users — inclut app_ids pour chaque utilisateur
admin.get('/users', (c) => {
  const users = db.prepare('SELECT id, username, email, is_active, created_at FROM users').all()
  const withAccess = users.map(u => {
    const app_ids = db.prepare('SELECT app_id FROM user_app_access WHERE user_id = ?')
      .all(u.id).map(r => r.app_id)
    return { ...u, app_ids }
  })
  return c.json({ users: withAccess })
})

// POST /api/admin/users — crée l'utilisateur ET définit les accès apps en une seule opération
admin.post('/users', async (c) => {
  const { username, email, password, is_active = true, app_ids = [] } = await c.req.json()
  const password_hash = await bcrypt.hash(password, 12)
  const result = db.prepare(
    'INSERT INTO users (username, email, password_hash, is_active) VALUES (?, ?, ?, ?)'
  ).run(username, email, password_hash, is_active ? 1 : 0)
  const newId = result.lastInsertRowid
  for (const appId of app_ids) {
    db.prepare('INSERT OR IGNORE INTO user_app_access (user_id, app_id) VALUES (?, ?)').run(newId, appId)
  }
  return c.json({ id: newId }, 201)
})

// PUT /api/admin/users/:id
admin.put('/users/:id', async (c) => {
  const { id } = c.req.param()
  const { username, email, password, is_active } = await c.req.json()

  if (password) {
    const password_hash = await bcrypt.hash(password, 12)
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, id)
  }
  db.prepare('UPDATE users SET username = ?, email = ?, is_active = ? WHERE id = ?')
    .run(username, email, is_active ? 1 : 0, id)

  return c.json({ ok: true })
})

// DELETE /api/admin/users/:id
admin.delete('/users/:id', (c) => {
  const { id } = c.req.param()
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
  return c.json({ ok: true })
})

// PUT /api/admin/users/:id/access
admin.put('/users/:id/access', async (c) => {
  const { id } = c.req.param()
  const { appIds = [], workspaceAccess = [] } = await c.req.json()

  db.prepare('DELETE FROM user_app_access WHERE user_id = ?').run(id)
  for (const appId of appIds) {
    db.prepare('INSERT OR IGNORE INTO user_app_access (user_id, app_id) VALUES (?, ?)').run(id, appId)
  }

  db.prepare('DELETE FROM user_workspace_access WHERE user_id = ?').run(id)
  for (const { workspaceId, role } of workspaceAccess) {
    db.prepare('INSERT OR IGNORE INTO user_workspace_access (user_id, workspace_id, role) VALUES (?, ?, ?)')
      .run(id, workspaceId, role ?? 'member')
  }

  return c.json({ ok: true })
})

export default admin
