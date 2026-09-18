import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { useEspacePartage } from "./EspacePartageContext";
import { Text } from "./Texte";

// RÈGLE À NE JAMAIS CASSER — DISSOLUTION D'ESPACE PENDANT UNE SESSION ACTIVE
// (décision produit du 2026-09-18, AUDIT_V1.md §2.2) : sur le même modèle
// que SyncErrorBanner.tsx (bannière discrète, auto-effacée après quelques
// secondes), mais pilotée par espaceVientDEtreDissous/
// acquitterDissolutionEspace (EspacePartageContext.tsx) plutôt que
// erreurSync/effacerErreurSync (app/store.ts) — sujet différent, jamais
// mélangé au même état. Couleur neutre/teal (#1D9E75, palette Vista) plutôt
// que le rouge d'alerte de SyncErrorBanner : ce n'est pas une erreur, juste
// une information — CLAUDE.md/la décision produit demandent explicitement
// "aucun message d'erreur agressif". useEspacePartage() retombe sur les
// valeurs par défaut (espaceVientDEtreDissous: false) hors du Provider —
// ce composant peut donc être monté inconditionnellement, jamais de garde
// à dupliquer ici (même principe que SwitcherEspacePartage.tsx).
export function EspaceDissousBanner() {
  const { espaceVientDEtreDissous, acquitterDissolutionEspace } =
    useEspacePartage();

  useEffect(() => {
    if (!espaceVientDEtreDissous) return;
    const t = setTimeout(() => acquitterDissolutionEspace(), 5000);
    return () => clearTimeout(t);
  }, [espaceVientDEtreDissous, acquitterDissolutionEspace]);

  if (!espaceVientDEtreDissous) return null;

  return (
    <View style={styles.banniere} pointerEvents="none">
      <Text style={styles.texte}>L&apos;espace partagé a été dissous</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banniere: {
    position: "absolute",
    top: 55,
    left: 16,
    right: 16,
    backgroundColor: "#1D9E75",
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
