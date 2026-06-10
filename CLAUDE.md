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
apps/hub/          React 18 + Vite 5, PWA (vite-plugin-pwa), react-router-dom v6, i18next
packages/shared/   Shared constants: APP_SLUGS, ROLES, API_ROUTES (used by both sides)
server/            Hono 4 on @hono/node-server, Node.js built-in node:sqlite (not better-sqlite3)
data/              SQLite DB file (pogil.db), gitignored
```

**In development**, Vite proxies `/api` → `http://localhost:3000`. In production, the Hono server serves both `/api/*` routes and the static Vite build from `apps/hub/dist/`.

**Database** (`server/db/db.js`): uses Node's built-in `node:sqlite` (synchronous API, WAL mode). Schema is in `server/db/schema.sql` (applied on every startup via `CREATE TABLE IF NOT EXISTS`). Columns added after initial deploy live as idempotent `ALTER TABLE` calls in `db.js` — always add new columns there, never in `schema.sql` directly.

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

## JourDoc app — key files

All JourDoc components are in `apps/hub/src/pages/jourdoc/`.

| File                   | Role                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `JourDocApp.jsx`       | Shell: topbar, sidebar nav, Outlet. Handles workspace switching and Todoist background sync.                      |
| `JourDocJournal.jsx`   | Day journal with date navigation (arrows + swipe).                                                                |
| `CalendarView.jsx`     | Calendar container: month / week / 7-days / matrix / year modes + object/theme filters + swipe.                   |
| `CalendarMonth.jsx`    | Monthly grid with dots and CSS hover popups.                                                                      |
| `CalendarYear.jsx`     | 52-week grid with dots, CSS hover popups.                                                                         |
| `CalendarWeek.jsx`     | 7-column week view.                                                                                               |
| `ObjectMatrix.jsx`     | Objects×days matrix.                                                                                              |
| `AnalyseView.jsx`      | Multi-year comparative view (52-bucket timeline). Column highlight on click. Portal popup.                        |
| `NoteForm.jsx`         | Create/edit note: type, nature, theme, objects, rich text, media picker, Todoist.                                 |
| `NoteView.jsx`         | Read-only note: 2-column desktop layout, lightbox, link chain, TodoistPanel sidebar.                              |
| `NoteCard.jsx`         | Compact note preview: badge, theme, objects, media thumbnails, Todoist chip.                                      |
| `ObjetDetail.jsx`      | Object detail: recursive note search (down/up/both), theme filter, type filter.                                   |
| `ThemeDetail.jsx`      | Theme detail: recursive note search via `/themes/:id/notes`, objet filter, type filter.                           |
| `ObjetManager.jsx`     | Inline tree editor for objects (add/rename/reparent).                                                             |
| `ThemeManager.jsx`     | Inline tree editor for themes.                                                                                    |
| `MediaGallery.jsx`     | Media browser: filter by date/type/linked, drag-drop upload, multi-select → create note.                          |
| `MediaDetail.jsx`      | Media detail with linked notes.                                                                                   |
| `TodoistPanel.jsx`     | Todoist integration in NoteView sidebar: create/link/close/import/follow-up.                                      |
| `TodoistTasks.jsx`     | Workspace Todoist task manager: To handle / In progress / Done sections.                                          |
| `WorkspaceManager.jsx` | Workspace settings: rename/delete, members, CSV import, Todoist config + sync button.                             |
| `HierarchyPicker.jsx`  | Reusable hierarchical selector with search. Used everywhere for objects/themes.                                   |
| `hooks.js`             | `useJdData(wsId, token)` → `{objets, themes, loading, reload}`, `authHeader()`, `buildPathMap()`.                 |
| `calUtils.js`          | Calendar utilities: `getRange`, `shiftAnchor`, `weeksOfYear`, `weekBucket`, `getRelated`, `monthSpansFor52`, etc. |

## JourDoc — server routes

All JourDoc routes are in `server/routes/jourdoc.js`, mounted at `/api/jourdoc`. Protected by `authMiddleware` (all) and `wsCheck` middleware (per `:wsId/*` via `jourdoc.use('/:wsId/*', wsCheck)`).

Key route groups:

- `/:wsId/objets` — CRUD objects + import CSV
- `/:wsId/themes` — CRUD themes + import CSV
- `/:wsId/themes/:id/notes` — notes with hierarchical theme filter (JS-based, not SQL CTE)
- `/:wsId/objets/:id/notes` — notes with hierarchical object filter (SQL recursive CTE)
- `/:wsId/notes` — list/create/update/delete, full-text search
- `/:wsId/medias` — upload/list/delete media (HEIC→JPEG conversion via sharp)
- `/:wsId/todoist/*` — Todoist integration (config, sync, link, tasks list)
- `/:wsId/notes/:id/todoist/*` — per-note Todoist (create/link/close/import/details)
- `/:wsId/analyse` — multi-year comparative analysis (JS hierarchy + bucket grouping)

## JourDoc — data model

Core tables (all `workspace_id`-scoped):

- `jd_objets` — objects with `parent_id` (auto-ref), `nom_court`, `est_individu`
- `jd_themes` — themes with `parent_id` (auto-ref), `nom_court`
- `jd_notes` — notes with `type` (journal|documentation), `nature` (observation|activite|NULL), `theme_id`, `titre`, `titre_alt`, `date`, and 6 Todoist columns added via migration
- `jd_note_objet` — N-N notes↔objects
- `jd_note_note` — N-N note chain (fil documentaire)
- `jd_medias` — photos/captures/PDFs, `date_prise`, `lie` flag
- `jd_note_media` — N-N notes↔medias

Todoist columns on `jd_notes` (all added via `ALTER TABLE` migration in `db.js`):
`tache_todoist_id`, `tache_todoist_due`, `tache_todoist_priority`, `tache_todoist_done`, `tache_todoist_recurrence_done`, `tache_todoist_consigne`, `tache_todoist_content`

## JourDoc — key patterns

**Hierarchy filtering** — `getRelated(items, rootId, direction)` in `calUtils.js` computes ancestor/descendant ID sets in pure JS. Used in `ObjetDetail`, `ThemeDetail`, `CalendarView`, `AnalyseView`. Direction: `'down'` | `'up'` | `'both'`.

**Todoist sync** — Background sync fires in `JourDocApp.useEffect` on mount + workspace change + `visibilitychange`, throttled to 1 min per workspace via `sessionStorage`. If `completed > 0`, navigates to `/todoist-tasks`. Recurring task detection: `tache_todoist_recurrence_done = 1` when `currentDue > storedDue && !isDone`.

**Rich text** — Stored as HTML string in `jd_notes.contenu`. Editor: Tiptap (`RichTextEditor.jsx`). Viewer: `dangerouslySetInnerHTML` (`RichTextView.jsx`).

**Media processing** — Server-side: EXIF date extraction, resize to 1600px max, HEIC→JPEG conversion (sharp + heic-convert fallback). UUID-based filenames stored in `data/uploads/`.

**PWA** — `vite-plugin-pwa` with `injectManifest` strategy, custom `sw.js` (workbox precache + clientsClaim/skipWaiting). Manifest served by dedicated Hono route with `Content-Type: application/manifest+json`. Maskable icon: `icon-maskable-512.png` with 10% safe zone.

**Portal pattern** — Dropdowns that must escape `overflow` containers (workspace switcher, analyse popup) are rendered via `createPortal(document.body)` with `position: fixed` + `getBoundingClientRect()` for positioning.

**Full-width pages** — `/jourdoc/:wsId/analyse` adds class `jd-main--wide` to remove `max-width: 900px` constraint.

## Deployment (Infomaniak)

Push to Git; Infomaniak automatically runs `npm install` → `npm run build` → `npm start` (port 3000). The server must be started from the repo root (not from `server/`) because `serveStatic` resolves `apps/hub/dist` relative to CWD.

## Build number & footer

À chaque itération (toute modification livrée), incrémenter le numéro de build dans `build.json` à la racine :

```json
{ "build": 78, "date": "2026-06-10T17:00:00Z" }
```

Ce fichier est injecté par Vite via `define` (`__BUILD_NUMBER__`, `__BUILD_DATE__`) et affiché dans `Footer.jsx`.

Workflow obligatoire : `build.json` → `npm run build` → `git commit` → `git push`. Les trois, toujours, dans cet ordre.

## Journal des itérations

À chaque itération, ajouter une entrée en tête de `CHANGELOG.dev.md`.

## Documentation développeur

Maintenir `docs/dev/` : `architecture.md`, `database.md`, `api.md`, `jourdoc.md`, `auth.md`. Ne pas dupliquer CLAUDE.md — se concentrer sur décisions d'architecture, flux de données, points d'extension.
