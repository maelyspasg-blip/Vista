import { forwardRef } from "react";
import { StyleSheet, TextInput as RNTextInput, type TextInputProps } from "react-native";
import { useAccessibilite } from "./AccessibiliteContext";

// Équivalent de Texte.tsx pour les champs de saisie : importer `TextInput`
// depuis ce fichier fait suivre la taille de texte choisie sans toucher au
// JSX existant.
export const TextInput = forwardRef<RNTextInput, TextInputProps>(
  function TextInput({ style, allowFontScaling, ...props }, ref) {
    const { echelleTexte } = useAccessibilite();
    const aplati = StyleSheet.flatten(style);

    const styleAjuste =
      aplati && typeof aplati.fontSize === "number"
        ? [style, { fontSize: aplati.fontSize * echelleTexte }]
        : style;

    return (
      <RNTextInput
        ref={ref}
        style={styleAjuste}
        allowFontScaling={allowFontScaling ?? false}
        {...props}
      />
    );
  },
);
