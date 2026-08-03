import { useRouter } from "expo-router";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGuest } from "./GuestContext";
import { Text } from "./Texte";
import { useTheme } from "./ThemeContext";

const UNE_HEURE_MS = 3_600_000;
const UN_JOUR_MS = 86_400_000;

// Bannière d'essai invité, montée en flux (pas en overlay absolu) une fois
// par sous-arbre de routes qui en a besoin — voir (tabs)/_layout.tsx et
// profil.tsx. `topSafeArea` gère l'inset du haut d'écran quand rien d'autre
// à cet endroit ne s'en charge déjà (cas des tabs).
export function GuestBanner({ topSafeArea = false }: { topSafeArea?: boolean }) {
  const router = useRouter();
  const { couleurs } = useTheme();
  const insets = useSafeAreaInsets();
  const { isGuest, msRestants } = useGuest();

  if (!isGuest || msRestants === null) return null;

  const { fond, texte } =
    msRestants <= UNE_HEURE_MS
      ? {
          fond: couleurs.rouge,
          texte: `Mode essai — ${Math.max(1, Math.ceil(msRestants / 60_000))}min restantes`,
        }
      : msRestants <= UN_JOUR_MS
        ? {
            fond: couleurs.peach,
            texte: `Mode essai — ${Math.ceil(msRestants / UNE_HEURE_MS)}h restantes`,
          }
        : {
            fond: couleurs.purple,
            texte: `Mode essai — ${Math.ceil(msRestants / UN_JOUR_MS)}j restants`,
          };

  return (
    <View
      style={[
        styles.banniere,
        { backgroundColor: fond },
        topSafeArea && { marginTop: insets.top + 8 },
      ]}
    >
      <Text style={styles.texte} numberOfLines={1}>
        {texte}
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
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
