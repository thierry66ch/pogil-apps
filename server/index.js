import { readFileSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import authRoutes from './routes/auth.js'
import portalRoutes from './routes/portal.js'
import adminRoutes from './routes/admin.js'
import jourdocRoutes from './routes/jourdoc.js'

// Load .env manually (no dotenv dependency required)
try {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  for (const line of env.split('\n')) {
    const [key, ...rest] = line.split('=')
    if (key && !key.startsWith('#') && rest.length) {
      process.env[key.trim()] ??= rest.join('=').trim()
    }
  }
} catch { /* .env absent en production */ }

mkdirSync('./data/share-sessions', { recursive: true })

// Sessions en attente (mémoire) — accès depuis le client via polling
const pendingSessions = new Map()

// Simple in-memory rate limiter for auth routes
const loginAttempts = new Map()
function rateLimitMiddleware(c, next) {
  const ip = c.req.header('x-forwarded-for') ?? 'unknown'
  const now = Date.now()
  const windowMs = 15 * 60 * 1000
  const maxAttempts = 20
  const entry = loginAttempts.get(ip) ?? { count: 0, resetAt: now + windowMs }
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs }
  entry.count++
  loginAttempts.set(ip, entry)
  if (entry.count > maxAttempts) return c.json({ error: 'Too many requests' }, 429)
  return next()
}

const app = new Hono()

app.use('/api/auth/*', rateLimitMiddleware)
app.use('/api/admin/login', rateLimitMiddleware)
app.use('/api/admin/verify-otp', rateLimitMiddleware)

// API routes
app.route('/api/auth', authRoutes)
app.route('/api/me', portalRoutes)
app.route('/api/admin', adminRoutes)
app.route('/api/jourdoc', jourdocRoutes)

// TWA Share Target — POST handler pour cold start (SW pas encore actif)
// Le SW intercepte les démarrages à chaud ; le serveur gère les démarrages à froid.
app.post('/share-target', async (c) => {
  const sessionId = randomUUID()
  const dir = `./data/share-sessions/${sessionId}`
  mkdirSync(dir, { recursive: true })
  try {
    const form = await c.req.formData()
    const files = form.getAll('files').filter(f => f instanceof File && f.size > 0)
    if (!files.length) { rmSync(dir, { recursive: true, force: true }); return c.redirect('/') }
    const meta = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const buf = Buffer.from(await file.arrayBuffer())
      const safe = `${i}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      writeFileSync(`${dir}/${safe}`, buf)
      meta.push({ name: file.name, filename: safe, type: file.type, size: buf.length })
    }
    writeFileSync(`${dir}/meta.json`, JSON.stringify(meta))
  } catch (e) {
    console.error('share-target POST error:', e)
    rmSync(dir, { recursive: true, force: true })
    return c.redirect('/')
  }
  // Enregistrer en mémoire pour que le client puisse poller
  pendingSessions.set(sessionId, Date.now())
  for (const [id, ts] of pendingSessions)
    if (Date.now() - ts > 10 * 60 * 1000) pendingSessions.delete(id)
  // Cookie : mécanisme de détection alternatif
  c.header('Set-Cookie', `share_session=${sessionId}; Path=/; Max-Age=3600; SameSite=Lax`)
  return c.redirect(`/share-target?session=${sessionId}`, 303)
})

// Métadonnées de session (UUID = sécurité suffisante pour fichiers éphémères)
app.get('/share-session/:id/meta.json', (c) => {
  try {
    const raw = readFileSync(`./data/share-sessions/${c.req.param('id')}/meta.json`, 'utf8')
    return c.json(JSON.parse(raw))
  } catch { return c.notFound() }
})

// Fichier de session pour preview et import
app.get('/share-session/:id/file/:name', (c) => {
  const { id, name } = c.req.param()
  try {
    const meta = JSON.parse(readFileSync(`./data/share-sessions/${id}/meta.json`, 'utf8'))
    const m = meta.find(f => f.filename === name)
    const buf = readFileSync(`./data/share-sessions/${id}/${name}`)
    return new Response(buf, { headers: { 'Content-Type': m?.type || 'application/octet-stream' } })
  } catch { return c.notFound() }
})

// Suppression de session après import ou annulation
app.delete('/share-session/:id', (c) => {
  const id = c.req.param('id')
  pendingSessions.delete(id)
  try { rmSync(`./data/share-sessions/${id}`, { recursive: true, force: true }) } catch { }
  return c.json({ ok: true })
})

// Client poll : session en attente la plus récente (< 5 min)
app.get('/api/share-pending', (c) => {
  const cutoff = Date.now() - 5 * 60 * 1000
  for (const [id, ts] of pendingSessions)
    if (ts > cutoff) return c.json({ session: id })
  return c.json({ session: null })
})

// Diagnostic temporaire — visiter /debug/share depuis le téléphone après un partage
app.get('/debug/share', (c) => {
  try {
    const sessions = readdirSync('./data/share-sessions')
    const pending = [...pendingSessions.entries()].map(([id, ts]) => ({ id, age: Math.round((Date.now()-ts)/1000)+'s' }))
    return c.json({ sessions_disk: sessions, sessions_memory: pending })
  } catch (e) { return c.json({ error: e.message }) }
})

// TWA digital asset links — links apps.pogil.ch to the signed APK (ch.pogil.apps)
// SHA256 fingerprint must match the APK signing key (generated by PWABuilder)
const ASSET_LINKS = JSON.stringify([{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: {
    namespace: 'android_app',
    package_name: 'ch.pogil.apps',
    sha256_cert_fingerprints: ['4C:6A:EC:6F:4B:49:A4:C2:89:8B:4F:98:BA:F4:C5:9F:D2:30:CE:50:EB:E2:71:AF:98:74:92:48:80:44:45:C6'],
  },
}])
app.get('/.well-known/assetlinks.json', (c) =>
  c.body(ASSET_LINKS, 200, { 'Content-Type': 'application/json' })
)

// Serve PWA manifest with correct MIME type — dedicated route, not serveStatic
// (Hono middleware wildcards don't suffix-match; proxy may also override headers)
app.get('/manifest.webmanifest', (c) => {
  try {
    const content = readFileSync('./apps/hub/dist/manifest.webmanifest', 'utf8')
    return c.body(content, 200, { 'Content-Type': 'application/manifest+json; charset=utf-8' })
  } catch {
    return c.notFound()
  }
})

// User uploads (UUID-based filenames — no auth required on URL)
app.use('/uploads/*', serveStatic({ root: '.' }))

// Static files (Vite build output)
app.use('/*', serveStatic({ root: './apps/hub/dist' }))

// SPA fallback
app.get('*', serveStatic({ path: './apps/hub/dist/index.html' }))

const PORT = Number(process.env.PORT ?? 3000)

const server = serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

process.on('SIGTERM', () => server.close())
process.on('SIGINT', () => server.close())
