import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { BarreProgression } from "../app/BarreProgression";
import { BoutonPrincipal } from "../app/BoutonPrincipal";
import { Text } from "../app/Texte";
import { useTheme } from "../app/ThemeContext";

// Wrapper commun aux 6 écrans du questionnaire d'onboarding : fond, logo,
// barre de progression, titre/aide, zone de contenu scrollable, et le
// bouton principal (+ éventuel bouton secondaire "Passer cette étape") fixé
// en bas. Évite de dupliquer cette mécanique dans chaque écran.
//
// Vit hors de app/ (pas app/onboarding/) : expo-router scanne récursivement
// tout app/ pour construire sa table de routes, et un fichier sans default
// export à l'intérieur y déclenche "Route ... is missing the required
// default export" même préfixé d'un underscore (cette version d'expo-router
// n'a pas de convention d'exclusion par nom de fichier, seul _layout est
// spécial — vérifié dans node_modules/expo-router/build/getRoutesCore.js).
export function OnboardingEtape({
  etapeActuelle,
  totalEtapes,
  titre,
  aide,
  children,
  boutonLabel = "Continuer",
  onContinuer,
  chargement,
  boutonSecondaireLabel,
  onBoutonSecondaire,
  erreur,
  onRetour,
}: {
  etapeActuelle: number;
  totalEtapes: number;
  titre: string;
  aide?: string;
  children?: ReactNode;
  boutonLabel?: string;
  onContinuer: () => void;
  chargement?: boolean;
  boutonSecondaireLabel?: string;
  onBoutonSecondaire?: () => void;
  erreur?: string;
  onRetour?: () => void;
}) {
  const { theme, couleurs: C } = useTheme();
  const fond = theme === "sombre" ? C.fond : C.fondPage;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: fond }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!!onRetour && (
          <TouchableOpacity
            onPress={onRetour}
            disabled={chargement}
            style={styles.boutonRetour}
            accessibilityRole="button"
            accessibilityLabel="Étape précédente"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={22} color={C.texte} />
          </TouchableOpacity>
        )}
        <Image
          source={require("../assets/images/vista-logo-mark.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <BarreProgression
          pourcentage={(etapeActuelle / totalEtapes) * 100}
          couleur={C.purple}
          couleurFond={C.purpleLight}
          hauteur={6}
          style={styles.barre}
        />
        <Text style={[styles.titre, { color: C.texte }]}>{titre}</Text>
        {!!aide && (
          <Text style={[styles.aide, { color: C.texteMuted }]}>{aide}</Text>
        )}

        {children}

        {!!erreur && (
          <Text style={[styles.erreur, { color: C.rougeText }]}>{erreur}</Text>
        )}
      </ScrollView>

      <View style={[styles.pied, { backgroundColor: fond }]}>
        {!!boutonSecondaireLabel && (
          <TouchableOpacity
            onPress={onBoutonSecondaire}
            disabled={chargement}
            style={styles.boutonSecondaire}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.boutonSecondaireTexte, { color: C.texteMuted }]}
            >
              {boutonSecondaireLabel}
            </Text>
          </TouchableOpacity>
        )}
        <BoutonPrincipal
          style={[
            styles.bouton,
            { backgroundColor: C.purple, opacity: chargement ? 0.7 : 1 },
          ]}
          onPress={onContinuer}
          disabled={chargement}
        >
          {chargement ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.boutonTexte}>{boutonLabel}</Text>
          )}
        </BoutonPrincipal>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 64,
    paddingBottom: 24,
  },
  boutonRetour: { marginBottom: 16, alignSelf: "flex-start" },
  logo: { width: 28, height: 28, marginBottom: 20 },
  barre: { marginBottom: 28 },
  titre: { fontSize: 24, fontWeight: "700", marginBottom: 8 },
  aide: { fontSize: 14, marginBottom: 28 },
  erreur: { fontSize: 13, marginTop: 12 },
  pied: { paddingHorizontal: 28, paddingBottom: 32, paddingTop: 12 },
  boutonSecondaire: { alignItems: "center", paddingVertical: 12 },
  boutonSecondaireTexte: { fontSize: 14, fontWeight: "600" },
  bouton: { borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  boutonTexte: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
});
