import type { Session } from "@supabase/supabase-js";
import { Stack, useRouter, useSegments } from "expo-router";
import * as ExpoSplashScreen from "expo-splash-screen";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Animated, StyleSheet } from "react-native";
import "react-native-gesture-handler";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  AccessibiliteProvider,
  TailleTexte,
  useAccessibilite,
} from "./AccessibiliteContext";
import { EspacePartageProvider } from "./EspacePartageContext";
import { GuestContext } from "./GuestContext";
import { JoursFeriesProvider } from "./JoursFeriesContext";
import { PremiumProvider } from "./PremiumContext";
import { supabase } from "../supabaseClient";
import { ESPACE_PARTAGE_ACTIF } from "../utils/premium";
import { reinitialiserEtatUtilisateur } from "./store";
import "./calendarLocale";
import { ecouterOnboardingTermine } from "./onboardingCompletion";
import { getOnboardingVu } from "./onboardingStorage";
import { SplashScreen } from "./SplashScreen";
import { Theme, ThemeProvider } from "./ThemeContext";
import { getThemeCache, setThemeCache } from "./themeStorage";
import { PageTutoriel, TutorielContext, TutorielStatus } from "./TutorielContext";

// RÈGLE À NE JAMAIS CASSER — COORDINATION SPLASH NATIF → SPLASH JS : appelé
// au chargement du module (avant le premier rendu), pas dans un effet —
// sinon le splash natif (app.json, expo-splash-screen plugin) risque de
// disparaître tout seul avant que notre splash JS (SplashScreen.tsx) soit
// prêt à prendre le relais, laissant un flash d'écran blanc/noir natif nu.
ExpoSplashScreen.preventAutoHideAsync().catch(() => {});

const DUREE_MIN_SPLASH_MS = 1000;
const DUREE_FADE_SPLASH_MS = 300;

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
  // RÈGLE : thème utilisé PAR LE SPLASH uniquement, distinct de
  // `themeInitial` (celui de ThemeProvider) — lu depuis le cache local
  // AsyncStorage, disponible avant même la réponse Supabase (cf. RÈGLE dans
  // app/themeStorage.ts). `null` tant qu'il n'a pas encore été lu (repli sur
  // useColorScheme() dans SplashScreen.tsx, cf. RÈGLE là-bas).
  const [themeSplash, setThemeSplash] = useState<Theme | null>(null);
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
  // RÈGLE À NE JAMAIS CASSER — SPLASH JS, DURÉE MINIMUM + FADE : `instantMontage`
  // fige l'instant du tout premier rendu (initialiseur paresseux useState,
  // jamais recalculé — Date.now() directement dans le corps du composant
  // serait réévalué à CHAQUE rendu, une fonction impure interdite pendant
  // le rendu par le React Compiler) pour garantir DUREE_MIN_SPLASH_MS de
  // splash même si le chargement Supabase est instantané — jamais un flash
  // trop rapide. `opaciteSplash` : useMemo (pas useRef().current, lui aussi
  // interdit en lecture pendant le rendu par le React Compiler), même
  // pattern que l'Animated.Value stable de GraphiqueFlux.tsx. `splashVisible`
  // reste vrai pendant tout le fondu (l'écran réel est déjà monté DESSOUS,
  // superposé par le splash en `position: absolute`, jamais un fondu vers
  // du vide) ; passe à `false` seulement une fois l'animation terminée, pour
  // démonter l'overlay et ne plus jamais bloquer les interactions.
  const [instantMontage] = useState(() => Date.now());
  const [splashVisible, setSplashVisible] = useState(true);
  const opaciteSplash = useMemo(() => new Animated.Value(1), []);

  useEffect(() => {
    // Une fois le premier rendu JS (notre splash) commis, on masque le
    // splash NATIF pour révéler celui-ci — jamais l'inverse (cf. RÈGLE
    // preventAutoHideAsync en tête de fichier).
    ExpoSplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (chargement) return;
    const ecoule = Date.now() - instantMontage;
    const attente = Math.max(0, DUREE_MIN_SPLASH_MS - ecoule);
    const delai = setTimeout(() => {
      Animated.timing(opaciteSplash, {
        toValue: 0,
        duration: DUREE_FADE_SPLASH_MS,
        useNativeDriver: true,
      }).start(() => setSplashVisible(false));
    }, attente);
    return () => clearTimeout(delai);
  }, [chargement, opaciteSplash, instantMontage]);

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
      // RÈGLE : lu EN PARALLÈLE du reste, jamais après — c'est ce qui permet
      // au splash JS d'afficher la bonne couleur dès le premier rendu, sans
      // attendre la requête réseau vers `profils` (cf. RÈGLE dans
      // app/themeStorage.ts).
      const [{ data }, vu, themeCache] = await Promise.all([
        supabase.auth.getSession(),
        getOnboardingVu(),
        getThemeCache(),
      ]);
      setOnboardingVu(vu);
      setThemeSplash(themeCache);

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
          // RÈGLE : rafraîchit le cache local à chaque chargement de profil
          // (pas seulement à la bascule manuelle, cf. ThemeContext.tsx) —
          // pour que le PROCHAIN lancement affiche la bonne couleur même si
          // le thème a été changé depuis un autre appareil.
          setThemeSplash(profil.theme);
          setThemeCache(profil.theme);
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
            reinitialiserEtatUtilisateur();
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
      (event, nouvelleSession) => {
        setSession(nouvelleSession);
        if (!nouvelleSession) {
          setIsGuest(false);
          setGuestExpiresAt(null);
          setMsRestantsEssai(null);
          setOnboardingComplete(null);
          dernierUserIdRef.current = null;
          // RÈGLE À NE JAMAIS CASSER — PROTECTION CONTRE LES DONNÉES QUI
          // FUITENT D'UN COMPTE À L'AUTRE : cf. RÈGLE détaillée sur
          // reinitialiserEtatUtilisateur dans app/store.ts. Le listener
          // interne de store.ts fait déjà cette réinitialisation de façon
          // fiable (toujours actif au niveau module), mais on l'appelle
          // aussi ici explicitement, sur l'événement SIGNED_OUT précisément
          // — défense en profondeur, jamais un seul mécanisme considéré
          // suffisant seul pour une donnée aussi sensible qu'une photo/un
          // nom de profil.
          if (event === "SIGNED_OUT") {
            reinitialiserEtatUtilisateur();
          }
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
        reinitialiserEtatUtilisateur();
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
    // RÈGLE À NE JAMAIS CASSER : un invité (session anonyme déjà active,
    // onboarding déjà marqué complet) qui navigue volontairement vers
    // /onboarding/inscription pour convertir son compte (depuis GuestBanner
    // ou "Ton bilan", cf. RÈGLE dans ces fichiers) ne doit JAMAIS être
    // reboucané vers (tabs) par ce useEffect — sinon l'écran d'inscription
    // s'affiche une fraction de seconde puis disparaît (bug confirmé). Cette
    // route reste la SEULE exception : tout autre écran d'onboarding, une
    // fois onboarding_complete vrai, renvoie normalement vers (tabs).
    const dansInscription = dansOnboarding && segments[1] === "inscription";
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
      } else if (dansOnboarding && !(isGuest && dansInscription)) {
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
    isGuest,
    segments,
    router,
  ]);

  // RÈGLE À NE JAMAIS CASSER : pendant `chargement`, RIEN d'autre que le
  // splash ne doit être monté — ThemeProvider (themeInitial), GuestContext
  // (isGuest/msRestantsEssai) etc. dépendent tous de données pas encore
  // chargées à ce stade (cf. l'effet plus haut, qui pose ces states EN MÊME
  // TEMPS que `setChargement(false)`).
  if (chargement) {
    return <SplashScreen theme={themeSplash} />;
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
              <PremiumProvider>
                <JoursFeriesProvider>
                  {/* RÈGLE À NE JAMAIS CASSER — MONTÉ UNIQUEMENT SI
                      ESPACE_PARTAGE_ACTIF : tant que ce flag reste `false`
                      (bêta TestFlight), EspacePartageProvider n'existe même
                      pas dans l'arbre — cf. utils/premium.ts. */}
                  {ESPACE_PARTAGE_ACTIF ? (
                    <EspacePartageProvider userId={session?.user?.id ?? null}>
                      <Navigateur />
                    </EspacePartageProvider>
                  ) : (
                    <Navigateur />
                  )}
                </JoursFeriesProvider>
              </PremiumProvider>
            </TutorielContext.Provider>
          </GuestContext.Provider>
        </ThemeProvider>
      </AccessibiliteProvider>
      {/* RÈGLE À NE JAMAIS CASSER — FONDU VERS L'ÉCRAN RÉEL, JAMAIS VERS DU
          VIDE : l'app réelle (Navigateur ci-dessus) est déjà montée EN
          DESSOUS dès que `chargement` passe à false — ce splash n'est qu'une
          SUPERPOSITION (position: absolute) dont l'opacité descend à 0 sur
          DUREE_FADE_SPLASH_MS, révélant progressivement l'app déjà rendue,
          jamais un fondu vers un fond noir/blanc. pointerEvents="none" :
          purement décoratif, ne doit jamais intercepter un tap même à
          pleine opacité. */}
      {splashVisible && (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { opacity: opaciteSplash }]}
        >
          {/* RÈGLE : themeInitial (le VRAI thème, déjà chargé à ce stade,
              chargement === false) prioritaire sur themeSplash (le cache,
              une simple estimation) — plus de raison de deviner ici. */}
          <SplashScreen theme={themeInitial ?? themeSplash} />
        </Animated.View>
      )}
    </GestureHandlerRootView>
  );
}
