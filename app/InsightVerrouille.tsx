import { ReactNode, useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ADMOB_ACTIF, AD_UNIT_ID_REWARDED, TESTFLIGHT_MODE } from "../utils/premium";
import { Text } from "./Texte";
import { useTheme } from "./ThemeContext";
// RÈGLE À NE JAMAIS CASSER : import depuis la paire utils/adMobModule.ts/
// utils/adMobModule.web.ts, jamais react-native-google-mobile-ads
// directement depuis ce fichier — cf. RÈGLE détaillée dans
// utils/adMobModule.ts (le try/catch seul ne protège pas la résolution
// statique du bundler web). DANS utils/, PAS app/ : tout fichier posé
// directement dans app/ est balayé par le require.context d'expo-router
// (construction de la table de routes) qui require() chaque fichier par
// son nom de fichier EXACT sur disque, sans respecter la préférence de
// plateforme .web.ts — seul un import depuis en dehors de app/ passe par
// la résolution Metro standard qui, elle, préfère bien adMobModule.web.ts
// sur le web.
import { AdEventType, RewardedAd, RewardedAdEventType } from "../utils/adMobModule";
// RÈGLE : TestIds n'est pas encore consommé ici — importé/exporté par
// utils/adMobModule.ts pour que le guard try/catch le couvre dès qu'un
// usage (ex: ad unit de test en __DEV__) sera ajouté, sans retoucher le
// require() protégé à ce moment-là.

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

// RÈGLE À NE JAMAIS CASSER — SOURCE UNIQUE POUR "COMMENT DÉCLENCHER UNE PUB
// RÉCOMPENSÉE" DANS TOUTE L'APP (refonte monétisation du 2026-09-12) :
// utilisé par <InsightVerrouille> ci-dessous ET directement par tout autre
// site qui a besoin du même déclencheur sans l'habillage visuel du
// composant (ex: le sélecteur de période de Stats, qui ouvre l'Alert
// directement depuis le tap sur une option verrouillée plutôt que depuis un
// overlay). Ne jamais dupliquer cette logique ailleurs — un seul endroit à
// faire évoluer le jour où AdMob est réintégré (ADMOB_ACTIF, utils/premium.ts).
//
// RÈGLE À NE JAMAIS CASSER — AdMob NÉCESSITE UN REBUILD NATIF EAS : ce hook
// ne peut PAS être testé avec le dev client seul (le module natif
// react-native-google-mobile-ads doit être compilé dans le binaire). Sur
// dev client sans ce rebuild (ou tant que ADMOB_ACTIF est false), le SDK
// natif n'est jamais sollicité — c'est justement pour ça que le fallback
// simulé existe, jamais un plantage silencieux.
export function useDeblocagePub(
  onDeverrouille: () => void,
  // RÈGLE : optionnel — passer l'état "déjà déverrouillé" connu de
  // l'appelant (premium/invité/session déjà débloquée) quand il existe
  // (cf. <InsightVerrouille>/<TonBilanVerrou> plus bas) pour ne jamais
  // charger une pub inutilement pour un contenu déjà accessible. Un site
  // d'appel qui n'a pas un seul booléen "tout est débloqué" pertinent
  // (ex: le sélecteur de période de Stats, plusieurs paliers indépendants)
  // peut l'omettre — aucun appel AdMob n'est fait tant qu'ADMOB_ACTIF est
  // false de toute façon.
  dejaDeverrouille = false,
) {
  const [enCoursDeblocage, setEnCoursDeblocage] = useState(false);
  const [pubChargee, setPubChargee] = useState(false);
  const rewardedRef = useRef<any>(null);

  // RÈGLE : chargée une seule fois au montage ([] volontaire) — TESTFLIGHT_
  // MODE, ADMOB_ACTIF=false ou un contenu déjà déverrouillé au moment du
  // montage n'ont jamais besoin d'une pub, jamais chargée dans ce cas
  // (aucun appel AdMob inutile).
  useEffect(() => {
    if (TESTFLIGHT_MODE || !ADMOB_ACTIF || dejaDeverrouille || !RewardedAd) return;

    // RÈGLE À NE JAMAIS CASSER — SECOND GARDE, INDISPENSABLE EN PLUS DU
    // try/catch DANS utils/adMobModule.ts : ce dernier protège uniquement
    // le require() du package — `RewardedAd` est un objet JS valide dès que
    // ce require() réussit, MÊME si le module natif n'est pas linké dans ce
    // build (dev client sans rebuild EAS). C'est justement
    // `createForAdRequest()`/`addAdEventListener()`/`load()` ci-dessous qui
    // touchent réellement le pont natif et peuvent planter avec "Module
    // XXX not found" à CE point précis, hors de portée du try/catch de
    // adMobModule.ts. Toute erreur ici laisse `pubChargee` à `false` pour
    // de bon (jamais mis à `true`), donc `demanderDeblocage` retombe
    // automatiquement sur l'Alert simulé — jamais de crash visible.
    try {
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
    } catch (e) {
      console.error(
        "[useDeblocagePub] Initialisation AdMob (RewardedAd) a échoué — fallback Alert simulé :",
        e,
      );
      rewardedRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // RÈGLE : Alert simulée — "Pub simulée" + bouton "Fermer" qui déverrouille
  // directement (demande explicite du 2026-09-12, refonte monétisation) :
  // pas d'étape de confirmation intermédiaire ni de délai artificiel,
  // remplacée le jour où AdMob est réintégré par le vrai SDK (ci-dessus),
  // jamais l'inverse.
  const demanderDeblocageSimule = () => {
    Alert.alert("Pub simulée", "AdMob n'est pas encore réintégré — ceci simule le visionnage d'une publicité récompensée.", [
      {
        text: "Fermer",
        onPress: () => {
          onDeverrouille();
        },
      },
    ]);
  };

  // RÈGLE À NE JAMAIS CASSER — FALLBACK SI PUB NON DISPONIBLE : si
  // ADMOB_ACTIF est faux, ou si la pub AdMob n'a pas fini de charger (ou a
  // échoué — device sans le rebuild natif EAS, pas de réseau, aucun
  // inventaire disponible...), on retombe sur l'Alert simulé plutôt que de
  // laisser le déclencheur sans effet.
  const declencherPub = () => {
    if (ADMOB_ACTIF && RewardedAd && pubChargee && rewardedRef.current) {
      setEnCoursDeblocage(true);
      // RÈGLE : try/catch en plus du .catch() sur la promesse — show() peut
      // aussi planter de façon SYNCHRONE (pas seulement via une promesse
      // rejetée) si le pont natif est absent, même piège que
      // createForAdRequest() dans le useEffect plus haut.
      try {
        rewardedRef.current.show().catch(() => {
          setEnCoursDeblocage(false);
          demanderDeblocageSimule();
        });
      } catch {
        setEnCoursDeblocage(false);
        demanderDeblocageSimule();
      }
      return;
    }
    demanderDeblocageSimule();
  };

  return { declencherPub, enCoursDeblocage };
}

// RÈGLE À NE JAMAIS CASSER : à la différence de PremiumVerrou (Premium
// uniquement, ne montre jamais le contenu verrouillé), ce composant montre
// TOUJOURS le contenu réel en dessous (flouté visuellement par l'overlay
// pointerEvents="none"), déblocage par pub via useDeblocagePub ci-dessus.
export function InsightVerrouille({
  deverrouille,
  onDeverrouille,
  texteCadenas = "Débloquer mes analyses",
  children,
}: {
  deverrouille: boolean;
  onDeverrouille: () => void;
  // RÈGLE : personnalisable depuis le 2026-09-12 — ce même composant sert
  // maintenant aussi de verrou consolidé pour "Ton bilan" (onglets Vista/
  // Santé/Trophées/Simulateur, app/(tabs)/analytics.tsx), pas seulement les
  // insights — jamais un second composant qui dupliquerait
  // useDeblocagePub/l'habillage visuel pour un texte différent.
  texteCadenas?: string;
  children: ReactNode;
}) {
  const { theme, couleurs: C } = useTheme();
  const { declencherPub, enCoursDeblocage } = useDeblocagePub(
    onDeverrouille,
    deverrouille,
  );

  // RÈGLE À NE JAMAIS CASSER — CORRECTIF DU 2026-09-13 (bug trouvé en test) :
  // ce composant ne doit JAMAIS court-circuiter sur TESTFLIGHT_MODE
  // directement — seul `deverrouille` décide, exactement comme
  // <TonBilanVerrou>/le Picker de période Stats (app/(tabs)/analytics.tsx),
  // qui n'ont jamais eu ce court-circuit. `deverrouille` encode déjà
  // TESTFLIGHT_MODE correctement via estComptePremium (utils/premium.ts) :
  // un testeur TestFlight non-admin reste TOUJOURS débloqué (branche
  // TESTFLIGHT_MODE d'estComptePremium, aucune régression pour lui). Seul
  // un ADMIN avec "Simuler compte non-premium" activé profitait de l'ancien
  // court-circuit pour ne jamais voir le cadenas — cassant justement le
  // seul mécanisme prévu pour qu'un admin puisse tester ce cadenas/la pub
  // simulée tout en restant libre de le désactiver à tout moment (jamais
  // bloqué : ce même toggle admin se désactive en un geste).
  if (deverrouille) return <>{children}</>;

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
        <Text style={styles.texteDeverrouiller}>{texteCadenas}</Text>
      </View>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={declencherPub}
        disabled={enCoursDeblocage}
        accessibilityLabel={texteCadenas}
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
