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

// GET /api/admin/users
admin.get('/users', (c) => {
  const users = db.prepare('SELECT id, username, email, is_active, created_at FROM users').all()
  return c.json({ users })
})

// POST /api/admin/users
admin.post('/users', async (c) => {
  const { username, email, password, is_active = true } = await c.req.json()
  const password_hash = await bcrypt.hash(password, 12)
  const result = db.prepare(
    'INSERT INTO users (username, email, password_hash, is_active) VALUES (?, ?, ?, ?)'
  ).run(username, email, password_hash, is_active ? 1 : 0)
  return c.json({ id: result.lastInsertRowid }, 201)
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
