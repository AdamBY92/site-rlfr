/* ==========================================================================
   hero-particles.js - Traînées de vitesse animées du hero (canvas 2D)
   --------------------------------------------------------------------------
   Fines lignes diagonales qui traversent lentement le hero : elles évoquent
   la vitesse sans attirer l'oeil. Aucun asset externe, tout est dessiné.

   PERFORMANCE (les 4 garde-fous) :
     1. COUNT est plafonné (voir CONFIG) et réduit sur petit écran ;
     2. l'animation est mise en pause quand l'onglet passe en arrière-plan
        (Page Visibility API) ;
     3. elle est aussi mise en pause quand le hero sort de l'écran
        (IntersectionObserver) : plus rien ne tourne pendant que tu lis le bas
        de la page ;
     4. si l'utilisateur a demandé "réduire les animations" dans son système,
        le canvas n'est jamais démarré (et il est masqué en CSS).

   RÉGLAGES : tout est dans l'objet CONFIG ci-dessous.
   ========================================================================== */

(function () {
  "use strict";

  var canvas = document.querySelector("[data-hero-canvas]");
  if (!canvas) return;

  /* Préférence système : on ne démarre rien du tout. */
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  /* ======================================================================
     CONFIG - c'est ici qu'on règle l'ambiance
     ====================================================================== */
  var CONFIG = {
    count: 70,          // nombre de traînées sur grand écran (plafond : 100)
    countMobile: 34,    // en dessous de 760 px de large
    angle: -25,         // direction en degrés (négatif = monte vers la droite)
    speedMin: 0.25,     // vitesse la plus lente (px par frame)
    speedMax: 0.9,      // vitesse la plus rapide
    lengthMin: 40,      // longueur d'une traînée en pixels
    lengthMax: 190,
    opacityMin: 0.05,   // opacité : volontairement très faible
    opacityMax: 0.3,
    warmRatio: 0.25,    // proportion de traînées dans l'accent chaud
    colorCold: "180, 215, 255",
    colorWarm: "255, 130, 80",
  };

  var MAX_PARTICLES = 100; // plafond dur, ne pas dépasser

  /* ----------------------------------------------------------------------
     DÉTECTION D'APPAREIL MODESTE
     On divise le nombre de traînées par deux quand la machine a peu de
     coeurs, peu de mémoire, ou qu'il s'agit d'un écran tactile étroit.
     C'est volontairement simple : aucune détection de navigateur, juste des
     signaux standard, et une valeur par défaut prudente s'ils sont absents.
     ---------------------------------------------------------------------- */
  function isLowEndDevice() {
    var cores = navigator.hardwareConcurrency;
    var memory = navigator.deviceMemory; // non supporté partout
    var coarsePointer = window.matchMedia("(pointer: coarse)").matches;

    if (typeof cores === "number" && cores <= 4) return true;
    if (typeof memory === "number" && memory <= 4) return true;
    if (coarsePointer && window.innerWidth < 1024) return true;
    return false;
  }

  var lowEnd = isLowEndDevice();

  /* ======================================================================
     ÉTAT
     ====================================================================== */
  var particles = [];
  var width = 0;
  var height = 0;
  var dpr = 1;
  var rafId = null;
  var tabVisible = !document.hidden;
  var heroVisible = true;

  var radians = (CONFIG.angle * Math.PI) / 180;
  var dirX = Math.cos(radians);
  var dirY = Math.sin(radians);

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  /** Crée (ou recycle) une traînée à une position aléatoire. */
  function spawn(particle, offscreen) {
    var p = particle || {};
    // offscreen = true : on la fait réapparaître en amont de la diagonale
    p.x = offscreen ? -random(0, width * 0.4) : random(-width * 0.1, width);
    p.y = offscreen ? random(0, height * 1.4) : random(0, height);
    p.length = random(CONFIG.lengthMin, CONFIG.lengthMax);
    p.speed = random(CONFIG.speedMin, CONFIG.speedMax);
    p.opacity = random(CONFIG.opacityMin, CONFIG.opacityMax);
    p.thickness = Math.random() < 0.15 ? 1.6 : 0.8;
    p.color = Math.random() < CONFIG.warmRatio ? CONFIG.colorWarm : CONFIG.colorCold;
    return p;
  }

  /** (Re)dimensionne le canvas en tenant compte de la densité d'écran. */
  function resize() {
    var rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    if (!width || !height) return;

    // On plafonne le DPR a 2 : au-dela, le cout GPU grimpe sans gain visible.
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var target = Math.min(
      width < 760 ? CONFIG.countMobile : CONFIG.count,
      MAX_PARTICLES
    );

    /* Appareil modeste : moitié moins de traînées (minimum 12, sinon
       l'effet disparaît complètement). */
    if (lowEnd) target = Math.max(12, Math.round(target / 2));

    if (particles.length > target) {
      particles.length = target;
    } else {
      while (particles.length < target) particles.push(spawn(null, false));
    }
  }

  /** Une frame : efface, déplace, redessine. */
  function draw() {
    ctx.clearRect(0, 0, width, height);

    for (var i = 0; i < particles.length; i += 1) {
      var p = particles[i];

      p.x += dirX * p.speed;
      p.y += dirY * p.speed;

      // Sortie de l'écran : on recycle la traînée en amont.
      if (p.x - p.length > width || p.y + p.length < 0) {
        spawn(p, true);
        continue;
      }

      // Dégradé sur la longueur : la traînée s'estompe vers l'arrière.
      var tailX = p.x - dirX * p.length;
      var tailY = p.y - dirY * p.length;
      var gradient = ctx.createLinearGradient(tailX, tailY, p.x, p.y);
      gradient.addColorStop(0, "rgba(" + p.color + ", 0)");
      gradient.addColorStop(1, "rgba(" + p.color + ", " + p.opacity + ")");

      ctx.strokeStyle = gradient;
      ctx.lineWidth = p.thickness;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    rafId = window.requestAnimationFrame(draw);
  }

  /* ======================================================================
     DÉMARRAGE / MISE EN PAUSE
     ====================================================================== */
  function start() {
    if (rafId === null) rafId = window.requestAnimationFrame(draw);
  }

  function stop() {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  /** On ne tourne que si l'onglet est actif ET le hero à l'écran. */
  function sync() {
    if (tabVisible && heroVisible) start();
    else stop();
  }

  document.addEventListener("visibilitychange", function () {
    tabVisible = !document.hidden;
    sync();
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      heroVisible = entries[0].isIntersecting;
      sync();
    }, { threshold: 0 }).observe(canvas);
  }

  /* Redimensionnement : débounce de 200 ms, et listener passif.
     Redimensionner un canvas efface son contenu et réalloue sa mémoire :
     le faire à chaque pixel du geste provoquait des à-coups très visibles. */
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 200);
  }, { passive: true });

  resize();
  sync();
})();
