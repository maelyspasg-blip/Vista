import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { useObjectifs } from "../store";

const PURPLE = "#8B6FE8";
const PURPLE_LIGHT = "#F0EEFF";
const MINT = "#5DC8A0";
const PEACH = "#F4956A";
const BLEU = "#4A90D9";

const MOIS_LABELS = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Jun",
  "Jul",
  "Aoû",
  "Sep",
  "Oct",
  "Nov",
  "Déc",
];
const MOIS_ACTUEL = new Date().getMonth();
const ANNEE_ACTUELLE = new Date().getFullYear();

const { width: SCREEN_W } = Dimensions.get("window");
const CHART_W = SCREEN_W - 80;
const CHART_H = 160;
const PADDING_X = 16;

type Periode = "3mois" | "6mois" | "12mois";
type Vue = "global" | "categorie";

function GraphiqueLignes({
  donneesReelles,
  donneesPrevisionnelles,
  labels,
}: {
  donneesReelles: number[];
  donneesPrevisionnelles: number[];
  labels: string[];
}) {
  const toutes = [...donneesReelles, ...donneesPrevisionnelles];
  const max = Math.max(...toutes, 1);
  const n = labels.length;
  const largeurUtile = CHART_W - PADDING_X * 2;
  const espacement = n > 1 ? largeurUtile / (n - 1) : largeurUtile;

  const pointsReels = donneesReelles.map((v, i) => ({
    x: PADDING_X + i * espacement,
    y: CHART_H - (v / max) * (CHART_H - 10) + 5,
  }));
  const pointsPrevus = donneesPrevisionnelles.map((v, i) => ({
    x: PADDING_X + i * espacement,
    y: CHART_H - (v / max) * (CHART_H - 10) + 5,
  }));

  const pathReels = pointsReels
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
  const pathPrevus = pointsPrevus
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  return (
    <Svg width={CHART_W} height={CHART_H + 24}>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <Line
          key={f}
          x1={PADDING_X}
          y1={CHART_H - f * (CHART_H - 10) + 5}
          x2={CHART_W - PADDING_X}
          y2={CHART_H - f * (CHART_H - 10) + 5}
          stroke="#F0EEF8"
          strokeWidth={1}
        />
      ))}
      <Path
        d={pathReels}
        stroke={MINT}
        strokeWidth={2.5}
        fill="none"
        strokeLinejoin="round"
      />
      {pointsReels.map((p, i) => (
        <Circle key={`r${i}`} cx={p.x} cy={p.y} r={4} fill={MINT} />
      ))}
      <Path
        d={pathPrevus}
        stroke={PEACH}
        strokeWidth={2}
        fill="none"
        strokeDasharray="6,4"
        strokeLinejoin="round"
      />
      {pointsPrevus.map((p, i) => (
        <Circle key={`p${i}`} cx={p.x} cy={p.y} r={3} fill={PEACH} />
      ))}
      {labels.map((lbl, i) => (
        <SvgText
          key={`l${i}`}
          x={PADDING_X + i * espacement}
          y={CHART_H + 18}
          fontSize={10}
          fill="#999"
          textAnchor="middle"
        >
          {lbl}
        </SvgText>
      ))}
    </Svg>
  );
}

export default function Analytics() {
  const objStore = useObjectifs();
  const [periode, setPeriode] = useState<Periode>("3mois");
  const [vue, setVue] = useState<Vue>("global");
  const [titoirOuvert, setTiroirOuvert] = useState(false);
  const [categoriesSelectionnees, setCategoriesSelectionnees] = useState<
    number[]
  >([]);

  useFocusEffect(
    useCallback(() => {
      objStore.verifierEcheancesFixes();
    }, []),
  );

  const nbMois = periode === "3mois" ? 3 : periode === "6mois" ? 6 : 12;

  const moisAffiches = Array.from({ length: nbMois }, (_, i) => {
    const d = new Date(ANNEE_ACTUELLE, MOIS_ACTUEL - nbMois + 1 + i, 1);
    return { mois: d.getMonth(), annee: d.getFullYear() };
  });

  const getDepenseMois = (
    mois: number,
    annee: number,
    enveloppeIds?: number[],
  ) => {
    if (mois === MOIS_ACTUEL && annee === ANNEE_ACTUELLE) {
      const envsFiltrees = enveloppeIds
        ? objStore.enveloppes.filter((e) => enveloppeIds.includes(e.id))
        : objStore.enveloppes;
      return envsFiltrees.reduce((acc, e) => acc + e.depense, 0);
    }
    const snap = objStore.historiquesMois.find(
      (s) => s.mois === mois && s.annee === annee,
    );
    if (!snap) return null;
    const envsFiltrees = enveloppeIds
      ? snap.enveloppes.filter((e) => enveloppeIds.includes(e.id))
      : snap.enveloppes;
    return envsFiltrees.reduce((acc, e) => acc + e.depense, 0);
  };

  const getBudgetMois = (
    mois: number,
    annee: number,
    enveloppeIds?: number[],
  ) => {
    if (mois === MOIS_ACTUEL && annee === ANNEE_ACTUELLE) {
      const envsFiltrees = enveloppeIds
        ? objStore.enveloppes.filter((e) => enveloppeIds.includes(e.id))
        : objStore.enveloppes;
      return envsFiltrees.reduce((acc, e) => acc + e.budget, 0);
    }
    const snap = objStore.historiquesMois.find(
      (s) => s.mois === mois && s.annee === annee,
    );
    if (!snap) return null;
    const envsFiltrees = enveloppeIds
      ? snap.enveloppes.filter((e) => enveloppeIds.includes(e.id))
      : snap.enveloppes;
    return envsFiltrees.reduce((acc, e) => acc + e.budget, 0);
  };

  const getEpargneMois = (mois: number, annee: number) => {
    if (mois === MOIS_ACTUEL && annee === ANNEE_ACTUELLE)
      return objStore.epargneMois;
    const snap = objStore.historiquesMois.find(
      (s) => s.mois === mois && s.annee === annee,
    );
    return snap ? snap.epargne : null;
  };

  const enveloppesFiltrees =
    categoriesSelectionnees.length > 0 ? categoriesSelectionnees : undefined;

  const donneesReelles = moisAffiches.map(
    ({ mois, annee }) => getDepenseMois(mois, annee, enveloppesFiltrees) ?? 0,
  );
  const donneesPrevisionnelles = moisAffiches.map(
    ({ mois, annee }) => getBudgetMois(mois, annee, enveloppesFiltrees) ?? 0,
  );
  const donneesEpargne = moisAffiches.map(
    ({ mois, annee }) => getEpargneMois(mois, annee) ?? 0,
  );
  const labels = moisAffiches.map(({ mois }) => MOIS_LABELS[mois]);

  const moisAvecDonnees = moisAffiches.filter(({ mois, annee }) => {
    if (mois === MOIS_ACTUEL && annee === ANNEE_ACTUELLE) return true;
    return objStore.historiquesMois.some(
      (s) => s.mois === mois && s.annee === annee,
    );
  });
  const nbMoisAvecDonnees = moisAvecDonnees.length;
  const pasSuffisammentDonnees = nbMoisAvecDonnees < nbMois;

  const depenseMoisActuel = getDepenseMois(MOIS_ACTUEL, ANNEE_ACTUELLE) ?? 0;
  const moisPrecedent = new Date(ANNEE_ACTUELLE, MOIS_ACTUEL - 1, 1);
  const depenseMoisPrec =
    getDepenseMois(moisPrecedent.getMonth(), moisPrecedent.getFullYear()) ?? 0;
  const joursEcoules = new Date().getDate();
  const depenseMoyJour =
    joursEcoules > 0 ? Math.round(depenseMoisActuel / joursEcoules) : 0;
  const depenseMoyJourPrec =
    depenseMoisPrec > 0 ? Math.round(depenseMoisPrec / 30) : 0;
  const deltaDepMoy =
    depenseMoyJourPrec > 0
      ? Math.round(
          ((depenseMoyJour - depenseMoyJourPrec) / depenseMoyJourPrec) * 100,
        )
      : 0;

  const disponible = objStore.argentDisponible;
  const epargne = objStore.epargneMois;
  const tauxEpargne =
    disponible > 0 ? Math.round((epargne / disponible) * 100) : 0;

  const deltaTotal =
    depenseMoisPrec > 0
      ? Math.round(
          ((depenseMoisActuel - depenseMoisPrec) / depenseMoisPrec) * 100,
        )
      : 0;

  const insights: string[] = [];
  if (deltaDepMoy < 0)
    insights.push(
      `Dépense journalière en baisse de ${Math.abs(deltaDepMoy)}% vs le mois dernier`,
    );
  else if (deltaDepMoy > 0)
    insights.push(
      `Dépense journalière en hausse de ${deltaDepMoy}% vs le mois dernier`,
    );
  if (tauxEpargne >= 20)
    insights.push(`Bon taux d'épargne ce mois-ci à ${tauxEpargne}%`);
  if (deltaTotal < 0)
    insights.push(
      `Tu as dépensé ${Math.abs(deltaTotal)}% de moins que le mois dernier`,
    );
  else if (deltaTotal > 0)
    insights.push(`Tu as dépensé ${deltaTotal}% de plus que le mois dernier`);
  if (insights.length === 0)
    insights.push(
      "Commence à enregistrer tes dépenses pour voir tes insights ici !",
    );

  const topDepenses: {
    nom: string;
    montant: number;
    couleur: string;
    mois: string;
  }[] = [];
  moisAffiches.forEach(({ mois, annee }) => {
    if (mois === MOIS_ACTUEL && annee === ANNEE_ACTUELLE) {
      objStore.enveloppes.forEach((e) => {
        if (e.depense > 0)
          topDepenses.push({
            nom: e.nom,
            montant: e.depense,
            couleur: e.couleur,
            mois: MOIS_LABELS[mois],
          });
      });
    } else {
      const snap = objStore.historiquesMois.find(
        (s) => s.mois === mois && s.annee === annee,
      );
      snap?.enveloppes.forEach((e) => {
        if (e.depense > 0)
          topDepenses.push({
            nom: e.nom,
            montant: e.depense,
            couleur: e.couleur,
            mois: MOIS_LABELS[mois],
          });
      });
    }
  });
  const topDepensesTri = topDepenses
    .sort((a, b) => b.montant - a.montant)
    .slice(0, 5);

  const toggleCategorie = (id: number) => {
    setCategoriesSelectionnees((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.titre}>Stats</Text>
          <Text style={styles.sousTitre}>
            {MOIS_LABELS[MOIS_ACTUEL]} {ANNEE_ACTUELLE}
          </Text>
        </View>

        <View style={styles.chipRow}>
          {(["global", "categorie"] as Vue[]).map((v) => (
            <TouchableOpacity
              key={v}
              style={[styles.chip, vue === v && styles.chipActif]}
              onPress={() => {
                setVue(v);
                if (v === "categorie") setTiroirOuvert(true);
                else {
                  setTiroirOuvert(false);
                  setCategoriesSelectionnees([]);
                }
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.chipTexte, vue === v && styles.chipTexteActif]}
              >
                {v === "global"
                  ? "Global"
                  : `Par catégorie${categoriesSelectionnees.length > 0 ? ` (${categoriesSelectionnees.length})` : ""}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {vue === "categorie" && (
          <TouchableOpacity
            style={styles.tiroirBouton}
            onPress={() => setTiroirOuvert(!titoirOuvert)}
            activeOpacity={0.7}
          >
            <Text style={styles.tiroirBoutonTexte}>
              {categoriesSelectionnees.length === 0
                ? "Sélectionner des catégories"
                : `${categoriesSelectionnees.length} catégorie${categoriesSelectionnees.length > 1 ? "s" : ""} sélectionnée${categoriesSelectionnees.length > 1 ? "s" : ""}`}
            </Text>
            <Text style={styles.tiroirChevron}>{titoirOuvert ? "▾" : "▸"}</Text>
          </TouchableOpacity>
        )}

        {vue === "categorie" && titoirOuvert && (
          <View style={styles.tiroirContenu}>
            {objStore.enveloppes.map((env) => {
              const sel = categoriesSelectionnees.includes(env.id);
              return (
                <TouchableOpacity
                  key={env.id}
                  style={[
                    styles.tiroirItem,
                    sel && { backgroundColor: env.couleur + "22" },
                  ]}
                  onPress={() => toggleCategorie(env.id)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.tiroirRond,
                      { backgroundColor: env.couleur },
                    ]}
                  />
                  <Text style={styles.tiroirNom}>{env.nom}</Text>
                  {sel && (
                    <Text style={[styles.tiroirCoche, { color: env.couleur }]}>
                      ✓
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
            {categoriesSelectionnees.length > 0 && (
              <TouchableOpacity
                style={styles.tiroirReset}
                onPress={() => setCategoriesSelectionnees([])}
                activeOpacity={0.7}
              >
                <Text style={styles.tiroirResetTexte}>Tout déselectionner</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.chipRow}>
          {(["3mois", "6mois", "12mois"] as Periode[]).map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.chip, periode === p && styles.chipActif]}
              onPress={() => setPeriode(p)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.chipTexte,
                  periode === p && styles.chipTexteActif,
                ]}
              >
                {p === "3mois"
                  ? "3 mois"
                  : p === "6mois"
                    ? "6 mois"
                    : "12 mois"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {pasSuffisammentDonnees && (
          <View style={styles.banniereInfo}>
            <Text style={styles.banniereInfoTexte}>
              {nbMoisAvecDonnees === 1
                ? `Données disponibles pour 1 mois seulement. Reviens dans ${nbMois - nbMoisAvecDonnees} mois pour une vue complète sur ${nbMois} mois.`
                : `Données disponibles pour ${nbMoisAvecDonnees} mois sur ${nbMois}. La vue sera complète dans ${nbMois - nbMoisAvecDonnees} mois.`}
            </Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>Vue d'ensemble</Text>
        <View style={styles.kpiGrid}>
          <View style={[styles.kpiCard, { backgroundColor: "#E8F8F2" }]}>
            <Text style={[styles.kpiLabel, { color: MINT }]}>
              DÉPENSE MOY. / JOUR
            </Text>
            <Text style={[styles.kpiVal, { color: "#0F6E56" }]}>
              {depenseMoyJour} €
            </Text>
            <Text
              style={[
                styles.kpiDelta,
                { color: deltaDepMoy <= 0 ? "#0F6E56" : "#993C1D" },
              ]}
            >
              {deltaDepMoy > 0 ? "↑" : "↓"} {Math.abs(deltaDepMoy)}% vs mois
              dernier
            </Text>
          </View>
          <View style={[styles.kpiCard, { backgroundColor: "#FFF0EA" }]}>
            <Text style={[styles.kpiLabel, { color: PEACH }]}>
              TAUX D'ÉPARGNE
            </Text>
            <Text style={[styles.kpiVal, { color: "#993C1D" }]}>
              {tauxEpargne}%
            </Text>
            <Text style={[styles.kpiDelta, { color: "#993C1D" }]}>
              Ce mois-ci
            </Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Dépensé vs dépenses prévues</Text>
        <View style={styles.chartCard}>
          <GraphiqueLignes
            donneesReelles={donneesReelles}
            donneesPrevisionnelles={donneesPrevisionnelles}
            labels={labels}
          />
          <View style={styles.legendeRow}>
            <View style={styles.legendeItem}>
              <View style={[styles.legendeDot, { backgroundColor: MINT }]} />
              <Text style={styles.legendeTexte}>Dépensé</Text>
            </View>
            <View style={styles.legendeItem}>
              <View style={[styles.legendeDot, { backgroundColor: PEACH }]} />
              <Text style={styles.legendeTexte}>Dépenses prévues</Text>
            </View>
          </View>
        </View>

        <View style={styles.compareCard}>
          <View style={styles.compareHead}>
            <Text style={styles.compareTitle}>
              {MOIS_LABELS[MOIS_ACTUEL]} vs{" "}
              {MOIS_LABELS[moisPrecedent.getMonth()]}
            </Text>
            <Text
              style={[
                styles.compareDelta,
                { color: deltaTotal <= 0 ? "#0F6E56" : "#993C1D" },
              ]}
            >
              {deltaTotal > 0 ? "+" : ""}
              {deltaTotal}%
            </Text>
          </View>
          {objStore.enveloppes.map((env) => {
            const pct =
              env.budget > 0 ? Math.round((env.depense / env.budget) * 100) : 0;
            return (
              <View key={env.id} style={styles.cbarRow}>
                <Text style={styles.cbarLabel} numberOfLines={1}>
                  {env.nom}
                </Text>
                <View style={styles.cbarTrack}>
                  <View
                    style={[
                      styles.cbarFill,
                      {
                        width: `${Math.min(pct, 100)}%`,
                        backgroundColor: env.couleur,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.cbarVal}>{env.depense} €</Text>
              </View>
            );
          })}
          {depenseMoisPrec > 0 && (
            <Text style={styles.compareFooter}>
              Total ce mois : {depenseMoisActuel} € vs {depenseMoisPrec} € le
              mois dernier
            </Text>
          )}
        </View>

        <Text style={styles.sectionLabel}>Épargne dans le temps</Text>
        <View style={styles.chartCard}>
          <View style={styles.barresEpargne}>
            {donneesEpargne.map((val, i) => {
              const maxE = Math.max(...donneesEpargne, 1);
              const h = Math.round((val / maxE) * 90);
              return (
                <View key={i} style={styles.barreEpargneCol}>
                  <Text style={[styles.barreEpargneVal, { color: BLEU }]}>
                    {val > 0 ? `${val}€` : ""}
                  </Text>
                  <View style={styles.barreEpargneTrack}>
                    <View
                      style={[
                        styles.barreEpargneRemplissage,
                        { height: h, backgroundColor: BLEU },
                      ]}
                    />
                  </View>
                  <Text style={styles.barreEpargneLabel}>{labels[i]}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <Text style={styles.sectionLabel}>Ce qu'il faut retenir</Text>
        <View style={styles.insightCard}>
          {insights.map((txt, i) => (
            <View
              key={i}
              style={[styles.insightItem, i > 0 && styles.insightItemBorder]}
            >
              <View style={styles.insightDot} />
              <Text style={styles.insightTexte}>{txt}</Text>
            </View>
          ))}
        </View>

        {topDepensesTri.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>
              Top dépenses — {nbMois} derniers mois
            </Text>
            {topDepensesTri.map((dep, i) => (
              <View key={i} style={styles.topItem}>
                <View
                  style={[styles.topRank, { backgroundColor: dep.couleur }]}
                >
                  <Text style={styles.topRankTexte}>{i + 1}</Text>
                </View>
                <Text style={styles.topNom}>{dep.nom}</Text>
                <Text style={styles.topMois}>{dep.mois}</Text>
                <Text style={styles.topMontant}>{dep.montant} €</Text>
              </View>
            ))}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF", paddingHorizontal: 20 },
  header: { marginTop: 60, marginBottom: 16 },
  titre: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1A1A1A",
    letterSpacing: 1,
  },
  sousTitre: { fontSize: 13, color: "#999", marginTop: 2 },
  chipRow: { flexDirection: "row", gap: 8, marginBottom: 10, flexWrap: "wrap" },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F7F7F7",
    borderWidth: 0.5,
    borderColor: "#EEE",
  },
  chipActif: { backgroundColor: PURPLE, borderColor: PURPLE },
  chipTexte: { fontSize: 12, fontWeight: "600", color: "#999" },
  chipTexteActif: { color: "#FFFFFF" },
  tiroirBouton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F7F7F7",
    borderRadius: 13,
    padding: 14,
    marginBottom: 8,
    borderWidth: 0.5,
    borderColor: "#EEE",
  },
  tiroirBoutonTexte: { fontSize: 14, color: "#1A1A1A", fontWeight: "500" },
  tiroirChevron: { fontSize: 14, color: "#999" },
  tiroirContenu: {
    backgroundColor: "#FAFAFA",
    borderRadius: 13,
    borderWidth: 0.5,
    borderColor: "#EEE",
    marginBottom: 10,
    overflow: "hidden",
  },
  tiroirItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: "#F0F0F0",
  },
  tiroirRond: { width: 12, height: 12, borderRadius: 6 },
  tiroirNom: { flex: 1, fontSize: 14, color: "#1A1A1A", fontWeight: "500" },
  tiroirCoche: { fontSize: 16, fontWeight: "700" },
  tiroirReset: { padding: 14, alignItems: "center" },
  tiroirResetTexte: { fontSize: 13, color: "#999", fontWeight: "600" },
  banniereInfo: {
    backgroundColor: PURPLE_LIGHT,
    borderRadius: 13,
    padding: 14,
    marginBottom: 10,
  },
  banniereInfoTexte: { fontSize: 13, color: "#26215C", lineHeight: 19 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#999",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 20,
    marginBottom: 10,
  },
  kpiGrid: { flexDirection: "row", gap: 10 },
  kpiCard: { flex: 1, borderRadius: 16, padding: 14 },
  kpiLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  kpiVal: { fontSize: 22, fontWeight: "700" },
  kpiDelta: { fontSize: 11, fontWeight: "600", marginTop: 3 },
  chartCard: {
    backgroundColor: "#FAFAFA",
    borderRadius: 16,
    padding: 16,
    borderWidth: 0.5,
    borderColor: "#F0EEF8",
  },
  legendeRow: { flexDirection: "row", gap: 14, marginTop: 12 },
  legendeItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendeDot: { width: 9, height: 9, borderRadius: 2 },
  legendeTexte: { fontSize: 11, color: "#999", fontWeight: "500" },
  compareCard: {
    backgroundColor: "#FAFAFA",
    borderRadius: 16,
    padding: 18,
    borderWidth: 0.5,
    borderColor: "#F0EEF8",
    marginTop: 14,
  },
  compareHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  compareTitle: { fontSize: 15, fontWeight: "700", color: "#1A1A1A" },
  compareDelta: { fontSize: 13, fontWeight: "700" },
  cbarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  cbarLabel: { fontSize: 12, fontWeight: "600", color: "#1A1A1A", width: 80 },
  cbarTrack: {
    flex: 1,
    height: 14,
    backgroundColor: "#EEEEEE",
    borderRadius: 4,
    overflow: "hidden",
  },
  cbarFill: { height: "100%", borderRadius: 4 },
  cbarVal: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1A1A1A",
    width: 50,
    textAlign: "right",
  },
  compareFooter: {
    fontSize: 11,
    color: "#999",
    fontWeight: "500",
    marginTop: 10,
  },
  barresEpargne: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-end",
    justifyContent: "space-around",
    height: 130,
  },
  barreEpargneCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  barreEpargneVal: { fontSize: 9, fontWeight: "700", marginBottom: 3 },
  barreEpargneTrack: {
    width: "80%",
    height: 90,
    justifyContent: "flex-end",
    backgroundColor: "#F0F0F0",
    borderRadius: 6,
    overflow: "hidden",
  },
  barreEpargneRemplissage: { width: "100%", borderRadius: 6 },
  barreEpargneLabel: { fontSize: 10, color: "#999", marginTop: 5 },
  insightCard: { backgroundColor: PURPLE_LIGHT, borderRadius: 16, padding: 18 },
  insightItem: { flexDirection: "row", gap: 10, paddingVertical: 10 },
  insightItemBorder: {
    borderTopWidth: 0.5,
    borderTopColor: "rgba(139,111,232,0.2)",
  },
  insightDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: PURPLE,
    marginTop: 6,
    flexShrink: 0,
  },
  insightTexte: { flex: 1, fontSize: 13, color: "#26215C", lineHeight: 19 },
  topItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 0.5,
    borderBottomColor: "#F0F0F0",
  },
  topRank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  topRankTexte: { fontSize: 11, fontWeight: "700", color: "#FFFFFF" },
  topNom: { flex: 1, fontSize: 13, fontWeight: "600", color: "#1A1A1A" },
  topMois: { fontSize: 11, color: "#999", marginRight: 8 },
  topMontant: { fontSize: 13, fontWeight: "700", color: "#1A1A1A" },
});

