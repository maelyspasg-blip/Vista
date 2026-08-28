import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useObjectifs } from "./store";
import { Text } from "./Texte";

// RÈGLE À NE JAMAIS CASSER — AUCUNE ÉCRITURE SUPABASE DANS CE FICHIER :
// composant d'affichage pur — la détermination de l'alerte (app/
// alertesBudget.ts) et son état (app/store.ts) vivent ailleurs.
//
// RÈGLE : couleurs FIXES (pas theme-aware) — un bandeau d'alerte doit
// rester lisible/reconnaissable de la même façon quel que soit le thème,
// contrairement au reste de l'app. Teal pour les signaux non critiques
// (approche 80%, rythme anormal — tous deux de simples avertissements
// précoces), orange uniquement pour un dépassement déjà effectif.
const COULEUR_TEAL = "#1D9E75";
const COULEUR_ORANGE = "#E8863C";
const DUREE_AFFICHAGE_MS = 5000;

const ICONES: Record<"depassement" | "approche" | "rythme", keyof typeof Ionicons.glyphMap> = {
  depassement: "alert-circle-outline",
  approche: "information-circle-outline",
  rythme: "trending-up-outline",
};

// Bannière d'alerte budget, montée en flux au-dessus du contenu de la page
// Aperçu (app/(tabs)/index.tsx) UNIQUEMENT — contrairement à GuestBanner/
// SyncErrorBanner (montées globalement dans (tabs)/_layout.tsx), cette
// alerte ne concerne que le tableau de bord budgétaire, pas les autres
// onglets.
export function AlerteBudgetBanner() {
  const { alerteBudgetActuelle, fermerAlerteBudget } = useObjectifs();
  // RÈGLE : montée hors du ScrollView de la page (comme GuestBanner/
  // SyncErrorBanner dans (tabs)/_layout.tsx), donc au tout début physique
  // de l'écran — sans cet inset, le bandeau se retrouve sous l'encoche/la
  // barre de statut sur les devices qui en ont une.
  const insets = useSafeAreaInsets();

  // RÈGLE : disparaît au tap OU après quelques secondes — les deux chemins
  // appellent le même fermerAlerteBudget(), jamais deux mécanismes
  // distincts qui pourraient diverger.
  useEffect(() => {
    if (!alerteBudgetActuelle) return;
    const minuteur = setTimeout(fermerAlerteBudget, DUREE_AFFICHAGE_MS);
    return () => clearTimeout(minuteur);
  }, [alerteBudgetActuelle, fermerAlerteBudget]);

  if (!alerteBudgetActuelle) return null;

  const fond =
    alerteBudgetActuelle.type === "depassement" ? COULEUR_ORANGE : COULEUR_TEAL;

  return (
    <TouchableOpacity
      style={[styles.banniere, { backgroundColor: fond, marginTop: insets.top + 8 }]}
      onPress={fermerAlerteBudget}
      activeOpacity={0.9}
      accessibilityRole="alert"
      accessibilityLabel={alerteBudgetActuelle.texte}
    >
      <Ionicons
        name={ICONES[alerteBudgetActuelle.type]}
        size={16}
        color="#FFFFFF"
      />
      <Text style={styles.texte} numberOfLines={1}>
        {alerteBudgetActuelle.texte}
      </Text>
      <TouchableOpacity
        onPress={fermerAlerteBudget}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Fermer l'alerte"
      >
        <Ionicons name="close" size={16} color="#FFFFFF" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banniere: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  texte: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
});
