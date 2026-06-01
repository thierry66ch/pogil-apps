# Changelog développeur

Journal de bord des itérations. Entrées les plus récentes en tête.

---

## Build 3 — 2026-06-01
Refonte complète du design : système de variables CSS (light/dark/system), ThemeContext, ThemeToggle (segmented control 3 états), LanguageSwitcher, TopBar sticky avec backdrop blur. Redesign de toutes les pages (Login, Portal, AdminLogin, AdminDashboard, AdminSettings, UserEditor, Footer, AppCard, WorkspaceSelector). Responsive mobile/tablet/desktop, support stylet (pointer: fine). Nouvelles clés i18n (greeting, subtitle, backToLogin, edit, confirmDelete).

---

## Build 2 — 2026-06-01
Ajout du composant Footer.jsx affichant le numéro de build et la date en pied de page. Injection des valeurs via Vite `define` (lecture de build.json dans vite.config.js). Footer intégré dans Portal et AdminDashboard.

---

## Build 1 — 2026-06-01
Initialisation du projet : mise en place du CLAUDE.md, création de build.json, CHANGELOG.dev.md et docs/dev/.
