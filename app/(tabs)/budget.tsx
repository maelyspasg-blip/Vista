import { StyleSheet, Text, View } from "react-native";

export default function Budget() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Budget</Text>
      <Text style={styles.subtitle}>Bientôt disponible</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F3EE",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    color: "#1A1A1A",
  },
  subtitle: {
    fontSize: 14,
    color: "#888",
    marginTop: 8,
  },
});
