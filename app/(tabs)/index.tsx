import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const PURPLE = "#8B6FE8";
const PURPLE_LIGHT = "#F0EEFF";
const PURPLE_MID = "#C9B8F5";
const MINT = "#5DC8A0";
const MINT_LIGHT = "#E8F8F2";
const PEACH = "#F4956A";
const PEACH_LIGHT = "#FFF0EA";

const enveloppes = [
  { nom: "Courses", depense: 157, budget: 250, couleur: MINT, bg: MINT_LIGHT },
  {
    nom: "Restaurants",
    depense: 66,
    budget: 200,
    couleur: PEACH,
    bg: PEACH_LIGHT,
  },
  {
    nom: "Transport",
    depense: 34,
    budget: 80,
    couleur: PURPLE,
    bg: PURPLE_LIGHT,
  },
  {
    nom: "Loisirs",
    depense: 179,
    budget: 200,
    couleur: PEACH,
    bg: PEACH_LIGHT,
  },
  { nom: "Abonnements", depense: 0, budget: 50, couleur: MINT, bg: MINT_LIGHT },
  {
    nom: "Logement",
    depense: 0,
    budget: 850,
    couleur: PURPLE,
    bg: PURPLE_LIGHT,
  },
];

export default function Dashboard() {
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.appName}>VISTA</Text>
          <Text style={styles.subtitle}>Juin 2026</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>M</Text>
        </View>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroLabel}>DÉPENSÉ CE MOIS</Text>
        <Text style={styles.heroAmount}>436 €</Text>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: "24%" }]} />
        </View>
        <View style={styles.heroFooter}>
          <Text style={styles.heroSub}>24% du budget</Text>
          <Text style={styles.heroSub}>1 364 € restants</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: MINT_LIGHT }]}>
          <Text style={[styles.statLabel, { color: MINT }]}>DÉPENSÉ</Text>
          <Text style={[styles.statValue, { color: "#0F6E56" }]}>436 €</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: PURPLE_LIGHT }]}>
          <Text style={[styles.statLabel, { color: PURPLE }]}>RESTANT</Text>
          <Text style={[styles.statValue, { color: "#5A3DC4" }]}>1 364 €</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: PEACH_LIGHT }]}>
          <Text style={[styles.statLabel, { color: PEACH }]}>BUDGET</Text>
          <Text style={[styles.statValue, { color: "#993C1D" }]}>1 800 €</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>ENVELOPPES</Text>

      {enveloppes.map((env) => {
        const pct = Math.min((env.depense / env.budget) * 100, 100);
        const isAlert = pct > 80;
        return (
          <TouchableOpacity
            key={env.nom}
            style={[styles.envCard, { backgroundColor: env.bg }]}
            activeOpacity={0.7}
          >
            <View style={styles.envRow}>
              <Text
                style={[styles.envNom, { color: isAlert ? PEACH : "#1A1A1A" }]}
              >
                {env.nom}
              </Text>
              <Text style={[styles.envMontant, { color: env.couleur }]}>
                {env.depense} € / {env.budget} €
              </Text>
            </View>
            <View style={styles.envBarBg}>
              <View
                style={[
                  styles.envBarFill,
                  { width: `${pct}%`, backgroundColor: env.couleur },
                ]}
              />
            </View>
          </TouchableOpacity>
        );
      })}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 60,
    marginBottom: 24,
  },
  appName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1A1A1A",
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 13,
    color: "#999",
    marginTop: 2,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  hero: {
    backgroundColor: PURPLE,
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
  },
  heroLabel: {
    fontSize: 10,
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 1,
    marginBottom: 8,
  },
  heroAmount: {
    fontSize: 48,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 20,
  },
  barBg: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 2,
    marginBottom: 10,
  },
  barFill: {
    height: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 2,
  },
  heroFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  heroSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 28,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "600",
    color: "#999",
    letterSpacing: 1,
    marginBottom: 12,
  },
  envCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
  },
  envRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  envNom: {
    fontSize: 14,
    fontWeight: "500",
  },
  envMontant: {
    fontSize: 12,
  },
  envBarBg: {
    height: 4,
    backgroundColor: "rgba(0,0,0,0.08)",
    borderRadius: 2,
    overflow: "hidden",
  },
  envBarFill: {
    height: "100%",
    borderRadius: 2,
  },
});
