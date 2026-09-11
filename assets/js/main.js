/* ==========================================================================
   main.js - Interactions du site (JavaScript vanilla, aucune dépendance)
   --------------------------------------------------------------------------
   1. Header opaque au scroll
   2. Menu mobile (burger)
   3. Animations d'apparition au scroll (IntersectionObserver)
   4. Accordeon FAQ accessible au clavier
   5. Annee automatique dans le footer
   6. Date du jour sur la page Boutique
   7. Entree du hero au chargement
   8. Compteur de membres anime (count-up)
   9. Parallaxe du fond au scroll

   >>> APRES AVOIR MODIFIE CE FICHIER : lance  npm run version-assets
       Cela incremente le ?v=N des balises <link>/<script> dans les 5 pages.
       Sans cela, les visiteurs deja venus garderont l ancienne version en
       cache pendant 7 jours (duree fixee par le .htaccess). Voir README
       section 18.
   ========================================================================== */

(function () {
  "use strict";

  /* Respecte le réglage système "reduire les animations" */
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ======================================================================
     0. OUTILS PARTAGÉS DE PERFORMANCE
     ----------------------------------------------------------------------
     UN SEUL handler de scroll pour toute la page, appelé au maximum une
     fois par frame. Avant, chaque fonctionnalité posait son propre listener
     (header + parallaxe) : le navigateur exécutait deux fonctions par
     événement de scroll, soit des dizaines d'appels par seconde.

     Ici, les abonnés sont empilés dans un tableau et exécutés ensemble
     dans un unique requestAnimationFrame.
     ====================================================================== */
  var scrollSubscribers = [];
  var scrollTicking = false;

  function runScrollSubscribers() {
    var y = window.scrollY; /* une seule lecture, partagée par tous */
    for (var i = 0; i < scrollSubscribers.length; i += 1) {
      scrollSubscribers[i](y);
    }
    scrollTicking = false;
  }

  function onScrollFrame(callback) {
    scrollSubscribers.push(callback);
    callback(window.scrollY); /* état initial */
  }

  /* passive: true -> le navigateur sait qu'on n'appellera jamais
     preventDefault(), il peut donc démarrer le défilement sans attendre. */
  window.addEventListener("scroll", function () {
    if (!scrollTicking) {
      scrollTicking = true;
      window.requestAnimationFrame(runScrollSubscribers);
    }
  }, { passive: true });

  /**
   * Regroupe aussi les redimensionnements : un seul listener, débounce de
   * 180 ms. Sans cela, chaque pixel de redimensionnement déclenchait des
   * lectures de scrollHeight (recalcul de mise en page forcé) et un
   * redimensionnement du canvas.
   */
  var resizeSubscribers = [];
  var resizeTimer = null;

  function onResizeDebounced(callback) {
    resizeSubscribers.push(callback);
  }

  window.addEventListener("resize", function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      for (var i = 0; i < resizeSubscribers.length; i += 1) resizeSubscribers[i]();
    }, 180);
  }, { passive: true });

  /* ======================================================================
     1. HEADER : devient opaque après 20px de scroll
     ====================================================================== */
  var header = document.querySelector("[data-header]");

  if (header) {
    var headerScrolled = null;
    onScrollFrame(function (y) {
      var next = y > 20;
      /* On n'écrit dans le DOM que si l'état CHANGE : inutile de
         redéclencher un calcul de style à chaque frame de scroll. */
      if (next !== headerScrolled) {
        headerScrolled = next;
        header.classList.toggle("is-scrolled", next);
      }
    });
  }

  /* ======================================================================
     2. MENU MOBILE
     ====================================================================== */
  var navToggle = document.querySelector("[data-nav-toggle]");
  var nav = document.querySelector("[data-nav]");

  if (navToggle && nav) {
    var closeNav = function () {
      nav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    };

    navToggle.addEventListener("click", function () {
      var isOpen = nav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    /* Fermeture après un clic sur un lien du menu */
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) closeNav();
    });

    /* Fermeture avec la touche Echap */
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("is-open")) {
        closeNav();
        navToggle.focus();
      }
    });

    /* Fermeture quand on repasse en desktop (via le resize débouncé commun) */
    onResizeDebounced(function () {
      if (window.innerWidth > 760) closeNav();
    });
  }

  /* ======================================================================
     3. ANIMATIONS AU SCROLL
     Ajoute simplement class="reveal" (et data-delay="1..6") dans le HTML.
     ====================================================================== */
  var revealObserver = null;

  /**
   * CYCLE DE VIE DE will-change
   * On promeut l'element en couche GPU juste avant son animation, puis on
   * RETIRE la promotion des qu'elle est finie. Garder will-change en
   * permanence (comme le faisait la version precedente via le CSS) obligeait
   * le navigateur a conserver une texture GPU par element revele : sur une
   * page longue, cela represente des dizaines de couches inutiles.
   */
  function animateReveal(el) {
    el.classList.add("is-animating");
    el.classList.add("is-visible");

    var done = function () {
      el.classList.remove("is-animating"); /* liberation de la couche GPU */
      el.removeEventListener("transitionend", done);
    };
    el.addEventListener("transitionend", done);

    /* Filet de securite : si transitionend ne se declenche pas (element
       masque, transition annulee...), on nettoie quand meme. */
    window.setTimeout(done, 1600);
  }

  if (!reduceMotion && "IntersectionObserver" in window) {
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateReveal(entry.target);
          revealObserver.unobserve(entry.target); /* on n'anime qu'une fois */
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -60px 0px" });
  }

  /**
   * Active l'animation sur tous les ".reveal" pas encore pris en charge.
   * Appelable a tout moment : c'est ce qui permet d'animer aussi les blocs
   * ajoutes APRES le chargement (listes generees depuis data/*.json).
   */
  function scanReveals(root) {
    var scope = root || document;

    /* Cascade automatique : sur un conteneur [data-stagger], chaque enfant
       .reveal recoit un data-delay croissant (1, 2, 3...) sans avoir a
       l'ecrire dans le HTML. Pratique pour les grilles generees en JS.

       On inclut `scope` lui-meme dans la liste : quand content.js rappelle
       scanReveals(grille), c'est la grille elle-meme qui porte data-stagger,
       pas un de ses descendants. */
    var groups = [];
    if (scope.matches && scope.matches("[data-stagger]")) groups.push(scope);
    scope.querySelectorAll("[data-stagger]").forEach(function (g) { groups.push(g); });

    groups.forEach(function (group) {
      var children = group.querySelectorAll(":scope > .reveal:not([data-delay])");
      children.forEach(function (child, index) {
        child.setAttribute("data-delay", String(Math.min(index + 1, 6)));
      });
    });

    var items = scope.querySelectorAll(".reveal:not(.is-watched)");

    items.forEach(function (el) {
      el.classList.add("is-watched");
      if (revealObserver) {
        revealObserver.observe(el);
      } else {
        /* Repli : on affiche tout immediatement */
        el.classList.add("is-visible");
      }
    });
  }

  scanReveals(document);

  /* Expose le rescan pour assets/js/content.js (pages boutique et mises a jour) */
  window.RLFR = window.RLFR || {};
  window.RLFR.scanReveals = scanReveals;

  /* ======================================================================
     4. ACCORDÉON FAQ (accessible : bouton natif + aria-expanded)
     Structure attendue :
       <div class="faq__item">
         <h3><button class="faq__question" aria-expanded="false" aria-controls="faq-1">...</button></h3>
         <div class="faq__answer" id="faq-1" role="region"><div>...</div></div>
       </div>
     Navigation clavier : Tab/Entrée/Espace (natif) + flèches, Home et End.
     ====================================================================== */
  var faqButtons = Array.prototype.slice.call(document.querySelectorAll(".faq__question"));

  if (faqButtons.length) {
    var closeItem = function (btn) {
      var panel = document.getElementById(btn.getAttribute("aria-controls"));
      btn.setAttribute("aria-expanded", "false");
      btn.closest(".faq__item").classList.remove("is-open");
      if (panel) panel.style.maxHeight = null;
    };

    var openItem = function (btn) {
      var panel = document.getElementById(btn.getAttribute("aria-controls"));
      btn.setAttribute("aria-expanded", "true");
      btn.closest(".faq__item").classList.add("is-open");
      if (panel) panel.style.maxHeight = panel.scrollHeight + "px";
    };

    faqButtons.forEach(function (btn, index) {
      btn.addEventListener("click", function () {
        var isOpen = btn.getAttribute("aria-expanded") === "true";

        /* Mode "une seule réponse ouverte à la fois".
           Pour autoriser plusieurs ouvertures simultanées, supprime ces 3 lignes. */
        faqButtons.forEach(function (other) {
          if (other !== btn) closeItem(other);
        });

        if (isOpen) { closeItem(btn); } else { openItem(btn); }
      });

      /* Fleches / Home / End pour se deplacer entre les questions */
      btn.addEventListener("keydown", function (e) {
        var target = null;

        if (e.key === "ArrowDown")      target = faqButtons[(index + 1) % faqButtons.length];
        else if (e.key === "ArrowUp")   target = faqButtons[(index - 1 + faqButtons.length) % faqButtons.length];
        else if (e.key === "Home")      target = faqButtons[0];
        else if (e.key === "End")       target = faqButtons[faqButtons.length - 1];

        if (target) {
          e.preventDefault();
          target.focus();
        }
      });
    });

    /* Recalcule la hauteur du panneau ouvert si la fenêtre change de taille.
       Passe par le resize débouncé : lire scrollHeight force un recalcul de
       mise en page, a ne faire qu'une fois le redimensionnement terminé. */
    onResizeDebounced(function () {
      faqButtons.forEach(function (btn) {
        if (btn.getAttribute("aria-expanded") === "true") {
          var panel = document.getElementById(btn.getAttribute("aria-controls"));
          if (panel) panel.style.maxHeight = panel.scrollHeight + "px";
        }
      });
    });
  }

  /* ======================================================================
     5. ANNEE COURANTE dans le footer -> <span data-year></span>
     ====================================================================== */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  /* ======================================================================
     6. DATE DU JOUR sur la page Boutique -> <span data-today></span>
     Affiche par ex. "mercredi 10 septembre 2026".
     ====================================================================== */
  document.querySelectorAll("[data-today]").forEach(function (el) {
    el.textContent = new Date().toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  });

  /* ======================================================================
     7. ENTREE DU HERO au chargement
     On ajoute .is-ready sur <body> : le CSS fait alors monter en fondu tous
     les elements .hero-in, decales par leur variable --i.
     ====================================================================== */
  window.requestAnimationFrame(function () {
    window.requestAnimationFrame(function () {
      document.body.classList.add("is-ready");
    });
  });

  /* ======================================================================
     8. COMPTEUR ANIME (count-up)
     Usage :  <span data-count-to="1200">1200</span>
     Si l'attribut ne contient pas un nombre (placeholder non remplace),
     le texte deja present est laisse tel quel : aucune animation, aucun
     "NaN" affiche.
     ====================================================================== */
  function animateCounter(el) {
    var raw = (el.getAttribute("data-count-to") || "").replace(/[\s ]/g, "");
    var target = Number(raw);

    if (!raw || !isFinite(target)) return; // placeholder : on ne touche a rien

    if (reduceMotion) {
      el.textContent = target.toLocaleString("fr-FR");
      return;
    }

    var duration = 1800;
    var startedAt = null;

    function step(timestamp) {
      if (startedAt === null) startedAt = timestamp;
      var progress = Math.min((timestamp - startedAt) / duration, 1);
      /* easeOutExpo : demarre vite, se pose en douceur */
      var eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);

      el.textContent = Math.round(target * eased).toLocaleString("fr-FR");

      if (progress < 1) window.requestAnimationFrame(step);
    }

    window.requestAnimationFrame(step);
  }

  /* Expose pour content.js : le compteur de membres reçoit sa valeur APRES
     le chargement (lecture de data/stats.json), donc bien apres ce passage. */
  window.RLFR = window.RLFR || {};
  window.RLFR.animateCounter = animateCounter;

  var counters = document.querySelectorAll("[data-count-to]");

  if (counters.length) {
    if (!("IntersectionObserver" in window)) {
      counters.forEach(animateCounter);
    } else {
      var counterObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target); /* une seule fois */
        });
      }, { threshold: 0.4 });

      counters.forEach(function (el) { counterObserver.observe(el); });
    }
  }

  /* ======================================================================
     9. PARALLAXE DU FOND
     Les halos (body::after) se decalent a 25 % de la vitesse du contenu :
     le fond parait plus loin. Intensite reglable via la variable CSS
     --parallax (0 = desactive).
     ====================================================================== */
  if (!reduceMotion) {
    var root = document.documentElement;
    var factor = parseFloat(
      getComputedStyle(root).getPropertyValue("--parallax")
    );
    if (!isFinite(factor)) factor = 0.25;

    if (factor > 0) {
      var lastParallax = null;

      /* Abonne au handler de scroll commun : une seule execution par frame,
         partagee avec le header. La valeur ne pilote qu'un translate3d
         (voir body::after dans le CSS) : aucune propriete de mise en page. */
      onScrollFrame(function (y) {
        var value = Math.round(-(y * factor));
        if (value !== lastParallax) {       /* evite une ecriture inutile */
          lastParallax = value;
          root.style.setProperty("--parallax-y", value + "px");
        }
      });
    }
  }

  /* ======================================================================
     11. LOGO OFFICIEL avec repli
     Le HTML contient les deux versions : le monogramme SVG (visible par
     defaut) et <img data-logo> (masque). On n'affiche l'image QUE si elle
     se charge vraiment. Consequence : tant que assets/img/logo.png n'existe
     pas, le visiteur voit le monogramme, jamais une icone d'image cassee.
     ====================================================================== */
  document.querySelectorAll("[data-logo]").forEach(function (img) {
    var mark = img.closest(".logo__mark");

    var showImage = function () {
      img.hidden = false;
      if (mark) mark.classList.add("has-logo"); /* masque le SVG, retire le fond */
    };

    var dropImage = function () {
      img.remove(); /* fichier absent : on retire l'element du DOM */
    };

    /* L'image peut deja etre chargee (cache) au moment ou ce script tourne. */
    if (img.complete) {
      if (img.naturalWidth > 0) showImage();
      else dropImage();
      return;
    }

    img.addEventListener("load", showImage);
    img.addEventListener("error", dropImage);
  });

  /* ======================================================================
     10. PAUSE DES ANIMATIONS HORS ECRAN
     Les decors animes en permanence (orbite du hero, cartouches flottants,
     filets diagonaux...) continuaient de consommer des frames meme quand ils
     etaient loin au-dessus du viewport. On les gele des qu'ils en sortent.

     Usage cote HTML :  <section data-pause-offscreen> ... </section>
     Le CSS (section 19) fait le reste via la classe .is-offscreen.
     ====================================================================== */
  /* Décors animés en boucle, repérés automatiquement sur les 5 pages.
     Ajoute data-pause-offscreen dans le HTML pour en couvrir d'autres. */
  var PAUSABLE_SELECTOR = [
    "[data-pause-offscreen]",
    ".hero__visual",   /* orbite + halos + cartouches flottants */
    ".badge",          /* onde du point pulsant */
    ".scroll-cue",     /* flèche de défilement */
    ".btn--pulse"      /* halo du CTA principal */
  ].join(", ");

  var pausable = document.querySelectorAll(PAUSABLE_SELECTOR);

  if (pausable.length && "IntersectionObserver" in window) {
    var pauseObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        entry.target.classList.toggle("is-offscreen", !entry.isIntersecting);
      });
    }, { rootMargin: "120px" }); /* petite marge : reprise avant l'arrivee */

    pausable.forEach(function (el) { pauseObserver.observe(el); });
  }
})();
