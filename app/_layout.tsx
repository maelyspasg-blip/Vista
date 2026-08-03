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
  const dernierUserIdRef = useRef<string | null>(null);

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
            "theme, is_guest, guest_expires_at, taille_texte, contraste_renforce, reduire_animations, onboarding_complete",
          )
          .eq("user_id", data.session.user.id)
          .single();
        setOnboardingComplete(profil?.onboarding_complete ?? true);
        if (profil?.theme === "clair" || profil?.theme === "sombre") {
          setThemeInitial(profil.theme);
        }

        setAccessibiliteInitiale({
          tailleTexte: profil?.taille_texte as TailleTexte | undefined,
          contrasteRenforce: profil?.contraste_renforce ?? undefined,
          reduireAnimations: profil?.reduire_animations ?? undefined,
        });

        if (profil?.is_guest && profil.guest_expires_at) {
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
          .select("onboarding_complete, is_guest, guest_expires_at")
          .eq("user_id", nouvelleSession.user.id)
          .single()
          .then(({ data: profil }) => {
            setOnboardingComplete(profil?.onboarding_complete ?? true);
            setIsGuest(!!profil?.is_guest);
            setGuestExpiresAt(profil?.is_guest ? profil.guest_expires_at : null);
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
            <Navigateur />
          </GuestContext.Provider>
        </ThemeProvider>
      </AccessibiliteProvider>
    </GestureHandlerRootView>
  );
}
