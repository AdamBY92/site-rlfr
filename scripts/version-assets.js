#!/usr/bin/env node
/**
 * ============================================================================
 * version-assets.js - Force le rechargement du CSS et du JS chez les visiteurs
 * ----------------------------------------------------------------------------
 * Lancer :  npm run version-assets        (incremente : v=2 -> v=3)
 *           npm run version-assets -- 7   (impose une version precise)
 *
 * LE PROBLEME QU'IL RESOUT
 *   Le .htaccess demande aux navigateurs de garder le CSS et le JS en cache
 *   pendant 7 jours (section 4 du .htaccess). C'est voulu : le site charge
 *   plus vite. Mais quand tu modifies style.css ou content.js, un visiteur
 *   deja venu continue d'utiliser l'ANCIENNE version pendant une semaine, et
 *   voit donc un site casse ou inchange.
 *
 *   L'astuce : ajouter ?v=N a la fin de l'URL. Pour le navigateur,
 *   "style.css?v=3" est une adresse differente de "style.css?v=2" : il la
 *   telecharge donc a neuf. Le fichier sur le serveur, lui, ne change pas de
 *   nom - c'est purement cote URL.
 *
 * CE QUE CE SCRIPT MODIFIE
 *   Uniquement les <link> et <script> pointant vers assets/css/*.css et
 *   assets/js/*.js dans les pages .html a la racine. Il ne touche ni aux
 *   images, ni aux polices, ni a quoi que ce soit d'autre.
 *
 * A LANCER APRES CHAQUE MODIFICATION DE CSS OU DE JS, avant de televerser.
 * ============================================================================
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const RACINE = path.resolve(__dirname, "..");

/**
 * Repere une reference a un fichier CSS ou JS local, avec ou sans version.
 *   groupe 1 : href="  ou  src="
 *   groupe 2 : le chemin (assets/css/style.css)
 *   groupe 3 : la version actuelle, si elle existe deja
 */
const MOTIF = /((?:href|src)=")(assets\/(?:css|js)\/[A-Za-z0-9_-]+\.(?:css|js))(\?v=[^"]*)?"/g;

/** Liste les pages .html a la racine du projet. */
function pagesDuSite() {
  return fs
    .readdirSync(RACINE)
    .filter((f) => f.endsWith(".html"))
    .sort();
}

/** Plus grande version actuellement presente dans les pages (0 si aucune). */
function versionActuelle(pages) {
  let max = 0;
  for (const page of pages) {
    const contenu = fs.readFileSync(path.join(RACINE, page), "utf8");
    let m;
    MOTIF.lastIndex = 0;
    while ((m = MOTIF.exec(contenu)) !== null) {
      if (!m[3]) continue;
      const n = Number(m[3].replace("?v=", ""));
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max;
}

function main() {
  const pages = pagesDuSite();
  if (pages.length === 0) {
    console.error("Aucune page .html trouvee a la racine du projet.");
    process.exitCode = 1;
    return;
  }

  const actuelle = versionActuelle(pages);

  /* Version demandee en argument, sinon on incremente celle en place. */
  const argument = process.argv[2];
  let cible;

  if (argument !== undefined) {
    cible = Number(argument);
    if (!Number.isInteger(cible) || cible < 1) {
      console.error(
        'Version invalide : "' + argument + '". Attendu : un entier positif, ' +
          "par exemple  npm run version-assets -- 3"
      );
      process.exitCode = 1;
      return;
    }
  } else {
    cible = actuelle + 1;
  }

  console.log("Version en place : " + (actuelle || "aucune"));
  console.log("Nouvelle version : " + cible);
  console.log("");

  let totalRefs = 0;
  let pagesModifiees = 0;

  for (const page of pages) {
    const chemin = path.join(RACINE, page);
    const avant = fs.readFileSync(chemin, "utf8");

    let refs = 0;
    const apres = avant.replace(MOTIF, function (_, attribut, fichier) {
      refs += 1;
      return attribut + fichier + "?v=" + cible + '"';
    });

    totalRefs += refs;

    if (apres !== avant) {
      fs.writeFileSync(chemin, apres, "utf8");
      pagesModifiees += 1;
      console.log("  " + page.padEnd(24) + refs + " reference(s) mise(s) a jour");
    } else {
      console.log("  " + page.padEnd(24) + refs + " reference(s), deja en v=" + cible);
    }
  }

  console.log("");
  console.log(
    totalRefs + " reference(s) au total, " + pagesModifiees + " page(s) modifiee(s)."
  );

  if (totalRefs === 0) {
    console.error(
      "ATTENTION : aucune reference CSS/JS trouvee. Le motif de recherche ne " +
        "correspond peut-etre plus au HTML (chemins deplaces ?)."
    );
    process.exitCode = 1;
    return;
  }

  console.log("Pense a televerser les pages .html ET les fichiers modifies.");
}

if (require.main === module) main();

module.exports = { MOTIF, pagesDuSite, versionActuelle };
