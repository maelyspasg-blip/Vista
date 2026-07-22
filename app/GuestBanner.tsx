import { useRouter } from "expo-router";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "./Texte";
import { useTheme } from "./ThemeContext";

export function GuestBanner({ joursRestants }: { joursRestants: number }) {
  const router = useRouter();
  const { couleurs } = useTheme();

  const texteJours =
    joursRestants <= 1 ? "dernier jour" : `${joursRestants} jours restants`;

  return (
    <View
      style={[styles.banniere, { backgroundColor: couleurs.purple }]}
      pointerEvents="box-none"
    >
      <Text style={styles.texte}>
        Mode essai — {texteJours}
      </Text>
      <TouchableOpacity
        onPress={() => router.push("/onboarding/inscription")}
        activeOpacity={0.8}
        style={styles.bouton}
      >
        <Text style={styles.boutonTexte}>Créer un compte</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banniere: {
    position: "absolute",
    top: 55,
    left: 16,
    right: 16,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 999,
  },
  texte: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
    marginRight: 8,
  },
  bouton: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  boutonTexte: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
});
