import { forwardRef } from "react";
import { StyleSheet, Text as RNText, type TextProps } from "react-native";
import { useAccessibilite } from "./AccessibiliteContext";

// Remplace le `Text` de react-native partout dans l'app : importer `Text`
// depuis ce fichier au lieu de "react-native" suffit à faire suivre la
// taille de texte choisie dans Accessibilité, sans toucher au JSX existant.
export const Text = forwardRef<RNText, TextProps>(function Text(
  { style, allowFontScaling, ...props },
  ref,
) {
  const { echelleTexte } = useAccessibilite();
  const aplati = StyleSheet.flatten(style);

  const styleAjuste =
    aplati && typeof aplati.fontSize === "number"
      ? [style, { fontSize: aplati.fontSize * echelleTexte }]
      : style;

  return (
    <RNText
      ref={ref}
      style={styleAjuste}
      allowFontScaling={allowFontScaling ?? false}
      {...props}
    />
  );
});
