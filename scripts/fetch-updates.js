#!/usr/bin/env node
/**
 * ============================================================================
 * fetch-updates.js - Recupere les dernieres news officielles Rocket League
 * ----------------------------------------------------------------------------
 * Lancer :  npm run update-updates      (ou : node scripts/fetch-updates.js)
 * Produit :  data/updates.json
 *
 * POURQUOI DU SCRAPING ET PAS UN FLUX RSS ?
 *   rocketleague.com/news ne publie AUCUN flux RSS ni Atom (verifie le
 *   10/09/2026 : pas de <link rel="alternate" type="application/rss+xml">
 *   dans la page, et pas de JSON embarque type __NEXT_DATA__).
 *   On lit donc directement le HTML de la page news, en un seul appel.
 *   Si Psyonix publie un flux un jour, renseigne FEED_URL ci-dessous :
 *   le script l'utilisera en priorite, toujours en un seul appel.
 *
 * EN CAS D'ECHEC :
 *   le script ecrit un message d'erreur explicite, NE TOUCHE PAS a
 *   data/updates.json (la derniere version valide reste affichee) et
 *   se termine avec le code 1 pour que l'echec soit visible.
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
} = require("./lib/util");

const log = makeLogger("fetch-updates");

/* ==========================================================================
   1. CONFIGURATION - c'est ici que tu ajustes si le site change
   ========================================================================== */

/** Page listant les actualites officielles. */
const NEWS_URL = "https://www.rocketleague.com/news";

/**
 * Transport reseau utilise pour cette source.
 * "curl"  : obligatoire ici, rocketleague.com renvoie 403 aux requetes Node.
 * "fetch" : reseau integre a Node, si leur filtrage disparait un jour.
 * "auto"  : essaie fetch puis retente une fois avec curl.
 */
const TRANSPORT = "curl";

/** Prefixe des liens d'articles, pour reconstruire des URL absolues. */
const SITE_ORIGIN = "https://www.rocketleague.com";

/**
 * Flux RSS/Atom officiel : il n'en existe pas aujourd'hui.
 * Si Psyonix en publie un, mets son URL ici (ex: "https://www.rocketleague.com/feed.xml").
 * Le script le lira au format XML au lieu de scraper la page HTML.
 */
const FEED_URL = null;

/** Nombre d'entrees conservees dans le JSON. */
const LIMIT = 10;

/**
 * SELECTEURS CSS - a ajuster si la page news est refondue.
 *
 * Attention : les classes CSS de rocketleague.com sont generees
 * automatiquement (ex: "_1eu3eal45e") et changent a chaque redeploiement.
 * On s'appuie donc volontairement sur la STRUCTURE (liens /news/..., balise
 * h3, texte de date) et non sur ces classes instables.
 */
const SELECTORS = {
  // Chaque article de la liste est un lien vers /news/<slug>.
  articleLink: 'a[href^="/news/"]',
  // Le titre est dans un h3 a l'interieur du lien.
  title: "h3",
  // La date est un <span> voisin du lien, dans le meme bloc parent.
  dateCandidate: "span",
};

/**
 * REGLES DE TAG - le premier mot-cle trouve dans le titre gagne.
 * L'ordre compte : "Patch Notes v2.70: Season 23" est classe "correctif"
 * parce que la regle "correctif" est testee avant "evenement".
 * Inverse les deux blocs si tu preferes l'inverse.
 */
const TAG_RULES = [
  { tag: "correctif", keywords: ["patch", "correctif", "hotfix", "bug", "fix"] },
  { tag: "evenement", keywords: ["event", "événement", "evenement", "saison", "season", "tournoi", "tournament", "rlcs", "championship"] },
];
const DEFAULT_TAG = "MAJ";

/* ==========================================================================
   2. OUTILS DE PARSING
   ========================================================================== */

/** Mois anglais (format "Jun 09, 2026" utilise par rocketleague.com). */
const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Reconnait "Jun 09, 2026" et renvoie une date ISO, sinon null. */
function parseEnglishDate(text) {
  const match = /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(text || "");
  if (!match) return null;

  const month = MONTHS[match[1].toLowerCase()];
  if (month === undefined) return null;

  const date = new Date(Date.UTC(Number(match[3]), month, Number(match[2])));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Deduit le tag a partir du titre, selon TAG_RULES. */
function deduceTag(title) {
  const haystack = (title || "").toLowerCase();
  for (const rule of TAG_RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      return rule.tag;
    }
  }
  return DEFAULT_TAG;
}

/**
 * Extrait les articles depuis le HTML de la page news.
 * Exportee pour pouvoir etre testee sur un fichier HTML enregistre.
 */
function parseNewsHtml(html) {
  const $ = cheerio.load(html);
  const entries = [];
  const seen = new Set();

  $(SELECTORS.articleLink).each((_, element) => {
    const link = $(element);
    const href = link.attr("href") || "";

    // On ignore les pages de categorie (/news/tag/patch-notes) et la page racine.
    if (href.startsWith("/news/tag/") || href === "/news" || href === "/news/") return;

    const titre = cleanText(link.find(SELECTORS.title).text() || link.text());
    if (!titre) return;

    const url = href.startsWith("http") ? href : SITE_ORIGIN + href;
    if (seen.has(url)) return; // le meme article peut apparaitre 2 fois (mise en avant + liste)
    seen.add(url);

    // La date se trouve dans un <span> voisin : on remonte au maximum de
    // 3 parents en cherchant un texte du type "Jun 09, 2026".
    let date = null;
    let node = link.parent();
    for (let depth = 0; depth < 3 && !date && node.length; depth += 1) {
      node.find(SELECTORS.dateCandidate).each((__, span) => {
        if (date) return;
        date = parseEnglishDate($(span).text());
      });
      node = node.parent();
    }

    entries.push({
      date: date || new Date().toISOString(), // a defaut : date de recuperation
      titre,
      resume: "", // voir la note "RESUME" dans le README
      lien: url,
      tag: deduceTag(titre),
    });
  });

  return entries.slice(0, LIMIT);
}

/** Parse un flux RSS/Atom (utilise seulement si FEED_URL est renseigne). */
function parseFeedXml(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const entries = [];

  $("item, entry").each((_, element) => {
    if (entries.length >= LIMIT) return;
    const node = $(element);

    const titre = cleanText(node.find("title").first().text());
    const lien =
      cleanText(node.find("link").first().attr("href")) ||
      cleanText(node.find("link").first().text());
    const rawDate = cleanText(
      node.find("pubDate").first().text() || node.find("updated, published").first().text()
    );
    const resume = cleanText(
      node.find("description").first().text() || node.find("summary").first().text()
    ).slice(0, 300);

    if (!titre || !lien) return;

    const parsed = new Date(rawDate);
    entries.push({
      date: Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString(),
      titre,
      resume,
      lien,
      tag: deduceTag(titre),
    });
  });

  return entries;
}

/* ==========================================================================
   3. VALIDATION - decide si on a le droit d'ecraser le fichier existant
   ========================================================================== */

function isValidPayload(entries) {
  return (
    Array.isArray(entries) &&
    entries.length > 0 &&
    entries.every((entry) => entry.titre && entry.lien && entry.date)
  );
}

/* ==========================================================================
   4. PROGRAMME PRINCIPAL
   ========================================================================== */

async function main() {
  const source = FEED_URL || NEWS_URL;
  log.info(`recuperation depuis ${source}`);

  // UN SEUL appel reseau par execution.
  const body = await fetchHtml(source, TRANSPORT);

  const entries = FEED_URL ? parseFeedXml(body) : parseNewsHtml(body);
  log.info(`${entries.length} article(s) extrait(s).`);

  if (!isValidPayload(entries)) {
    // Cas typique : la page a ete refondue et les selecteurs ne matchent plus.
    throw new Error(
      "aucun article exploitable n'a ete trouve. La structure de la page a " +
        "probablement change : ajuste SELECTORS en haut de scripts/fetch-updates.js."
    );
  }

  const written = writeJsonIfValid("data/updates.json", entries, isValidPayload, log);
  if (!written) process.exitCode = 1;

  const counts = entries.reduce((acc, entry) => {
    acc[entry.tag] = (acc[entry.tag] || 0) + 1;
    return acc;
  }, {});
  log.info(`repartition des tags : ${JSON.stringify(counts)}`);
}

// On ne lance le telechargement que si le fichier est execute directement
// (`node scripts/fetch-updates.js`). Ainsi, un `require()` de ce module
// pour tester les fonctions de parsing ne declenche aucun appel reseau.
if (require.main === module) {
  main().catch((err) => {
    log.error(err.message);

    const existing = readJson("data/updates.json");
    if (existing) {
      log.warn(
        "data/updates.json a ete CONSERVE tel quel : le site continue " +
          "d'afficher les dernieres actualites recuperees avec succes."
      );
    } else {
      log.warn(
        "aucun data/updates.json existant : la page mises-a-jour.html affichera " +
          "son contenu statique de secours."
      );
    }
    process.exitCode = 1;
  });
}

module.exports = { parseNewsHtml, parseFeedXml, deduceTag, parseEnglishDate };
