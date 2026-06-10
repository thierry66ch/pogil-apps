# Changelog développeur

Journal de bord des itérations. Entrées les plus récentes en tête.

---

## Build 73 — 2026-06-10
Fix extraction taskId Todoist : URL moderne = "nom-kebab-TASKID" → TASKID = dernier segment avec majuscules et ≥8 chars (ex. 6cVrwR54r6Jhmr69). Fallback = slug complet ou valeur brute.

---

## Build 72 — 2026-06-10
(1) ws-switch menu rendu via createPortal(document.body) — échappe définitivement overflow-x:auto et tout stacking context parent. CSS: position:fixed par défaut (mobile), position:absolute sur desktop. (2) todoist/link : affiche le taskId extrait dans le message d'erreur pour debug.

---

## Build 71 — 2026-06-10
Fix build 70 : (1) ws-switch menu z-index 50→300, backdrop 49→299 (menu derrière le contenu principal). (2) Route /todoist/link : outer try/catch + c.req.json() protégé + extraction ID plus robuste (split /task/ → dernière portion → strip query string).

---

## Build 70 — 2026-06-10
(1) Workspace switcher mobile : position:fixed pour échapper à overflow-x:auto de .jd-nav (menu clips). (2) TodoistPanel : bouton "🔗 Lier une tâche existante" — saisie URL ou ID Todoist, extraction de l'ID, vérification API, stockage tache_todoist_id + contenu + due + priority. Route POST /todoist/link côté serveur.

---

## Build 69 — 2026-06-09
Page Tâches : (2) 🔄 inline avant le titre (1rem, sans badge), visible même avec petite font-size. (3) Titre = tache_todoist_content (titre Todoist) avec fallback note.titre. Migration + stockage tache_todoist_content TEXT lors de la création et la sync.

---

## Build 68 — 2026-06-09
Retouches page Tâches Todoist : (1) Cartes arrondies avec hover accent (remplace liste plate à coins droits). (2) Symbole 🔄 sur les tâches récurrentes. (3) Affiche note.titre (plein) + thème + objets. (4) Section "✅ Traités" : après "Consigner", flag tache_todoist_consigne=1, tâche quitte "À traiter" → "Traités". Récurrentes : retour en "En cours" après consignation (comportement inchangé). Migration tache_todoist_consigne INTEGER DEFAULT 0.

---

## Build 67 — 2026-06-09
Corrections page Tâches Todoist : (1) Titre note remplace le bouton rectangulaire par jd-note-card__titre (style cohérent app). (2) Auto-sync throttle réduit 5 min → 1 min. (3) Import : HTML-escaping du titre de tâche et du contenu des commentaires Todoist (évite injection HTML brut). (4) Suivi : contenu pré-rempli avec lien <a> vers la note d'origine.

---

## Build 66 — 2026-06-09
Page "✓ Tâches" Todoist : route GET /todoist/tasks, composant TodoistTasks.jsx (sections À traiter / En cours), actions "↓ Consigner" et "✎ Suivi" inline. Détection tâches récurrentes : champ tache_todoist_recurrence_done, comparaison due date en sync. Auto-sync : ajout visibilitychange (retour au premier plan) + navigation automatique vers /todoist-tasks si d.completed > 0. Import remet recurrence_done à 0.

---

## Build 65 — 2026-06-09
Diagnostic sync Todoist : client affiche le message d'erreur réel (status HTTP + body ou exception) au lieu de "Erreur réseau" générique, pour identifier la cause de l'échec.

---

## Build 64 — 2026-06-09
Fix sync Todoist : try/catch global sur POST /todoist/sync — les erreurs non gérées retournaient une réponse vide (client voyait "erreur réseau"). Q4 : endpoint /details retourne task_content + task_id ; /import accepte task_title + task_id et les inclut dans le HTML ajouté (📌 lien cliquable vers la tâche Todoist).

---

## Build 63 — 2026-06-09
§6.4 Sync Todoist (A+B) : route POST /todoist/sync — batch check des tâches non complétées du workspace, mise à jour DB (done/due/priority). Sync silencieuse au montage de JourDocApp (throttlée 5 min via sessionStorage). Bouton "🔄 Sync maintenant" dans WorkspaceManager avec feedback (X tâches vérifiées, Y terminées) et horodatage de dernière sync.

---

## Build 62 — 2026-06-09
Fix §2.6 titre_alt : séparateur des objets corrigé de '/' en ', ' — le '/' est interne au nom_court d'un objet (ex. Pom/Gol), les objets sont séparés par ', ' comme dans le titre long (ex. Pom/Gol, Pru → TrAntif).

---

## Build 61 — 2026-06-09
(1) SW : ajout skipWaiting() + clientsClaim() — le nouveau service worker prend le contrôle immédiatement sans attendre la fermeture des onglets, ce qui corrige le build en retard dans le footer. (2) TopBar : logo "P" remplacé par icon-192.png (logo 4 couleurs).

---

## Build 60 — 2026-06-09
ObjetDetail + ThemeDetail : filtre par type de note — boutons segmentés Tout / 📔 Journal / 📄 Doc., aligné à droite sur la barre de contrôles. Appliqué après les filtres thème/objet existants.

---

## Build 59 — 2026-06-08
Vue annuelle : popup au survol identique à la vue mensuelle — 1ère ligne plage de dates (ex. "3 jan – 9 jan"), puis liste notes avec icône + titre court, navigation directe. CSS :hover réutilise les classes cal-cell__popup existantes.

---

## Build 58 — 2026-06-08
Vue annuelle + filtres calendrier : (1) CalendarYear.jsx — grille de semaines (lun→dim) par mois, puces de couleur, clic → notes de la semaine. weeksOfYear() dans calUtils. (2) Filtres objet et thème (HierarchyPicker) sur les vues mois et année, avec contrôle de portée ↕/↓/↑ activé dès qu'un filtre est sélectionné. getRelated() dans calUtils pour descendants/ancêtres. filteredNotes calculé avec useMemo.

---

## Build 57 — 2026-06-08
Fix ThemeDetail notes : route /:wsId/themes/:id/notes réécrite sans CTE SQLite (probable cause d'erreur silencieuse → 0 notes affichées). Calcul hiérarchique descendants/ancêtres en JS pur sur la liste des thèmes du workspace.

---

## Build 56 — 2026-06-08
Fix build 55 : (4) NoteCard date : champ note.date (pas date_note). (5) ThemeDetail : nouvelle route serveur GET /themes/:id/notes avec direction hiérarchique (CTE récursif descendants/ancêtres, maxDepth 5) + JD_THEME_NOTES dans shared + contrôle portée ↕/↓/↑ comme ObjetDetail + filtre objet en même ligne.

---

## Build 55 — 2026-06-08
6 retouches UX : (1) Swipe tactile sur la page journal (gauche/droite = jour suivant/précédent). (2) Toolbar mobile scrollable horizontalement au doigt (overflow-x auto, justify flex-start, items flex-shrink:0). (3) Arbres objets/thèmes : interligne réduit d'1/3 (padding .1rem, min-height 24px, toggle 32px). (4) NoteCard : prop showDate pour afficher la date — activée dans ObjetDetail et ThemeDetail. (5) ObjetDetail : filtre par thème (descendants inclus) ; ThemeDetail : filtre par objet (descendants inclus). (6) PDF viewer : Lightbox affiche iframe inline + lien "ouvrir dans nouvel onglet" ; NoteView inclut les PDFs dans la lightbox.

---

## Build 54 — 2026-06-06
Suppression complète du share target (fonctionnalité abandonnée) : ShareTarget.jsx, shareDB.js, ShareIntentDetector, routes serveur share-session/share-pending/debug/share, pendingSessions, POST /share-target, share_target du manifest, handler SW. Le serveur retrouve son état minimal.

---

## Build 53 — 2026-06-06
APK Bubblewrap : mise à jour assetlinks.json avec le fingerprint SHA-256 du keystore Bubblewrap (4C:6A:EC:6F:...). L'APK app-release-signed.apk généré sur ~/Desktop remplace le package PWABuilder.

---

## Build 52 — 2026-06-06
Diagnostic confirmé : POST /share-target n'arrive jamais sur le serveur (sessions_disk et sessions_memory vides). Ajout check IDB dans ShareIntentDetector : si le SW a intercepté le POST et stocké en IDB sans que le redirect ne cause une navigation, le polling le détecte et redirige vers /share-target?shared=1.

---

## Build 51 — 2026-06-06
Diagnostic + polling TWA share : endpoint GET /api/share-pending (session la plus récente < 5 min en mémoire), endpoint GET /debug/share (sessions disque + mémoire, temporaire). ShareIntentDetector passe en polling actif : toutes les 500ms pendant 10s au mount et à chaque visibilitychange, vérifie cookie ET /api/share-pending. pendingSessions Map côté serveur, nettoyée au DELETE et après 10 min.

---

## Build 50 — 2026-06-06
Fix TWA share target — cookie comme mécanisme de détection : la TWA Android navigue vers start_url (/) sans suivre le redirect 303 du POST. Le serveur pose maintenant un cookie share_session=<uuid> (Max-Age 1h) dans la réponse du POST /share-target. Nouveau composant ShareIntentDetector dans main.jsx (top-level, à l'intérieur du BrowserRouter) : détecte le cookie au mount ET sur visibilitychange, redirige vers /share-target?session=<uuid> quelle que soit la route courante. ShareTarget nettoie le cookie au cleanup (import ou annulation). Suppression du check IDB dans Portal (remplacé par la détection globale).

---

## Build 49 — 2026-06-06
Fix partage TWA Android cold start : le SW n'est pas actif au premier démarrage → le POST /share-target arrivait sur Hono sans handler → Chrome naviguait vers start_url (/). Ajout d'un handler POST /share-target côté serveur : sauvegarde les fichiers dans data/share-sessions/<uuid>/, redirige vers /share-target?session=<uuid>. Trois routes serveur supplémentaires : GET /share-session/:id/meta.json, GET /share-session/:id/file/:name, DELETE /share-session/:id. ShareTarget.jsx gère les deux chemins : session (serveur, cold start) et IDB (SW actif, warm start). Cleanup de session après import ou annulation.

---

## Build 48 — 2026-06-06
Fix partage TWA Android : quand l'app est déjà ouverte en arrière-plan, le redirect 303 du SW ne déclenche pas de navigation. Fix : (1) Portal.jsx vérifie IndexedDB au mount ET sur visibilitychange → redirige vers /share-target?shared=1 si fichiers en attente. (2) ShareTarget : charge les fichiers IDB dès que le token est présent (sans attendre ?shared dans l'URL) ; affiche le picker si files.length > 0 même sans paramètre URL.

---

## Build 47 — 2026-06-06
TWA assetlinks.json : fingerprint SHA-256 réel (DB:C1:55:...) généré par PWABuilder pour ch.pogil.apps / signing.keystore. L'APK pogil apps.apk peut être sideloadé sur Android.

---

## Build 46 — 2026-06-06
Préparation TWA/APK Android : route GET /.well-known/assetlinks.json (Digital Asset Links) liant apps.pogil.ch au package ch.pogil.apps. Le SHA256 fingerprint est un placeholder à remplacer après génération de l'APK via PWABuilder.

---

## Build 45 — 2026-06-05
Fix PWA Android (2e passe) : (1) Middleware Hono `/*.webmanifest` ne matchait pas `/manifest.webmanifest` — remplacé par une route GET dédiée lisant le fichier et forçant Content-Type application/manifest+json. (2) Le template index.html avait déjà `<link rel="manifest">` ET vite-plugin-pwa en injectait un second → manifest dupliqué ; suppression du lien du template (vite-plugin-pwa l'injecte seul).

---

## Build 44 — 2026-06-05
Fix PWA Android — installation vraie app au lieu de raccourci : (1) Middleware Hono pour servir manifest.webmanifest avec Content-Type application/manifest+json (Hono serveStatic pouvait envoyer octet-stream, Chrome ignorait silencieusement le manifest). (2) Génération d'une icône maskable dédiée (icon-maskable-512.png) : logo centré sur fond #0f0f1a avec 10% de marge (safe zone 80%) via sharp. (3) Manifest : champ id "/" ajouté pour identification stable de la PWA. Résout l'impossibilité de partager images/PDF avec l'app via le Share Target Android.

---

## Build 27 — 2026-06-04
Intégration Todoist (CDC §6) : migration DB (todoist_token/project_id/project_nom sur workspaces). 5 endpoints serveur proxy (config GET/PUT, projects POST, task POST/GET/DELETE). TodoistPanel.jsx : création tâche (titre=note, lien retour, échéance, priorité P1-P4, récurrence texte libre avec popup aide syntaxe), statut polling au chargement, délier/supprimer. NoteView : TodoistPanel dans la sidebar. WorkspaceManager : section Todoist (saisie token masqué, test+chargement projets, sélection projet, enregistrement). Tous les appels Todoist passent par le serveur (clé jamais exposée au client).

---

## Build 26 — 2026-06-04
Validation backlog C+E : (C) ObjetManager et ThemeManager déjà complets — éditeur inline arbre avec renommage, changement de parent (= insertion niveau intermédiaire), ajout enfant, suppression. (E) Nouveau mode "📋 7 jours" dans CalendarView : affiche les 7 derniers jours se terminant sur l'anchor (anchor = aujourd'hui par défaut), navigation par blocs de 7 jours via les flèches, réutilise CalendarWeek avec prop mode="last7". Ajout getRange/shiftAnchor/rangeLabel/daysOfLast7 pour le period "last7" dans calUtils.

---

## Build 25 — 2026-06-04
HierarchyPicker scroll : soustraction du offsetTop de la <ul> (l'offsetParent étant le dropdown positionné, el.offsetTop incluait la hauteur de la zone de recherche → item 2 lignes au-dessus du visible). Correction : scrollTop = el.offsetTop - listRef.offsetTop.

---

## Build 24 — 2026-06-04
HEIC (3e tentative) : ajout détection magic bytes — iOS envoie souvent du contenu JPEG avec extension .heic ; la détection (FF D8 → jpeg, ftyp → heif) permet de distinguer les deux cas et évite une conversion inutile. Pour les vrais HEIC, la chaîne reste sharp → heic-convert WASM → fallback. HierarchyPicker : scroll vers le haut du container (scrollTop = el.offsetTop) quand une recherche est active, au lieu de scrollIntoView nearest qui plaçait l'item en dernière ligne.

---

## Build 23 — 2026-06-04
Corrections post-test terrain (build 22) : (1) Fix crash NoteView page blanche — useRef placé après les early returns violait les règles des hooks React. (2) Vue semaine : clic sur une colonne jour affiche le panneau notes en dessous (même comportement que la vue mensuelle). (3) HEIC : ajout heic-convert (WASM) comme fallback quand sharp ne peut pas décoder HEIC. (4) Overlay médias mobile : @media pointer:coarse au lieu de hover:none, plus fiable sur iOS/Android. (5) HierarchyPicker : au lieu de filtrer, défile vers la première correspondance et surligne les items matchés en maintenant la hiérarchie complète visible.

---

## Build 22 — 2026-06-04
Sprint mobile/UX : (1) Fix timezone — toutes les fonctions de date locale utilisent désormais les méthodes getFullYear/getMonth/getDate au lieu de toISOString() UTC, corrige le recul de 2 jours sur les flèches journal et l'ancrage incorrecte de la vue semaine. (2) HEIC → JPEG : conversion automatique côté serveur via sharp, les images iPhone sont maintenant affichées partout. (3) Swipe mobile dans Lightbox (médias) et NoteView (navigation notes). (4) Vue semaine mobile : header compact, titres masqués, min-width 44px → utilisable en portrait. Dates centrées en paysage. (5) Overlay média toujours visible sur écrans tactiles (@media hover:none). (6) Filtre médias "Tous/Non liés/Liés" remplacé par boutons inline. (7) HierarchyPicker : items triés alphabétiquement par chemin hiérarchique complet.

---

## Build 21 — 2026-06-03
Import CSV objets + thèmes : backend parseur (BOM, séparateur ; ou , auto-détecté, commentaires #), format chemin hiérarchique (Arbres/Fruitiers/Pommiers) ou nom+parent, idempotent (doublons ignorés). Routes POST /import/objets et /import/themes. CsvImporter : upload drag&drop + coller, prévisualisation table, résultats (créés/existants). Section import dans WorkspaceManager avec onglets Objets/Thèmes et exemples chargeables.

---

## Build 20 — 2026-06-03
Gestion des workspaces : backend CRUD (créer, renommer PATCH, supprimer DELETE, membres GET/POST/PUT/DELETE, ownerCheck middleware). WorkspaceSwitcher dans la sidebar JourDoc (dropdown rapide, basculer d'un ws à l'autre). WorkspaceManager (⚙️ Workspace dans la nav) : renommer, supprimer ws courant, gérer les membres (inviter par username/email, changer rôle, retirer), créer un nouveau ws. Route /api/jourdoc/workspaces (non scoped).

---

## Build 19 — 2026-06-03
Navigation précédente/suivante dans NoteView : sortedIds() transmis via location.state depuis Journal, CalendarMonth (popup + panneau), CalendarWeek, ObjetDetail, ThemeDetail, ObjectMatrix. Tri date ASC + created_at ASC. NoteView lit noteIds, affiche position (n/total) et flèches ‹ / ›. Contexte préservé à chaque nav (replace:true). Backend : created_at ajouté à la requête objets/notes récursive.

---

## Build 18 — 2026-06-03
Ergonomie : NoteView lecture (2 colonnes desktop, médias lightbox, fil de notes, bouton Modifier). RichTextEditor Tiptap (gras/italique/souligné, code/bloc, puces/numéros indentables, H1/H2, lien). RichTextView (HTML + fallback texte brut). Calendrier URL-based state (useSearchParams → navigate(-1) restaure le contexte). Bouton "+ Note" depuis ObjetDetail (pré-remplit objet). NoteForm → NoteView après sauvegarde. Tri liens created_at.

---

## Build 17 — 2026-06-03
Fix fil de notes : permutation Contexte/Suite — liens sortants (notes citées, plus anciennes) → Contexte ; liens entrants (notes qui citent celle-ci, plus récentes) → Suite / entraîne.

---

## Build 16 — 2026-06-03
Liaisons notes : section "Fil de notes" visible dès la création (liens en attente créés après POST). Titre complet affiché dans chips et picker (titre_alt en secondaire). Couleur par type (observation=vert, activité=indigo, documentation=ambre) sur chips et items picker. Tri chronologique des liens (sortByDate).

---

## Build 15 — 2026-06-03
Liaison entre notes (CDC §2.3) : table jd_note_note. Backend : recherche plein-texte GET /notes/search, POST/DELETE /notes/:id/liens, liens entrants dans GET /notes/:id. NoteLinkPicker (recherche debounce, titre_alt affiché, date). Section "Fil de notes" dans NoteForm (edit seulement) : liens entrants en lecture, liens sortants modifiables, NoteLienChip cliquable + suppression immédiate.

---

## Build 14 — 2026-06-03
Fix vues calendrier : WeekNoteItem compact (icône + fond coloré + titre_alt, titre complet en tooltip). Popup hover CSS sur CalendarMonth (titre_alt, navigation directe vers la note, repositionnement colonnes droite). Matrice refaite en CSS Grid natif : colonne objet sticky left, header sticky top, coin sticky, scroll vertical + horizontal sans chevauchement, hauteurs de lignes uniformes (grid-auto-rows: 34px).

---

## Build 13 — 2026-06-03
Phase 2 Calendrier : CalendarView (conteneur avec 3 modes + nav période + compteur). CalendarMonth (grille 7×N, dots colorés par nature, clic jour → notes + bouton +). CalendarWeek (7 colonnes, NoteCard compact, + rapide par colonne). ObjectMatrix (matrice objets × jours, cellules colorées par activité dominante, popup clic → notes liées + nouvelle note pré-remplie objet+date, scroll horizontal, colonne gauche sticky). Navigation "Aujourd'hui" + flèches sur tous les modes.

---

## Build 12 — 2026-06-03
Galerie médias : filtre plage de date période (jour/sem./mois/trim./an) avec flèches prev/next et label dynamique. Lightbox plein écran (nav ←→, Échap, clic fond). MediaCard redesigné : zone image → lightbox, checkbox coin haut-gauche → sélection, bouton 🔗 → notes liées. NoteCard : lightbox sur miniatures sans quitter la vue. Créer note depuis galerie : date = date de la 1ère image sélectionnée. MediaDetail (page notes liées + aperçu grand format). Auto-ancrage après upload sur la date de la première image. Backend : GET /medias/:id/notes.

---

## Build 11 — 2026-06-03
Fix médias : date EXIF extraite en priorité (exifreader, format YYYY:MM:DD → ISO). Réduction automatique à 1600 px max (sharp, withMetadata pour conserver l'EXIF). Proxy Vite /uploads → port 3000 (vignettes visibles en dev). MediaGallery : filtres par défaut "Non liés" + date du jour.

---

## Build 10 — 2026-06-03
Phase 2 Médias : tables jd_medias + jd_note_media, upload multipart (UUID filenames, serveStatic /uploads/*), liste avec filtres (date/type/lié), suppression fichier + DB. MediaGallery (galerie avec drag&drop upload, filtres, sélection multi → créer note). MediaCard (vignette image/PDF, sélection, badge lié, suppression). MediaPicker (inline dans NoteForm, médias du jour, filtres). Vignettes dans NoteCard. NoteForm enrichi (section pièces jointes, médias pré-sélectionnés depuis galerie via location.state). Nav JourDoc : item 📷 Médias.

---

## Build 9 — 2026-06-03
HierarchyPicker unifié avec navigation clavier complète (↑↓ naviguer, Entrée valider, Échap fermer, clic mobile maintenu). État focalisé visible (outline accent). Support nullable/nullLabel pour l'option racine. Sélecteur de parent dans ObjetManager/ThemeManager remplacé par HierarchyPicker (plus de <select>). Footer "X sélectionnés / Effacer" en mode multi.

---

## Build 8 — 2026-06-03
Flèche de dépliage doublée (22→44 px, font 1.5rem) avec hover accent. Sélecteur de parent trié par chemin court (localeCompare sur pathMap) pour refléter la hiérarchie.

---

## Build 7 — 2026-06-03
Améliorations arbres objets/thèmes : sélecteur de parent dans le formulaire d'édition (select avec chemin court, descendants exclus pour éviter les cycles). Noms cliquables dans les arbres → fiche objet (ObjetDetail) ou fiche thème (ThemeDetail, nouveau). Backend : filtre theme_id sur GET /notes.

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
