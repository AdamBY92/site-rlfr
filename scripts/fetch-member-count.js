#!/usr/bin/env node
/**
 * ============================================================================
 * fetch-member-count.js - Compteur de membres du serveur Discord
 * ----------------------------------------------------------------------------
 * Lancer :  npm run update-stats     (ou : node scripts/fetch-member-count.js)
 * Produit :  data/stats.json
 *
 * AUCUNE AUTHENTIFICATION. Pas de token, pas de bot, aucun secret.
 * Ne mets JAMAIS de token Discord ici : ce depot est destine a un site
 * statique, tout ce qui s'y trouve finit publiquement lisible.
 *
 * ----------------------------------------------------------------------------
 * DEUX SOURCES, DANS CET ORDRE
 *
 * 1. L'API PUBLIQUE DES INVITATIONS (utilisee en priorite)
 *      GET https://discord.com/api/v10/invites/<CODE>?with_counts=true
 *    Elle renvoie DEUX chiffres :
 *      - approximate_member_count   -> nombre TOTAL de membres
 *      - approximate_presence_count -> nombre de membres EN LIGNE
 *    Avantages : rien a activer dans Discord, et on obtient le TOTAL.
 *    Limite : si l'invitation est revoquee ou expire, l'appel renvoie 404.
 *    C'est pour cela que le lien d'invitation du serveur doit etre permanent
 *    (dans Discord : Inviter des amis > Modifier le lien > Expire : Jamais).
 *
 * 2. LE WIDGET PUBLIC (secours automatique)
 *      GET https://discord.com/api/guilds/<SERVER_ID>/widget.json
 *    Il ne renvoie QUE presence_count, c'est-a-dire les membres EN LIGNE.
 *    Il ne donne PAS le total, et il faut l'activer a la main :
 *      Parametres du serveur > Widget > "Activer le widget serveur".
 *
 * POURQUOI PAS LE TOTAL EXACT ? Obtenir le nombre exact (et non approximatif)
 * demanderait un bot Discord heberge en permanence avec l'intent privilegie
 * SERVER MEMBERS : hebergement a maintenir, token a proteger, validation par
 * Discord au-dela de 100 serveurs. Le chiffre approximatif ci-dessus est
 * suffisant pour un compteur d'accueil.
 *
 * EN CAS D'ECHEC : message clair, data/stats.json CONSERVE tel quel,
 * code de sortie 1. Le site continue de fonctionner normalement.
 * ============================================================================
 */

"use strict";

const { makeLogger, readJson, writeJsonIfValid } = require("./lib/util");

const log = makeLogger("fetch-member-count");

/* ==========================================================================
   1. CONFIGURATION
   ========================================================================== */

/**
 * CODE D'INVITATION du serveur : la partie apres discord.gg/ dans ton lien.
 * Ex: pour https://discord.gg/CNDjmDBmJz -> "CNDjmDBmJz"
 */
const INVITE_CODE = process.env.DISCORD_INVITE_CODE || "CNDjmDBmJz";

/**
 * IDENTIFIANT DU SERVEUR (utilise uniquement par la source de secours).
 *
 * Ou le trouver, deux methodes :
 *   A. Discord > Parametres utilisateur > Avances > active "Mode developpeur",
 *      puis clic droit sur le NOM DU SERVEUR > "Copier l'identifiant du serveur".
 *   B. Ouvre ton serveur sur Discord web : l'URL a la forme
 *      https://discord.com/channels/<SERVER_ID>/<ID_DU_SALON>.
 */
const SERVER_ID = process.env.DISCORD_SERVER_ID || "1426966365964599428";

const TIMEOUT_MS = 15000;

const USER_AGENT =
  "RLFR-SiteBot/1.0 (+https://github.com/ton-compte/site-rlfr; contact: ton-email@exemple.fr)";

/* ==========================================================================
   2. OUTILS
   ========================================================================== */

/** Un identifiant Discord est un nombre de 17 a 20 chiffres. */
function isValidServerId(value) {
  return /^\d{17,20}$/.test(String(value || "").trim());
}

/** Appel JSON unique, avec delai maximum et messages d'erreur parlants. */
async function fetchJson(url, contexte) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });

    if (response.status === 403) {
      throw new Error(
        contexte + " : Discord repond 403. Si c'est le widget, il est " +
          'DESACTIVE (Parametres du serveur > Widget > "Activer le widget serveur").'
      );
    }
    if (response.status === 404) {
      throw new Error(
        contexte + " : Discord repond 404. Invitation expiree/revoquee, " +
          "ou identifiant de serveur incorrect."
      );
    }
    if (response.status === 429) {
      throw new Error(
        contexte + " : Discord repond 429 (trop de requetes). Espace " +
          "davantage les executions : une par heure suffit largement."
      );
    }
    if (!response.ok) {
      throw new Error(contexte + " : HTTP " + response.status + " (" + response.statusText + ")");
    }

    return await response.json();
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(contexte + " : delai depasse (" + TIMEOUT_MS + " ms)");
    }
    if (err instanceof SyntaxError) {
      throw new Error(contexte + " : la reponse n'est pas du JSON valide");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/* ==========================================================================
   3. LES DEUX SOURCES
   ========================================================================== */

/** Source 1 : invitation publique -> total ET en ligne. */
async function viaInvitation(code) {
  const url =
    "https://discord.com/api/v10/invites/" + encodeURIComponent(code) + "?with_counts=true";
  const data = await fetchJson(url, "invitation " + code);

  const total = data.approximate_member_count;
  const enLigne = data.approximate_presence_count;

  if (typeof total !== "number" && typeof enLigne !== "number") {
    throw new Error(
      "invitation " + code + " : aucun compteur dans la reponse. " +
        "Le format de l'API a peut-etre change."
    );
  }

  return {
    membres_total: typeof total === "number" ? total : null,
    membres_en_ligne: typeof enLigne === "number" ? enLigne : null,
    nom_serveur: (data.guild && data.guild.name) || null,
    source: "invitation",
  };
}

/** Source 2 : widget public -> en ligne uniquement. */
async function viaWidget(serverId) {
  if (!isValidServerId(serverId)) {
    throw new Error(
      "widget : SERVER_ID invalide (\"" + serverId + "\"). Renseigne-le en " +
        "haut de ce fichier ou via la variable DISCORD_SERVER_ID."
    );
  }

  const url = "https://discord.com/api/guilds/" + serverId + "/widget.json";
  const data = await fetchJson(url, "widget " + serverId);

  if (typeof data.presence_count !== "number") {
    throw new Error("widget : pas de champ numerique 'presence_count' dans la reponse.");
  }

  return {
    membres_total: null, // le widget ne donne pas le total
    membres_en_ligne: data.presence_count,
    nom_serveur: data.name || null,
    source: "widget",
  };
}

/* ==========================================================================
   4. VALIDATION
   ========================================================================== */

function isValidPayload(data) {
  if (!data || typeof data !== "object") return false;
  if (typeof data.derniere_maj !== "string") return false;

  const enLigneOk = typeof data.membres_en_ligne === "number" && data.membres_en_ligne >= 0;
  const totalOk = typeof data.membres_total === "number" && data.membres_total >= 0;

  /* Au moins un des deux compteurs doit etre exploitable. */
  return enLigneOk || totalOk;
}

/* ==========================================================================
   5. PROGRAMME PRINCIPAL
   ========================================================================== */

async function main() {
  let resultat = null;

  /* Source 1 : l'invitation. */
  try {
    resultat = await viaInvitation(INVITE_CODE);
    log.info("source utilisee : invitation publique (total + en ligne)");
  } catch (err) {
    log.warn(err.message);
    log.info("bascule sur la source de secours : widget public.");

    /* Source 2 : le widget. Deuxieme et DERNIERE tentative, pas de boucle. */
    resultat = await viaWidget(SERVER_ID);
    log.info("source utilisee : widget public (membres en ligne uniquement)");
  }

  const payload = {
    membres_total: resultat.membres_total,
    membres_en_ligne: resultat.membres_en_ligne,
    derniere_maj: new Date().toISOString(),
    source: resultat.source,
  };

  const written = writeJsonIfValid("data/stats.json", payload, isValidPayload, log);
  if (!written) process.exitCode = 1;

  log.info(
    "\"" + (resultat.nom_serveur || "serveur") + "\" : " +
      (payload.membres_total !== null ? payload.membres_total + " membres au total, " : "") +
      payload.membres_en_ligne + " en ligne."
  );

  if (payload.membres_total === null) {
    log.warn(
      "total indisponible avec cette source : le site affichera uniquement " +
        "le nombre de membres EN LIGNE, libelle comme tel."
    );
  }
}

if (require.main === module) {
  main().catch((err) => {
    log.error(err.message);

    const existing = readJson("data/stats.json");
    if (existing) {
      log.warn(
        "data/stats.json a ete CONSERVE tel quel : le site continue " +
          "d'afficher le dernier compteur connu (mis a jour le " +
          existing.derniere_maj + ")."
      );
    } else {
      log.warn(
        "aucun data/stats.json : le hero affichera son texte de repli " +
          '("Rejoins la communaute"), sans chiffre ni placeholder visible.'
      );
    }
    process.exitCode = 1;
  });
}

module.exports = { isValidServerId, isValidPayload, viaInvitation, viaWidget };
