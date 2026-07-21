import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "./ThemeContext";

export function InfoBulle({
  titre,
  texte,
  taille = 15,
  couleur,
}: {
  titre: string;
  texte: string;
  taille?: number;
  couleur?: string;
}) {
  const { couleurs: C } = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <>
      <TouchableOpacity
        onPress={() => setVisible(true)}
        activeOpacity={0.6}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons
          name="information-circle-outline"
          size={taille}
          color={couleur ?? C.texteMuted}
        />
      </TouchableOpacity>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        >
          <TouchableOpacity
            style={[styles.carte, { backgroundColor: C.carte }]}
            activeOpacity={1}
            onPress={() => {}}
          >
            <Text style={[styles.titre, { color: C.texte }]}>{titre}</Text>
            <Text style={[styles.texte, { color: C.texteMuted }]}>{texte}</Text>
            <TouchableOpacity
              style={[styles.btnFermer, { backgroundColor: C.purpleLight }]}
              onPress={() => setVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.btnFermerTexte, { color: C.purple }]}>
                Compris
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  carte: {
    borderRadius: 20,
    padding: 20,
    width: "100%",
    maxWidth: 340,
  },
  titre: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  texte: { fontSize: 14, lineHeight: 20 },
  btnFermer: {
    marginTop: 16,
    alignSelf: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  btnFermerTexte: { fontSize: 14, fontWeight: "600" },
});
