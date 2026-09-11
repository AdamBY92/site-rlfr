/**
 * ============================================================================
 * util.js - Fonctions communes aux deux scripts de mise a jour
 * ----------------------------------------------------------------------------
 * Utilise par :
 *   - scripts/fetch-updates.js  (news officielles Rocket League)
 *   - scripts/fetch-shop.js     (rotation de la boutique)
 *
 * Regles de politesse appliquees ici, ne les retire pas :
 *   - UN SEUL appel reseau par execution de script ;
 *   - un User-Agent identifiable avec une adresse de contact ;
 *   - un timeout, pour ne jamais laisser une requete pendre ;
 *   - aucune boucle de retry agressive (1 seule tentative).
 * ============================================================================
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * User-Agent envoye a chaque requete.
 * >>> REMPLACE l'adresse e-mail par la tienne : c'est ce qui permet a un
 *     administrateur de site de te contacter au lieu de bloquer le script.
 */
const USER_AGENT =
  "RLFR-SiteBot/1.0 (+https://github.com/ton-compte/site-rlfr; contact: ton-email@exemple.fr)";

/** Delai maximum d'une requete, en millisecondes. */
const TIMEOUT_MS = 30000;

/** Racine du projet (le dossier qui contient package.json). */
const ROOT = path.resolve(__dirname, "..", "..");

/* --------------------------------------------------------------------------
   Journalisation : prefixe le nom du script pour lire clairement les logs
   du Planificateur de taches Windows ou de GitHub Actions.
   -------------------------------------------------------------------------- */
function makeLogger(scriptName) {
  const stamp = () => new Date().toISOString();
  return {
    info: (msg) => console.log(`[${stamp()}] [${scriptName}] ${msg}`),
    warn: (msg) => console.warn(`[${stamp()}] [${scriptName}] ATTENTION : ${msg}`),
    error: (msg) => console.error(`[${stamp()}] [${scriptName}] ERREUR : ${msg}`),
  };
}

/**
 * Telecharge une page via fetch() (module reseau integre a Node).
 * Une seule tentative, aucun retry.
 */
async function fetchViaNode(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
    });

    if (!response.ok) {
      // 403 = le site refuse les robots ; 404 = l'URL a change ; 5xx = panne chez eux.
      throw new Error(
        `le serveur a repondu HTTP ${response.status} (${response.statusText}) pour ${url}`
      );
    }
    return await response.text();
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`delai depasse (${TIMEOUT_MS} ms) en appelant ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Telecharge une page via le programme `curl`.
 *
 * POURQUOI CE SECOND TRANSPORT ?
 *   www.rocketleague.com renvoie HTTP 403 aux requetes emises par Node
 *   (leur pare-feu filtre la signature TLS de Node, quels que soient les
 *   en-tetes envoyes : teste le 10/09/2026), alors que la meme requete
 *   passe avec curl. curl est installe d'origine sur Windows 10/11 et sur
 *   les serveurs GitHub Actions.
 *
 * Toujours UNE SEULE requete : `-s` silencieux, `-f` echoue proprement sur
 * un code >= 400, `--max-time` borne la duree, aucun `--retry`.
 */
function fetchViaCurl(url) {
  const { execFileSync } = require("node:child_process");

  try {
    return execFileSync(
      "curl",
      [
        "-sSfL",                                  // silencieux, erreur claire, suit les redirections
        "--max-time", String(Math.round(TIMEOUT_MS / 1000)),
        "--compressed",
        "-A", USER_AGENT,
        "-H", "Accept-Language: fr-FR,fr;q=0.9,en;q=0.8",
        url,
      ],
      {
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
        // On capture la sortie d'erreur de curl au lieu de la laisser
        // s'afficher : elle est reformulee dans le message d'erreur ci-dessous.
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
  } catch (err) {
    const detail = String(err.stderr || err.message || "").trim().split("\n")[0];
    if (err.code === "ENOENT") {
      throw new Error(
        `curl est introuvable sur cette machine. Installe-le, ou passe ce script ` +
          `en transport "fetch" (voir TRANSPORT dans le script appelant).`
      );
    }
    throw new Error(`curl a echoue pour ${url} : ${detail}`);
  }
}

/**
 * Telecharge une page et renvoie son HTML brut.
 *
 * @param {string} url
 * @param {"fetch"|"curl"|"auto"} transport
 *        - "fetch" : uniquement le reseau integre a Node (1 requete) ;
 *        - "curl"  : uniquement curl (1 requete) ;
 *        - "auto"  : essaie fetch, et SEULEMENT s'il est refuse, retente une
 *                    fois avec curl (2 requetes au maximum, jamais plus).
 */
async function fetchHtml(url, transport = "auto") {
  let html;

  if (transport === "curl") {
    html = fetchViaCurl(url);
  } else if (transport === "fetch") {
    html = await fetchViaNode(url);
  } else {
    try {
      html = await fetchViaNode(url);
    } catch (err) {
      // Repli unique : utile quand un site filtre les requetes emises par Node.
      html = fetchViaCurl(url);
    }
  }

  if (!html || html.length < 500) {
    throw new Error(`reponse anormalement courte (${(html || "").length} octets) pour ${url}`);
  }
  return html;
}

/** Chemin absolu a partir de la racine du projet. */
function fromRoot(...segments) {
  return path.join(ROOT, ...segments);
}

/** Lit un JSON existant ; renvoie null si absent ou illisible. */
function readJson(relativePath) {
  const file = fromRoot(relativePath);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Ecrit le JSON UNIQUEMENT si les donnees sont jugees valides.
 *
 * C'est la garantie demandee : si le scraping casse (site tiers modifie),
 * on NE remplace PAS le fichier existant par un tableau vide. La derniere
 * donnee valide reste affichee sur le site.
 *
 * @param {string}   relativePath  ex: "data/shop.json"
 * @param {object}   data          objet a serialiser
 * @param {function} isValid       renvoie true si `data` merite d'etre ecrit
 * @param {object}   logger        makeLogger(...)
 * @returns {boolean} true si le fichier a ete ecrit
 */
function writeJsonIfValid(relativePath, data, isValid, logger) {
  if (!isValid(data)) {
    logger.error(
      `donnees jugees invalides : ${relativePath} n'est PAS modifie, ` +
        `l'ancienne version reste en place sur le site.`
    );
    return false;
  }

  const file = fromRoot(relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  // Ecriture atomique : on ecrit un fichier temporaire puis on le renomme,
  // pour ne jamais laisser un JSON a moitie ecrit si le script est interrompu.
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);

  logger.info(`${relativePath} mis a jour.`);
  return true;
}

/** Nettoie un texte extrait du HTML (espaces multiples, retours a la ligne). */
function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Date du jour a 00:00:00 UTC, au format ISO 8601. */
function todayUtcMidnight() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

module.exports = {
  USER_AGENT,
  TIMEOUT_MS,
  makeLogger,
  fetchHtml,
  fromRoot,
  readJson,
  writeJsonIfValid,
  cleanText,
  todayUtcMidnight,
};
