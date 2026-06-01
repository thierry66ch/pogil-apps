# API REST

Base URL : `/api`

## Auth utilisateur

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| POST | `/auth/login` | — | Connexion (`identifier` + `password`) → `{ token }` |
| POST | `/auth/logout` | — | Stateless, retourne `{ ok: true }` (le client supprime le token) |

## Portail utilisateur

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| GET | `/me/apps` | Bearer user | Apps accessibles à l'utilisateur connecté |
| GET | `/me/apps/:slug/workspaces` | Bearer user | Workspaces de l'app pour cet utilisateur |

## Admin

Toutes les routes `/admin/users*` et `/admin/settings*` nécessitent un token admin (`Authorization: Bearer <adminToken>`).

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| POST | `/admin/login` | — | Étape 1 : mot de passe → envoi OTP |
| POST | `/admin/verify-otp` | — | Étape 2 : OTP → `{ token }` admin |
| GET | `/admin/users` | Bearer admin | Liste tous les utilisateurs |
| POST | `/admin/users` | Bearer admin | Créer un utilisateur |
| PUT | `/admin/users/:id` | Bearer admin | Modifier un utilisateur |
| DELETE | `/admin/users/:id` | Bearer admin | Supprimer un utilisateur |
| PUT | `/admin/users/:id/access` | Bearer admin | Définir les droits app/workspace |
| POST | `/admin/settings/request-otp` | Bearer admin | Demander un OTP pour valider un changement d'identifiants |
| POST | `/admin/settings/confirm` | Bearer admin | Confirmer le changement avec l'OTP (`newEmail`, `newPassword`) |
