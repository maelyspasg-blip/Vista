import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
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
import { styleModaleTablette, useEstTablette } from "../app/useTablette";

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
  piedDansLeDefilement = false,
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
  // Demande du 2026-10-10 (étape "autres dépenses") : le pied (bouton
  // principal + secondaire) est placé DANS le défilement, après le contenu,
  // au lieu d'être fixé en bas — et il est masqué tant que le clavier est
  // ouvert. Fixé, le KeyboardAvoidingView le remontait juste au-dessus du
  // clavier : l'utilisateur tapait "Continuer" par erreur en pleine saisie.
  // Désactivé par défaut : les autres étapes gardent leur pied fixe.
  piedDansLeDefilement?: boolean;
}) {
  const { theme, couleurs: C } = useTheme();
  const fond = theme === "sombre" ? C.fond : C.fondPage;
  const estTablette = useEstTablette();
  // État réel du clavier AU MONTAGE (bug trouvé en revue le 2026-10-10 :
  // initialisé à false, il pouvait rester bloqué à "ouvert" d'une étape à
  // l'autre et masquer Continuer clavier fermé). L'étape qui utilise
  // piedDansLeDefilement est montée avec une `key` dédiée
  // (app/onboarding/preferences.tsx) : instance neuve à chaque arrivée.
  const [clavierOuvert, setClavierOuvert] = useState(() =>
    piedDansLeDefilement ? Keyboard.isVisible() : false,
  );
  useEffect(() => {
    if (!piedDansLeDefilement) return;
    // "Will" sur iOS (avant l'animation du clavier), "Did" sur Android
    // (seuls événements émis).
    const evOuverture =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const evFermeture =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const abonnementOuverture = Keyboard.addListener(evOuverture, () =>
      setClavierOuvert(true),
    );
    const abonnementFermeture = Keyboard.addListener(evFermeture, () =>
      setClavierOuvert(false),
    );
    return () => {
      abonnementOuverture.remove();
      abonnementFermeture.remove();
    };
  }, [piedDansLeDefilement]);

  const pied = (
    <View
    style={[
      styles.pied,
      { backgroundColor: fond },
      piedDansLeDefilement && styles.piedDansLeDefilement,
    ]}
  >
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
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: fond }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* RÈGLE — iPad : colonne de contenu limitée à 560px, centrée — un
          seul point de changement pour les 6 écrans du questionnaire
          d'onboarding, qui passent tous par ce composant partagé. Englobe
          ScrollView ET pied (bouton fixe en bas) pour qu'ils restent alignés
          sur la même colonne centrée. */}
      <View style={[{ flex: 1 }, styleModaleTablette(estTablette, 560)]}>
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

        {piedDansLeDefilement && !clavierOuvert && pied}
      </ScrollView>

      {!piedDansLeDefilement && pied}
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
  // Dans le défilement, le contenu porte déjà les marges horizontales
  // (scrollContent) : pas de padding latéral en double, et un écart net
  // avec le contenu au-dessus.
  piedDansLeDefilement: { paddingHorizontal: 0, paddingTop: 32, paddingBottom: 8 },
  boutonSecondaire: { alignItems: "center", paddingVertical: 12 },
  boutonSecondaireTexte: { fontSize: 14, fontWeight: "600" },
  bouton: { borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  boutonTexte: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
});
