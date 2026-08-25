import { Image } from "expo-image";
import { StyleSheet, Text, View, useColorScheme } from "react-native";
import { Theme } from "./ThemeContext";

// RÈGLE À NE JAMAIS CASSER : ce composant s'affiche AVANT que ThemeProvider
// soit monté (cf. RÈGLE dans app/_layout.tsx — affiché pendant `chargement`,
// hors de l'arbre ThemeProvider) : il ne peut donc JAMAIS utiliser
// useTheme() directement — la préférence stockée en base (profils.theme)
// n'est pas encore chargée à ce stade, c'est justement ce qu'on attend.
// `theme` est donc reçu en PROP, lue depuis le cache local AsyncStorage du
// dernier thème connu (cf. RÈGLE dans app/themeStorage.ts et site d'appel
// dans app/_layout.tsx) — synchrone/quasi-instantané, pas besoin d'attendre
// le réseau. useColorScheme() (préférence SYSTÈME) n'est qu'un DERNIER
// recours pour le tout premier lancement, quand aucun thème d'app n'a
// encore été mis en cache — jamais utilisé si `theme` est fourni, sous
// peine de reproduire le bug déjà rencontré (splash toujours en navy malgré
// un thème "clair" choisi dans l'app, parce que l'OS du device était en
// mode sombre : OS et thème d'app sont deux réglages indépendants).
export function SplashScreen({ theme }: { theme?: Theme | null }) {
  const schemeSysteme = useColorScheme();
  const sombre =
    theme != null ? theme === "sombre" : schemeSysteme === "dark";
  const fond = sombre ? "#0D1B2A" : "#FFFFFF";
  const couleurTexte = sombre ? "#FFFFFF" : "#2D3A4A";

  return (
    <View style={[styles.conteneur, { backgroundColor: fond }]}>
      <Image
        source={require("../assets/images/vista-logo-mark.png")}
        style={styles.logo}
        contentFit="contain"
      />
      <Text style={[styles.texte, { color: couleurTexte }]}>Vista</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  conteneur: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 90,
    height: 90,
  },
  texte: {
    marginTop: 16,
    fontSize: 28,
    fontWeight: "700",
  },
});
