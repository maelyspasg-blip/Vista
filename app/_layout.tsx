import type { Session } from "@supabase/supabase-js";
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import "react-native-gesture-handler";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  AccessibiliteProvider,
  TailleTexte,
  useAccessibilite,
} from "./AccessibiliteContext";
import { GuestBanner } from "./GuestBanner";
import { supabase } from "../supabaseClient";
import "./calendarLocale";
import { getOnboardingVu } from "./onboardingStorage";
import { Theme, ThemeProvider } from "./ThemeContext";

type AccessibiliteInitiale = {
  tailleTexte?: TailleTexte;
  contrasteRenforce?: boolean;
  reduireAnimations?: boolean;
};

function Navigateur({
  session,
  joursRestantsEssai,
}: {
  session: Session | null;
  joursRestantsEssai: number | null;
}) {
  const { reduireAnimations } = useAccessibilite();

  return (
    <>
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
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="profil" />
      </Stack>
      {session?.user.is_anonymous && joursRestantsEssai !== null && (
        <GuestBanner joursRestants={joursRestantsEssai} />
      )}
    </>
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
  const [joursRestantsEssai, setJoursRestantsEssai] = useState<number | null>(
    null,
  );
  const [accessibiliteInitiale, setAccessibiliteInitiale] =
    useState<AccessibiliteInitiale>({});

  useEffect(() => {
    (async () => {
      const [{ data }, vu] = await Promise.all([
        supabase.auth.getSession(),
        getOnboardingVu(),
      ]);
      setOnboardingVu(vu);

      if (data.session) {
        const { data: profil } = await supabase
          .from("profils")
          .select(
            "theme, is_guest, guest_expires_at, taille_texte, contraste_renforce, reduire_animations",
          )
          .eq("user_id", data.session.user.id)
          .single();
        if (profil?.theme === "clair" || profil?.theme === "sombre") {
          setThemeInitial(profil.theme);
        }

        setAccessibiliteInitiale({
          tailleTexte: profil?.taille_texte as TailleTexte | undefined,
          contrasteRenforce: profil?.contraste_renforce ?? undefined,
          reduireAnimations: profil?.reduire_animations ?? undefined,
        });

        if (profil?.is_guest && profil.guest_expires_at) {
          const msRestants =
            new Date(profil.guest_expires_at).getTime() - Date.now();
          if (msRestants <= 0) {
            // Garde-fou côté app : le nettoyage effectif est fait par le
            // cron cleanup-expired-guests, mais on ne laisse pas l'invité
            // voir des données censées être expirées en attendant son passage.
            await supabase.auth.signOut();
            setSession(null);
            setChargement(false);
            return;
          }
          setJoursRestantsEssai(Math.max(1, Math.ceil(msRestants / 86_400_000)));
        }
      }

      setSession(data.session);
      setChargement(false);
    })();

    const { data: abonnement } = supabase.auth.onAuthStateChange(
      (_event, nouvelleSession) => {
        setSession(nouvelleSession);
        if (!nouvelleSession) setJoursRestantsEssai(null);
      },
    );

    return () => abonnement.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (chargement) return;

    const dansOnboarding = segments[0] === "onboarding";
    const dansTabs = segments[0] === "(tabs)" || segments[0] === "profil";
    const surSlides = dansOnboarding && segments.length <= 1;

    if (session) {
      if (dansOnboarding) router.replace("/(tabs)");
    } else if (dansTabs) {
      router.replace("/onboarding/connexion");
    } else if (surSlides && onboardingVu) {
      router.replace("/onboarding/connexion");
    }
  }, [session, chargement, onboardingVu, segments, router]);

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
          <Navigateur session={session} joursRestantsEssai={joursRestantsEssai} />
        </ThemeProvider>
      </AccessibiliteProvider>
    </GestureHandlerRootView>
  );
}
