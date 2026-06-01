# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # install all workspaces
npm run setup        # interactive first-time setup: creates admin account + test user
npm run dev          # start Vite (port 5173) + Hono server (port 3000) concurrently
npm run build        # build hub to apps/hub/dist/
npm start            # production: serve API + static files on port 3000
```

No test suite is configured.

## Architecture

Monorepo (npm workspaces): `apps/*`, `packages/*`, `server`.

```
apps/hub/      React 18 + Vite 5, PWA (vite-plugin-pwa), react-router-dom v6, i18next
packages/shared/   Shared constants: APP_SLUGS, ROLES, API_ROUTES (used by both sides)
server/        Hono 4 on @hono/node-server, Node.js built-in node:sqlite (not better-sqlite3)
data/          SQLite DB file (pogil.db), gitignored
```

**In development**, Vite proxies `/api` → `http://localhost:3000`. In production, the Hono server serves both `/api/*` routes and the static Vite build from `apps/hub/dist/`.

**Database** (`server/db/db.js`): uses Node's built-in `node:sqlite` (synchronous API, WAL mode). Schema is applied on every startup via `CREATE TABLE IF NOT EXISTS`, so migrations are manual SQL edits to `server/db/schema.sql`.

**`.env` loading**: done manually by `server/index.js` (no `dotenv` dependency). Copy `.env.example` to `.env` before first run.

## Auth flow

Two separate JWT tokens, same `JWT_SECRET`:

|            | Users                                  | Admin                                                         |
| ---------- | -------------------------------------- | ------------------------------------------------------------- |
| Storage    | `localStorage`                         | `sessionStorage`                                              |
| Expiry     | 7d (configurable via `JWT_EXPIRES_IN`) | 4h                                                            |
| Login      | password → token                       | password → OTP email → token                                  |
| Middleware | `authMiddleware` (sets `userId`)       | `adminMiddleware` (checks `role === 'admin'`, sets `adminId`) |

Admin login is 2-step: `POST /api/admin/login` sends OTP by email; `POST /api/admin/verify-otp` validates and returns the JWT. In dev, if SMTP is not configured the OTP is printed to the terminal as a fallback.

Rate limiting is in-memory (`loginAttempts` Map in `server/index.js`), resets on server restart — applied to `/api/auth/*`, `/api/admin/login`, and `/api/admin/verify-otp`.

## Key conventions

- All API route strings are defined in `packages/shared/src/index.js` as `API_ROUTES` — import from `@pogil/shared` on both sides instead of hardcoding paths.
- `AuthContext` (`apps/hub/src/context/AuthContext.jsx`) exposes `{ token, login, logout, adminToken, adminLogin, adminLogout }` — use `useAuth()` hook in components.
- Protected routes in `main.jsx`: `<PrivateRoute>` checks `token`, `<AdminRoute>` checks `adminToken`.
- Admin settings changes (email/password) require a second OTP confirmation via `POST /api/admin/settings/request-otp` → `POST /api/admin/settings/confirm`.

## Deployment (Infomaniak)

Push to Git; Infomaniak automatically runs `npm install` → `npm run build` → `npm start` (port 3000). The server must be started from the repo root (not from `server/`) because `serveStatic` resolves `apps/hub/dist` relative to CWD.

## Build number & footer

À chaque itération (toute modification livrée), incrémenter le numéro de build dans `build.json` à la racine :

```json
{ "build": 42, "date": "2026-06-01T14:32:00Z" }
```

Ce fichier est importé par le composant `Footer` (`apps/hub/src/components/Footer.jsx`) qui affiche une bannière en pied de page :

```
pogil apps — build 42 · 2026-06-01 14:32
```

Vite expose `build.json` via un import statique (`import meta from '../../build.json'`). Mettre à jour `build.json` **avant** tout `npm run build` ou commit.

## Journal des itérations

À chaque itération, ajouter une entrée en tête du fichier `CHANGELOG.dev.md` à la racine :

```
## Build 42 — 2026-06-01 14:32
Bref commentaire décrivant ce qui a été modifié ou ajouté.
```

Ce fichier sert de journal de bord développeur ; il n'est pas destiné aux utilisateurs finaux.

## Documentation développeur

Maintenir `docs/dev/` (créer le dossier si absent). Chaque fonctionnalité ou module non trivial doit avoir son fichier Markdown dans ce dossier. Mettre à jour la documentation concernée à chaque itération qui modifie le module correspondant. Ne pas dupliquer ce qui est déjà dans CLAUDE.md ; se concentrer sur les décisions d'architecture, les flux de données et les points d'extension.
