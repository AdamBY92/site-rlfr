# Site communautaire Rocket League FR

Landing page statique (HTML5 + CSS3 + JavaScript vanilla) pour un serveur Discord
communautaire francophone autour de Rocket League.

Aucun framework, aucune dépendance : tu peux déposer le dossier tel quel sur
n'importe quel hébergement statique (Netlify, Vercel, GitHub Pages, OVH, un
simple FTP...).

---

## 1. Arborescence

```
site_rlfr/
├── index.html              Accueil (hero plein écran, actus, cards, bot, étapes, FAQ)
├── mises-a-jour.html       Actus / patch notes  (liste générée depuis data/updates.json)
├── boutique.html           Rotation du jour     (grille générée depuis data/shop.json)
├── communaute.html         Présentation, règlement, modération
├── mentions-legales.html   Mentions légales + données personnelles
├── sitemap.xml             Plan du site pour les moteurs de recherche
├── robots.txt              Autorisations d'indexation
├── .htaccess               En-têtes de sécurité Apache/OVH (à déposer en ligne)
├── package.json            Commandes npm (npm run update-content)
├── data/
│   ├── updates.json        Les 10 dernières news officielles
│   ├── shop.json           La rotation de la boutique du jour
│   └── stats.json          Compteur de membres Discord
├── scripts/
│   ├── fetch-updates.js    Récupère les news sur rocketleague.com/news
│   ├── fetch-shop.js       Récupère la rotation sur itemshop.gg
│   ├── fetch-member-count.js  Compteur de membres Discord
│   ├── update-all.js       Lance les trois scripts (npm run update-content)
│   └── lib/util.js         Réseau, écriture des JSON, journalisation
├── .github/workflows/
│   └── update-content.yml  Automatisation quotidienne (GitHub Actions)
└── assets/
    ├── css/style.css       Toute la mise en forme (commentée par sections)
    ├── js/main.js          Header au scroll, menu mobile, FAQ, animations
    ├── js/content.js       Affiche data/*.json (grille actus, boutique, MAJ)
    ├── js/hero-particles.js Trainees de vitesse animees du hero (canvas)
    └── img/                Dépose ici ton logo et ton image de partage
```

---

## 2. Placeholders

### Déjà renseignés

| Élément | Valeur en place |
|---|---|
| Nom du serveur — forme longue | **Rocket League France** (titres, meta descriptions, H1, textes, copyright, mentions légales) |
| Nom du serveur — forme courte | **RL FR** (logo du header, logo du footer, `aria-label` du logo, nom du bot dans le mockup Discord, suffixe des titres des pages internes) |
| Lien d'invitation | **https://discord.gg/CNDjmDBmJz** (31 occurrences : boutons CTA, footers, liens affichés en clair, `sameAs` des données structurées) |
| Adresse du site | **https://rocketleaguefrancediscord.fr** (27 occurrences : `canonical`, `og:url`, `og:image`, `twitter:image`, données structurées, `sitemap.xml`, `robots.txt`) |
| Mentions légales | **Complètes** : éditeur Barcelona (pseudonyme, anonymat LCEN art. 6-III), hébergeur OVH SAS, contact contact@rocketleaguefrancediscord.fr |
| Compteur de membres | **Dynamique**, récupéré depuis Discord (section 12) — plus aucun chiffre à saisir |

Pour changer le nom plus tard, cherche `Rocket League France` **et** `RL FR` :
les deux formes coexistent volontairement.

### Ce qu'il reste

**Aucun placeholder visible** sur `index.html`, `communaute.html` et
`mentions-legales.html`.

Il en subsiste dans le **CONTENU DE SECOURS** de `mises-a-jour.html` et
`boutique.html` (`[TITRE DE LA MISE A JOUR]`, `[Prix]`…). Ils ne s'affichent
que si `data/*.json` est absent du serveur — donc jamais, tant que le
déploiement FTP fonctionne (section 17).

---

## 3. Couleurs, polices et vitesses (les variables à connaître)

Tout se règle dans `:root`, en haut de `assets/css/style.css` (section 01).
Le site fonctionne sur **deux familles de couleurs** : une froide pour
l'ambiance, une chaude pour les actions.

### Couleurs

| Variable | Valeur | Ce qu'elle pilote |
|---|---|---|
| `--bg` | `#04070f` | Fond général |
| `--bg-deep` | `#0a1428` | Bleu nuit du dégradé animé |
| `--accent-1` / `--accent-2` | `#1d6fe0` / `#4fa3ff` | **Froid** : liens, halos de fond, icônes, mockup Discord |
| `--hot-1` / `--hot-2` | `#ff6b35` / `#ff2d78` | **Chaud** : CTA, survols, compteur, pastilles d'étapes, liserés |
| `--gradient` / `--gradient-hot` | — | Les deux dégradés dérivés des accents ci-dessus |
| `--glow` / `--glow-hot` | — | Halos lumineux au survol |
| `--glass-bg` / `--glass-bg-2` | `rgba(15,25,45,.55)` | Fond des cards en verre (normal / survol) |
| `--glass-blur` | `14px` | Intensité du flou des cards |

> Règle de lecture : le bleu porte l'ambiance, **l'orange/magenta ne sert qu'à
> l'action**. Si tu ajoutes du chaud ailleurs, tu perds cette hiérarchie.

Pour changer d'identité : modifie `--hot-1` / `--hot-2` (par exemple en vert
acide `#7cff5a` / `#00d68f`) et tous les CTA du site suivent.

### Polices

| Variable | Police | Usage |
|---|---|---|
| `--font-display` | Chakra Petch | Titres, boutons, chiffres, badges |
| `--font` | Inter | Texte courant |

Les deux sont chargées depuis Google Fonts dans les 5 pages. Pour en changer,
remplace la balise `<link>` **et** la variable correspondante.

### Mouvement (le tempo du site)

| Variable | Défaut | Effet |
|---|---|---|
| `--speed-bg` | `55s` | Tour complet du dégradé conique de fond. **Augmente** pour ralentir. Au-delà de ~90s le mouvement n'est plus perceptible |
| `--speed-drift` | `18s` | Respiration des halos lumineux |
| `--speed-reveal` | `.85s` | Durée des apparitions au scroll |
| `--parallax` | `0.25` | Force du parallaxe de fond. `0` le désactive complètement |
| `--ease-out-expo` | `cubic-bezier(.16,1,.3,1)` | Courbe des arrivées (entrées, reveals) |
| `--ease-dynamic` | `cubic-bezier(.2,.85,.25,1)` | Courbe des interactions (survols, boutons) |

Les traînées du hero se règlent à part, dans l'objet `CONFIG` en haut de
`assets/js/hero-particles.js` : `count` (70, plafonné à 100), `countMobile`,
`angle`, `speedMin`/`speedMax`, `opacityMin`/`opacityMax`, `warmRatio`.

### Où trouver les nouveaux blocs

`.hero__canvas` (traînées) · `.hero-in` (entrée au chargement) · `.scroll-cue`
(flèche de défilement) · `.counter` (compteur animé) · `.news-card` (grille
actus) · `.speed-lines` (filets diagonaux décoratifs) · `data-stagger`
(cascade automatique sur une grille).

Pense aussi à mettre à jour :
- `<meta name="theme-color" content="#04070f">` dans chaque page ;
- le favicon SVG en ligne (`<link rel="icon" ...>`, la couleur `%231d6fe0`).

---

## 4. Le logo

Ton logo est en place dans le **header et le footer des 5 pages**
(`assets/img/logo.png`). Le HTML contient aussi un monogramme SVG de
secours : si le fichier PNG disparaissait, c'est lui qui s'afficherait,
jamais une icone d'image cassee (bascule geree par `main.js`, section 11).

Pour changer de fichier, cherche `assets/img/logo.png` (10 occurrences).

> **A faire :** `logo.png` pese 1 Mo pour un affichage a 44 px. Le
> compresser en 128x128 px (< 30 Ko) est la plus grosse amelioration de
> temps de chargement disponible. Marche a suivre dans
> `assets/img/A-LIRE.txt`.

---

## 5. Image de partage (Open Graph)

Crée une image **1200 × 630 px**, enregistre-la dans `assets/img/og-image.jpg`.
C'est elle qui s'affiche quand le lien est partagé sur Discord, X, Facebook...
Les balises sont déjà en place dans les cinq pages.

---

## 6. Mettre à jour le contenu

### Pages automatiques

**Mises à jour** et **Boutique** se remplissent toutes seules à partir de deux
fichiers JSON. Tu n'édites plus le HTML de ces deux pages au quotidien.

```
scripts/fetch-updates.js  ──>  data/updates.json  ──>  mises-a-jour.html
scripts/fetch-shop.js     ──>  data/shop.json     ──>  boutique.html
```

Commandes :

```bash
npm install            # une seule fois, installe cheerio
npm run update-content # lance les deux scripts
npm run update-updates # seulement les news
npm run update-shop    # seulement la boutique
```

Chaque script fait **un seul appel réseau**, avec un User-Agent identifiable
(à personnaliser dans `scripts/lib/util.js`, constante `USER_AGENT`).

**Règle de sécurité importante :** si une source est inaccessible ou si sa
structure HTML change, le script écrit une erreur explicite et **ne remplace
pas** le JSON existant. La dernière donnée valide reste affichée sur le site.

### Pages manuelles

- **FAQ** (`index.html`) : pour ajouter une question, duplique un
  `<div class="faq__item">` et incrémente les identifiants `faq-6` /
  `faq-btn-6` (le `aria-controls` du bouton doit correspondre à l'`id` de la
  réponse, sinon l'accordéon ne s'ouvre pas).
- **Règlement** (`communaute.html`) : liste `<ol class="rules">`, la numérotation
  est automatique en CSS.

---

## 6 bis. Automatiser l'exécution

### Option A — GitHub Actions (si le site est sur GitHub)

Le fichier `.github/workflows/update-content.yml` est déjà prêt. Il tourne
**tous les jours à 00:05 UTC** (5 minutes après la rotation de la boutique),
lance les deux scripts, puis commit et pousse `data/updates.json` et
`data/shop.json` s'ils ont changé.

Rien à configurer : le workflow utilise le jeton fourni par GitHub. Vérifie
seulement, dans *Settings > Actions > General > Workflow permissions*, que
l'option **Read and write permissions** est active.

### Option B — Planificateur de tâches Windows (aucun dépôt Git requis)

1. Ouvre **Planificateur de tâches** > *Créer une tâche de base*.
2. Nom : `Mise à jour site RL FR`. Déclencheur : **Tous les jours**, à
   **02:05** (soit 00:05 UTC en heure d'été française, 01:05 en hiver).
3. Action : *Démarrer un programme*.
   - **Programme** : `cmd.exe`
   - **Arguments** :
     `/c cd /d "C:\Users\User\Desktop\dsc\site_rlfr" && npm run update-content >> update.log 2>&1`
4. Coche *Exécuter même si l'utilisateur n'est pas connecté* si la machine
   tourne en permanence.

Le fichier `update.log` créé dans le dossier te donnera l'historique des
exécutions, avec les messages d'erreur éventuels.

> Après une exécution locale, n'oublie pas de réenvoyer `data/updates.json` et
> `data/shop.json` sur ton hébergement (FTP ou déploiement habituel).

---

## 6 ter. Éditer les JSON à la main (dépannage)

Si le RSS/scraping casse un jour et que tu veux publier quand même, édite
directement les deux fichiers. Le site les lit sans rien demander d'autre.
Respecte la structure ci-dessous (JSON valide : guillemets droits, virgules
entre les éléments, **pas** de virgule après le dernier).

### `data/updates.json`

Un **tableau** d'entrées, la plus récente en premier.

| Champ    | Type   | Rôle |
|---|---|---|
| `date`   | texte  | Date ISO 8601 : `"2026-09-10T00:00:00.000Z"` |
| `titre`  | texte  | Titre affiché en gras |
| `resume` | texte  | Phrase de description. **Peut être vide** (`""`) : le paragraphe est alors masqué |
| `lien`   | texte  | URL de l'article officiel (bouton « Lire l'article officiel ») |
| `tag`    | texte  | `"MAJ"`, `"correctif"` ou `"evenement"` — pilote la couleur de la pastille |

```json
[
  {
    "date": "2026-09-10T00:00:00.000Z",
    "titre": "Rocket League Patch Notes v2.73",
    "resume": "Correction du matchmaking classé et nouveaux objets saisonniers.",
    "lien": "https://www.rocketleague.com/news/rocket-league-patch-notes-v2-73",
    "tag": "correctif"
  },
  {
    "date": "2026-09-04T00:00:00.000Z",
    "titre": "La saison 24 démarre",
    "resume": "Nouveau Rocket Pass, nouvelle arène et récompenses classées.",
    "lien": "https://www.rocketleague.com/news/saison-24",
    "tag": "evenement"
  }
]
```

> **À propos du champ `resume` :** la page news officielle n'affiche que le
> titre et la date des articles, sans chapô. Le script laisse donc `resume`
> vide, et le site n'affiche pas de paragraphe. Si tu veux des résumés, écris-les
> ici à la main : le script les écrasera à la prochaine exécution réussie, donc
> fais-le plutôt quand l'automatisation est en panne.

### `data/shop.json`

Un **objet** avec trois clés.

| Champ                | Type   | Rôle |
|---|---|---|
| `date_rotation`      | texte  | Date ISO de la rotation en cours (affichée dans la pastille en haut) |
| `prochaine_rotation` | texte  | Date ISO du lendemain à `00:00:00.000Z` |
| `items`              | liste  | Les objets à afficher |

Chaque objet de `items` :

| Champ   | Type          | Rôle |
|---|---|---|
| `nom`   | texte         | Nom de l'objet |
| `prix`  | nombre        | Prix en crédits, sans guillemets. `0` affiche « Prix non communiqué » |
| `image` | texte ou null | URL **https** de la vignette, ou `null` pour la vignette CSS de secours |
| `type`  | texte ou null | Catégorie affichée au-dessus du nom (Body, Wheels, Decal…) |

```json
{
  "date_rotation": "2026-09-10T00:00:00.000Z",
  "prochaine_rotation": "2026-09-11T00:00:00.000Z",
  "items": [
    {
      "nom": "Fennec",
      "prix": 700,
      "image": "https://cdn.locker.gg/images/rocket-league-baked-cards/4284.png",
      "type": "Body"
    },
    {
      "nom": "Draco",
      "prix": 900,
      "image": null,
      "type": "Wheels"
    }
  ]
}
```

Vérifie ton fichier avant publication :

```bash
node -e "JSON.parse(require('fs').readFileSync('data/shop.json','utf8')); console.log('JSON valide')"
```

### Et si je ne veux plus du tout d'automatisation ?

Supprime `data/updates.json` et `data/shop.json` : les deux pages réafficheront
le contenu écrit en dur dans le HTML, que tu édites alors normalement (les blocs
sont repérés par un commentaire `CONTENU DE SECOURS`).

---

## 6 quater. Réparer les scripts si un site change

Les deux scripts lisent du HTML public : le jour où ces sites changent leur
structure, il faut corriger un sélecteur. Tout est regroupé en haut de chaque
fichier, dans une constante `SELECTORS`.

| Symptôme | Où regarder |
|---|---|
| `moins de 4 objets exploitables trouves` | `SELECTORS.card` dans `scripts/fetch-shop.js` (actuellement `.isg-card`) |
| Objets sans prix | `SELECTORS.creditsIcon` (image `rl-credits`) |
| `aucun article exploitable` | `SELECTORS.articleLink` dans `scripts/fetch-updates.js` |
| `HTTP 403` | Le site bloque le robot : voir la constante `TRANSPORT` (`"curl"`, `"fetch"` ou `"auto"`) |

Méthode : ouvre la page dans ton navigateur, clic droit sur un élément >
*Inspecter*, repère la balise qui entoure **un** item, et remplace le sélecteur.

**Deux points à connaître :**

- `www.rocketleague.com` refuse les requêtes réseau émises par Node (HTTP 403,
  quels que soient les en-têtes) mais accepte `curl`. `fetch-updates.js` utilise
  donc `curl`, installé d'origine sur Windows 10/11 et sur les serveurs GitHub.
  Si un jour GitHub Actions renvoie 403 sur cette étape, c'est que le filtrage
  s'applique aussi aux adresses IP des serveurs : lance alors le script depuis
  chez toi (Option B ci-dessus).
- `itemshop.gg` est un site tiers non officiel. Les prix et disponibilités qu'il
  publie sont indicatifs — c'est déjà précisé dans l'encadré de `boutique.html`.

---

## 7. Détails techniques

- **Animations au scroll** : ajoute `class="reveal"` sur un élément, plus
  `data-delay="1"` à `"6"` pour un effet en cascade (`IntersectionObserver`).
  Les blocs ajoutés après le chargement sont animés en appelant
  `window.RLFR.scanReveals(conteneur)` — c'est ce que fait `content.js`.
- **Aperçu local des pages dynamiques** : ouvrir un fichier en `file://` empêche
  le navigateur de lire `data/*.json` (règle de sécurité) et tu verras le contenu
  de secours. Pour voir le rendu réel, lance un serveur local :
  `python -m http.server 8080` puis <http://localhost:8080/boutique.html>.
- **Sécurité de l'affichage** : `content.js` construit le DOM avec
  `createElement` + `textContent`, jamais avec `innerHTML`, et n'accepte que des
  images en `https://`. Les données venant de sites tiers ne peuvent donc pas
  injecter de code dans la page.
- **Accordéon FAQ** : accessible au clavier (Tab, Entrée/Espace, flèches haut/bas,
  Home/End), une seule réponse ouverte à la fois — voir `main.js` section 4 pour
  autoriser plusieurs ouvertures simultanées.
- **Année du copyright** : injectée par `<span data-year>`, rien à maintenir.
- **`prefers-reduced-motion`** : les animations se désactivent pour les visiteurs
  qui l'ont demandé dans leur système.
- **Responsive** : mobile-first, testé de 360 px à grand écran ; menu burger
  en dessous de 760 px.

---

## 8. Deux remarques avant la mise en ligne

1. **Polices Google Fonts** : la police Inter est chargée depuis
   `fonts.googleapis.com`, ce qui transmet l'IP du visiteur à Google. Pour un
   site 100 % sans transfert, télécharge les fichiers de police, mets-les dans
   `assets/img/` (ou un dossier `assets/fonts/`) et supprime les trois balises
   `<link>` de polices. La pile de secours `system-ui` est déjà prévue.
2. **Mentions légales** : le texte fourni est un modèle générique. Complète tous
   les champs entre crochets, et fais-le relire si ton projet reçoit des dons ou
   des sponsors.

---

## 9. Propriété intellectuelle

Aucun visuel officiel de Rocket League n'est utilisé : toutes les illustrations
(logo temporaire, icônes, orbe du hero, mockup Discord, vignettes de la boutique)
sont des formes CSS et des SVG originaux.

Le pied de page de chaque page affiche la mention :

> Site communautaire indépendant, sans lien officiel avec Psyonix LLC ni Epic
> Games. Rocket League est une marque de Psyonix LLC.

Garde cette mention visible.

---

## 10. Performance : ce qui est optimisé et pourquoi

Le site anime en permanence un fond, des traînées et des apparitions au
scroll. Voilà les règles qui le gardent fluide — **à respecter si tu ajoutes
des animations**, sinon les saccades reviendront.

### Les 3 règles à ne pas casser

1. **N'anime que `transform` et `opacity`.** Ce sont les deux seules
   propriétés que le navigateur peut traiter sur le GPU, sans recalculer la
   mise en page ni repeindre. Éviter absolument en animation : `top`, `left`,
   `width`, `height`, `margin`, `box-shadow`, `filter`, `backdrop-filter`.
2. **Un seul calcul par frame au scroll.** Ne pose jamais un
   `addEventListener("scroll")` de plus : utilise `onScrollFrame(callback)`
   dans `main.js` (section 0), qui regroupe tout dans un seul
   `requestAnimationFrame`.
3. **`will-change` est temporaire.** On le pose juste avant l'animation et on
   le retire à la fin (`transitionend`). Le laisser en CSS permanent crée une
   couche GPU par élément, indéfiniment.

### Corrections déjà appliquées

| Problème trouvé | Correction |
|---|---|
| `filter: blur(90px)` sur un fond géant en rotation permanente | Le flou est appliqué sur une surface réduite (`inset: 25%`, `blur(34px)`) puis agrandie par `scale(2.6)` : le GPU réutilise la texture au lieu de la refabriquer |
| `.reveal` animait `filter: blur(6px)` sur toute une cascade | Supprimé — apparitions en `transform` + `opacity` uniquement |
| `will-change` permanent sur tous les `.reveal` | Posé/retiré par JS autour de l'animation (`.is-animating`) |
| Onde du badge animée en `box-shadow` (repaint continu) | Redessinée en pseudo-élément animé en `transform`/`opacity` |
| Deux listeners de scroll séparés, dont un non throttlé | Fusionnés en un seul, rAF, `passive: true`, écriture DOM uniquement au changement d'état |
| Deux listeners de resize non passifs, lisant `scrollHeight` | Fusionnés, débouncés 180 ms, `passive: true` |
| Canvas redimensionné à chaque pixel du geste | Débounce 200 ms + `passive: true` |
| 70 traînées quelle que soit la machine | Divisé par deux si ≤ 4 cœurs, ≤ 4 Go de RAM, ou écran tactile étroit |
| Décors animés en boucle hors écran | Gelés par `IntersectionObserver` (`.is-offscreen`, section 19 du CSS) |
| `backdrop-filter` sur toutes les cards, y compris mobile | Désactivé sous 760 px (fonds opaques), flou du fond réduit |
| `transition` sur `backdrop-filter` du header | Retirée |

### Pause automatique

Trois mécanismes coupent le travail inutile :

- **Onglet en arrière-plan** → le canvas s'arrête (Page Visibility API) ;
- **Hero hors écran** → le canvas s'arrête (`IntersectionObserver`) ;
- **Décor hors écran** → ses animations CSS sont gelées.

Pour couvrir un nouvel élément décoratif, ajoute-lui `data-pause-offscreen`.

### Le poste le plus lourd aujourd'hui

`assets/img/logo.png` pèse **1 Mo** pour un affichage à 44 px. Le compresser
en 128 × 128 px (< 30 Ko) fera plus pour le temps de chargement que toutes
les optimisations ci-dessus réunies. Marche à suivre dans
`assets/img/A-LIRE.txt`.

---

## 11. Logo et emplacements visuels

### Le logo

Intégré à **4 endroits** : header et footer des 5 pages (via `assets/img/logo.png`),
plus les instructions pour le favicon et l'image de partage.

Le HTML contient **les deux versions** : ton PNG et un monogramme SVG de
secours. `main.js` (section 11) n'affiche le PNG que s'il se charge
réellement — donc si le fichier disparaît, le visiteur voit le monogramme,
jamais une icône d'image cassée.

Pour changer de fichier, cherche `assets/img/logo.png` (10 occurrences).

### Les emplacements visuels

Cinq emplacements sont préparés et documentés **dans le code**, chacun avec le
format attendu, l'ambiance recherchée et des pistes de recherche :

| # | Où | Fichier attendu | Format |
|---|---|---|---|
| 1 | Fond du hero (`index.html`) | `hero-fond.jpg` | 1920 × 1080 |
| 2 | Vignettes d'actus (`index.html`) | `actu-1.jpg`… | 640 × 360 |
| 3 | Fond « Ce qui t'attend » (`index.html`) | `fond-section.jpg` | 1600 × 900 |
| 4 | Bandeau CTA final (`index.html`) | `cta-fond.jpg` | 1400 × 600 |
| 5 | Portrait de communauté (`communaute.html`) | libre | 1200 × 800 |

Tous sont **facultatifs** : sans eux, le site affiche ses dégradés générés en
CSS, qui sont propres et sans aucune question de droits. Cherche
`EMPLACEMENT VISUEL` dans le code pour les retrouver.

---

## 12. Compteur de membres Discord

Le hero, le badge de la page Communauté et le bandeau CTA affichent un
compteur alimenté par `data/stats.json`, généré par
`scripts/fetch-member-count.js`.

```bash
npm run update-stats
```

### Deux sources, sans aucune authentification

| Source | Ce qu'elle donne | Conditions |
|---|---|---|
| **API des invitations** (utilisée en premier) | Total **et** membres en ligne | Le lien d'invitation doit être **permanent** (ne pas expirer) |
| **Widget public** (secours automatique) | Membres en ligne **uniquement** | Widget à activer : *Paramètres du serveur > Widget* |

Aucun token, aucun bot, aucun secret : rien à protéger.

### Ce que le compteur affiche

- Total connu → **12 504** avec le libellé « membres · 2 448 en ligne »
- Total inconnu → **2 448** avec le libellé « membres **en ligne** »
- Rien de disponible → « Rejoins-nous » / « Communauté ouverte 24/7 »

Le libellé n'affiche jamais « membres » tout court pour un nombre qui ne
représente que les connectés : ce serait trompeur.

### Où trouver l'identifiant du serveur

Déjà renseigné dans le script (`1426966365964599428`). Pour le retrouver :
Discord > *Paramètres utilisateur > Avancés > Mode développeur*, puis clic
droit sur le nom du serveur > *Copier l'identifiant du serveur*.

### Fréquence

Le workflow GitHub lance le compteur **toutes les heures** et le contenu
complet une fois par jour à 00:05 UTC. En local : `npm run update-content`
lance les trois scripts (`scripts/update-all.js`), chacun protégé des autres.

---

## 13. Sécurité

### En-têtes HTTP

Le fichier **`.htaccess`** à la racine est prêt pour un hébergement Apache
(c'est le cas d'OVH mutualisé). Dépose-le dans `www/` avec le reste du site.
Il contient : `Content-Security-Policy`, `X-Content-Type-Options: nosniff`,
`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, plus la
compression et le cache.

La **redirection HTTPS** et **HSTS** sont actives (certificat SSL en place).
Deux points à connaître :

- La redirection teste `%{HTTPS}` **et** `X-Forwarded-Proto`. Chez OVH
  mutualisé, le TLS est terminé par un répartiteur de charge en amont :
  vu d'Apache, `%{HTTPS}` vaut `off` même en HTTPS. Sans la seconde
  condition, le site partirait en boucle de redirection infinie.
- HSTS est envoyé **sans `includeSubDomains`**, volontairement : cette option
  imposerait le HTTPS à tous les sous-domaines (webmail, ftp…), y compris
  ceux sans certificat, et les rendrait inaccessibles.

HSTS est **irréversible côté visiteur** pendant `max-age` (1 an) : retirer
l'en-tête plus tard ne l'efface pas des navigateurs qui l'ont mémorisé. Pour
une montée en charge prudente, mets d'abord `max-age=86400`, vérifie quelques
jours, puis repasse à `31536000`.

La CSP a été testée dans Chrome sur les 5 pages : **aucune violation**. Si tu
ajoutes un service externe (statistiques, widget embarqué, YouTube), il sera
bloqué tant que tu ne l'auras pas ajouté à la liste — le message apparaît
dans la console du navigateur.

### Règles à respecter si tu modifies le JS

- **Jamais d'`innerHTML` avec une donnée externe.** Tout ce qui vient de
  `data/*.json` passe par `createElement` + `textContent`.
- **Toute URL affichée passe par `safeLinkUrl()`** (`content.js`), qui
  n'autorise que `http://` et `https://`. Sans ça, un champ `lien` contenant
  `javascript:…` deviendrait un lien exécutable.
- Les images passent par `safeImageUrl()` : `https://` uniquement.

Un test d'intrusion a été réalisé en injectant `<script>`, `<img onerror>` et
un lien `javascript:` dans `data/updates.json` : aucune exécution, la charge
s'affiche comme du texte, et le lien piégé n'est pas rendu.

---

## 14. Mise en ligne : checklist et dépannage

### Fichiers à téléverser (tout le dossier, sauf ces trois)

```
À ENVOYER                        À NE PAS ENVOYER
─────────────────────────        ──────────────────────
index.html                       node_modules/   (volumineux, inutile en ligne)
mises-a-jour.html                package.json    (fichier de travail)
boutique.html                    package-lock.json
communaute.html                  README.md       (documentation interne)
mentions-legales.html
sitemap.xml  robots.txt          scripts/ est FACULTATIF en ligne :
.htaccess                        les scripts tournent chez toi ou sur
assets/   (css, js, img)         GitHub Actions, jamais sur le serveur web.
data/     ← INDISPENSABLE
```

**`data/` est le dossier le plus souvent oublié.** Sans lui, le site
s'affiche normalement mais avec ses contenus de secours : compteur remplacé
par « Rejoins-nous », actus génériques, boutique en placeholders.

Trois pièges classiques en FTP :

1. **Le dossier `data/` n'est pas monté** — vérifie qu'il existe bien à côté
   de `index.html` sur le serveur.
2. **La casse** — OVH tourne sous Linux : `Data/` et `data/` sont deux
   dossiers différents. Tout doit être en minuscules.
3. **Les fichiers commençant par un point** — `.htaccess` est masqué par
   défaut dans FileZilla : *Serveur > Forcer l'affichage des fichiers cachés*.

### Le compteur affiche « Rejoins-nous » : que faire

C'est le texte de repli : il signifie que `data/stats.json` n'a pas pu être lu.
Ouvre **F12 > Console** et lis le message `[content.js]`, il nomme la cause :

| Message dans la console | Cause | Correction |
|---|---|---|
| « la page est ouverte en file:// » | Tu as double-cliqué sur le fichier | Normal en local. Lance un serveur (ci-dessous) ou teste en ligne |
| « le fichier est introuvable sur le serveur (HTTP 404) » | `data/` n'est pas sur le serveur | Téléverse le dossier `data/` |

Pour tester en local avec les vraies données :

```bash
cd site_rlfr
npx serve .          # puis ouvre l'adresse affichee (http://localhost:3000)
```

### Vérifier soi-même que le compteur fonctionne

Ouvre le site, **F12 > Console**, colle ceci et valide :

```js
fetch('data/stats.json').then(r => r.json()).then(console.log)
```

- Un objet avec `membres_total` et `membres_en_ligne` s'affiche → tout va bien,
  le compteur doit montrer le nombre dans le hero.
- Une erreur s'affiche → c'est le fichier qui manque, pas le code.

Onglet **Réseau (Network)** : recharge la page, filtre sur `stats`. La ligne
`stats.json` doit être en **200**. Un **404** confirme que le fichier n'est
pas en ligne.

---

## 15. GitHub Actions : mise à jour automatique des données

Le fichier `.github/workflows/update-content.yml` relance les trois scripts
**toutes les heures** (à la minute 5) et publie `data/*.json` si — et
seulement si — leur contenu a changé.

**Aucun secret à configurer.** Les trois scripts n'utilisent que des API et
des pages publiques. Rien à mettre dans *Settings > Secrets*.

### Déclencher une mise à jour manuellement

1. Sur GitHub, onglet **Actions**.
2. Dans la colonne de gauche, clique sur **Mise a jour des donnees**.
3. Bouton **Run workflow** à droite → choisis la branche `main` → **Run workflow**.
4. Le run apparaît en quelques secondes. Clique dessus pour suivre l'exécution.

> Le bouton *Run workflow* n'apparaît que si le fichier de workflow est
> présent sur la **branche par défaut**. Si tu ne le vois pas, vérifie que
> le push sur `main` est bien passé.

### Lire les logs quand un run échoue

Sur la page du run :

- **Summary** (en haut) : un tableau récapitule les trois scripts et indique
  si les données ont été publiées. C'est le premier endroit à regarder.
- **Clique sur le job** « Recuperer et publier les donnees » pour dérouler les
  étapes. Celle en rouge porte l'erreur ; déplie-la pour lire le message.

Messages les plus fréquents et ce qu'ils veulent dire :

| Message dans les logs | Cause | Correction |
|---|---|---|
| `HTTP 403` sur rocketleague.com | Le site refuse les requêtes du serveur GitHub | Lance le script depuis chez toi (`npm run update-updates`) |
| `moins de 4 objets exploitables` | itemshop.gg a changé son HTML | Ajuste `SELECTORS.card` dans `scripts/fetch-shop.js` |
| `Discord repond 404` | Le lien d'invitation a expiré | Recrée un lien permanent, mets à jour `INVITE_CODE` |
| `Discord repond 403` | Le widget est désactivé | Active-le, ou laisse : la source invitation suffit |

**Un échec ne casse jamais le site.** Le script concerné laisse son fichier
JSON inchangé, les deux autres s'exécutent quand même, et les pages
continuent d'afficher les dernières données valides.

### Pourquoi il n'y a pas de commit à chaque heure

Le workflow compare les fichiers avant de publier (`git diff --staged
--quiet`). Si aucune donnée n'a bougé — cas fréquent la nuit — il n'y a
simplement pas de commit. Un historique sans commit pendant plusieurs heures
est donc normal, pas un signe de panne : vérifie l'onglet Actions, les runs
y apparaissent même quand ils ne publient rien.

### Changer la fréquence

Dans le workflow, la ligne `- cron: "5 * * * *"` :

| Valeur | Fréquence |
|---|---|
| `5 * * * *` | Toutes les heures (actuel) |
| `5 */6 * * *` | Toutes les 6 heures |
| `5 0 * * *` | Une fois par jour à 00h05 UTC |

La boutique tourne à 00:00 UTC et les actus sortent rarement : une fréquence
plus basse suffirait pour ces deux-là. C'est le compteur de membres qui
profite le plus du rythme horaire.

---

## 16. Actualités du jeu : mise à jour depuis ta machine

### Pourquoi ce n'est plus sur GitHub Actions

`rocketleague.com` bloque les adresses IP des serveurs GitHub (403, puis page
de challenge anti-robot). Le filtrage porte sur **l'origine de la requête**,
pas sur les en-têtes : aucun ajustement de code ne le contourne depuis le
cloud. Depuis ta connexion personnelle, la requête passe sans problème.

Répartition actuelle :

| Donnée | Où ça tourne | Fréquence |
|---|---|---|
| Compteur de membres | GitHub Actions | Toutes les heures |
| Boutique | GitHub Actions | Toutes les heures |
| **Actualités du jeu** | **Ta machine** (Planificateur de tâches) | **1 fois par jour** |

Les deux automatisations ne touchent **jamais aux mêmes fichiers** : Actions
gère `stats.json` et `shop.json`, ta machine gère `updates.json`. Aucun
conflit possible, même si elles tournent en même temps.

### Le script

`scripts/maj-actualites.ps1` enchaîne : récupération → commit → `pull
--rebase` → push, et journalise tout dans `logs/maj-actualites.log`
(archivé automatiquement au-delà de 2 Mo, et ignoré par Git).

Test manuel avant de planifier quoi que ce soit :

```powershell
cd "C:\Users\User\Desktop\dsc\site_rlfr"
powershell -ExecutionPolicy Bypass -File "scripts\maj-actualites.ps1"
```

### Créer la tâche planifiée (interface Windows)

1. Touche **Windows**, tape **Planificateur de tâches**, ouvre-le.
2. Menu de droite : **Créer une tâche…** (surtout pas *Créer une tâche de
   base*, qui n'offre pas les options nécessaires).
3. Onglet **Général** :
   - *Nom* : `Maj actualites Rocket League France`
   - Coche **Exécuter même si l'utilisateur n'est pas connecté**
   - Coche **Exécuter avec les autorisations maximales**
   - *Configurer pour* : **Windows 10** (valable pour Windows 11)
4. Onglet **Déclencheurs** → **Nouveau…** :
   - *Lancer la tâche* : **Selon une planification** → **Tous les jours**
   - *Démarrer* : aujourd'hui à **10:00:00**
   - Coche **Activé** → **OK**
5. Onglet **Actions** → **Nouveau…** :
   - *Action* : **Démarrer un programme**
   - *Programme/script* :
     ```
     powershell.exe
     ```
   - *Ajouter des arguments* :
     ```
     -NoProfile -ExecutionPolicy Bypass -File "C:\Users\User\Desktop\dsc\site_rlfr\scripts\maj-actualites.ps1"
     ```
   - *Commencer dans* :
     ```
     C:\Users\User\Desktop\dsc\site_rlfr
     ```
   - **OK**
6. Onglet **Conditions** :
   - **Décoche** *Ne démarrer la tâche que si l'ordinateur est alimenté par
     le secteur* (sinon rien ne se lance sur batterie)
   - Coche **Démarrer seulement si la connexion réseau suivante est
     disponible** → *N'importe quelle connexion*
7. Onglet **Paramètres** :
   - Coche **Exécuter la tâche dès que possible si un démarrage planifié est
     manqué** (rattrape les jours où le PC était éteint à 10h)
   - *Arrêter la tâche si elle s'exécute plus de* : **1 heure**
8. **OK**. Windows demande ton mot de passe Windows : c'est normal, il en a
   besoin pour lancer la tâche sans session ouverte.

### Vérifier que ça marche

Dans le Planificateur, clic droit sur la tâche → **Exécuter**. Puis :

- La colonne **Résultat de la dernière exécution** doit afficher
  `L'opération a réussi (0x0)`.
- Ouvre `logs\maj-actualites.log` : la dernière ligne doit être
  `Termine (succes)` ou `Termine (aucun changement)`.

### Lire le journal en cas de problème

| Dernière ligne du journal | Cause | Correction |
|---|---|---|
| `Termine (aucun changement)` | Aucune nouvelle actualité | Normal, rien à faire |
| `BLOCAGE ANTI-ROBOT` | Trop d'appels rapprochés | Attendre une heure, relancer |
| `git push a echoue` | Identifiants GitHub expirés | Faire un `git push` manuel une fois dans un terminal |
| `Conflit lors de la synchronisation` | Les deux côtés ont modifié le même fichier | `git pull --rebase origin main` dans un terminal |
| `Introuvable : ...` | Projet déplacé | Corriger la section CONFIGURATION en haut du `.ps1` |

Le code `0x1` dans le Planificateur signifie que le script a échoué : le
journal en donne toujours la raison exacte. Dans tous les cas,
`data/updates.json` n'est **jamais** écrasé par des données invalides.

---

## 17. Déploiement automatique des données sur OVH (FTP)

Après chaque mise à jour réussie, le workflow téléverse `data/` vers
`/www/data/` sur l'hébergement OVH. Le reste du site (HTML, CSS, JS, images)
n'est **jamais** touché : tu le déposes à la main.

### Les 3 secrets à créer

Sur GitHub : **Settings** → **Secrets and variables** → **Actions** → onglet
**Secrets** → bouton **New repository secret**. Un secret par création.

| Nom du secret (exact, en majuscules) | Valeur |
|---|---|
| `FTP_SERVER` | `ftp.cluster129.hosting.ovh.net` |
| `FTP_USERNAME` | `rocketj` |
| `FTP_PASSWORD` | Ton mot de passe FTP (espace client OVH) |

Les noms doivent être **identiques au caractère près** : le workflow les
appelle sous cette forme exacte. Une fois enregistré, un secret n'est plus
jamais affiché, même par toi — GitHub le masque aussi dans les logs.

> Où trouver le mot de passe : espace client OVH → **Hébergements** → ton
> hébergement → onglet **FTP - SSH** → ligne `rocketj` → **…** →
> *Modifier le mot de passe*. OVH n'affiche jamais l'ancien : si tu l'as
> perdu, il faut en définir un nouveau.

### Tester avant de compter dessus

1. Crée les 3 secrets ci-dessus.
2. Pousse le workflow sur `main` (`git push`).
3. GitHub → onglet **Actions** → **Mise a jour des donnees** → **Run workflow**
   → branche `main` → **Run workflow**.

Le déclenchement manuel force l'étape FTP **même si aucune donnée n'a
changé** : c'est prévu exprès pour ce test.

4. Ouvre le run, déplie l'étape **Deployer data/ sur OVH (FTP)**. Tu dois y
   lire la connexion puis la liste des fichiers envoyés.
5. Vérifie en ligne — le fichier doit répondre et contenir du JSON frais :

```
https://rocketleaguefrancediscord.fr/data/stats.json
```

Le bloc **Summary** du run affiche aussi une ligne
`Deploiement FTP vers OVH : success`.

### Si le déploiement échoue

Le Summary liste les vérifications dans l'ordre. Les deux causes les plus
fréquentes :

| Message | Cause | Correction |
|---|---|---|
| `530 Login incorrect` | Mot de passe ou identifiant erroné | Recrée le secret `FTP_PASSWORD` |
| Erreur TLS / certificat | FTPS refusé par le serveur | Passe `protocol: ftps` à `protocol: ftp` dans le workflow |
| `550 ... No such file` | `/www/data/` n'existe pas | Crée le dossier via l'explorateur FTP d'OVH |

Un échec FTP **ne perd aucune donnée** : elles sont déjà commitées sur
GitHub. Seul le site en ligne reste sur les données précédentes, jusqu'au
prochain run réussi.

### Deux points de fonctionnement

- **Seuls les fichiers modifiés partent.** L'action garde un état
  (`.ftp-deploy-sync-state.json`) dans `/www/data/` pour comparer. Ce fichier
  commence par un point : la règle `FilesMatch` du `.htaccess` le rend
  inaccessible depuis le web.
- **Suppressions.** L'action synchronise : elle supprimerait dans
  `/www/data/` un fichier disparu en local, et il n'existe pas d'option pour
  l'en empêcher. En pratique le risque est nul (les 3 JSON sont suivis par
  Git, et les scripts ne les effacent jamais), et son action est confinée à
  `/www/data/`. Pour une garantie absolue, il faudrait remplacer l'action par
  `lftp` avec `mirror -R --only-newer` **sans** `--delete`.
