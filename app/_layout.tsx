import type { Session } from "@supabase/supabase-js";
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import "react-native-gesture-handler";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { supabase } from "../supabaseClient";
import { getOnboardingVu } from "./onboardingStorage";
import { Theme, ThemeProvider } from "./ThemeContext";

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [session, setSession] = useState<Session | null>(null);
  const [onboardingVu, setOnboardingVu] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [themeInitial, setThemeInitial] = useState<Theme | undefined>(
    undefined,
  );

  useEffect(() => {
    (async () => {
      const [{ data }, vu] = await Promise.all([
        supabase.auth.getSession(),
        getOnboardingVu(),
      ]);
      setSession(data.session);
      setOnboardingVu(vu);

      if (data.session) {
        const { data: profil } = await supabase
          .from("profils")
          .select("theme")
          .eq("user_id", data.session.user.id)
          .single();
        if (profil?.theme === "clair" || profil?.theme === "sombre") {
          setThemeInitial(profil.theme);
        }
      }

      setChargement(false);
    })();

    const { data: abonnement } = supabase.auth.onAuthStateChange(
      (_event, nouvelleSession) => {
        setSession(nouvelleSession);
      },
    );

    return () => abonnement.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (chargement) return;

    const dansOnboarding = segments[0] === "onboarding";
    const dansTabs = segments[0] === "(tabs)";
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
      <ThemeProvider themeInitial={themeInitial}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="onboarding/index" />
          <Stack.Screen name="onboarding/inscription" />
          <Stack.Screen name="onboarding/connexion" />
          <Stack.Screen name="onboarding/preferences" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
