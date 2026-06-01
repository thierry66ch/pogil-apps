import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import db from '../db/db.js'

const auth = new Hono()

// POST /api/auth/login
auth.post('/login', async (c) => {
  const { identifier, password } = await c.req.json()

  const user = db.prepare(
    'SELECT * FROM users WHERE (email = ? OR username = ?) AND is_active = TRUE'
  ).get(identifier, identifier)

  if (!user) return c.json({ error: 'Invalid credentials' }, 401)

  const valid = await bcrypt.compare(password, user.password_hash)
  if (!valid) return c.json({ error: 'Invalid credentials' }, 401)

  const token = jwt.sign(
    { sub: user.id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' }
  )

  return c.json({ token })
})

// POST /api/auth/logout  (stateless — client drops the token)
auth.post('/logout', (c) => c.json({ ok: true }))

export default auth
