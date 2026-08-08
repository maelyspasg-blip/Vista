import { StyleSheet, TouchableOpacity, View } from "react-native";
import { trierParDistinction } from "../utils/couleurs";

export const PALETTE_COULEURS = [
  "#E63946",
  "#FF6B6B",
  "#F4956A",
  "#E8A33D",
  "#D9A04A",
  "#FFD166",
  "#8AC926",
  "#5DC8A0",
  "#2EC4B6",
  "#4ECDC4",
  "#5BC0BE",
  "#3AA655",
  "#1982C4",
  "#4A90D9",
  "#2E86AB",
  "#6B8CAE",
  "#4A5FD9",
  "#6A4C93",
  "#8B6FE8",
  "#9B5DE5",
  "#B565D9",
  "#D94A8C",
  "#E85D75",
  "#FF8FA3",
  "#C73E1D",
  "#8D6E63",
  "#78716C",
  "#5C6470",
];

export function ColorPicker({
  value,
  onChange,
  borderColor,
  couleursUtilisees,
}: {
  value: string;
  onChange: (couleur: string) => void;
  borderColor: string;
  // Couleurs déjà prises par d'autres catégories — quand fourni, la palette
  // affichée est réordonnée pour proposer en premier les couleurs les plus
  // distinctes de celles-ci, plutôt que l'ordre fixe de PALETTE_COULEURS.
  couleursUtilisees?: string[];
}) {
  const palette = couleursUtilisees
    ? trierParDistinction(PALETTE_COULEURS, couleursUtilisees)
    : PALETTE_COULEURS;

  return (
    <View style={styles.grid}>
      {palette.map((c) => (
        <TouchableOpacity
          key={c}
          style={[
            styles.swatch,
            { backgroundColor: c },
            value === c && { borderWidth: 3, borderColor },
          ]}
          onPress={() => onChange(c)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Choisir la couleur ${c}`}
          accessibilityState={{ selected: value === c }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 11, marginBottom: 6 },
  swatch: { width: 36, height: 36, borderRadius: 18 },
});
