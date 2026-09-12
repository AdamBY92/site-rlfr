/**
 * ============================================================================
 * health.js - Suivi des echecs consecutifs + alerte Discord
 * ----------------------------------------------------------------------------
 * A QUOI CA SERT
 *   fetch-updates.js peut echouer sans que personne ne le remarque : le site
 *   continue d'afficher les dernieres actualites valides (c'est voulu), donc
 *   rien ne casse visuellement. Le risque, c'est de decouvrir trois mois plus
 *   tard que les actus datent de mars.
 *
 *   Un echec isole n'a rien d'anormal (coupure reseau, site en maintenance).
 *   Ce module ne previent donc qu'apres PLUSIEURS echecs d'affilee, signe que
 *   quelque chose est reellement casse et demande une intervention.
 *
 * OU EST STOCKE L'ETAT
 *   data/.fetch-updates-health.json, ignore par Git : c'est l'etat de la
 *   machine qui lance le script, pas une donnee du site. Il commence par un
 *   point, et .htaccess refuse deja de servir les fichiers caches.
 *
 * CONFIGURATION DU WEBHOOK
 *   L'URL n'est JAMAIS ecrite dans le code. Elle est lue dans la variable
 *   d'environnement DISCORD_WEBHOOK_URL. Si elle est absente, le suivi des
 *   echecs continue de fonctionner normalement (compteur, journal) : seul
 *   l'envoi de l'alerte est saute. Voir README section 21.
 * ============================================================================
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { fromRoot, readJson } = require("./util");

/* ==========================================================================
   REGLAGES
   ========================================================================== */

/** Fichier d'etat, relatif a la racine du projet. */
const FICHIER_ETAT = "data/.fetch-updates-health.json";

/** Nombre d'echecs d'affilee avant la premiere alerte. */
const SEUIL_ALERTE = 3;

/**
 * Si la panne dure, on ne renvoie pas une alerte a chaque execution : ce
 * serait du spam. On rappelle tous les N echecs supplementaires apres la
 * premiere alerte (avec une execution par jour : 3e jour, puis 10e, 17e...).
 */
const RAPPEL_TOUS_LES = 7;

/** Nom de la variable d'environnement contenant l'URL du webhook. */
const VARIABLE_WEBHOOK = "DISCORD_WEBHOOK_URL";

/** Coupe-circuit reseau : l'alerte ne doit jamais faire trainer le script. */
const TIMEOUT_ALERTE_MS = 10000;

/** Longueur max du message d'erreur conserve et transmis. */
const MAX_ERREUR = 500;

const ETAT_INITIAL = {
  echecs_consecutifs: 0,
  dernier_succes: null,
  dernier_echec: null,
  derniere_erreur: null,
  alerte_envoyee_le: null,
};

/* ==========================================================================
   LECTURE / ECRITURE DE L'ETAT
   ========================================================================== */

/**
 * Lit le fichier d'etat. Un fichier absent ou corrompu redonne l'etat initial
 * plutot qu'une erreur : le suivi ne doit jamais empecher le script de tourner.
 */
function lireEtat() {
  const brut = readJson(FICHIER_ETAT);
  if (!brut || typeof brut !== "object") return { ...ETAT_INITIAL };

  return {
    ...ETAT_INITIAL,
    ...brut,
    // Un compteur corrompu (texte, negatif, absent) repart de zero.
    echecs_consecutifs:
      Number.isInteger(brut.echecs_consecutifs) && brut.echecs_consecutifs >= 0
        ? brut.echecs_consecutifs
        : 0,
  };
}

/** Ecrit l'etat. Une erreur d'ecriture est signalee mais n'interrompt rien. */
function ecrireEtat(etat, log) {
  try {
    const fichier = fromRoot(FICHIER_ETAT);
    fs.mkdirSync(path.dirname(fichier), { recursive: true });
    fs.writeFileSync(fichier, `${JSON.stringify(etat, null, 2)}\n`, "utf8");
    return true;
  } catch (err) {
    log.warn(`impossible d'ecrire ${FICHIER_ETAT} : ${err.message}`);
    return false;
  }
}

/* ==========================================================================
   ENVOI DE L'ALERTE
   ========================================================================== */

/**
 * Verifie que l'URL est bien un webhook Discord en HTTPS.
 * Objectif : si la variable d'environnement contient autre chose (faute de
 * frappe, URL collee de travers), on n'envoie pas le contenu a un hote
 * inconnu. On ne journalise JAMAIS l'URL elle-meme.
 */
function webhookValide(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const hotesAutorises = ["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"];
  return (
    u.protocol === "https:" &&
    hotesAutorises.includes(u.hostname) &&
    u.pathname.startsWith("/api/webhooks/")
  );
}

/**
 * Poste un message sur le webhook Discord.
 * Ne leve jamais : une alerte qui n'part pas ne doit pas transformer un echec
 * de scraping en plantage du script.
 *
 * @returns {Promise<boolean>} true si Discord a accepte le message.
 */
async function envoyerAlerte(contenu, log) {
  const url = process.env[VARIABLE_WEBHOOK];

  if (!url) {
    log.warn(
      `${VARIABLE_WEBHOOK} n'est pas definie : aucune alerte envoyee. ` +
        "Le compteur d'echecs, lui, continue d'etre tenu a jour. " +
        "Pour activer les alertes, voir README section 21."
    );
    return false;
  }

  if (!webhookValide(url)) {
    log.error(
      `${VARIABLE_WEBHOOK} ne ressemble pas a une URL de webhook Discord ` +
        "(attendu : https://discord.com/api/webhooks/...). Aucun envoi effectue."
    );
    return false;
  }

  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), TIMEOUT_ALERTE_MS);

  try {
    const reponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "Site RLFR - surveillance",
        content: contenu,
        // Aucune mention ne doit pouvoir etre declenchee par le texte d'erreur.
        allowed_mentions: { parse: [] },
      }),
      signal: controleur.signal,
    });

    if (!reponse.ok) {
      // 401/404 = webhook supprime ou URL erronee ; 429 = trop d'envois.
      log.warn(`le webhook Discord a repondu ${reponse.status} : alerte non delivree.`);
      return false;
    }

    log.info("alerte envoyee sur le webhook Discord.");
    return true;
  } catch (err) {
    const cause = err.name === "AbortError" ? `pas de reponse en ${TIMEOUT_ALERTE_MS} ms` : err.message;
    log.warn(`envoi de l'alerte impossible (${cause}). Le script continue normalement.`);
    return false;
  } finally {
    clearTimeout(minuteur);
  }
}

/* ==========================================================================
   MISE EN FORME DES MESSAGES
   ========================================================================== */

/** Raccourcit et neutralise le texte d'erreur avant de l'afficher sur Discord. */
function erreurLisible(message) {
  const texte = String(message || "erreur inconnue")
    .replace(/`/g, "'") // evite de casser le bloc de code Discord
    .slice(0, MAX_ERREUR);
  return texte;
}

function formaterDate(iso) {
  if (!iso) return "jamais";
  return new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
}

function messageAlerte(etat) {
  return [
    `**Les actualites du site ne se mettent plus a jour.**`,
    ``,
    `Echecs consecutifs : **${etat.echecs_consecutifs}**`,
    `Derniere recuperation reussie : ${formaterDate(etat.dernier_succes)}`,
    ``,
    "Derniere erreur :",
    "```",
    erreurLisible(etat.derniere_erreur),
    "```",
    `Le site n'est pas casse : il affiche toujours les dernieres actualites`,
    `valides. Mais elles ne bougeront plus tant que ce n'est pas repare.`,
    ``,
    `A verifier : le journal logs/maj-actualites.log sur la machine qui lance`,
    `la tache planifiee, puis README section 6 quater (reparer les scripts).`,
  ].join("\n");
}

function messageRetablissement(etat, echecsPrecedents) {
  return [
    `**Les actualites du site sont de nouveau a jour.**`,
    ``,
    `La recuperation a refonctionne apres ${echecsPrecedents} echec(s) consecutif(s).`,
    `Rien a faire de plus.`,
  ].join("\n");
}

/* ==========================================================================
   API UTILISEE PAR LES SCRIPTS
   ========================================================================== */

/**
 * A appeler quand la recuperation a REUSSI.
 * Remet le compteur a zero et previent sur Discord si une alerte avait ete
 * envoyee pendant la panne (sinon on resterait sur la derniere alerte, sans
 * jamais savoir que c'est rentre dans l'ordre).
 */
async function signalerSucces(log) {
  const etat = lireEtat();
  const echecsPrecedents = etat.echecs_consecutifs;
  const alerteEnCours = Boolean(etat.alerte_envoyee_le);

  const nouvel = {
    ...etat,
    echecs_consecutifs: 0,
    dernier_succes: new Date().toISOString(),
    derniere_erreur: null,
    alerte_envoyee_le: null,
  };
  ecrireEtat(nouvel, log);

  if (echecsPrecedents > 0) {
    log.info(`compteur d'echecs remis a zero (il etait a ${echecsPrecedents}).`);
  }

  // On ne notifie le retour a la normale que si une alerte etait partie.
  if (alerteEnCours) {
    await envoyerAlerte(messageRetablissement(nouvel, echecsPrecedents), log);
  }
}

/**
 * A appeler quand la recuperation a ECHOUE.
 * Incremente le compteur et declenche l'alerte au SEUIL_ALERTE-ieme echec
 * d'affilee, puis un rappel tous les RAPPEL_TOUS_LES echecs suivants.
 */
async function signalerEchec(messageErreur, log) {
  const etat = lireEtat();
  const compteur = etat.echecs_consecutifs + 1;

  const nouvel = {
    ...etat,
    echecs_consecutifs: compteur,
    dernier_echec: new Date().toISOString(),
    derniere_erreur: erreurLisible(messageErreur),
  };

  if (compteur < SEUIL_ALERTE) {
    log.warn(
      `echec ${compteur}/${SEUIL_ALERTE} avant alerte. Un echec isole est ` +
        "courant (reseau, maintenance) : on attend de voir."
    );
    ecrireEtat(nouvel, log);
    return;
  }

  // Au-dela du seuil : premiere alerte, puis rappels espaces.
  const depuisSeuil = compteur - SEUIL_ALERTE;
  const doitAlerter = depuisSeuil === 0 || depuisSeuil % RAPPEL_TOUS_LES === 0;

  log.error(`${compteur} echecs consecutifs : la recuperation des actualites est cassee.`);

  if (doitAlerter) {
    const envoyee = await envoyerAlerte(messageAlerte(nouvel), log);
    if (envoyee) nouvel.alerte_envoyee_le = new Date().toISOString();
  } else {
    const restant = RAPPEL_TOUS_LES - (depuisSeuil % RAPPEL_TOUS_LES);
    log.warn(`alerte deja envoyee pour cette panne : prochain rappel dans ${restant} echec(s).`);
  }

  ecrireEtat(nouvel, log);
}

module.exports = {
  FICHIER_ETAT,
  SEUIL_ALERTE,
  RAPPEL_TOUS_LES,
  VARIABLE_WEBHOOK,
  lireEtat,
  signalerSucces,
  signalerEchec,
  webhookValide,
};
