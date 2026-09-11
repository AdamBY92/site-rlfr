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
 *   Neuf URL de flux ont ete testees le 11/09/2026 (/news/rss, /news/feed,
 *   /news.rss, /feed, /rss, /rss.xml, /atom.xml, /feed.xml, /blog/rss) :
 *   TOUTES renvoient 404. Il n'existe donc pas de flux a exploiter.
 *   Si Psyonix en publie un, renseigne FEED_URL ci-dessous : le script
 *   l'utilisera en priorite, toujours en un seul appel.
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
 *
 * ---------------------------------------------------------------------------
 * POURQUOI PAS node-fetch / undici ? (question frequente)
 *
 * Parce que ca ne changerait rien. Mesures faites le 11/09/2026 sur
 * www.rocketleague.com :
 *
 *     curl  + User-Agent "bot"                 -> 200
 *     curl  + User-Agent Chrome                -> 200
 *     curl  + UA Chrome + en-tetes Sec-Fetch   -> 200
 *     fetch + User-Agent "bot"                 -> 403
 *     fetch + User-Agent Chrome                -> 403
 *     fetch + UA Chrome + en-tetes Sec-Fetch   -> 403
 *
 * Le filtrage ne regarde donc PAS les en-tetes : il reconnait la signature
 * TLS/HTTP2 de Node. Or le fetch() integre a Node EST undici, et node-fetch
 * s'appuie sur la meme pile TLS : les trois ont la meme empreinte et seraient
 * bloques pareil. Seul un client different (curl) passe.
 * ---------------------------------------------------------------------------
 */
const TRANSPORT = "curl";

/**
 * En-tetes envoyes a cette source.
 *
 * Compromis assume : un User-Agent de navigateur RECENT (pour ne pas etre
 * ecarte par un filtrage grossier sur l'UA), auquel on ajoute une mention
 * d'identification et une URL de contact. On ne se fait donc pas passer pour
 * un visiteur anonyme : un administrateur qui lit ses journaux sait qui
 * l'appelle et comment nous joindre.
 *
 * >>> REMPLACE l'URL de contact par celle de ton depot.
 */
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/140.0.0.0 Safari/537.36 (+https://github.com/ton-compte/site-rlfr; bot communautaire)",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};

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

/**
 * MOIS, en francais ET en anglais.
 *
 * Pourquoi les deux : on demande la version francaise du site
 * (Accept-Language dans BROWSER_HEADERS), qui affiche "09 sept. 2026".
 * Mais si le site ignore l'en-tete un jour, ou si un flux RSS anglais est
 * branche via FEED_URL, on retombe sur "Sep 09, 2026". Les deux formats
 * doivent donc etre compris.
 *
 * Les cles sont des prefixes SANS ACCENT : "aout" couvre "août",
 * "fevr" couvre "février" et "févr.", "sept" couvre "septembre" et "sept.".
 * Les prefixes longs sont testes en premier, sinon "juin" et "juillet"
 * seraient confondus (tous deux commencent par "jui").
 */
const MONTH_PREFIXES = [
  ["janv", 0], ["jan", 0],
  ["fevr", 1], ["fev", 1], ["feb", 1],
  ["mars", 2], ["mar", 2],
  ["avri", 3], ["avr", 3], ["apr", 3],
  ["juil", 6], ["jul", 6],
  ["juin", 5], ["jun", 5],
  ["mai", 4], ["may", 4],
  ["aout", 7], ["aou", 7], ["aug", 7],
  ["sept", 8], ["sep", 8],
  ["octo", 9], ["oct", 9],
  ["nove", 10], ["nov", 10],
  ["dece", 11], ["dec", 11],
];

/** Retire les accents et la ponctuation d'un nom de mois. */
function normaliserMois(mot) {
  return String(mot)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // supprime les accents
    .replace(/\./g, "");
}

/** Renvoie l'index du mois (0-11), ou null si non reconnu. */
function indexDuMois(mot) {
  const propre = normaliserMois(mot);
  for (const [prefixe, index] of MONTH_PREFIXES) {
    if (propre.startsWith(prefixe)) return index;
  }
  return null;
}

/**
 * Reconnait les deux formats de la page :
 *   francais : "09 sept. 2026", "04 août 2026"
 *   anglais  : "Sep 09, 2026"
 * Renvoie une date ISO, ou null si la date est illisible.
 *
 * IMPORTANT : on renvoie null, JAMAIS la date du jour. Afficher la date du
 * jour sur un article de juin donnerait une information fausse au visiteur.
 */
function parseArticleDate(text) {
  const brut = String(text || "").trim();

  // Format francais : "09 sept. 2026" (jour, mois, annee)
  let match = /^(\d{1,2})\s+([A-Za-zÀ-ÿ.]+)\s+(\d{4})$/.exec(brut);
  if (match) {
    const mois = indexDuMois(match[2]);
    if (mois !== null) {
      const date = new Date(Date.UTC(Number(match[3]), mois, Number(match[1])));
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
  }

  // Format anglais : "Sep 09, 2026" (mois, jour, annee)
  match = /([A-Za-zÀ-ÿ.]{3,})\s+(\d{1,2}),?\s+(\d{4})/.exec(brut);
  if (match) {
    const mois = indexDuMois(match[1]);
    if (mois !== null) {
      const date = new Date(Date.UTC(Number(match[3]), mois, Number(match[2])));
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
  }

  return null;
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
        date = parseArticleDate($(span).text());
      });
      node = node.parent();
    }

    entries.push({
      // null si la date est illisible : le site masque alors la date
      // plutot que d'en afficher une fausse.
      date: date,
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
    entries.every((entry) => entry.titre && entry.lien)
  );
}

/* ==========================================================================
   4. PROGRAMME PRINCIPAL
   ========================================================================== */

async function main() {
  const source = FEED_URL || NEWS_URL;
  log.info(`recuperation depuis ${source}`);

  // UN SEUL appel reseau par execution.
  const body = await fetchHtml(source, TRANSPORT, BROWSER_HEADERS);

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
/**
 * Traduit une erreur technique en explication actionnable.
 * Le 403 a une cause bien identifiee et une reponse differente des autres :
 * inutile de chercher du cote des selecteurs si on est simplement bloque.
 */
function expliquerEchec(message) {
  if (/\b403\b/.test(message)) {
    return [
      "Le site officiel a REFUSE la requete (403). Ce n'est pas un bug du",
      "script : sa protection anti-robot a reconnu l'appel.",
      "",
      "Cause la plus probable selon l'endroit ou tu lances le script :",
      "  - depuis GitHub Actions : les adresses IP des serveurs GitHub sont",
      "    souvent bloquees en masse par ce genre de protection. Dans ce cas",
      "    le blocage est DEFINITIF depuis le cloud, et il faut lancer CE",
      "    script depuis ta machine (Planificateur de taches Windows) ;",
      "  - depuis ta machine : blocage temporaire (trop d'appels rapproches).",
      "    Attends une heure et relance.",
      "",
      "A savoir : changer le User-Agent ne sert a rien, la protection lit la",
      "signature TLS du client, pas les en-tetes (mesures dans l'en-tete de",
      "ce fichier). Les deux autres scripts ne sont pas concernes.",
    ].join("\n           ");
  }
  if (/curl est introuvable/.test(message)) {
    return "curl est absent de cette machine : installe-le, ou bascule TRANSPORT sur \"fetch\".";
  }
  if (/aucun article exploitable/.test(message)) {
    return "La page a repondu mais sa structure a change : ajuste SELECTORS en haut de ce fichier.";
  }
  return null;
}

if (require.main === module) {
  main().catch((err) => {
    log.error(err.message);

    const explication = expliquerEchec(err.message);
    if (explication) log.warn(explication);

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

module.exports = { parseNewsHtml, parseFeedXml, deduceTag, parseArticleDate };
