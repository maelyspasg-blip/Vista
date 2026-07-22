import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "./Texte";
import { useTheme } from "./ThemeContext";

export function AccordionItem({
  titre,
  texte,
}: {
  titre: string;
  texte: string;
}) {
  const { couleurs: C } = useTheme();
  const [ouvert, setOuvert] = useState(false);

  return (
    <View style={[styles.carte, { backgroundColor: C.fondSecondaire }]}>
      <TouchableOpacity
        style={styles.entete}
        onPress={() => setOuvert(!ouvert)}
        activeOpacity={0.7}
      >
        <Text style={[styles.titre, { color: C.texte }]}>{titre}</Text>
        <Ionicons
          name={ouvert ? "chevron-up" : "chevron-down"}
          size={16}
          color={C.texteMuted}
        />
      </TouchableOpacity>
      {ouvert && (
        <Text style={[styles.texte, { color: C.texteMuted }]}>{texte}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  carte: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  entete: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  titre: { fontSize: 14, fontWeight: "700", flex: 1 },
  texte: { fontSize: 13, lineHeight: 19, marginTop: 10 },
});
