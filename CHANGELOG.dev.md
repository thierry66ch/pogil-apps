# Changelog développeur

Journal de bord des itérations. Entrées les plus récentes en tête.

---

## Build 6 — 2026-06-02
Script de seed idempotent (server/seed-demo.js, npm run seed) : utilisateur test, app jourdoc, workspace Jardin, 12 objets hiérarchiques, 17 thèmes, 6 notes de démo (observations, activités, documentation). Déploiement validé sur apps.pogil.ch (Node 24.15.0).

---

## Build 5 — 2026-06-02
Fix ThemeToggle tronqué : flex-shrink:0 sur topbar__controls et page-auth__controls ; boutons réduits de 26→22 px (toggle total 88→72 px). Ordre inversé dans Login/AdminLogin (ThemeToggle avant LanguageSwitcher). Les 3 icônes ☀️ 🖥 🌙 sont désormais toutes visibles.

---

## Build 4 — 2026-06-02
MVP JourDoc frontend : JourDocApp (shell + sidebar nav responsive), JourDocJournal (vue jour avec navigation date), NoteForm (saisie rapide — type/nature/date/thème/objets/titre auto), NoteCard, ObjetDetail (fiche avec recherche récursive ±3 niveaux, contrôle de direction), ObjetManager et ThemeManager (arbres CRUD inline). Composant HierarchyPicker (sélecteur hiérarchique avec recherche textuelle, modes single/multi). Routes React Router imbriquées. Styles JourDoc dans global.css.

---

## Build 3 — 2026-06-01
Refonte complète du design : système de variables CSS (light/dark/system), ThemeContext, ThemeToggle (segmented control 3 états), LanguageSwitcher, TopBar sticky avec backdrop blur. Redesign de toutes les pages (Login, Portal, AdminLogin, AdminDashboard, AdminSettings, UserEditor, Footer, AppCard, WorkspaceSelector). Responsive mobile/tablet/desktop, support stylet (pointer: fine). Nouvelles clés i18n (greeting, subtitle, backToLogin, edit, confirmDelete).

---

## Build 2 — 2026-06-01
Ajout du composant Footer.jsx affichant le numéro de build et la date en pied de page. Injection des valeurs via Vite `define` (lecture de build.json dans vite.config.js). Footer intégré dans Portal et AdminDashboard.

---

## Build 1 — 2026-06-01
Initialisation du projet : mise en place du CLAUDE.md, création de build.json, CHANGELOG.dev.md et docs/dev/.
