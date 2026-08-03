import { useRouter } from "expo-router";
import { Image, KeyboardAvoidingView, Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../Texte";
import { BoutonPrincipal } from "../BoutonPrincipal";

const PURPLE = "#8B6FE8";

// Écran terminal atteint uniquement via la redirection forcée de
// app/_layout.tsx quand un essai invité a expiré (estGuestExpire) — pas de
// session/données à charger ici, purement statique. router.replace partout
// pour qu'on ne puisse jamais revenir en arrière dessus.
export default function EssaiExpire() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        { paddingBottom: Math.max(24, insets.bottom + 12) },
      ]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Image
        source={require("../../assets/images/vista-logo-mark.png")}
        style={styles.logo}
        resizeMode="contain"
      />

      <View style={styles.contenu}>
        <Text style={styles.titre}>Ta période d&apos;essai est terminée.</Text>
        <Text style={styles.sousTitre}>
          Crée un compte pour continuer à profiter de Vista.
        </Text>

        <BoutonPrincipal
          style={styles.btnPrincipal}
          onPress={() => router.replace("/onboarding/inscription")}
          activeOpacity={0.8}
        >
          <Text style={styles.btnTexte}>Créer un compte</Text>
        </BoutonPrincipal>

        <TouchableOpacity
          style={styles.lienSecondaire}
          onPress={() => router.replace("/onboarding/connexion")}
          activeOpacity={0.7}
        >
          <Text style={styles.lienSecondaireTexte}>Se connecter</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 28,
    paddingTop: 64,
  },
  logo: { width: 28, height: 28, marginBottom: 24 },
  contenu: {
    flex: 1,
    justifyContent: "center",
  },
  titre: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 10,
  },
  sousTitre: {
    fontSize: 15,
    color: "#888",
    lineHeight: 22,
    marginBottom: 32,
  },
  btnPrincipal: {
    backgroundColor: PURPLE,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  btnTexte: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  lienSecondaire: {
    alignItems: "center",
    marginTop: 20,
  },
  lienSecondaireTexte: {
    fontSize: 14,
    fontWeight: "600",
    color: "#888",
    textDecorationLine: "underline",
  },
});
