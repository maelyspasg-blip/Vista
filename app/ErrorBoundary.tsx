import { Component, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

// RÈGLE À NE JAMAIS CASSER — PORTÉE RÉELLE DE CE COMPOSANT, NE PAS SURESTIMER
// CE QU'IL PROTÈGE : un ErrorBoundary React ne capture QUE les exceptions
// levées PENDANT LE RENDU d'un composant de son arbre (render, hooks,
// lifecycle) — jamais une erreur dans un event handler (onPress...), un
// timer, une Promise non gérée (déjà couvertes ailleurs par les try/catch
// systématiques de app/store.ts, cf. RÈGLE en tête de ce fichier), et
// SURTOUT jamais un crash NATIF survenant hors de React (SDK natif qui
// plante à l'initialisation, avant même que le JS n'ait la main). Ce
// composant protège contre l'écran blanc/l'app qui se ferme silencieusement
// pour une exception JS de RENDU non gérée — il ne remplace jamais un audit
// des points d'entrée natifs (modules requis au chargement du bundle,
// config native dans app.json).
//
// RÈGLE À NE JAMAIS CASSER — EXPORT NOMMÉ, JAMAIS PAR DÉFAUT : ce fichier vit
// directement dans app/, balayé par le require.context d'expo-router
// (construction de la table de routes) comme tout fichier à cet endroit —
// un export par défaut serait interprété comme un écran valide. Même
// convention que ThemeContext.tsx/GuestContext.tsx/Texte.tsx etc.
//
// RÈGLE À NE JAMAIS CASSER — AUCUNE DÉPENDANCE À UN CONTEXTE DE L'APP : ce
// composant doit pouvoir s'afficher même si ThemeProvider/AccessibiliteProvider
// (ou n'importe quel autre provider) est LUI-MÊME la cause du crash — jamais
// `useTheme()`/`useAccessibilite()`/le `Text` de app/Texte.tsx ici, toujours
// le `Text` brut de react-native et des couleurs en dur.
type Props = { children: ReactNode };
type State = { erreur: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { erreur: null };

  static getDerivedStateFromError(erreur: Error): State {
    return { erreur };
  }

  componentDidCatch(erreur: Error, info: { componentStack?: string | null }) {
    console.error(
      "[ErrorBoundary] Erreur de rendu non gérée — l'app affiche un écran de secours au lieu de crasher :",
      erreur,
      info.componentStack,
    );
  }

  render() {
    if (this.state.erreur) {
      return (
        <View style={styles.conteneur}>
          <Text style={styles.titre}>Une erreur est survenue</Text>
          <Text style={styles.message}>
            {this.state.erreur.message || "Erreur inconnue."}
          </Text>
          <Text style={styles.astuce}>
            Ferme complètement l&apos;app et relance-la. Si le problème
            persiste, contacte le support.
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  conteneur: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#FFFFFF",
  },
  titre: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
    color: "#1A1A1A",
  },
  message: {
    fontSize: 14,
    textAlign: "center",
    color: "#666666",
    marginBottom: 16,
  },
  astuce: {
    fontSize: 13,
    textAlign: "center",
    color: "#999999",
  },
});
