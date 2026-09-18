#!/usr/bin/env node

/**
 * Génère le `client_secret` JWT requis par Supabase (Authentication →
 * Providers → Apple → Secret Key) pour Sign in with Apple.
 *
 * RÈGLE À NE JAMAIS CASSER — CE N'EST PAS UN SECRET STATIQUE : contrairement
 * à un client secret classique, Apple exige un JWT signé côté client, valide
 * au maximum 6 mois (~15 777 000 secondes). Ce script en génère un valide
 * 180 jours (`--dureeJours`, marge de sécurité sous la limite Apple) — il
 * faudra le régénérer et le recoller dans Supabase avant expiration, sinon
 * Sign in with Apple recommencera à échouer silencieusement en production
 * (aucune alerte Apple/Supabase n'est envoyée à l'expiration). Note-le dans
 * un rappel calendrier au moment où tu colles le JWT dans le dashboard.
 *
 * RÈGLE À NE JAMAIS CASSER — LE FICHIER .p8 NE DOIT JAMAIS ÊTRE COMMITÉ :
 * `*.p8` et `*.pem` sont déjà dans .gitignore (vérifié) — ce script ne
 * modifie jamais cette protection. Le JWT généré est affiché uniquement sur
 * stdout, jamais écrit dans un fichier par ce script : à copier-coller
 * directement dans Supabase, puis à ne conserver nulle part dans ce repo.
 *
 * Usage :
 *   node scripts/generate_apple_jwt.js --keyId TON_KEY_ID --p8 ./AuthKey_XXXXXXXX.p8 [--dureeJours 180]
 *
 * Team ID (AWVLF299UX) et Client ID (com.maelyspasgvista.vista) sont ceux du
 * projet Vista (cf. CLAUDE.md) — fixes, pas besoin de les passer en argument
 * sauf cas exceptionnel (--teamId / --clientId disponibles si besoin).
 */

const fs = require("fs");
const path = require("path");

let jwt;
try {
  jwt = require("jsonwebtoken");
} catch {
  console.error(
    "Le paquet 'jsonwebtoken' n'est pas installé. Lance d'abord :\n" +
      "  npm install --save-dev jsonwebtoken\n",
  );
  process.exit(1);
}

const TEAM_ID_PAR_DEFAUT = "AWVLF299UX";
const CLIENT_ID_PAR_DEFAUT = "com.maelyspasgvista.vista";
const DUREE_JOURS_PAR_DEFAUT = 180; // Apple : maximum 6 mois (~183 jours)

function lireArguments(argv) {
  const args = { teamId: TEAM_ID_PAR_DEFAUT, clientId: CLIENT_ID_PAR_DEFAUT, dureeJours: DUREE_JOURS_PAR_DEFAUT };
  for (let i = 0; i < argv.length; i += 1) {
    const cle = argv[i];
    const valeur = argv[i + 1];
    switch (cle) {
      case "--keyId":
        args.keyId = valeur;
        i += 1;
        break;
      case "--p8":
        args.p8 = valeur;
        i += 1;
        break;
      case "--teamId":
        args.teamId = valeur;
        i += 1;
        break;
      case "--clientId":
        args.clientId = valeur;
        i += 1;
        break;
      case "--dureeJours":
        args.dureeJours = Number(valeur);
        i += 1;
        break;
      default:
        console.error(`Argument inconnu : ${cle}`);
        process.exit(1);
    }
  }
  return args;
}

function afficherUsageEtQuitter(message) {
  if (message) console.error(`${message}\n`);
  console.error(
    "Usage :\n" +
      "  node scripts/generate_apple_jwt.js --keyId TON_KEY_ID --p8 ./AuthKey_XXXXXXXX.p8 [--dureeJours 180]\n\n" +
      "  --keyId       Key ID noté lors de la création de la clé sur developer.apple.com (obligatoire)\n" +
      "  --p8          Chemin vers le fichier AuthKey_XXXXXXXX.p8 téléchargé sur developer.apple.com (obligatoire)\n" +
      "  --dureeJours  Durée de validité du JWT en jours (défaut : 180, maximum autorisé par Apple : ~183)\n" +
      "  --teamId      Team ID Apple (défaut : " + TEAM_ID_PAR_DEFAUT + ")\n" +
      "  --clientId    Client ID / Bundle ID iOS (défaut : " + CLIENT_ID_PAR_DEFAUT + ")\n",
  );
  process.exit(1);
}

const args = lireArguments(process.argv.slice(2));

if (!args.keyId) {
  afficherUsageEtQuitter("--keyId manquant.");
}
if (!args.p8) {
  afficherUsageEtQuitter("--p8 manquant (chemin vers le fichier AuthKey_XXXXXXXX.p8).");
}
if (!Number.isFinite(args.dureeJours) || args.dureeJours <= 0) {
  afficherUsageEtQuitter("--dureeJours doit être un nombre de jours positif.");
}
if (args.dureeJours > 183) {
  afficherUsageEtQuitter(
    `--dureeJours (${args.dureeJours}) dépasse la limite Apple (~183 jours / 6 mois) — le JWT serait rejeté.`,
  );
}

const cheminP8 = path.resolve(process.cwd(), args.p8);
if (!fs.existsSync(cheminP8)) {
  afficherUsageEtQuitter(`Fichier introuvable : ${cheminP8}`);
}

const clePrivee = fs.readFileSync(cheminP8);

let token;
try {
  token = jwt.sign({}, clePrivee, {
    algorithm: "ES256",
    expiresIn: `${args.dureeJours}d`,
    audience: "https://appleid.apple.com",
    issuer: args.teamId,
    subject: args.clientId,
    keyid: args.keyId,
  });
} catch (e) {
  console.error("Échec de la génération du JWT :", e instanceof Error ? e.message : e);
  console.error(
    "Vérifie que le fichier .p8 est bien la clé privée ES256 téléchargée sur developer.apple.com " +
      "(elle ne se télécharge qu'une seule fois — si perdue, il faut en créer une nouvelle).",
  );
  process.exit(1);
}

console.log(token);
console.error(
  `\n(Team ID: ${args.teamId} · Client ID: ${args.clientId} · Key ID: ${args.keyId} · ` +
    `valide ${args.dureeJours} jours à partir de maintenant)\n` +
    "À coller dans Supabase → Authentication → Providers → Apple → Secret Key. " +
    "Ne commite jamais ce JWT ni le fichier .p8 dans ce repo.",
);
