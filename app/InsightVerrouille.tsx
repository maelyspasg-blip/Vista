import { ReactNode, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Texte";
import { useTheme } from "./ThemeContext";

// Couleur "navy" déjà utilisée ailleurs dans l'app (ex: widgets) — sobre,
// pas de cercle ni de fond coloré autour, même esprit que l'icône ampoule
// (Ionicons + couleur simple) utilisée dans budget.tsx.
const COULEUR_CADENAS = "#2D3A4A";

// RÈGLE À NE JAMAIS CASSER : pas de flou ici, ni natif (expo-blur,
// react-native-blur — mêmes modules natifs nécessitant un rebuild qui n'a
// pas eu lieu, testé et cassé une première fois) ni simulé par des couches
// semi-transparentes (essayé ensuite : le contenu restait partiellement
// devinable). Bloc totalement OPAQUE à la place — aucune ambiguïté, aucune
// dépendance native, fiable partout : le contenu en dessous n'est ni lisible
// ni devinable, seule sa hauteur est préservée (children toujours rendu en
// dessous, jamais remplacé par un placeholder vide).
//
// RÈGLE À NE JAMAIS CASSER : la couche opaque (le View "cache" ci-dessous)
// et la couche tactile (le Pressable) sont deux éléments SÉPARÉS, jamais le
// même composant. Un TouchableOpacity/Pressable qui porte à la fois le
// fond opaque ET la gestion du tap réduit son opacité pendant l'appui
// (comportement par défaut de ces composants, même sans activeOpacity
// explicite) — le contenu verrouillé redevenait lisible en maintenant le
// doigt dessus. Le View "cache" n'a aucune interactivité (pas de onPress,
// pas de Pressable) donc rien ne peut jamais faire varier son opacité ; le
// Pressable au-dessus est entièrement transparent, donc même s'il change
// d'état visuel au press, il n'y a rien de coloré à voir varier.
export function InsightVerrouille({
  deverrouille,
  onDeverrouille,
  children,
}: {
  deverrouille: boolean;
  onDeverrouille: () => void;
  children: ReactNode;
}) {
  const { theme, couleurs: C } = useTheme();
  const [enCoursDeblocage, setEnCoursDeblocage] = useState(false);

  if (deverrouille) return <>{children}</>;

  const demanderDeblocage = () => {
    Alert.alert(
      "Débloquer les analyses",
      "Regardez une courte publicité pour accéder à toutes vos analyses personnalisées.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Regarder la pub",
          onPress: () => {
            setEnCoursDeblocage(true);
            // Simulation de la pub récompensée — à remplacer par un vrai
            // SDK (AdMob) plus tard, sans changer onDeverrouille qu'elle
            // déclenche ni ce délai.
            setTimeout(() => {
              setEnCoursDeblocage(false);
              onDeverrouille();
              Alert.alert("Analyses débloquées !");
            }, 1500);
          },
        },
      ],
    );
  };

  return (
    <View style={styles.conteneur}>
      <View pointerEvents="none">{children}</View>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.cache,
          { backgroundColor: theme === "sombre" ? C.fond : C.fondSecondaire },
        ]}
      >
        <Ionicons name="lock-closed" size={24} color={COULEUR_CADENAS} />
        <Text style={styles.texteDeverrouiller}>Débloquer mes analyses</Text>
      </View>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={demanderDeblocage}
        disabled={enCoursDeblocage}
        accessibilityLabel="Déverrouiller mes analyses"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  conteneur: { position: "relative", overflow: "hidden", borderRadius: 12 },
  cache: { alignItems: "center", justifyContent: "center", gap: 6 },
  texteDeverrouiller: {
    fontSize: 13,
    fontWeight: "700",
    color: COULEUR_CADENAS,
  },
});
