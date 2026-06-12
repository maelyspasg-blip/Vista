import { ScrollView, StyleSheet, Text, View } from "react-native";

const enveloppes = [
  { nom: "Courses", depense: 157, budget: 250, couleur: "#4CAF50" },
  { nom: "Restaurants", depense: 66, budget: 200, couleur: "#FF5722" },
  { nom: "Transport", depense: 34, budget: 80, couleur: "#2196F3" },
  { nom: "Loisirs", depense: 179, budget: 200, couleur: "#9C27B0" },
  { nom: "Abonnements", depense: 0, budget: 50, couleur: "#FF9800" },
  { nom: "Logement", depense: 0, budget: 850, couleur: "#795548" },
];

export default function Dashboard() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.appName}>VISTA</Text>
        <Text style={styles.subtitle}>Pilotage financier · Juin 2026</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>BUDGET DU MOIS</Text>
        <Text style={styles.bigNumber}>436 €</Text>
        <Text style={styles.cardSub}>/ 1 800 € budget mensuel</Text>
      </View>

      <View style={styles.row}>
        <View style={[styles.card, styles.halfCard]}>
          <Text style={styles.cardLabel}>RESTE À DÉPENSER</Text>
          <Text style={styles.bigNumber}>1 364 €</Text>
        </View>
        <View style={[styles.card, styles.halfCard]}>
          <Text style={styles.cardLabel}>CE MOIS</Text>
          <Text style={styles.bigNumber}>436 €</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>ENVELOPPES</Text>

      {enveloppes.map((env) => (
        <View key={env.nom} style={styles.card}>
          <View style={styles.envRow}>
            <View style={[styles.dot, { backgroundColor: env.couleur }]} />
            <Text style={styles.envNom}>{env.nom}</Text>
            <Text style={styles.envMontant}>
              {env.depense} € / {env.budget} €
            </Text>
          </View>
          <View style={styles.barreContainer}>
            <View
              style={[
                styles.barreFill,
                {
                  width: `${Math.min((env.depense / env.budget) * 100, 100)}%`,
                  backgroundColor: env.couleur,
                },
              ]}
            />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F3EE",
    padding: 20,
  },
  header: {
    marginTop: 60,
    marginBottom: 24,
  },
  appName: {
    fontSize: 24,
    fontWeight: "600",
    color: "#1A1A1A",
  },
  subtitle: {
    fontSize: 13,
    color: "#888",
    marginTop: 2,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: "#E0DDD6",
  },
  cardLabel: {
    fontSize: 10,
    color: "#888",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  bigNumber: {
    fontSize: 28,
    fontWeight: "500",
    color: "#1A1A1A",
  },
  cardSub: {
    fontSize: 12,
    color: "#888",
    marginTop: 4,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  halfCard: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 10,
    color: "#888",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 4,
  },
  envRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  envNom: {
    fontSize: 14,
    color: "#1A1A1A",
    flex: 1,
  },
  envMontant: {
    fontSize: 12,
    color: "#888",
  },
  barreContainer: {
    height: 4,
    backgroundColor: "#F0EDE6",
    borderRadius: 2,
    overflow: "hidden",
  },
  barreFill: {
    height: "100%",
    borderRadius: 2,
  },
});
