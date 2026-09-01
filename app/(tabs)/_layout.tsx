import { Ionicons } from "@expo/vector-icons";
import {
  createMaterialTopTabNavigator,
  MaterialTopTabNavigationEventMap,
  MaterialTopTabNavigationOptions,
} from "expo-router/js-top-tabs";
import { ParamListBase, TabNavigationState } from "expo-router/react-navigation";
import { withLayoutContext } from "expo-router";
import { useEffect } from "react";
import { AppState, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccessibilite } from "../AccessibiliteContext";
import { GuestBanner } from "../GuestBanner";
import { PagerSwipeProvider, usePagerSwipe } from "../PagerSwipeContext";
import { RecurrenceSuggestionBanner } from "../RecurrenceSuggestionBanner";
import { SyncErrorBanner } from "../SyncErrorBanner";
import { useObjectifs } from "../store";
import { useTheme } from "../ThemeContext";

const INTERVALLE_VERIFICATION_MS = 60000;

const { Navigator } = createMaterialTopTabNavigator();

const MaterialTopTabs = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(Navigator);

function TabsNavigator() {
  const { couleurs: C } = useTheme();
  const { echelleTexte } = useAccessibilite();
  const { swipeOngletsActif } = usePagerSwipe();
  const insets = useSafeAreaInsets();

  return (
    <MaterialTopTabs
      tabBarPosition="bottom"
      screenOptions={{
        swipeEnabled: swipeOngletsActif,
        tabBarShowIcon: true,
        tabBarIndicatorStyle: { height: 0 },
        tabBarStyle: {
          backgroundColor: C.carte,
          borderTopColor: C.carteBorder,
          borderTopWidth: 1,
          height: 60 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: C.tabActif,
        tabBarInactiveTintColor: C.tabInactif,
        tabBarLabelStyle: {
          fontSize: 10 * echelleTexte,
          fontWeight: "500",
          textTransform: "none",
        },
        tabBarItemStyle: { paddingTop: 6 },
      }}
    >
      <MaterialTopTabs.Screen
        name="index"
        options={{
          title: "Aperçu",
          tabBarIcon: ({ color }) => (
            <Ionicons name="search-outline" size={22} color={color} />
          ),
        }}
      />
      <MaterialTopTabs.Screen
        name="budget"
        options={{
          title: "Budget",
          tabBarIcon: ({ color }) => (
            <Ionicons name="wallet-outline" size={22} color={color} />
          ),
        }}
      />
      <MaterialTopTabs.Screen
        name="planning"
        options={{
          title: "Planning",
          tabBarIcon: ({ color }) => (
            <Ionicons name="calendar-outline" size={22} color={color} />
          ),
        }}
      />
      <MaterialTopTabs.Screen
        name="analytics"
        options={{
          title: "Statistiques",
          tabBarIcon: ({ color }) => (
            <Ionicons name="bar-chart-outline" size={22} color={color} />
          ),
        }}
      />
    </MaterialTopTabs>
  );
}

export default function TabLayout() {
  const objStore = useObjectifs();

  useEffect(() => {
    // RÈGLE À NE JAMAIS CASSER — ARCHIVAGE TOUJOURS EN PREMIER, ATTENDU
    // AVANT LES AUTRES VÉRIFICATIONS : les autres verifier* (échéances
    // fixes, événements financiers, motifs récurrents) lisent/écrivent sur
    // etat.enveloppes — les lancer AVANT que verifierArchivageMois() ait
    // fini de rattraper un éventuel retard (snapshot + remise à zéro +
    // reconduction des entrées récurrentes) les ferait tourner sur des
    // données d'un mois précédent encore présentes, avec le risque qu'ils
    // marquent une échéance "payée" ou créent un événement à partir de
    // montants qui vont être écrasés une fraction de seconde plus tard par
    // l'archivage. verifierArchivageMois() retourne maintenant sa Promise
    // explicitement pour permettre cet ordre (les autres restent
    // fire-and-forget, indépendants les uns des autres). Même raisonnement
    // pour verifierIntegriteDonnees() (vérification d'intégrité
    // Variable-only, cf. RÈGLE dans app/store.ts) : attendue juste après
    // l'archivage, jamais avant, pour ne comparer depense aux transactions
    // QUE sur le mois déjà rattrapé.
    const verifierEtat = async () => {
      await objStore.verifierArchivageMois();
      await objStore.verifierIntegriteDonnees();
      objStore.verifierEcheancesFixes();
      objStore.verifierVersementsObjectifs();
      objStore.verifierEvenementsFinanciers();
      objStore.verifierMotifsRecurrents();
    };

    (async () => {
      await Promise.all([
        objStore.chargerEnveloppes(),
        objStore.chargerObjectifs(),
        objStore.chargerEvenements(),
        objStore.chargerTransactions(),
        objStore.chargerModelesDepenses(),
        objStore.chargerHistoriquePaiements(),
        objStore.chargerHistoriquesMois(),
      ]);
      await verifierEtat();
    })();

    const intervalle = setInterval(verifierEtat, INTERVALLE_VERIFICATION_MS);
    const abonnement = AppState.addEventListener("change", (etatApp) => {
      if (etatApp === "active") verifierEtat();
    });

    return () => {
      clearInterval(intervalle);
      abonnement.remove();
    };
  }, []);

  return (
    <PagerSwipeProvider>
      <View style={{ flex: 1 }}>
        <GuestBanner topSafeArea />
        <SyncErrorBanner />
        <RecurrenceSuggestionBanner />
        <TabsNavigator />
      </View>
    </PagerSwipeProvider>
  );
}
