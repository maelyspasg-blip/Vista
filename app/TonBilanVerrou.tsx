import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Texte";
import { useTheme } from "./ThemeContext";
import { BoutonPrincipal } from "./BoutonPrincipal";
import { useDeblocagePub } from "./InsightVerrouille";

const COULEUR_CADENAS = "#2D3A4A";

// RÈGLE À NE JAMAIS CASSER — REFONTE MONÉTISATION DU 2026-09-12 : remplace
// PremiumVerrou (Premium uniquement, jamais de pub) pour les 4 anciens
// verrous individuels de "Ton bilan" (onglets Vista/Santé/Trophées/
// Simulateur, app/(tabs)/analytics.tsx) — désormais UN SEUL déblocage
// partagé pour toute la modale (cf. tonBilanDebloque, EspacePartageContext
// n'est pas concerné, c'est un state local à analytics.tsx). Ne montre
// JAMAIS le contenu verrouillé en dessous (contrairement à
// InsightVerrouille) : PremiumVerrou.tsx reste inchangé et en place pour
// une éventuelle réactivation de Premium (cf. RÈGLE dans utils/premium.ts),
// ce composant est un sibling dédié à la pub, pas un remplacement du
// fichier existant. Réutilise useDeblocagePub (app/InsightVerrouille.tsx)
// plutôt que de dupliquer la logique AdMob/simulation Alert.
export function TonBilanVerrou({
  hauteur = 220,
  onDeverrouille,
}: {
  hauteur?: number;
  onDeverrouille: () => void;
}) {
  const { couleurs: C } = useTheme();
  const { declencherPub, enCoursDeblocage } = useDeblocagePub(onDeverrouille);

  return (
    <View
      style={[
        styles.conteneur,
        { height: hauteur, backgroundColor: C.fondSecondaire },
      ]}
    >
      <Ionicons name="lock-closed" size={24} color={COULEUR_CADENAS} />
      <Text style={[styles.texte, { color: C.texteMuted }]}>
        Regarde une pub pour débloquer Ton bilan
      </Text>
      <BoutonPrincipal
        style={styles.bouton}
        onPress={declencherPub}
        disabled={enCoursDeblocage}
      >
        <Text style={styles.boutonTexte}>Regarder une pub</Text>
      </BoutonPrincipal>
    </View>
  );
}

const styles = StyleSheet.create({
  conteneur: {
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  texte: { fontSize: 13, fontWeight: "600" },
  bouton: {
    backgroundColor: "#1D9E75",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 4,
  },
  boutonTexte: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
});
