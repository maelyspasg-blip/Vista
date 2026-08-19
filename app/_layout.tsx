import type { Session } from "@supabase/supabase-js";
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, View } from "react-native";
import "react-native-gesture-handler";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  AccessibiliteProvider,
  TailleTexte,
  useAccessibilite,
} from "./AccessibiliteContext";
import { GuestContext } from "./GuestContext";
import { supabase } from "../supabaseClient";
import "./calendarLocale";
import { ecouterOnboardingTermine } from "./onboardingCompletion";
import { getOnboardingVu } from "./onboardingStorage";
import { Theme, ThemeProvider } from "./ThemeContext";
import { PageTutoriel, TutorielContext, TutorielStatus } from "./TutorielContext";

const COLONNES_TUTORIEL: Record<PageTutoriel, string> = {
  apercu: "tutoriel_apercu_vu",
  budget: "tutoriel_budget_vu",
  planning: "tutoriel_planning_vu",
  stats: "tutoriel_stats_vu",
};

const INTERVALLE_VERIFICATION_ESSAI_MS = 60000;

type AccessibiliteInitiale = {
  tailleTexte?: TailleTexte;
  contrasteRenforce?: boolean;
  reduireAnimations?: boolean;
};

function Navigateur() {
  const { reduireAnimations } = useAccessibilite();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: reduireAnimations ? "none" : "default",
      }}
    >
      <Stack.Screen name="onboarding/index" />
      <Stack.Screen name="onboarding/inscription" />
      <Stack.Screen name="onboarding/connexion" />
      <Stack.Screen name="onboarding/invite" />
      <Stack.Screen name="onboarding/preferences" />
      <Stack.Screen name="onboarding/essai-expire" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="profil" />
    </Stack>
  );
}

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [session, setSession] = useState<Session | null>(null);
  const [onboardingVu, setOnboardingVu] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [themeInitial, setThemeInitial] = useState<Theme | undefined>(
    undefined,
  );
  const [accessibiliteInitiale, setAccessibiliteInitiale] =
    useState<AccessibiliteInitiale>({});
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(
    null,
  );
  const [isGuest, setIsGuest] = useState(false);
  const [guestExpiresAt, setGuestExpiresAt] = useState<string | null>(null);
  const [msRestantsEssai, setMsRestantsEssai] = useState<number | null>(null);
  const [estGuestExpire, setEstGuestExpire] = useState(false);
  const [tutoriel, setTutoriel] = useState<
    Omit<TutorielStatus, "marquerVu" | "reinitialiser">
  >({
    apercu: true,
    budget: true,
    planning: true,
    stats: true,
  });
  const dernierUserIdRef = useRef<string | null>(null);

  const marquerTutorielVu = (page: PageTutoriel) => {
    setTutoriel((t) => ({ ...t, [page]: true }));
    const userId = dernierUserIdRef.current;
    if (!userId) return;
    supabase
      .from("profils")
      .update({ [COLONNES_TUTORIEL[page]]: true })
      .eq("user_id", userId)
      .then(({ error }) => {
        if (error) console.error("Supabase update tutoriel a échoué :", error);
      });
  };

  // RÈGLE À NE JAMAIS CASSER : "Revoir le tutoriel" (profil.tsx) doit
  // remettre les 4 flags à false À LA FOIS en local (setTutoriel, pour que
  // l'UI reflète le changement immédiatement, sans attendre un aller-retour
  // réseau) ET côté Supabase (pour que ça survive à un refresh/reconnexion).
  // Les deux updates ci-dessous doivent toujours porter sur les 4 mêmes
  // pages — en ajouter une cinquième (nouvelle page avec tutoriel) sans
  // l'ajouter ICI AUSSI la laisserait invisible à "Revoir le tutoriel".
  const reinitialiserTutoriel = () => {
    setTutoriel({ apercu: false, budget: false, planning: false, stats: false });
    const userId = dernierUserIdRef.current;
    if (!userId) return;
    supabase
      .from("profils")
      .update({
        tutoriel_apercu_vu: false,
        tutoriel_budget_vu: false,
        tutoriel_planning_vu: false,
        tutoriel_stats_vu: false,
      })
      .eq("user_id", userId)
      .then(({ error }) => {
        if (error) console.error("Supabase update tutoriel a échoué :", error);
      });
  };

  useEffect(() => {
    (async () => {
      const [{ data }, vu] = await Promise.all([
        supabase.auth.getSession(),
        getOnboardingVu(),
      ]);
      setOnboardingVu(vu);

      if (data.session) {
        dernierUserIdRef.current = data.session.user.id;
        const { data: profil } = await supabase
          .from("profils")
          .select(
            "theme, is_guest, guest_expires_at, taille_texte, contraste_renforce, reduire_animations, onboarding_complete, is_admin, tutoriel_apercu_vu, tutoriel_budget_vu, tutoriel_planning_vu, tutoriel_stats_vu",
          )
          .eq("user_id", data.session.user.id)
          .single();
        setOnboardingComplete(profil?.onboarding_complete ?? true);
        setTutoriel({
          apercu: profil?.tutoriel_apercu_vu ?? true,
          budget: profil?.tutoriel_budget_vu ?? true,
          planning: profil?.tutoriel_planning_vu ?? true,
          stats: profil?.tutoriel_stats_vu ?? true,
        });
        if (profil?.theme === "clair" || profil?.theme === "sombre") {
          setThemeInitial(profil.theme);
        }

        setAccessibiliteInitiale({
          tailleTexte: profil?.taille_texte as TailleTexte | undefined,
          contrasteRenforce: profil?.contraste_renforce ?? undefined,
          reduireAnimations: profil?.reduire_animations ?? undefined,
        });

        // !profil.is_admin : un admin n'est jamais traité comme invité
        // restreint (pas de bannière d'essai, pas d'expiration forcée),
        // même si is_guest est techniquement vrai en base.
        if (profil?.is_guest && profil.guest_expires_at && !profil.is_admin) {
          setIsGuest(true);
          setGuestExpiresAt(profil.guest_expires_at);
          const msRestants =
            new Date(profil.guest_expires_at).getTime() - Date.now();
          if (msRestants <= 0) {
            // Garde-fou côté app : le nettoyage effectif est fait par le
            // cron cleanup-expired-guests, mais on ne laisse pas l'invité
            // voir des données censées être expirées en attendant son passage.
            // L'effet de redirection ci-dessous s'occupe de l'écran affiché
            // (essai-expire), une fois estGuestExpire posé à true.
            await supabase.auth.signOut();
            setSession(null);
            setOnboardingComplete(null);
            setEstGuestExpire(true);
            dernierUserIdRef.current = null;
            setChargement(false);
            return;
          }
        }
      }

      setSession(data.session);
      setChargement(false);
    })();

    // preferences.tsx écrit onboarding_complete directement en base à la fin
    // du questionnaire ; sans ce pont, cette copie locale ne l'apprendrait
    // jamais, et l'effet de redirection ci-dessous renverrait indéfiniment
    // vers /onboarding/preferences (boucle infinie).
    ecouterOnboardingTermine(() => setOnboardingComplete(true));

    const { data: abonnement } = supabase.auth.onAuthStateChange(
      (_event, nouvelleSession) => {
        setSession(nouvelleSession);
        if (!nouvelleSession) {
          setIsGuest(false);
          setGuestExpiresAt(null);
          setMsRestantsEssai(null);
          setOnboardingComplete(null);
          dernierUserIdRef.current = null;
          // estGuestExpire n'est volontairement pas remis à false ici : une
          // déconnexion peut survenir précisément parce que l'essai vient
          // d'expirer (cf. l'effet de recheck plus bas), et l'effet de
          // redirection a besoin de ce flag pour router vers essai-expire
          // au lieu de connexion.
          return;
        }
        // Ne re-fetch que si l'utilisateur a réellement changé (nouvelle
        // inscription/connexion) — un simple refresh de token sur le même
        // utilisateur ne doit pas redéclencher ces appels.
        if (nouvelleSession.user.id === dernierUserIdRef.current) return;
        dernierUserIdRef.current = nouvelleSession.user.id;
        setOnboardingComplete(null);
        setEstGuestExpire(false);
        supabase
          .from("profils")
          .select(
            "onboarding_complete, is_guest, guest_expires_at, is_admin, tutoriel_apercu_vu, tutoriel_budget_vu, tutoriel_planning_vu, tutoriel_stats_vu",
          )
          .eq("user_id", nouvelleSession.user.id)
          .single()
          .then(({ data: profil }) => {
            setOnboardingComplete(profil?.onboarding_complete ?? true);
            // Un admin n'est jamais traité comme invité restreint, même si
            // is_guest est techniquement vrai en base : bannière d'essai,
            // flou des stats et expiration forcée en dépendent tous via cet
            // état, donc c'est le point unique à corriger ici plutôt que de
            // dupliquer la condition à chaque consommateur.
            setIsGuest(!!profil?.is_guest && !profil?.is_admin);
            setGuestExpiresAt(
              profil?.is_guest && !profil?.is_admin
                ? profil.guest_expires_at
                : null,
            );
            setTutoriel({
              apercu: profil?.tutoriel_apercu_vu ?? true,
              budget: profil?.tutoriel_budget_vu ?? true,
              planning: profil?.tutoriel_planning_vu ?? true,
              stats: profil?.tutoriel_stats_vu ?? true,
            });
          });
      },
    );

    return () => {
      ecouterOnboardingTermine(null);
      abonnement.subscription.unsubscribe();
    };
  }, []);

  // Recalcule le temps restant de l'essai régulièrement pendant que l'app
  // reste ouverte (sinon seul le montage initial le connaît, cf. bug où
  // l'expiration n'était détectée qu'au redémarrage de l'app) — même
  // mécanique (interval + retour au premier plan) que app/(tabs)/_layout.tsx.
  useEffect(() => {
    if (!isGuest || !guestExpiresAt) return;

    const verifierExpirationEssai = () => {
      const ms = new Date(guestExpiresAt).getTime() - Date.now();
      setMsRestantsEssai(ms);
      if (ms <= 0) {
        setEstGuestExpire(true);
        supabase.auth.signOut();
      }
    };

    verifierExpirationEssai();
    const intervalle = setInterval(
      verifierExpirationEssai,
      INTERVALLE_VERIFICATION_ESSAI_MS,
    );
    const abonnement = AppState.addEventListener("change", (etatApp) => {
      if (etatApp === "active") verifierExpirationEssai();
    });

    return () => {
      clearInterval(intervalle);
      abonnement.remove();
    };
  }, [isGuest, guestExpiresAt]);

  useEffect(() => {
    if (chargement) return;

    const dansOnboarding = segments[0] === "onboarding";
    const dansPreferences = dansOnboarding && segments[1] === "preferences";
    const dansEssaiExpire = dansOnboarding && segments[1] === "essai-expire";
    const dansTabs = segments[0] === "(tabs)" || segments[0] === "profil";
    const surSlides = dansOnboarding && segments.length <= 1;

    if (estGuestExpire) {
      // Prioritaire sur tout le reste : l'essai expiré doit bloquer l'accès
      // quel que soit l'écran courant, pas seulement (tabs).
      if (!dansEssaiExpire) router.replace("/onboarding/essai-expire");
    } else if (session) {
      // Le fetch de onboarding_complete pour cet utilisateur est en cours
      // (juste après une inscription/connexion) : on ne prend aucune
      // décision de redirection tant qu'on ne connaît pas sa vraie valeur,
      // pour ne jamais court-circuiter la navigation explicite de l'écran
      // appelant (inscription.tsx, connexion.tsx) avec une valeur inconnue.
      if (onboardingComplete === null) return;
      if (!onboardingComplete) {
        if (!dansPreferences) router.replace("/onboarding/preferences");
      } else if (dansOnboarding) {
        router.replace("/(tabs)");
      }
    } else if (dansTabs) {
      router.replace("/onboarding/connexion");
    } else if (surSlides && onboardingVu) {
      router.replace("/onboarding/connexion");
    }
  }, [
    session,
    chargement,
    onboardingVu,
    onboardingComplete,
    estGuestExpire,
    segments,
    router,
  ]);

  if (chargement) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AccessibiliteProvider initial={accessibiliteInitiale}>
        <ThemeProvider themeInitial={themeInitial}>
          <GuestContext.Provider value={{ isGuest, msRestants: msRestantsEssai }}>
            <TutorielContext.Provider
              value={{
                ...tutoriel,
                marquerVu: marquerTutorielVu,
                reinitialiser: reinitialiserTutoriel,
              }}
            >
              <Navigateur />
            </TutorielContext.Provider>
          </GuestContext.Provider>
        </ThemeProvider>
      </AccessibiliteProvider>
    </GestureHandlerRootView>
  );
}
