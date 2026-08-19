import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccessibilite } from "./AccessibiliteContext";
import { BoutonPrincipal } from "./BoutonPrincipal";
import { useTheme } from "./ThemeContext";
import { Text } from "./Texte";

// Modale plein écran réutilisée pour la politique de confidentialité et les
// CGU, accessible depuis Profil et depuis l'écran de connexion (avant même
// d'être authentifié) — d'où un composant partagé plutôt que dupliqué dans
// les deux écrans.
export function ModaleDocumentLegal({
  visible,
  onClose,
  titre,
  texte,
}: {
  visible: boolean;
  onClose: () => void;
  titre: string;
  texte: string;
}) {
  const { couleurs: C } = useTheme();
  const { reduireAnimations } = useAccessibilite();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType={reduireAnimations ? "none" : "slide"}
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.container,
          { backgroundColor: C.fondPage, paddingTop: insets.top + 20 },
        ]}
      >
        <Text style={[styles.titre, { color: C.texte }]}>{titre}</Text>
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.corps, { color: C.texte }]}>{texte}</Text>
          <View style={{ height: 20 }} />
        </ScrollView>
        <BoutonPrincipal
          style={[
            styles.btnFermer,
            {
              backgroundColor: C.purple,
              marginBottom: Math.max(20, insets.bottom + 12),
            },
          ]}
          onPress={onClose}
          activeOpacity={0.8}
        >
          <Text style={styles.btnFermerTexte}>Fermer</Text>
        </BoutonPrincipal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  titre: { fontSize: 22, fontWeight: "700", marginBottom: 16 },
  scroll: { flex: 1 },
  corps: { fontSize: 14, lineHeight: 22 },
  btnFermer: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 16,
  },
  btnFermerTexte: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
});
