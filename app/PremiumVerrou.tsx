import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Text } from "./Texte";
import { useTheme } from "./ThemeContext";

const COULEUR_CADENAS = "#2D3A4A";

// RÈGLE À NE JAMAIS CASSER — AUCUNE ÉCRITURE SUPABASE DANS CE FICHIER : ce
// composant ne doit JAMAIS contenir d'appel .delete()/.update()/.insert()/
// .upsert() vers Supabase — composant d'affichage pur, toute écriture vit
// dans app/store.ts (cf. RÈGLE DE SÉCURITÉ en tête de ce fichier).
//
// RÈGLE À NE JAMAIS CASSER : à la différence d'InsightVerrouille (déblocage
// par pub, contenu réel toujours rendu en dessous), ce composant ne montre
// JAMAIS le contenu verrouillé et ne propose aucune pub — Premium
// uniquement. "Découvrir Premium" navigue vers Profil, où vit la section
// "Passer Premium" (visible pour tout compte ni admin ni premium).
export function PremiumVerrou({ hauteur = 220 }: { hauteur?: number }) {
  const { couleurs: C } = useTheme();
  const router = useRouter();

  return (
    <View
      style={[
        styles.conteneur,
        { height: hauteur, backgroundColor: C.fondSecondaire },
      ]}
    >
      <Ionicons name="lock-closed" size={24} color={COULEUR_CADENAS} />
      <Text style={[styles.texte, { color: C.texteMuted }]}>
        Disponible avec Premium
      </Text>
      <TouchableOpacity
        style={styles.bouton}
        onPress={() => router.push("/profil")}
        activeOpacity={0.8}
      >
        <Text style={styles.boutonTexte}>Découvrir Premium</Text>
      </TouchableOpacity>
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
    backgroundColor: "#C9A84C",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 4,
  },
  boutonTexte: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
});
