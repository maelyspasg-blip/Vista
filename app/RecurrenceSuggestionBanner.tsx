import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useObjectifs } from "./store";
import { Text } from "./Texte";
import { useTheme } from "./ThemeContext";

export function RecurrenceSuggestionBanner() {
  const { couleurs: C } = useTheme();
  const { suggestionRecurrence, accepterSuggestionRecurrence, ignorerSuggestionRecurrence } =
    useObjectifs();

  if (!suggestionRecurrence) return null;

  return (
    <View style={[styles.banniere, { backgroundColor: C.carte, borderColor: C.carteBorder }]}>
      <View style={styles.contenu}>
        <View style={[styles.pastille, { backgroundColor: suggestionRecurrence.couleur }]} />
        <Text style={[styles.texte, { color: C.texte }]}>
          Tu dépenses environ {suggestionRecurrence.montantMoyen} € dans{" "}
          {suggestionRecurrence.nom} chaque mois. L&apos;automatiser ?
        </Text>
        <TouchableOpacity
          onPress={ignorerSuggestionRecurrence}
          activeOpacity={0.6}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Ignorer la suggestion"
        >
          <Ionicons name="close" size={18} color={C.texteMuted} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={[styles.btnAutomatiser, { backgroundColor: C.purple }]}
        onPress={accepterSuggestionRecurrence}
        activeOpacity={0.8}
      >
        <Text style={styles.btnAutomatiserTexte}>Automatiser</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banniere: {
    position: "absolute",
    top: 110, // sous SyncErrorBanner (top:55) pour éviter un chevauchement si les deux s'affichent en même temps
    left: 16,
    right: 16,
    borderRadius: 14,
    borderWidth: 0.5,
    padding: 14,
    zIndex: 999,
  },
  contenu: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  pastille: { width: 10, height: 10, borderRadius: 5 },
  texte: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  btnAutomatiser: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  btnAutomatiserTexte: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
