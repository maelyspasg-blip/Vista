import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const PURPLE = "#8B6FE8";
const PURPLE_LIGHT = "#F0EEFF";
const MINT = "#5DC8A0";
const MINT_LIGHT = "#E8F8F2";
const PEACH = "#F4956A";
const PEACH_LIGHT = "#FFF0EA";

const FILTRES = ["Semaine", "Mois", "Année"];

const CATEGORIES_DATA = [
  {
    nom: "Courses",
    montant: 157,
    budget: 250,
    couleur: MINT,
    bg: MINT_LIGHT,
    pct: 32,
  },
  {
    nom: "Loisirs",
    montant: 179,
    budget: 200,
    couleur: PEACH,
    bg: PEACH_LIGHT,
    pct: 37,
  },
  {
    nom: "Restaurants",
    montant: 66,
    budget: 200,
    couleur: PURPLE,
    bg: PURPLE_LIGHT,
    pct: 14,
  },
  {
    nom: "Transport",
    montant: 34,
    budget: 80,
    couleur: "#A8E6CF",
    bg: MINT_LIGHT,
    pct: 7,
  },
  {
    nom: "Abonnements",
    montant: 20,
    budget: 50,
    couleur: "#C9B8F5",
    bg: PURPLE_LIGHT,
    pct: 4,
  },
  {
    nom: "Autre",
    montant: 30,
    budget: 100,
    couleur: "#FFD3B6",
    bg: PEACH_LIGHT,
    pct: 6,
  },
];

const TOP_DEPENSES = [
  {
    nom: "Anniversaire ami",
    categorie: "Loisirs",
    montant: 120,
    couleur: PEACH,
    bg: PEACH_LIGHT,
  },
  {
    nom: "Carrefour",
    categorie: "Courses",
    montant: 64,
    couleur: MINT,
    bg: MINT_LIGHT,
  },
  {
    nom: "Picard",
    categorie: "Courses",
    montant: 42,
    couleur: MINT,
    bg: MINT_LIGHT,
  },
  {
    nom: "Le Petit Bistrot",
    categorie: "Restaurants",
    montant: 38,
    couleur: PURPLE,
    bg: PURPLE_LIGHT,
  },
  {
    nom: "Cinéma",
    categorie: "Loisirs",
    montant: 14,
    couleur: PEACH,
    bg: PEACH_LIGHT,
  },
];

const TOTAL = CATEGORIES_DATA.reduce((acc, c) => acc + c.montant, 0);

export default function Analytics() {
  const [filtre, setFiltre] = useState("Mois");

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.titre}>Analytics</Text>
        <Text style={styles.sousTitre}>Vue d'ensemble · {filtre}</Text>
      </View>

      <View style={styles.filtres}>
        {FILTRES.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filtre, filtre === f && styles.filtreActif]}
            onPress={() => setFiltre(f)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filtreTexte,
                filtre === f && styles.filtreTexteActif,
              ]}
            >
              {f}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Résumé 4 stats */}
      <View style={styles.resumeGrid}>
        <View style={[styles.resumeCard, { backgroundColor: MINT_LIGHT }]}>
          <Text style={[styles.resumeVal, { color: "#0F6E56" }]}>
            {TOTAL} €
          </Text>
          <Text style={[styles.resumeLabel, { color: MINT }]}>
            Total dépensé
          </Text>
        </View>
        <View style={[styles.resumeCard, { backgroundColor: PURPLE_LIGHT }]}>
          <Text style={[styles.resumeVal, { color: "#5A3DC4" }]}>
            {Math.round(TOTAL / 30)} €
          </Text>
          <Text style={[styles.resumeLabel, { color: PURPLE }]}>
            Moy. par jour
          </Text>
        </View>
        <View style={[styles.resumeCard, { backgroundColor: PEACH_LIGHT }]}>
          <Text style={[styles.resumeVal, { color: "#993C1D" }]}>Loisirs</Text>
          <Text style={[styles.resumeLabel, { color: PEACH }]}>
            Top catégorie
          </Text>
        </View>
        <View style={[styles.resumeCard, { backgroundColor: MINT_LIGHT }]}>
          <Text style={[styles.resumeVal, { color: "#0F6E56" }]}>+ 316 €</Text>
          <Text style={[styles.resumeLabel, { color: MINT }]}>Sous budget</Text>
        </View>
      </View>

      {/* Répartition visuelle */}
      <View style={styles.card}>
        <Text style={styles.cardTitre}>Répartition des dépenses</Text>

        {/* Barre empilée */}
        <View style={styles.barreEmpilee}>
          {CATEGORIES_DATA.map((cat, i) => (
            <View
              key={i}
              style={[
                styles.barreSegment,
                {
                  width: `${cat.pct}%`,
                  backgroundColor: cat.couleur,
                  borderRadius:
                    i === 0 ? 4 : i === CATEGORIES_DATA.length - 1 ? 4 : 0,
                },
              ]}
            />
          ))}
        </View>

        {/* Légende */}
        <View style={styles.legendeGrid}>
          {CATEGORIES_DATA.map((cat, i) => (
            <View key={i} style={styles.legendeItem}>
              <View
                style={[styles.legendeDot, { backgroundColor: cat.couleur }]}
              />
              <Text style={styles.legendeNom}>{cat.nom}</Text>
              <Text style={styles.legendePct}>{cat.pct}%</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Par catégorie */}
      <View style={styles.card}>
        <Text style={styles.cardTitre}>Par catégorie</Text>
        {CATEGORIES_DATA.map((cat, i) => (
          <View key={i} style={styles.catRow}>
            <View style={styles.catHeader}>
              <View style={styles.catLeft}>
                <View
                  style={[styles.catDot, { backgroundColor: cat.couleur }]}
                />
                <Text style={styles.catNom}>{cat.nom}</Text>
              </View>
              <Text style={styles.catMontant}>
                {cat.montant} € / {cat.budget} €
              </Text>
            </View>
            <View style={styles.catBarBg}>
              <View
                style={[
                  styles.catBarFill,
                  {
                    width: `${Math.min((cat.montant / cat.budget) * 100, 100)}%`,
                    backgroundColor: cat.couleur,
                  },
                ]}
              />
            </View>
          </View>
        ))}
      </View>

      {/* Top dépenses */}
      <View style={styles.card}>
        <Text style={styles.cardTitre}>Top dépenses</Text>
        {TOP_DEPENSES.map((dep, i) => (
          <View key={i} style={[styles.topItem, { backgroundColor: dep.bg }]}>
            <View style={[styles.topRank, { backgroundColor: dep.couleur }]}>
              <Text style={styles.topRankTexte}>{i + 1}</Text>
            </View>
            <View style={styles.topContent}>
              <Text style={[styles.topNom, { color: dep.couleur }]}>
                {dep.nom}
              </Text>
              <Text style={styles.topCat}>{dep.categorie}</Text>
            </View>
            <Text style={[styles.topMontant, { color: dep.couleur }]}>
              {dep.montant} €
            </Text>
          </View>
        ))}
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF", paddingHorizontal: 20 },
  header: { marginTop: 60, marginBottom: 20 },
  titre: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1A1A1A",
    letterSpacing: 1,
  },
  sousTitre: { fontSize: 13, color: "#999", marginTop: 2 },
  filtres: {
    flexDirection: "row",
    backgroundColor: "#F7F7F7",
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  filtre: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  filtreActif: { backgroundColor: "#FFFFFF" },
  filtreTexte: { fontSize: 13, color: "#999", fontWeight: "500" },
  filtreTexteActif: { color: PURPLE, fontWeight: "600" },
  resumeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  resumeCard: { width: "47%", borderRadius: 14, padding: 14 },
  resumeVal: { fontSize: 18, fontWeight: "700", marginBottom: 4 },
  resumeLabel: { fontSize: 11, fontWeight: "500" },
  card: {
    backgroundColor: "#FAFAFA",
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 0.5,
    borderColor: "#F0EEF8",
  },
  cardTitre: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 16,
  },
  barreEmpilee: {
    flexDirection: "row",
    height: 12,
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 16,
  },
  barreSegment: { height: "100%" },
  legendeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  legendeItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    width: "45%",
  },
  legendeDot: { width: 8, height: 8, borderRadius: 4 },
  legendeNom: { flex: 1, fontSize: 12, color: "#1A1A1A" },
  legendePct: { fontSize: 12, color: "#999", fontWeight: "500" },
  catRow: { marginBottom: 12 },
  catHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  catLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catNom: { fontSize: 13, color: "#1A1A1A" },
  catMontant: { fontSize: 12, color: "#999" },
  catBarBg: {
    height: 4,
    backgroundColor: "#EEEEEE",
    borderRadius: 2,
    overflow: "hidden",
  },
  catBarFill: { height: "100%", borderRadius: 2 },
  topItem: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  topRank: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  topRankTexte: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },
  topContent: { flex: 1 },
  topNom: { fontSize: 13, fontWeight: "500", marginBottom: 2 },
  topCat: { fontSize: 11, color: "#999" },
  topMontant: { fontSize: 14, fontWeight: "600" },
});
