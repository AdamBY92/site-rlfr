#!/usr/bin/env node
/**
 * ============================================================================
 * fetch-shop.js - Recupere la rotation du jour de la boutique en jeu
 * ----------------------------------------------------------------------------
 * Lancer :  npm run update-shop        (ou : node scripts/fetch-shop.js)
 * Produit :  data/shop.json
 *
 * SOURCE : https://itemshop.gg/rocket-league (site tiers, rendu cote serveur).
 *   Aucune API privee Epic/Psyonix, aucune authentification, aucun compte :
 *   on lit la page publique, une seule fois par execution.
 *
 * EN CAS D'ECHEC (le point important) :
 *   si le site tiers change son HTML, le script :
 *     1. ecrit une erreur explicite disant quel selecteur ajuster,
 *     2. NE TOUCHE PAS a data/shop.json -> la derniere rotation valide
 *        reste affichee sur boutique.html,
 *     3. se termine avec le code 1 pour que l'echec soit visible.
 * ============================================================================
 */

"use strict";

const cheerio = require("cheerio");
const {
  makeLogger,
  fetchHtml,
  readJson,
  writeJsonIfValid,
  cleanText,
  todayUtcMidnight,
} = require("./lib/util");

const log = makeLogger("fetch-shop");

/* ==========================================================================
   1. CONFIGURATION - tout ce qui casse un jour se regle ici
   ========================================================================== */

const SHOP_URL = "https://itemshop.gg/rocket-league";

/**
 * Nombre maximum d'objets enregistres.
 * La page en liste environ 80 (boutique mise en avant + rayons thematiques).
 * 24 remplit proprement la grille de boutique.html (4 colonnes x 6 lignes).
 * Mets un nombre plus grand pour tout afficher.
 */
const MAX_ITEMS = 24;

/**
 * SELECTEURS CSS - verifies le 10/09/2026 sur itemshop.gg.
 *
 * Comment les reparer si le site change :
 *   1. ouvre https://itemshop.gg/rocket-league dans ton navigateur ;
 *   2. clic droit sur une vignette d'objet > "Inspecter" ;
 *   3. repere le bloc qui entoure UN objet (ici : <div class="isg-card">)
 *      et remplace `card` ci-dessous ;
 *   4. fais de meme pour le nom, l'image et le prix.
 *
 * Note : la plupart des autres classes de ce site sont des classes utilitaires
 * (Tailwind : "m-0 truncate font-semibold...") qui changent souvent. On s'appuie
 * donc en priorite sur `.isg-card`, sur les attributs (aria-label, alt, src) et
 * sur l'ORDRE des paragraphes, plus stables.
 */
const SELECTORS = {
  // Bloc entourant un objet.
  card: ".isg-card",
  // Le nom est repris dans l'attribut aria-label du lien qui couvre la carte.
  nameLink: "a[aria-label]",
  // Repli sur l'attribut alt de la vignette.
  image: 'img[src*="baked-cards"]',
  // L'icone de credits ; le prix est le nombre affiche juste a cote.
  creditsIcon: 'img[src*="rl-credits"]',
  // Les paragraphes de la carte, dans l'ordre : [0] nom, [1] type, [2] expiration.
  paragraphs: "p",
};

/** Repere la date de rotation annoncee par la page, ex: "Item Shop — 2026-09-10". */
const ROTATION_DATE_PATTERN = /Item Shop\s*[—-]\s*(\d{4}-\d{2}-\d{2})/;

/* ==========================================================================
   2. PARSING
   ========================================================================== */

/**
 * Extrait le prix en credits d'une carte.
 * On part de l'icone de credits et on lit le premier nombre du bloc voisin,
 * ce qui evite de confondre le prix avec un autre chiffre de la carte.
 */
function extractPrice($, card) {
  const icon = card.find(SELECTORS.creditsIcon).first();
  if (!icon.length) return null;

  const zone = cleanText(icon.parent().text());
  const match = /(\d[\d\s.,]*)/.exec(zone);
  if (!match) return null;

  const price = Number(match[1].replace(/[^\d]/g, ""));
  return Number.isFinite(price) ? price : null;
}

/**
 * Transforme le HTML de la page en liste d'objets.
 * Exportee pour pouvoir la tester sur un fichier HTML enregistre.
 */
function parseShopHtml(html) {
  const $ = cheerio.load(html);
  const items = [];

  $(SELECTORS.card).each((_, element) => {
    if (items.length >= MAX_ITEMS) return;
    const card = $(element);

    // --- Nom : aria-label du lien, sinon alt de l'image, sinon 1er paragraphe.
    const nom =
      cleanText(card.find(SELECTORS.nameLink).first().attr("aria-label")) ||
      cleanText(card.find(SELECTORS.image).first().attr("alt")) ||
      cleanText(card.find(SELECTORS.paragraphs).eq(0).text());
    if (!nom) return;

    // --- Image : URL absolue en https uniquement (jamais de donnees douteuses).
    const rawImage = cleanText(card.find(SELECTORS.image).first().attr("src"));
    const image = rawImage.startsWith("https://") ? rawImage : null;

    // --- Prix en credits.
    const prix = extractPrice($, card);

    // --- Type (Body, Wheels, Decal...) : 2e paragraphe de la carte.
    //     Champ bonus, utilise par boutique.html pour la ligne "categorie".
    const type = cleanText(card.find(SELECTORS.paragraphs).eq(1).text()) || null;

    items.push({
      nom,
      prix: prix === null ? 0 : prix,
      image,
      type,
    });
  });

  return items;
}

/** Lit la date de rotation affichee par la page, sinon prend le jour courant (UTC). */
function extractRotationDate(html) {
  const match = ROTATION_DATE_PATTERN.exec(html || "");
  if (match) {
    const parsed = new Date(`${match[1]}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return todayUtcMidnight();
}

/** La boutique tourne chaque jour a 00:00 UTC : rotation suivante = J+1. */
function nextRotation(rotationDate) {
  const next = new Date(rotationDate.getTime());
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/* ==========================================================================
   3. VALIDATION - le garde-fou anti-ecrasement
   ========================================================================== */

/** Nombre minimum d'objets attendus pour considerer le scraping reussi. */
const MIN_ITEMS = 4;

function isValidPayload(data) {
  return (
    data &&
    typeof data === "object" &&
    Array.isArray(data.items) &&
    data.items.length >= MIN_ITEMS &&
    data.items.every((item) => typeof item.nom === "string" && item.nom.length > 0)
  );
}

/* ==========================================================================
   4. PROGRAMME PRINCIPAL
   ========================================================================== */

async function main() {
  log.info(`recuperation depuis ${SHOP_URL}`);

  // UN SEUL appel reseau par execution.
  const html = await fetchHtml(SHOP_URL);

  const items = parseShopHtml(html);
  log.info(`${items.length} objet(s) extrait(s).`);

  const rotation = extractRotationDate(html);
  const payload = {
    date_rotation: rotation.toISOString(),
    prochaine_rotation: nextRotation(rotation).toISOString(),
    items,
  };

  if (!isValidPayload(payload)) {
    throw new Error(
      `moins de ${MIN_ITEMS} objets exploitables trouves. itemshop.gg a ` +
        "probablement change son HTML : ajuste SELECTORS.card (actuellement " +
        `"${SELECTORS.card}") en haut de scripts/fetch-shop.js.`
    );
  }

  const sansPrix = items.filter((item) => item.prix === 0).length;
  if (sansPrix > 0) {
    log.warn(
      `${sansPrix} objet(s) sans prix lisible : verifie SELECTORS.creditsIcon ` +
        "si le probleme concerne tous les objets."
    );
  }

  const written = writeJsonIfValid("data/shop.json", payload, isValidPayload, log);
  if (!written) process.exitCode = 1;

  log.info(`rotation du ${payload.date_rotation}, prochaine le ${payload.prochaine_rotation}`);
}

// Execute uniquement en lancement direct : un require() pour tester le
// parsing ne declenche aucun appel reseau.
if (require.main === module) {
  main().catch((err) => {
    log.error(err.message);

    const existing = readJson("data/shop.json");
    if (existing) {
      log.warn(
        "data/shop.json a ete CONSERVE tel quel : boutique.html continue " +
          "d'afficher la derniere rotation recuperee avec succes " +
          `(${existing.date_rotation || "date inconnue"}).`
      );
    } else {
      log.warn(
        "aucun data/shop.json existant : boutique.html affichera son contenu " +
          "statique de secours."
      );
    }
    process.exitCode = 1;
  });
}

module.exports = { parseShopHtml, extractRotationDate, nextRotation, isValidPayload };
