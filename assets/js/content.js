/* ==========================================================================
   content.js - Affiche les contenus generes par les scripts Node
   --------------------------------------------------------------------------
   Charge par index.html, mises-a-jour.html, boutique.html et communaute.html.

   Principe :
     1. la page contient deja une version STATIQUE de secours, ecrite en dur ;
     2. ce script tente de lire data/updates.json ou data/shop.json ;
     3. si la lecture reussit ET que les donnees sont exploitables,
        il remplace le contenu statique ;
     4. sinon il ne touche a rien : le contenu statique reste affiche.

   SECURITE : les donnees proviennent de sites tiers (scraping). On construit
   donc le DOM avec createElement + textContent, JAMAIS avec innerHTML, pour
   qu'un texte piege ne puisse pas injecter de code dans la page.

   NOTE POUR LES TESTS EN LOCAL : ouvrir le fichier avec file:// bloque
   fetch() (regle de securite du navigateur) et tu verras donc le contenu
   statique. Lance un petit serveur local pour tester le rendu dynamique :
       npx serve .          (ou)      python -m http.server 8080

   >>> APRES AVOIR MODIFIE CE FICHIER : lance  npm run version-assets
       Cela incremente le ?v=N des balises <link>/<script> dans les 5 pages.
       Sans cela, les visiteurs deja venus garderont l ancienne version en
       cache pendant 7 jours (duree fixee par le .htaccess). Voir README
       section 18.
   ========================================================================== */

(function () {
  "use strict";

  /* ======================================================================
     OUTILS COMMUNS
     ====================================================================== */

  /** Cree un element avec une classe et un texte, en une ligne. */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  /** Lit un JSON du site. Renvoie null en cas d'echec (fichier absent, file://...). */
  function loadJson(url) {
    return fetch(url, { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .catch(function (err) {
        /* Message volontairement explicite : ce sont les deux seules causes
           possibles, et elles se corrigent differemment. */
        var cause;
        if (window.location.protocol === "file:") {
          cause =
            "la page est ouverte en file:// (double-clic sur le fichier). " +
            "Le navigateur INTERDIT de lire un fichier local par fetch. " +
            "Lance un serveur local, ou teste sur le site en ligne.";
        } else {
          cause =
            "le fichier est introuvable sur le serveur (" + err.message + "). " +
            "Verifie que le dossier data/ a bien ete televerse avec le site, " +
            "en minuscules, a cote de index.html.";
        }
        console.warn("[content.js] " + url + " non charge : " + cause);
        console.info("[content.js] Le contenu de secours reste affiche, le site fonctionne normalement.");
        return null;
      });
  }

  /** Formate une date ISO en francais, ex: "4 septembre 2026". */
  function formatDate(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  /** N'accepte que des URL d'images https, pour ne pas injecter n'importe quoi. */
  function safeImageUrl(value) {
    return typeof value === "string" && value.indexOf("https://") === 0 ? value : null;
  }

  /**
   * SECURITE — validation des liens.
   *
   * Les URL affichees viennent de data/*.json, donc de pages scrapees ou d'une
   * edition manuelle. Sans controle, une valeur du type "javascript:..." placee
   * dans le champ "lien" deviendrait un lien cliquable qui EXECUTE du code
   * lorsqu'un visiteur clique dessus.
   *
   * On n'autorise donc que http:// et https://. Tout le reste (javascript:,
   * data:, vbscript:, URL malformee) est rejete : le lien n'est alors pas
   * genere du tout, et la card reste affichee sans bouton.
   */
  function safeLinkUrl(value) {
    if (typeof value !== "string") return null;
    try {
      var parsed = new URL(value, window.location.href);
      return parsed.protocol === "https:" || parsed.protocol === "http:"
        ? parsed.href
        : null;
    } catch (err) {
      return null; /* URL illisible : on n'affiche pas de lien */
    }
  }

  /** Remplace le contenu d'un conteneur et relance les animations au scroll. */
  function replaceContent(container, nodes) {
    container.textContent = "";
    nodes.forEach(function (node) {
      container.appendChild(node);
    });
    if (window.RLFR && typeof window.RLFR.scanReveals === "function") {
      window.RLFR.scanReveals(container);
    }
  }

  /* ======================================================================
     1. PAGE MISES A JOUR  (data/updates.json)
     ====================================================================== */

  /**
   * Correspondance entre le tag du JSON et l'affichage.
   * >>> Pour ajouter un tag, complete ce tableau ET la palette dans
   *     assets/css/style.css (section 13, classes .post__tag--*).
   */
  var TAGS = {
    MAJ: { libelle: "Mise à jour", classe: "post__tag" },
    correctif: { libelle: "Correctif", classe: "post__tag post__tag--fix" },
    evenement: { libelle: "Événement", classe: "post__tag post__tag--event" },
  };

  function buildUpdateCard(entry, index) {
    var tag = TAGS[entry.tag] || TAGS.MAJ;

    var article = el("article", "post reveal");
    if (index < 6) article.setAttribute("data-delay", String(index));

    /* Colonne de gauche : tag + date */
    var meta = el("div", "post__meta");
    meta.appendChild(el("span", tag.classe, tag.libelle));

    var time = el("time", "post__date", formatDate(entry.date));
    if (entry.date) time.setAttribute("datetime", String(entry.date).slice(0, 10));
    meta.appendChild(time);

    /* Colonne de droite : titre, resume, lien */
    var body = el("div");
    body.appendChild(el("h3", null, entry.titre));

    if (entry.resume) body.appendChild(el("p", null, entry.resume));

    var lienValide = safeLinkUrl(entry.lien);
    if (lienValide) {
      var link = el("a", null, "Lire l’article officiel →");
      link.href = lienValide;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      body.appendChild(link);
    }

    article.appendChild(meta);
    article.appendChild(body);
    return article;
  }

  function renderUpdates() {
    var container = document.querySelector("[data-updates-list]");
    if (!container) return;

    loadJson("data/updates.json").then(function (data) {
      // On accepte les deux formes : un tableau, ou { "entrees": [...] }.
      var entries = Array.isArray(data) ? data : data && data.entrees;
      if (!Array.isArray(entries) || entries.length === 0) return;

      var valid = entries.filter(function (entry) {
        return entry && entry.titre;
      });
      if (valid.length === 0) return;

      replaceContent(
        container,
        valid.map(function (entry, index) {
          return buildUpdateCard(entry, index);
        })
      );

      // Petite mention de fraicheur sous la liste.
      var note = document.querySelector("[data-updates-note]");
      if (note) {
        note.textContent =
          valid.length + " actualités officielles, mises à jour automatiquement.";
      }
    });
  }

  /* ======================================================================
     1 bis. GRILLE ACTUS DE LA PAGE D'ACCUEIL  (data/updates.json)
     Format "site de jeu" : vignette, date, titre, card entierement cliquable.
     ====================================================================== */

  /** Nombre de cards affichees sur l'accueil. */
  var NEWS_LIMIT = 4;

  /**
   * Vignette : si l'entree porte une image (champ "image" en https), on
   * l'utilise ; sinon on genere une composition abstraite en CSS.
   * Les 4 variantes tournent en boucle pour que deux cards voisines
   * n'aient jamais le meme visuel.
   */
  function buildNewsThumb(entry, index) {
    var thumb = el("div", "news-card__thumb news-card__thumb--" + ((index % 4) + 1));

    var imageUrl = safeImageUrl(entry.image);
    if (imageUrl) {
      var img = document.createElement("img");
      img.src = imageUrl;
      img.alt = "";
      img.loading = "lazy";      /* chargement differe : bon pour Lighthouse */
      img.decoding = "async";
      thumb.appendChild(img);
    } else {
      thumb.appendChild(el("div", "news-card__art"));
    }
    return thumb;
  }

  function buildNewsCard(entry, index) {
    var tag = TAGS[entry.tag] || TAGS.MAJ;
    var article = el("article", "news-card reveal");

    article.appendChild(buildNewsThumb(entry, index));

    var body = el("div", "news-card__body");

    var meta = el("div", "news-card__meta");
    meta.appendChild(el("span", tag.classe, tag.libelle));
    var time = el("time", null, formatDate(entry.date));
    if (entry.date) time.setAttribute("datetime", String(entry.date).slice(0, 10));
    meta.appendChild(time);
    body.appendChild(meta);

    body.appendChild(el("h3", "news-card__title", entry.titre));
    body.appendChild(el("span", "news-card__link", "Lire l’article →"));
    article.appendChild(body);

    /* Lien invisible qui couvre la card : un seul lien, donc pas de piege
       pour la navigation au clavier ni pour les lecteurs d'ecran. */
    var lienCard = safeLinkUrl(entry.lien);
    if (lienCard) {
      var overlay = el("a", "news-card__overlay");
      overlay.href = lienCard;
      overlay.target = "_blank";
      overlay.rel = "noopener noreferrer";
      overlay.setAttribute("aria-label", entry.titre + " (article officiel, nouvelle fenêtre)");
      article.appendChild(overlay);
    }

    return article;
  }

  function renderNews() {
    var container = document.querySelector("[data-news-list]");
    if (!container) return;

    loadJson("data/updates.json").then(function (data) {
      var entries = Array.isArray(data) ? data : data && data.entrees;
      if (!Array.isArray(entries) || entries.length === 0) return;

      var valid = entries
        .filter(function (entry) { return entry && entry.titre; })
        .slice(0, NEWS_LIMIT);
      if (valid.length === 0) return;

      replaceContent(container, valid.map(buildNewsCard));
    });
  }

  /* ======================================================================
     1 ter. COMPTEUR DE MEMBRES  (data/stats.json)
     ----------------------------------------------------------------------
     Genere par scripts/fetch-member-count.js.

     HONNETETE DU CHIFFRE AFFICHE : on ne presente jamais le nombre de
     membres EN LIGNE comme un total.
       - si le total est connu  -> "12 504" + "membres · 2 448 en ligne"
       - si seul l'en-ligne l'est -> "2 448" + "membres en ligne"
       - si rien n'est disponible -> le texte de repli du HTML reste en place
         ("Rejoins-nous"), sans chiffre ni placeholder visible.
     ====================================================================== */
  function renderMemberCount() {
    var valueSlot = document.querySelector("[data-members-value]");
    var labelSlots = document.querySelectorAll("[data-members-label]");
    if (!valueSlot && !labelSlots.length) return;

    loadJson("data/stats.json").then(function (data) {
      if (!data || typeof data !== "object") return;

      var total = typeof data.membres_total === "number" ? data.membres_total : null;
      var enLigne = typeof data.membres_en_ligne === "number" ? data.membres_en_ligne : null;
      if (total === null && enLigne === null) return;

      var principal = total !== null ? total : enLigne;
      var libelle;

      if (total !== null && enLigne !== null) {
        libelle = "membres · " + enLigne.toLocaleString("fr-FR") + " en ligne";
      } else if (total !== null) {
        libelle = "membres";
      } else {
        libelle = "membres en ligne"; /* jamais "membres" tout court ici */
      }


      /* Valeur chiffree + animation count-up (fournie par main.js). */
      if (valueSlot) {
        valueSlot.setAttribute("data-count-to", String(principal));
        valueSlot.textContent = principal.toLocaleString("fr-FR");
        if (window.RLFR && typeof window.RLFR.animateCounter === "function") {
          window.RLFR.animateCounter(valueSlot);
        }
      }

      /* Libelles (hero, et badge de la page Communaute).
         Quand les deux chiffres sont connus, on isole "N en ligne" dans un
         span insecable : le libelle peut passer a la ligne apres le point
         median, mais jamais au milieu de "5 013 en ligne". */
      labelSlots.forEach(function (slot) {
        if (slot === valueSlot) return;

        var prefixe = valueSlot ? "" : principal.toLocaleString("fr-FR") + " ";

        if (total !== null && enLigne !== null) {
          slot.textContent = prefixe + "membres · ";
          slot.appendChild(
            el("span", "stat__online", enLigne.toLocaleString("fr-FR") + " en ligne")
          );
        } else {
          slot.textContent = prefixe + libelle;
        }
      });

      /* Mention en pleine phrase du bandeau CTA final :
         "Rejoins [12 504 joueurs] francophones, trouve ta prochaine equipe…" */
      document.querySelectorAll("[data-members-inline]").forEach(function (slot) {
        slot.textContent =
          principal.toLocaleString("fr-FR") + (total !== null ? " joueurs" : " joueurs en ligne");
      });
    });
  }

  /* ======================================================================
     2. PAGE BOUTIQUE  (data/shop.json)
     ====================================================================== */

  /**
   * Vignette de repli quand l'objet n'a pas d'image utilisable.
   *
   * SECURITE : c'est le SEUL innerHTML du site, et il ecrit une chaine
   * ENTIEREMENT FIGEE (un SVG decoratif), sans la moindre donnee externe.
   * >>> N'y insere jamais de variable : passe par createElement/textContent,
   *     comme partout ailleurs dans ce fichier.
   */
  function buildPlaceholderThumb() {
    var thumb = el("div", "item__thumb");
    thumb.setAttribute("aria-hidden", "true");
    thumb.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M3 13h18l-2-5H5l-2 5Z"></path>' +
      '<circle cx="7.5" cy="16.5" r="2.5"></circle>' +
      '<circle cx="16.5" cy="16.5" r="2.5"></circle></svg>';
    return thumb;
  }

  /**
   * CODE COULEUR DES OBJETS DE LA BOUTIQUE
   *
   * Convertit le type brut envoye par la source ("Goal Explosion",
   * "Bundle · 5 items", "Roues"...) en un identifiant court qui sert de
   * classe CSS : item--explosion, item--bundle, item--wheels...
   * La couleur elle-meme est definie UNE SEULE FOIS en CSS
   * (assets/css/style.css, section 19 bis), jamais ici.
   *
   * >>> POUR AJOUTER UN TYPE : ajoute ses mots-cles dans la table ci-dessous
   *     ET la classe .item--<slug> correspondante dans le CSS. Un type
   *     inconnu retombe sur item--autre, gris neutre : rien ne casse.
   */
  var TYPES_OBJET = [
    { slug: "body",      motsCles: ["body", "corps", "voiture", "car"] },
    { slug: "wheels",    motsCles: ["wheel", "roue"] },
    { slug: "decal",     motsCles: ["decal", "sticker", "autocollant"] },
    { slug: "explosion", motsCles: ["goal explosion", "explosion"] },
    { slug: "trail",     motsCles: ["trail", "trainee", "sillage"] },
    { slug: "anthem",    motsCles: ["anthem", "hymne", "musique"] },
    { slug: "bundle",    motsCles: ["bundle", "pack", "lot"] },
    { slug: "boost",     motsCles: ["boost", "propulseur"] },
    { slug: "topper",    motsCles: ["topper", "chapeau", "couvre-chef"] },
    { slug: "antenna",   motsCles: ["antenna", "antenne"] },
    { slug: "banner",    motsCles: ["banner", "banniere"] },
    { slug: "border",    motsCles: ["border", "bordure", "avatar"] },
    { slug: "finish",    motsCles: ["finish", "peinture", "paint"] },
    { slug: "audio",     motsCles: ["engine audio", "audio", "moteur"] },
  ];

  function slugDuType(type) {
    if (typeof type !== "string" || !type.trim()) return "autre";

    /* On compare en minuscules et sans accents. On ne garde que la partie
       avant un separateur : "Bundle · 5 items" -> "bundle". */
    var propre = type
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[·|(]/)[0]
      .trim();

    for (var i = 0; i < TYPES_OBJET.length; i += 1) {
      var regle = TYPES_OBJET[i];
      for (var j = 0; j < regle.motsCles.length; j += 1) {
        if (propre.indexOf(regle.motsCles[j]) !== -1) return regle.slug;
      }
    }
    return "autre";
  }

  function buildShopCard(item, index) {
    /* La classe de type est posee sur la CARD, pas sur le badge : elle y
       definit une variable CSS --item-color dont heritent a la fois le badge
       et le lisere de la vignette. Une seule classe, deux usages. */
    var article = el("article", "item reveal item--" + slugDuType(item.type));
    if (index < 6) article.setAttribute("data-delay", String(index));

    /* Vignette : image officielle du site source, ou forme CSS de repli */
    var imageUrl = safeImageUrl(item.image);
    if (imageUrl) {
      var thumb = el("div", "item__thumb");
      var img = document.createElement("img");
      img.src = imageUrl;
      img.alt = item.nom || "";
      img.loading = "lazy";
      img.decoding = "async";
      // Si l'image tombe (lien mort chez la source), on repasse sur la vignette CSS.
      img.addEventListener("error", function () {
        article.replaceChild(buildPlaceholderThumb(), thumb);
      });
      thumb.appendChild(img);
      article.appendChild(thumb);
    } else {
      article.appendChild(buildPlaceholderThumb());
    }

    /* Corps : categorie, nom, prix */
    var body = el("div", "item__body");
    if (item.type) body.appendChild(el("span", "item__rarity", item.type));
    body.appendChild(el("h3", null, item.nom));

    var prix = Number(item.prix);
    body.appendChild(
      el("p", "item__price", prix > 0 ? prix.toLocaleString("fr-FR") + " crédits" : "Prix non communiqué")
    );

    article.appendChild(body);
    return article;
  }

  function renderShop() {
    var container = document.querySelector("[data-shop-list]");
    if (!container) return;

    loadJson("data/shop.json").then(function (data) {
      if (!data || !Array.isArray(data.items) || data.items.length === 0) return;

      var valid = data.items.filter(function (item) {
        return item && item.nom;
      });
      if (valid.length === 0) return;

      replaceContent(
        container,
        valid.map(function (item, index) {
          return buildShopCard(item, index);
        })
      );

      /* Date de la rotation en cours */
      var dateSlot = document.querySelector("[data-shop-date]");
      if (dateSlot && data.date_rotation) {
        dateSlot.textContent = formatDate(data.date_rotation);
      }

      /* Heure de la prochaine rotation */
      var nextSlot = document.querySelector("[data-shop-next]");
      if (nextSlot && data.prochaine_rotation) {
        var next = new Date(data.prochaine_rotation);
        if (!isNaN(next.getTime())) {
          nextSlot.textContent =
            "Prochaine rotation le " + formatDate(data.prochaine_rotation) +
            " à " + next.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) +
            " (heure locale).";
        }
      }
    });
  }

  /* ======================================================================
     DEMARRAGE
     ====================================================================== */
  renderMemberCount(); /* accueil + communaute : compteur de membres */
  renderNews();     /* accueil : grille actus sous le hero */
  renderUpdates();  /* page Mises a jour : liste complete */
  renderShop();     /* page Boutique : grille d'objets */
})();
