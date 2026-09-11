#!/usr/bin/env node
/**
 * ============================================================================
 * update-all.js - Lance les trois recuperations de contenu
 * ----------------------------------------------------------------------------
 * Lancer :  npm run update-content
 *
 * POURQUOI CE FICHIER PLUTOT QU'UN SIMPLE "a && b && c" ?
 *   Avec &&, le premier script en echec empeche les suivants de tourner :
 *   une panne de rocketleague.com bloquerait aussi la boutique et le
 *   compteur de membres, sans raison. Ici, les trois sont TOUJOURS lances,
 *   chacun protege des autres, et un resume final indique qui a echoue.
 *
 * Code de sortie : 0 si tout passe, 1 si au moins un script a echoue
 * (pour que l'echec reste visible dans GitHub Actions ou dans un log).
 * ============================================================================
 */

"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const TASKS = [
  { nom: "Actualites officielles", fichier: "fetch-updates.js" },
  { nom: "Rotation de la boutique", fichier: "fetch-shop.js" },
  { nom: "Membres en ligne", fichier: "fetch-member-count.js" },
];

const resultats = [];

for (const tache of TASKS) {
  const script = path.join(__dirname, tache.fichier);

  /* stdio "inherit" : les logs de chaque script s'affichent normalement. */
  const res = spawnSync(process.execPath, [script], { stdio: "inherit" });

  resultats.push({
    nom: tache.nom,
    ok: res.status === 0,
    /* res.error = le processus n'a meme pas pu demarrer (fichier manquant...) */
    detail: res.error ? res.error.message : "code " + res.status,
  });
}

console.log("\n================ RESUME ================");
for (const r of resultats) {
  console.log((r.ok ? "  OK      " : "  ECHEC   ") + r.nom + (r.ok ? "" : "  (" + r.detail + ")"));
}

const echecs = resultats.filter((r) => !r.ok).length;
if (echecs > 0) {
  console.log(
    "\n" + echecs + " script(s) en echec. Les fichiers JSON correspondants " +
      "n'ont PAS ete modifies : le site affiche toujours les dernieres " +
      "donnees valides."
  );
  process.exitCode = 1;
} else {
  console.log("\nTout est a jour.");
}
