import { StyleSheet, View } from "react-native";
import { Text } from "./Texte";
import { useObjectifs } from "./store";

// RÈGLE À NE JAMAIS CASSER — BANNIÈRE DÉDIÉE, DISTINCTE DE SyncErrorBanner
// (demande explicite du 2026-10-02, point 2) : SyncErrorBanner est rouge,
// générique à toute écriture Supabase, et s'auto-efface après 5s quoi qu'il
// arrive (cf. app/SyncErrorBanner.tsx) — inadapté ici, où l'échec concerne
// spécifiquement l'archivage mensuel et doit rester visible tant qu'il n'a
// pas abouti, potentiellement bien au-delà de 5s. Pas de useEffect/timeout
// ici : seul archivageEnDifficulte (app/store.ts, posé/levé par
// verifierArchivageMoisInterne) contrôle l'affichage — jamais de minuteur
// local qui la ferait disparaître avant que l'archivage n'ait réellement
// réussi.
export function SynchronisationBanner() {
  const { archivageEnDifficulte } = useObjectifs();

  if (!archivageEnDifficulte) return null;

  return (
    <View style={styles.banniere} pointerEvents="none">
      <Text style={styles.texte}>Synchronisation en cours…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // RÈGLE : volontairement sobre (gris neutre, pas de rouge) — demande
  // explicite "bannière discrète", à ne pas confondre visuellement avec une
  // vraie erreur (SyncErrorBanner) alors que l'app continue de retenter
  // automatiquement en arrière-plan.
  banniere: {
    position: "absolute",
    // RÈGLE : top:165, sous SyncErrorBanner (top:55) ET
    // RecurrenceSuggestionBanner (top:110, déjà positionnée "sous
    // SyncErrorBanner pour éviter un chevauchement si les deux s'affichent
    // en même temps") — même convention de stacking, car archivageEnDifficulte
    // ET erreurSync peuvent être vrais simultanément en pratique (le dernier
    // échec avant épuisement des réessais pose aussi erreurSync via
    // signalerErreurSync, cf. RÈGLE dans archiverMoisActuelInterneCoeur).
    top: 165,
    left: 16,
    right: 16,
    backgroundColor: "#6B7280",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    zIndex: 999,
  },
  texte: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
});
