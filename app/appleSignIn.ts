import * as AppleAuthentication from "expo-apple-authentication";
import { supabase } from "../supabaseClient";
import { messageErreurAuth } from "./authErrors";

// RÈGLE À NE JAMAIS CASSER — SOURCE UNIQUE POUR "SE CONNECTER AVEC APPLE"
// DANS TOUTE L'APP (ajouté le 2026-09-18, demande explicite) : utilisé par
// app/onboarding/connexion.tsx ET app/onboarding/inscription.tsx — jamais
// dupliqué. Le flux est strictement le même dans les deux écrans (Apple ne
// distingue pas "connexion" de "inscription", `signInWithIdToken` crée le
// compte Supabase à la première authentification et réutilise le même à
// chaque fois ensuite) — un seul point à faire évoluer.
//
// RÈGLE — CRÉATION DU PROFIL À LA PREMIÈRE CONNEXION : aucun code ici ne
// crée la ligne `profils` explicitement — ce projet a déjà un trigger sur
// `auth.users` (non versionné dans ce repo, créé hors bande dans le
// dashboard Supabase, cf. RÈGLE détaillée dans
// supabase/migrations/20260722100100_guest_mode_triggers.sql) qui crée
// cette ligne pour TOUTE nouvelle ligne `auth.users`, quel que soit le
// fournisseur d'authentification — exactement le même mécanisme dont
// dépend déjà l'inscription par email (app/onboarding/inscription.tsx
// n'insère jamais non plus de ligne `profils` elle-même). Le routage
// post-connexion (onboarding si `profils.onboarding_complete` est faux,
// sinon `(tabs)` directement) est déjà géré globalement par
// app/_layout.tsx — chaque écran appelant n'a donc qu'à naviguer vers
// "/(tabs)" après un succès, cf. RÈGLE sur connecterAvecApple ci-dessous.
//
// RÈGLE À NE JAMAIS CASSER — CONFIGURATION DASHBOARD REQUISE, HORS DE
// PORTÉE DE CET ENVIRONNEMENT : `supabase.auth.signInWithIdToken({provider:
// "apple", ...})` échoue tant qu'Apple n'est pas activé comme fournisseur
// OAuth dans Authentication → Providers du dashboard Supabase (Bundle ID
// iOS `com.maelyspasgvista.vista` comme "Client ID" pour le flux natif) —
// aucun accès CLI/dashboard Supabase depuis cet environnement pour le
// faire. Ce correctif reste donc INERTE (bouton affiché mais toute
// tentative échoue proprement avec un message d'erreur) tant que cette
// configuration manuelle n'a pas été faite.
export type ResultatConnexionApple =
  | { succes: true }
  | { succes: false; annule: boolean; message?: string };

export async function connecterAvecApple(): Promise<ResultatConnexionApple> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential.identityToken) {
      return {
        succes: false,
        annule: false,
        message: "Apple n'a pas renvoyé de jeton d'authentification. Réessaie.",
      };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
    });

    if (error) {
      console.error("[appleSignIn] signInWithIdToken a échoué :", error);
      return {
        succes: false,
        annule: false,
        message: messageErreurAuth(error.message),
      };
    }

    // RÈGLE : Apple ne renvoie fullName/email QUE lors de la toute première
    // autorisation de cette app par cet utilisateur (jamais ensuite, même
    // en cas de reconnexion) — capturé ici en best-effort si présent,
    // jamais bloquant si absent (le profil créé par le trigger reste
    // valide sans prénom, exactement comme une inscription par email
    // classique qui ne demande pas non plus de prénom). Même geste
    // qu'app/onboarding/invite.tsx (UPDATE direct sur profils juste après
    // la connexion), pas objStore.modifierPrenom : ces écrans sont
    // pré-authentification, avant que le store principal ne soit monté.
    const prenom = credential.fullName?.givenName?.trim();
    if (prenom && data.user) {
      supabase
        .from("profils")
        .update({ prenom })
        .eq("user_id", data.user.id)
        .then(({ error: erreurPrenom }) => {
          if (erreurPrenom) {
            console.error(
              "[appleSignIn] Mise à jour du prénom depuis Apple a échoué :",
              erreurPrenom,
            );
          }
        });
    }

    return { succes: true };
  } catch (e) {
    // RÈGLE À NE JAMAIS CASSER — ANNULATION SILENCIEUSE, JAMAIS UNE ERREUR :
    // l'utilisateur qui ferme la feuille native Apple (bouton retour,
    // tap en dehors) déclenche ERR_REQUEST_CANCELED — un comportement
    // normal et fréquent, jamais à afficher comme une erreur rouge.
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code?: unknown }).code === "ERR_REQUEST_CANCELED"
    ) {
      return { succes: false, annule: true };
    }
    console.error("[appleSignIn] connecterAvecApple a échoué :", e);
    return {
      succes: false,
      annule: false,
      message: "Une erreur est survenue. Réessaie.",
    };
  }
}
