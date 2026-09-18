import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { supabase } from "../supabaseClient";
import { messageErreurAuth } from "./authErrors";

// RÈGLE À NE JAMAIS CASSER — SOURCE UNIQUE POUR "SE CONNECTER AVEC GOOGLE"
// DANS TOUTE L'APP (ajouté le 2026-09-18, demande explicite) : utilisé par
// app/onboarding/connexion.tsx ET app/onboarding/inscription.tsx — jamais
// dupliqué, même pattern qu'app/appleSignIn.ts (même mécanisme de création
// de profil à la première connexion via le trigger existant sur
// `auth.users`, même routage global post-connexion par app/_layout.tsx —
// chaque écran appelant navigue vers "/(tabs)" après un succès, jamais de
// logique de routage ici).
//
// RÈGLE À NE JAMAIS CASSER — IOS UNIQUEMENT POUR L'INSTANT : seul un Client
// ID iOS a été fourni (Google Cloud Console, OAuth 2.0 Client IDs). Android
// nécessiterait un Client ID distinct (Web Client ID / `webClientId`, utilisé
// aussi bien pour produire un idToken valide sur Android que comme
// "Authorized Client ID" côté Supabase) — non fourni, donc pas configuré.
// Les écrans appelants gated ce bouton par `Platform.OS === "ios"` : ne
// jamais l'activer sur Android sans configurer un `webClientId` d'abord
// (l'appel échouerait proprement, mais autant ne pas afficher un bouton
// non fonctionnel).
//
// RÈGLE À NE JAMAIS CASSER — CONFIGURATION DASHBOARD REQUISE, HORS DE
// PORTÉE DE CET ENVIRONNEMENT : `supabase.auth.signInWithIdToken({provider:
// "google", ...})` échoue tant que Google n'est pas activé comme
// fournisseur OAuth dans Authentication → Providers du dashboard Supabase,
// avec ce Client ID iOS ajouté à la liste "Authorized Client IDs" — aucun
// accès CLI/dashboard Supabase depuis cet environnement pour le faire. Ce
// correctif reste donc INERTE (bouton affiché mais toute tentative échoue
// proprement avec un message d'erreur) tant que cette configuration
// manuelle n'a pas été faite — même limite que Sign in with Apple.
//
// Pas de fichier GoogleService-Info.plist dans ce repo : le plugin Expo de
// ce package a deux modes (cf. node_modules/@react-native-google-signin/
// google-signin/plugin/build/withGoogleSignIn.js) — avec un fichier Firebase
// complet (API_KEY/GCM_SENDER_ID/PROJECT_ID…), ou sans Firebase via
// `iosUrlScheme` seul (juste le schéma d'URL de redirection OAuth injecté
// dans Info.plist). Le fichier .plist fourni par Maëlys est un export Google
// Cloud Console minimal (CLIENT_ID/REVERSED_CLIENT_ID/BUNDLE_ID seulement,
// pas un vrai GoogleService-Info.plist Firebase) — le copier tel quel et
// activer le mode Firebase du plugin aurait échoué (clés manquantes). Le
// mode `iosUrlScheme` (app.json) est donc le bon choix ici, pas un
// contournement : aucun fichier .plist à committer, `iosClientId` seul
// (configure() ci-dessous) suffit à produire un idToken valide.
const GOOGLE_IOS_CLIENT_ID =
  "834270415111-4cjeb5ftski3h5cdmdg61c8rpcm5nuif.apps.googleusercontent.com";

GoogleSignin.configure({
  iosClientId: GOOGLE_IOS_CLIENT_ID,
});

export type ResultatConnexionGoogle =
  | { succes: true }
  | { succes: false; annule: boolean; message?: string };

export async function connecterAvecGoogle(): Promise<ResultatConnexionGoogle> {
  try {
    // RÈGLE : hasPlayServices() est un no-op qui renvoie toujours `true` sur
    // iOS (vérifié dans le code source du package) — jamais bloquant ici,
    // gardé uniquement parce que c'est l'appel attendu avant signIn().
    await GoogleSignin.hasPlayServices();
    const reponse = await GoogleSignin.signIn();

    // RÈGLE À NE JAMAIS CASSER — ANNULATION SILENCIEUSE, JAMAIS UNE ERREUR :
    // contrairement à Apple (qui rejette la promesse avec un code
    // d'erreur), signIn() de ce package intercepte déjà l'annulation
    // native et résout avec `{type: "cancelled", data: null}` — jamais une
    // exception. L'utilisateur qui ferme la feuille Google ne doit jamais
    // voir de message rouge.
    if (reponse.type === "cancelled") {
      return { succes: false, annule: true };
    }

    const idToken = reponse.data.idToken;
    if (!idToken) {
      return {
        succes: false,
        annule: false,
        message: "Google n'a pas renvoyé de jeton d'authentification. Réessaie.",
      };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: idToken,
    });

    if (error) {
      console.error("[googleSignIn] signInWithIdToken a échoué :", error);
      return {
        succes: false,
        annule: false,
        message: messageErreurAuth(error.message),
      };
    }

    // RÈGLE : contrairement à Apple (fullName fourni uniquement à la toute
    // première autorisation), Google renvoie le prénom à chaque connexion —
    // capturé ici en best-effort à chaque fois, jamais bloquant si l'écriture
    // échoue. Même geste qu'app/appleSignIn.ts (UPDATE direct sur profils,
    // pas objStore.modifierPrenom : écran pré-authentification).
    const prenom = reponse.data.user.givenName?.trim();
    if (prenom && data.user) {
      supabase
        .from("profils")
        .update({ prenom })
        .eq("user_id", data.user.id)
        .then(({ error: erreurPrenom }) => {
          if (erreurPrenom) {
            console.error(
              "[googleSignIn] Mise à jour du prénom depuis Google a échoué :",
              erreurPrenom,
            );
          }
        });
    }

    return { succes: true };
  } catch (e) {
    console.error("[googleSignIn] connecterAvecGoogle a échoué :", e);
    return {
      succes: false,
      annule: false,
      message: "Une erreur est survenue. Réessaie.",
    };
  }
}
