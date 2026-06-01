# pogil-apps

Portail d'applications PWA hébergé sur `apps.pogil.com`. Point d'entrée unique pour toutes les applications pogil, avec authentification JWT, gestion des droits par app et par workspace, et interface d'administration.

## Architecture

Monorepo npm workspaces :

```
pogil-apps/
├── apps/
│   └── hub/          # Portail React + Vite (PWA)
├── packages/
│   └── shared/       # Code partagé (types, constantes, utils)
└── server/           # Backend Hono + SQLite WAL
```

## Prérequis

- Node.js >= 20
- npm >= 10

## Installation

```bash
npm install
```

## Développement

```bash
npm run dev
```

- Hub (Vite) : http://localhost:5173
- API (Hono) : http://localhost:3000

## Production

```bash
npm run build   # Build le frontend (apps/hub/dist/)
npm start       # Démarre le serveur sur le port 3000
```

Le serveur sert à la fois l'API (`/api/*`) et les fichiers statiques du hub.

## Variables d'environnement

Copier `.env.example` en `.env` et renseigner les valeurs :

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `PORT` | Port du serveur (défaut : 3000) |
| `JWT_SECRET` | Secret pour signer les JWT |
| `ADMIN_EMAIL` | Email de l'administrateur |
| `ADMIN_PASSWORD_HASH` | Hash bcrypt du mot de passe admin |
| `SMTP_HOST` | Serveur SMTP pour les OTP admin |
| `SMTP_PORT` | Port SMTP |
| `SMTP_USER` | Utilisateur SMTP |
| `SMTP_PASS` | Mot de passe SMTP |
| `DB_PATH` | Chemin vers le fichier SQLite (défaut : `data/pogil.db`) |

## Déploiement (Infomaniak)

Le déploiement se fait via Git. Infomaniak exécute automatiquement :

1. `npm install` — installation des dépendances
2. `npm run build` — build du frontend
3. `npm start` — démarrage du serveur sur le port 3000
