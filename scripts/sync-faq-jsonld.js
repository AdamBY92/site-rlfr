#!/usr/bin/env node
/**
 * ============================================================================
 * sync-faq-jsonld.js - Regenere le JSON-LD FAQPage a partir de la vraie FAQ
 * ----------------------------------------------------------------------------
 * Lancer :  npm run sync-faq
 *
 * LE PROBLEME QU'IL RESOUT
 *   index.html contient DEUX fois les questions/reponses : une fois en HTML
 *   (la FAQ que lisent les visiteurs) et une fois en JSON-LD (ce que lit
 *   Google pour afficher les questions directement dans ses resultats).
 *   Ecrites a la main, ces deux copies finissent toujours par diverger : on
 *   corrige une reponse dans la FAQ, on oublie le JSON-LD, et Google affiche
 *   pendant des mois une reponse qui n'existe plus sur le site.
 *
 *   Ce script fait du HTML la SEULE source de verite : il lit la section FAQ
 *   et reecrit le bloc JSON-LD a l'identique. Tu ne touches plus jamais au
 *   JSON-LD a la main.
 *
 * QUAND LE LANCER
 *   Apres toute modification des questions ou des reponses de la FAQ.
 *   Le script signale d'ailleurs si le JSON-LD etait deja a jour.
 *
 * COMMENT CA MARCHE
 *   Le bloc a remplacer est delimite dans index.html par deux commentaires :
 *     <!-- FAQ-JSONLD:DEBUT -->  ...  <!-- FAQ-JSONLD:FIN -->
 *   Si ces reperes disparaissent, le script s'arrete sans rien modifier.
 * ============================================================================
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const cheerio = require("cheerio");

const RACINE = path.resolve(__dirname, "..");
const PAGE = path.join(RACINE, "index.html");

const MARQUEUR_DEBUT = "<!-- FAQ-JSONLD:DEBUT -->";
const MARQUEUR_FIN = "<!-- FAQ-JSONLD:FIN -->";

/**
 * SELECTEURS de la FAQ - a ajuster si la structure HTML change.
 * item     : le bloc englobant une question + sa reponse
 * question : le bouton cliquable (contient aussi l'icone, qu'on retire)
 * reponse  : le paragraphe de reponse
 */
const SELECTEURS = {
  item: ".faq__item",
  question: ".faq__question",
  icone: ".faq__icon",
  reponse: ".faq__answer p",
};

/** Normalise un texte extrait du HTML (espaces multiples, retours ligne). */
function nettoyer(texte) {
  return String(texte || "").replace(/\s+/g, " ").trim();
}

/** Lit les questions/reponses depuis le HTML de la page. */
function lireFaq(html) {
  const $ = cheerio.load(html);
  const entrees = [];

  $(SELECTEURS.item).each((_, element) => {
    const item = $(element);

    /* On clone le bouton pour en retirer l'icone SVG sans toucher au DOM
       d'origine : sinon le texte recupere contiendrait le chevron. */
    const bouton = item.find(SELECTEURS.question).first().clone();
    bouton.find(SELECTEURS.icone).remove();

    const question = nettoyer(bouton.text());
    const reponse = nettoyer(item.find(SELECTEURS.reponse).first().text());

    if (question && reponse) entrees.push({ question, reponse });
  });

  return entrees;
}

/** Construit le bloc JSON-LD complet, marqueurs compris. */
function construireBloc(entrees) {
  const donnees = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entrees.map((e) => ({
      "@type": "Question",
      name: e.question,
      acceptedAnswer: { "@type": "Answer", text: e.reponse },
    })),
  };

  /* Indente sur 2 espaces, comme le bloc Organization juste au-dessus. */
  const json = JSON.stringify(donnees, null, 2)
    .split("\n")
    .map((ligne) => "  " + ligne)
    .join("\n");

  return [
    "  " + MARQUEUR_DEBUT,
    "  <!-- Genere par : npm run sync-faq. Ne pas editer a la main :",
    "       modifie la FAQ en HTML plus bas, puis relance la commande. -->",
    '  <script type="application/ld+json">',
    json,
    "  </script>",
    "  " + MARQUEUR_FIN,
  ].join("\n");
}

function main() {
  const html = fs.readFileSync(PAGE, "utf8");

  const debut = html.indexOf(MARQUEUR_DEBUT);
  const fin = html.indexOf(MARQUEUR_FIN);

  if (debut === -1 || fin === -1 || fin < debut) {
    console.error(
      "Reperes introuvables dans index.html.\n" +
        "Le bloc JSON-LD de la FAQ doit etre encadre par :\n" +
        "  " + MARQUEUR_DEBUT + "\n  ... <script type=\"application/ld+json\"> ...\n  " +
        MARQUEUR_FIN + "\n" +
        "Rien n'a ete modifie."
    );
    process.exitCode = 1;
    return;
  }

  const entrees = lireFaq(html);

  if (entrees.length === 0) {
    console.error(
      "Aucune question trouvee dans la FAQ. La structure HTML a peut-etre " +
        "change : verifie SELECTEURS en haut de ce script. Rien n'a ete modifie."
    );
    process.exitCode = 1;
    return;
  }

  /* On recule jusqu'au debut de la ligne : le bloc genere porte deja sa
     propre indentation, sinon elle se cumulerait a chaque execution. */
  let coupe = debut;
  while (coupe > 0 && (html[coupe - 1] === " " || html[coupe - 1] === "	")) coupe--;

  const avant = html.slice(0, coupe);
  const apres = html.slice(fin + MARQUEUR_FIN.length);
  const nouveau = avant + construireBloc(entrees) + apres;

  console.log(entrees.length + " question(s) lue(s) dans la FAQ :");
  entrees.forEach((e, i) => {
    console.log("  " + (i + 1) + ". " + e.question);
    console.log("     -> " + e.reponse.slice(0, 66) + (e.reponse.length > 66 ? "..." : ""));
  });
  console.log("");

  if (nouveau === html) {
    console.log("Le JSON-LD etait deja a jour : aucune modification.");
    return;
  }

  fs.writeFileSync(PAGE, nouveau, "utf8");
  console.log("JSON-LD FAQPage regenere dans index.html.");
  console.log("Pense a relancer  npm run version-assets  si tu as aussi touche au CSS/JS.");
}

if (require.main === module) main();

module.exports = { lireFaq, construireBloc };
