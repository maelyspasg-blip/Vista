import { ReactNode, useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AD_UNIT_ID_REWARDED, TESTFLIGHT_MODE } from "../utils/premium";
import { Text } from "./Texte";
import { useTheme } from "./ThemeContext";

// RÈGLE À NE JAMAIS CASSER — require() DANS UN try/catch, JAMAIS UN IMPORT
// STATIQUE : react-native-google-mobile-ads est un module natif qui
// nécessite un rebuild EAS (cf. RÈGLE plus bas) — sur le dev client actuel
// (pas rebuild), le module natif RNGoogleMobileAdsModule est absent, et
// l'évaluation du module JS de la librairie plante immédiatement à
// l'IMPORT (avant même d'atteindre le corps de ce composant). Un
// `import { ... } from "react-native-google-mobile-ads"` statique est
// hissé et évalué AU CHARGEMENT DU BUNDLE, hors de portée de tout
// try/catch placé dans ce fichier — seul un require() explicite, lui un
// appel de fonction normal exécuté à l'endroit où il est écrit, peut être
// intercepté. Sans ce garde, l'app plantait au démarrage avec
// "RNGoogleMobileAdsModule not found" dès que ce fichier était chargé,
// même si aucun insight verrouillé n'était jamais affiché à l'écran.
let RewardedAd: any = null;
let RewardedAdEventType: any = null;
let AdEventType: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const admob = require("react-native-google-mobile-ads");
  RewardedAd = admob.RewardedAd;
  RewardedAdEventType = admob.RewardedAdEventType;
  AdEventType = admob.AdEventType;
} catch {
  // AdMob non disponible (dev client sans rebuild natif EAS, ou plateforme
  // web) — RewardedAd reste `null`, le composant retombe systématiquement
  // sur l'Alert simulé plus bas, jamais de crash.
}

// RÈGLE À NE JAMAIS CASSER — AUCUNE ÉCRITURE SUPABASE DANS CE FICHIER : ce
// composant ne doit JAMAIS contenir d'appel .delete()/.update()/.insert()/
// .upsert() vers Supabase — composant d'affichage/déblocage UI pur, toute
// écriture vit dans app/store.ts (cf. RÈGLE DE SÉCURITÉ en tête de ce
// fichier).
//
// Couleur "navy" déjà utilisée ailleurs dans l'app (ex: widgets) — sobre,
// pas de cercle ni de fond coloré autour, même esprit que l'icône ampoule
// (Ionicons + couleur simple) utilisée dans budget.tsx.
const COULEUR_CADENAS = "#2D3A4A";

// RÈGLE À NE JAMAIS CASSER — AdMob NÉCESSITE UN REBUILD NATIF EAS : ce
// composant ne peut PAS être testé avec le dev client seul (le module
// natif react-native-google-mobile-ads doit être compilé dans le binaire).
// Sur dev client sans ce rebuild, le SDK natif est absent — c'est
// justement pour ça que le fallback ci-dessous (pubChargee toujours false
// si `load()` n'aboutit jamais) retombe sur l'Alert simulé plutôt que de
// planter.
export function InsightVerrouille({
  deverrouille,
  onDeverrouille,
  children,
}: {
  deverrouille: boolean;
  onDeverrouille: () => void;
  children: ReactNode;
}) {
  const { theme, couleurs: C } = useTheme();
  const [enCoursDeblocage, setEnCoursDeblocage] = useState(false);
  const [pubChargee, setPubChargee] = useState(false);
  const rewardedRef = useRef<any>(null);

  // RÈGLE À NE JAMAIS CASSER — TOUS LES HOOKS AVANT TOUT RETURN
  // CONDITIONNEL : `deverrouille`/TESTFLIGHT_MODE ne doivent jamais changer
  // l'ORDRE des hooks appelés d'un rendu à l'autre (règle React) — d'où cet
  // effet toujours déclaré ici, son corps décidant lui-même s'il a quelque
  // chose à faire, plutôt qu'un hook placé après un `if (...) return`.
  //
  // RÈGLE : chargée une seule fois au montage ([] volontaire) — TESTFLIGHT_
  // MODE ou un insight déjà déverrouillé au moment du montage n'ont jamais
  // besoin d'une pub, jamais chargée dans ce cas (aucun appel AdMob inutile
  // pendant la période TestFlight).
  useEffect(() => {
    if (TESTFLIGHT_MODE || deverrouille || !RewardedAd) return;

    const rewarded = RewardedAd.createForAdRequest(AD_UNIT_ID_REWARDED);
    rewardedRef.current = rewarded;

    const desabonnerCharge = rewarded.addAdEventListener(
      RewardedAdEventType.LOADED,
      () => setPubChargee(true),
    );
    // RÈGLE À NE JAMAIS CASSER : onDeverrouille ne doit être déclenché QUE
    // sur EARNED_REWARD (l'utilisateur a effectivement regardé la pub
    // jusqu'au bout) — jamais sur CLOSED seul, qui se déclenche aussi si
    // l'utilisateur ferme la pub avant la fin sans obtenir la récompense.
    const desabonnerRecompense = rewarded.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      () => {
        setEnCoursDeblocage(false);
        onDeverrouille();
      },
    );
    const desabonnerErreur = rewarded.addAdEventListener(AdEventType.ERROR, () => {
      setPubChargee(false);
      setEnCoursDeblocage(false);
    });
    const desabonnerFerme = rewarded.addAdEventListener(AdEventType.CLOSED, () => {
      setEnCoursDeblocage(false);
    });

    rewarded.load();

    return () => {
      desabonnerCharge();
      desabonnerRecompense();
      desabonnerErreur();
      desabonnerFerme();
      rewardedRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // RÈGLE À NE JAMAIS CASSER : TESTFLIGHT_MODE n'affiche JAMAIS le cadenas,
  // quel que soit `deverrouille` — cf. utils/premium.ts.
  if (TESTFLIGHT_MODE || deverrouille) return <>{children}</>;

  // RÈGLE À NE JAMAIS CASSER — FALLBACK SI PUB NON DISPONIBLE : si la pub
  // AdMob n'a pas fini de charger (ou a échoué — device sans le rebuild
  // natif EAS, pas de réseau, aucun inventaire disponible...), on retombe
  // sur l'Alert simulé plutôt que de laisser le bouton sans effet.
  const demanderDeblocage = () => {
    if (RewardedAd && pubChargee && rewardedRef.current) {
      setEnCoursDeblocage(true);
      rewardedRef.current.show().catch(() => {
        setEnCoursDeblocage(false);
        demanderDeblocageSimule();
      });
      return;
    }
    demanderDeblocageSimule();
  };

  const demanderDeblocageSimule = () => {
    Alert.alert(
      "Débloquer les analyses",
      "Regardez une courte publicité pour accéder à toutes vos analyses personnalisées.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Regarder la pub",
          onPress: () => {
            setEnCoursDeblocage(true);
            // Simulation de la pub récompensée (fallback) — même délai/
            // même déclenchement de onDeverrouille que le vrai SDK AdMob
            // ci-dessus, pour un comportement identique du point de vue de
            // l'utilisateur quel que soit le chemin emprunté.
            setTimeout(() => {
              setEnCoursDeblocage(false);
              onDeverrouille();
              Alert.alert("Analyses débloquées !");
            }, 1500);
          },
        },
      ],
    );
  };

  return (
    <View style={styles.conteneur}>
      <View pointerEvents="none">{children}</View>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.cache,
          { backgroundColor: theme === "sombre" ? C.fond : C.fondSecondaire },
        ]}
      >
        <Ionicons name="lock-closed" size={24} color={COULEUR_CADENAS} />
        <Text style={styles.texteDeverrouiller}>Débloquer mes analyses</Text>
      </View>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={demanderDeblocage}
        disabled={enCoursDeblocage}
        accessibilityLabel="Déverrouiller mes analyses"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  conteneur: { position: "relative", overflow: "hidden", borderRadius: 12 },
  cache: { alignItems: "center", justifyContent: "center", gap: 6 },
  texteDeverrouiller: {
    fontSize: 13,
    fontWeight: "700",
    color: COULEUR_CADENAS,
  },
});
