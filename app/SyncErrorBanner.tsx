import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useObjectifs } from "./store";

export function SyncErrorBanner() {
  const { erreurSync, effacerErreurSync } = useObjectifs();

  useEffect(() => {
    if (!erreurSync) return;
    const t = setTimeout(() => effacerErreurSync(), 5000);
    return () => clearTimeout(t);
  }, [erreurSync]);

  if (!erreurSync) return null;

  return (
    <View style={styles.banniere} pointerEvents="none">
      <Text style={styles.texte}>{erreurSync}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banniere: {
    position: "absolute",
    top: 55,
    left: 16,
    right: 16,
    backgroundColor: "#E24B4A",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    zIndex: 999,
  },
  texte: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
});
