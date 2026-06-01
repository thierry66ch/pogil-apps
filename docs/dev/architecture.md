# Architecture générale

## Vue d'ensemble

`pogil-apps` est un monorepo npm workspaces composé de trois espaces :

| Workspace | Rôle |
|-----------|------|
| `apps/hub` | Frontend React+Vite PWA (portail utilisateur + interface admin) |
| `packages/shared` | Constantes partagées front/back (`API_ROUTES`, `APP_SLUGS`, `ROLES`) |
| `server` | API REST Hono + serveur de fichiers statiques |

## Flux de données en développement

```
Navigateur (5173)
  └── Vite dev server
        └── proxy /api/* → Hono (3000)
                              └── node:sqlite (WAL) → data/pogil.db
```

En production, Hono sert à la fois l'API et le build statique Vite (`apps/hub/dist/`).

## Authentification

Deux tokens JWT distincts, signés avec le même `JWT_SECRET` :

- **Utilisateur** — durée 7 j, stocké dans `localStorage`, délivré par `POST /api/auth/login`.
- **Admin** — durée 4 h, stocké dans `sessionStorage`, délivré après validation OTP email en deux étapes (`POST /api/admin/login` puis `POST /api/admin/verify-otp`).

Les middlewares `authMiddleware` et `adminMiddleware` (`server/middleware/`) vérifient le token et injectent respectivement `userId` et `adminId` dans le contexte Hono.

## Base de données

- Moteur : `node:sqlite` (intégré à Node.js ≥ 22, API synchrone).
- Mode WAL activé au démarrage, clés étrangères activées.
- Le schéma (`server/db/schema.sql`) est appliqué à chaque démarrage du serveur via `CREATE TABLE IF NOT EXISTS` — les migrations se font manuellement dans ce fichier.
- Chemin configurable via `DB_PATH` (défaut : `data/pogil.db`).

## Build number

Le fichier `build.json` (racine) contient le numéro de build courant et son horodatage. Il est importé statiquement par le frontend pour affichage dans le footer. Il doit être incrémenté manuellement avant chaque build livré.
