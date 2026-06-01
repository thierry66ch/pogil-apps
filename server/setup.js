#!/usr/bin/env node
/**
 * Script d'initialisation : crée le compte admin et un utilisateur de test.
 * Usage : node server/setup.js
 */
import { readFileSync, mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { createInterface } from 'node:readline'
import bcrypt from 'bcryptjs'

// Load .env
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
mkdirSync('data', { recursive: true })

const db = new DatabaseSync(DB_PATH)
db.exec('PRAGMA journal_mode=WAL')
db.exec('PRAGMA foreign_keys=ON')

const schema = readFileSync('server/db/schema.sql', 'utf8')
db.exec(schema)

const rl = createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise((r) => rl.question(q, r))

console.log('\n=== Setup pogil-apps ===\n')

// --- Admin ---
const existingAdmin = db.prepare('SELECT id FROM admin LIMIT 1').get()
if (existingAdmin) {
  console.log('✓ Compte admin déjà existant — ignoré.\n')
} else {
  console.log('Création du compte administrateur :')
  const adminEmail = await ask(`  Email admin [${process.env.ADMIN_EMAIL ?? 'admin@pogil.ch'}] : `)
  const email = adminEmail.trim() || process.env.ADMIN_EMAIL || 'admin@pogil.ch'
  const adminPass = await ask('  Mot de passe admin : ')
  if (!adminPass.trim()) { console.error('Mot de passe vide — abandon.'); process.exit(1) }
  const hash = await bcrypt.hash(adminPass.trim(), 12)
  db.prepare('INSERT INTO admin (id, email, password_hash) VALUES (1, ?, ?)').run(email, hash)
  console.log(`✓ Admin créé : ${email}\n`)
}

// --- Utilisateur de test ---
const existingUser = db.prepare('SELECT id FROM users LIMIT 1').get()
if (existingUser) {
  console.log('✓ Des utilisateurs existent déjà — skip.\n')
} else {
  const createTest = await ask('Créer un utilisateur de test ? [O/n] : ')
  if (!createTest.trim().toLowerCase().startsWith('n')) {
    const username = (await ask('  Nom d\'utilisateur [test] : ')).trim() || 'test'
    const email = (await ask('  Email [test@pogil.ch] : ')).trim() || 'test@pogil.ch'
    const password = (await ask('  Mot de passe [test1234] : ')).trim() || 'test1234'
    const hash = await bcrypt.hash(password, 12)
    const result = db.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    ).run(username, email, hash)
    console.log(`✓ Utilisateur créé : ${username} / ${email}\n`)

    // Ajouter l'app jourdoc si elle existe
    const app = db.prepare("SELECT id FROM apps WHERE slug = 'jourdoc'").get()
    if (app) {
      db.prepare('INSERT OR IGNORE INTO user_app_access VALUES (?, ?)').run(result.lastInsertRowid, app.id)
      console.log('✓ Accès jourdoc assigné.\n')
    }
  }
}

rl.close()
console.log('Setup terminé. Lance npm run dev et connecte-toi.\n')
