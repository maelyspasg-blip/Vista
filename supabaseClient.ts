import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";

// RÈGLE À NE JAMAIS CASSER — ÉCHEC EXPLICITE SI VARIABLE MANQUANTE (bug
// trouvé le 2026-09-14) : createClient(undefined, undefined, ...) plus bas
// throw déjà en interne si l'URL est invalide, mais SANS dire POURQUOI ni
// QUELLE variable manque — et comme ce fichier est importé très tôt (avant
// le montage de React, donc hors de portée de tout ErrorBoundary), ce
// throw silencieux dans un bundle release (preview/production, sans
// overlay d'erreur JS) est INDISCERNABLE d'un crash natif au démarrage.
// C'est exactement ce qui s'est produit : l'environnement EAS "preview"
// n'avait aucune variable configurée (seul "production" les avait), et le
// crash qui en a résulté a été pris pendant des jours pour un crash natif
// AdMob/widgets — aucun des deux n'était en cause. Ces 2 vérifications
// explicites, AVANT tout appel à createClient, remplacent un échec muet
// par un message qui nomme la variable manquante et le geste correctif
// (vérifier les variables EAS pour l'environnement du build), quel que
// soit l'environnement futur qui pourrait un jour se retrouver dans le
// même état.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error(
    "[Vista] EXPO_PUBLIC_SUPABASE_URL manquante — vérifier les variables EAS pour cet environnement",
  );
}
if (!supabaseAnonKey) {
  throw new Error(
    "[Vista] EXPO_PUBLIC_SUPABASE_ANON_KEY manquante — vérifier les variables EAS pour cet environnement",
  );
}

// Sur le rendu web côté serveur (SSR d'Expo Router), `window` n'existe pas
// encore : AsyncStorage (qui s'appuie sur window.localStorage sur web)
// planterait dès l'initialisation du client Supabase. On bascule sur un
// stockage no-op le temps du SSR ; le vrai storage prend le relais une fois
// hydraté dans le navigateur.
const storageServeurSSR = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

const storage =
  Platform.OS === "web" && typeof window === "undefined"
    ? storageServeurSSR
    : AsyncStorage;

// RÈGLE À NE JAMAIS CASSER — TIMEOUT RÉSEAU GLOBAL, PAS PAR APPEL : sans
// ça, un réseau instable (mobile en particulier) peut laisser un appel
// Supabase (auth, table, storage) pendre indéfiniment, bloquant l'UI qui
// attend son `.then()`/`await` sans jamais recevoir d'erreur à afficher.
// Passer par `global.fetch` (plutôt que d'ajouter un timeout à chaque site
// d'appel dans store.ts) couvre TOUS les appels du client Supabase — REST
// ET auth — en un seul endroit, sans toucher à leur signature. 20s est
// largement au-dessus du temps normal d'un appel (habituellement < 1s) :
// aucun impact sur les flux qui fonctionnent déjà, seuls les appels
// réellement bloqués reçoivent enfin une erreur au lieu d'attendre à
// l'infini.
const TIMEOUT_RESEAU_MS = 20000;

function fetchAvecTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (init?.signal) return fetch(input, init);
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), TIMEOUT_RESEAU_MS);
  return fetch(input, { ...init, signal: controleur.signal }).finally(() =>
    clearTimeout(minuteur),
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: fetchAvecTimeout,
  },
});
