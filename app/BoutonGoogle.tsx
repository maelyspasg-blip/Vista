import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Text } from "./Texte";

// RÈGLE À NE JAMAIS CASSER — BOUTON GOOGLE SUR MESURE (décision de Maëlys du
// 2026-10-11, remplace GoogleSigninButton) : le composant officiel de la
// librairie n'expose ni le rayon, ni la taille du texte/du logo, et ne
// pouvait donc pas être aligné sur le bouton Apple (AppleAuthenticationButton,
// lui TOUJOURS officiel — imposé par Apple pour l'App Store). Ce bouton suit
// la charte "Sign in with Google" (autorise un bouton personnalisé) : fond
// blanc, bordure #747775 de 1px, texte #1F1F1F, logo "G" officiel 4 couleurs
// (jamais redessiné ni recoloré), libellé "Continuer/S'inscrire avec
// Google". Gabarit IDENTIQUE au bouton Apple des écrans appelants : hauteur
// 50, rayon 16, pleine largeur. Seule source de ce bouton (connexion.tsx et
// inscription.tsx) — jamais dupliqué.
export function BoutonGoogle({
  libelle,
  onPress,
  chargement = false,
}: {
  libelle: string;
  onPress: () => void;
  chargement?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={chargement}
      activeOpacity={0.8}
      style={[styles.bouton, { opacity: chargement ? 0.6 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={libelle}
    >
      {chargement ? (
        <ActivityIndicator color="#1F1F1F" />
      ) : (
        <View style={styles.contenu}>
          <LogoGoogle />
          <Text style={styles.texte} allowFontScaling={false}>
            {libelle}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// Logo "G" officiel (chemins publiés par Google, viewBox 48x48).
function LogoGoogle() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  bouton: {
    width: "100%",
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#747775",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  contenu: { flexDirection: "row", alignItems: "center", gap: 10 },
  texte: { fontSize: 17, fontWeight: "600", color: "#1F1F1F" },
});
