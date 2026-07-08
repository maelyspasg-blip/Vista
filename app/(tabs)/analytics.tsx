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
import { COULEURS, useTheme } from "../ThemeContext";

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
  couleurs: C,
}: {
  donneesReelles: number[];
  donneesPrevisionnelles: number[];
  labels: string[];
  couleurs: typeof COULEURS.clair;
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
          stroke={C.separateur}
          strokeWidth={1}
        />
      ))}
      <Path
        d={pathReels}
        stroke={C.accent}
        strokeWidth={2.5}
        fill="none"
        strokeLinejoin="round"
      />
      {pointsReels.map((p, i) => (
        <Circle key={`r${i}`} cx={p.x} cy={p.y} r={4} fill={C.accent} />
      ))}
      <Path
        d={pathPrevus}
        stroke={C.peach}
        strokeWidth={2}
        fill="none"
        strokeDasharray="6,4"
        strokeLinejoin="round"
      />
      {pointsPrevus.map((p, i) => (
        <Circle key={`p${i}`} cx={p.x} cy={p.y} r={3} fill={C.peach} />
      ))}
      {labels.map((lbl, i) => (
        <SvgText
          key={`l${i}`}
          x={PADDING_X + i * espacement}
          y={CHART_H + 18}
          fontSize={10}
          fill={C.texteMuted}
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
  const { theme, couleurs: C } = useTheme();
  const [periode, setPeriode] = useState<Periode>("3mois");
  const [vue, setVue] = useState<Vue>("global");
  const [titoirOuvert, setTiroirOuvert] = useState(false);
  const [categoriesSelectionnees, setCategoriesSelectionnees] = useState<
    number[]
  >([]);

  useFocusEffect(
    useCallback(() => {
      objStore.verifierEcheancesFixes();
      objStore.verifierVersementsObjectifs();
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

  const snapshotMoisPrecedent = objStore.historiquesMois.find(
    (s) =>
      s.mois === moisPrecedent.getMonth() &&
      s.annee === moisPrecedent.getFullYear(),
  );
  const objectifsAvecDelta = objStore.objectifs.map((obj) => {
    const pct = obj.cible > 0 ? Math.min((obj.actuel / obj.cible) * 100, 100) : 0;
    const objPrecedent = snapshotMoisPrecedent?.objectifs.find(
      (o) => o.id === obj.id,
    );
    const delta = objPrecedent ? obj.actuel - objPrecedent.actuel : null;
    return { ...obj, pct, delta };
  });

  const toggleCategorie = (id: number) => {
    setCategoriesSelectionnees((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: C.fondPage }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.titre, { color: C.texte }]}>Stats</Text>
          <Text style={[styles.sousTitre, { color: C.texteMuted }]}>
            {MOIS_LABELS[MOIS_ACTUEL]} {ANNEE_ACTUELLE}
          </Text>
        </View>

        <View style={styles.chipRow}>
          {(["global", "categorie"] as Vue[]).map((v) => (
            <TouchableOpacity
              key={v}
              style={[
                styles.chip,
                { backgroundColor: C.fondSecondaire, borderColor: C.carteBorder },
                vue === v && { backgroundColor: C.purple, borderColor: C.purple },
              ]}
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
                style={[
                  styles.chipTexte,
                  { color: C.texteMuted },
                  vue === v && styles.chipTexteActif,
                ]}
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
            style={[
              styles.tiroirBouton,
              { backgroundColor: C.fondSecondaire, borderColor: C.carteBorder },
            ]}
            onPress={() => setTiroirOuvert(!titoirOuvert)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tiroirBoutonTexte, { color: C.texte }]}>
              {categoriesSelectionnees.length === 0
                ? "Sélectionner des catégories"
                : `${categoriesSelectionnees.length} catégorie${categoriesSelectionnees.length > 1 ? "s" : ""} sélectionnée${categoriesSelectionnees.length > 1 ? "s" : ""}`}
            </Text>
            <Text style={[styles.tiroirChevron, { color: C.texteMuted }]}>
              {titoirOuvert ? "▾" : "▸"}
            </Text>
          </TouchableOpacity>
        )}

        {vue === "categorie" && titoirOuvert && (
          <View
            style={[
              styles.tiroirContenu,
              {
                backgroundColor: theme === "sombre" ? C.carte : "#FAFAFA",
                borderColor: C.carteBorder,
              },
            ]}
          >
            {objStore.enveloppes.map((env) => {
              const sel = categoriesSelectionnees.includes(env.id);
              return (
                <TouchableOpacity
                  key={env.id}
                  style={[
                    styles.tiroirItem,
                    { borderBottomColor: C.separateur },
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
                  <Text style={[styles.tiroirNom, { color: C.texte }]}>
                    {env.nom}
                  </Text>
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
                <Text style={[styles.tiroirResetTexte, { color: C.texteMuted }]}>
                  Tout déselectionner
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.chipRow}>
          {(["3mois", "6mois", "12mois"] as Periode[]).map((p) => (
            <TouchableOpacity
              key={p}
              style={[
                styles.chip,
                { backgroundColor: C.fondSecondaire, borderColor: C.carteBorder },
                periode === p && {
                  backgroundColor: C.purple,
                  borderColor: C.purple,
                },
              ]}
              onPress={() => setPeriode(p)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.chipTexte,
                  { color: C.texteMuted },
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
          <View
            style={[
              styles.banniereInfo,
              {
                backgroundColor: theme === "sombre" ? C.carte : C.purpleLight,
                borderWidth: theme === "sombre" ? 0.5 : 0,
                borderColor: C.carteBorder,
              },
            ]}
          >
            <Text style={[styles.banniereInfoTexte, { color: C.purpleText }]}>
              {nbMoisAvecDonnees === 1
                ? `Données disponibles pour 1 mois seulement. Reviens dans ${nbMois - nbMoisAvecDonnees} mois pour une vue complète sur ${nbMois} mois.`
                : `Données disponibles pour ${nbMoisAvecDonnees} mois sur ${nbMois}. La vue sera complète dans ${nbMois - nbMoisAvecDonnees} mois.`}
            </Text>
          </View>
        )}

        <Text style={[styles.sectionLabel, { color: C.texteMuted }]}>
          Vue d'ensemble
        </Text>
        <View style={styles.kpiGrid}>
          <View
            style={[
              styles.kpiCard,
              {
                backgroundColor: theme === "sombre" ? C.carte : C.accentLight,
                borderWidth: theme === "sombre" ? 0.5 : 0,
                borderColor: C.carteBorder,
              },
            ]}
          >
            <Text style={[styles.kpiLabel, { color: C.accent }]}>
              DÉPENSE MOY. / JOUR
            </Text>
            <Text style={[styles.kpiVal, { color: C.accentText }]}>
              {depenseMoyJour} €
            </Text>
            <Text
              style={[
                styles.kpiDelta,
                { color: deltaDepMoy <= 0 ? C.accentText : C.peachText },
              ]}
            >
              {deltaDepMoy > 0 ? "↑" : "↓"} {Math.abs(deltaDepMoy)}% vs mois
              dernier
            </Text>
          </View>
          <View
            style={[
              styles.kpiCard,
              {
                backgroundColor: theme === "sombre" ? C.carte : C.peachLight,
                borderWidth: theme === "sombre" ? 0.5 : 0,
                borderColor: C.carteBorder,
              },
            ]}
          >
            <Text style={[styles.kpiLabel, { color: C.peach }]}>
              TAUX D'ÉPARGNE
            </Text>
            <Text style={[styles.kpiVal, { color: C.peachText }]}>
              {tauxEpargne}%
            </Text>
            <Text style={[styles.kpiDelta, { color: C.peachText }]}>
              Ce mois-ci
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: C.texteMuted }]}>
          Dépensé vs dépenses prévues
        </Text>
        <View
          style={[
            styles.chartCard,
            {
              backgroundColor: theme === "sombre" ? C.carte : "#FAFAFA",
              borderColor: C.carteBorder,
            },
          ]}
        >
          <GraphiqueLignes
            donneesReelles={donneesReelles}
            donneesPrevisionnelles={donneesPrevisionnelles}
            labels={labels}
            couleurs={C}
          />
          <View style={styles.legendeRow}>
            <View style={styles.legendeItem}>
              <View
                style={[styles.legendeDot, { backgroundColor: C.accent }]}
              />
              <Text style={[styles.legendeTexte, { color: C.texteMuted }]}>
                Dépensé
              </Text>
            </View>
            <View style={styles.legendeItem}>
              <View
                style={[styles.legendeDot, { backgroundColor: C.peach }]}
              />
              <Text style={[styles.legendeTexte, { color: C.texteMuted }]}>
                Dépenses prévues
              </Text>
            </View>
          </View>
        </View>

        <View
          style={[
            styles.compareCard,
            {
              backgroundColor: theme === "sombre" ? C.carte : "#FAFAFA",
              borderColor: C.carteBorder,
            },
          ]}
        >
          <View style={styles.compareHead}>
            <Text style={[styles.compareTitle, { color: C.texte }]}>
              {MOIS_LABELS[MOIS_ACTUEL]} vs{" "}
              {MOIS_LABELS[moisPrecedent.getMonth()]}
            </Text>
            <Text
              style={[
                styles.compareDelta,
                { color: deltaTotal <= 0 ? C.accentText : C.peachText },
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
                <Text
                  style={[styles.cbarLabel, { color: C.texte }]}
                  numberOfLines={1}
                >
                  {env.nom}
                </Text>
                <View
                  style={[styles.cbarTrack, { backgroundColor: C.separateur }]}
                >
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
                <Text style={[styles.cbarVal, { color: C.texte }]}>
                  {env.depense} €
                </Text>
              </View>
            );
          })}
          {depenseMoisPrec > 0 && (
            <Text style={[styles.compareFooter, { color: C.texteMuted }]}>
              Total ce mois : {depenseMoisActuel} € vs {depenseMoisPrec} € le
              mois dernier
            </Text>
          )}
        </View>

        <Text style={[styles.sectionLabel, { color: C.texteMuted }]}>
          Épargne dans le temps
        </Text>
        <View
          style={[
            styles.chartCard,
            {
              backgroundColor: theme === "sombre" ? C.carte : "#FAFAFA",
              borderColor: C.carteBorder,
            },
          ]}
        >
          <View style={styles.barresEpargne}>
            {donneesEpargne.map((val, i) => {
              const maxE = Math.max(...donneesEpargne, 1);
              const h = Math.round((val / maxE) * 90);
              return (
                <View key={i} style={styles.barreEpargneCol}>
                  <Text
                    style={[styles.barreEpargneVal, { color: C.bleuGris }]}
                  >
                    {val > 0 ? `${val}€` : ""}
                  </Text>
                  <View
                    style={[
                      styles.barreEpargneTrack,
                      { backgroundColor: C.separateur },
                    ]}
                  >
                    <View
                      style={[
                        styles.barreEpargneRemplissage,
                        { height: h, backgroundColor: C.bleuGris },
                      ]}
                    />
                  </View>
                  <Text
                    style={[styles.barreEpargneLabel, { color: C.texteMuted }]}
                  >
                    {labels[i]}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: C.texteMuted }]}>
          Ce qu'il faut retenir
        </Text>
        <View
          style={[
            styles.insightCard,
            {
              backgroundColor: theme === "sombre" ? C.carte : C.purpleLight,
              borderWidth: theme === "sombre" ? 0.5 : 0,
              borderColor: C.carteBorder,
            },
          ]}
        >
          {insights.map((txt, i) => (
            <View
              key={i}
              style={[
                styles.insightItem,
                i > 0 && [
                  styles.insightItemBorder,
                  { borderTopColor: C.separateur },
                ],
              ]}
            >
              <View style={[styles.insightDot, { backgroundColor: C.purple }]} />
              <Text style={[styles.insightTexte, { color: C.purpleText }]}>
                {txt}
              </Text>
            </View>
          ))}
        </View>

        {objectifsAvecDelta.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: C.texteMuted }]}>
              Objectifs d'épargne
            </Text>
            {objectifsAvecDelta.map((obj) => (
              <View
                key={obj.id}
                style={[
                  styles.objectifStatItem,
                  {
                    backgroundColor: theme === "sombre" ? C.carte : "#FAFAFA",
                    borderColor: C.carteBorder,
                  },
                ]}
              >
                <View style={styles.objectifStatHeader}>
                  <Text style={[styles.objectifStatNom, { color: C.texte }]}>
                    {obj.nom}
                  </Text>
                  <Text style={[styles.objectifStatPct, { color: obj.couleur }]}>
                    {Math.round(obj.pct)}%
                  </Text>
                </View>
                <View style={[styles.cbarTrack, { backgroundColor: C.separateur }]}>
                  <View
                    style={[
                      styles.cbarFill,
                      { width: `${obj.pct}%`, backgroundColor: obj.couleur },
                    ]}
                  />
                </View>
                <View style={styles.objectifStatFooter}>
                  <Text
                    style={[styles.objectifStatMontant, { color: C.texteMuted }]}
                  >
                    {obj.actuel} € / {obj.cible} €
                  </Text>
                  {obj.delta !== null && (
                    <Text
                      style={[
                        styles.objectifStatDelta,
                        { color: obj.delta >= 0 ? C.accentText : C.peachText },
                      ]}
                    >
                      {obj.delta >= 0 ? "+" : ""}
                      {obj.delta}€ vs mois dernier
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </>
        )}

        {topDepensesTri.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: C.texteMuted }]}>
              Top dépenses — {nbMois} derniers mois
            </Text>
            {topDepensesTri.map((dep, i) => (
              <View
                key={i}
                style={[styles.topItem, { borderBottomColor: C.separateur }]}
              >
                <View
                  style={[styles.topRank, { backgroundColor: dep.couleur }]}
                >
                  <Text style={styles.topRankTexte}>{i + 1}</Text>
                </View>
                <Text style={[styles.topNom, { color: C.texte }]}>
                  {dep.nom}
                </Text>
                <Text style={[styles.topMois, { color: C.texteMuted }]}>
                  {dep.mois}
                </Text>
                <Text style={[styles.topMontant, { color: C.texte }]}>
                  {dep.montant} €
                </Text>
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
  chipActif: { backgroundColor: "#8B6FE8", borderColor: "#8B6FE8" },
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
    backgroundColor: "#F0EEFF",
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
  insightCard: { backgroundColor: "#F0EEFF", borderRadius: 16, padding: 18 },
  insightItem: { flexDirection: "row", gap: 10, paddingVertical: 10 },
  insightItemBorder: {
    borderTopWidth: 0.5,
    borderTopColor: "rgba(139,111,232,0.2)",
  },
  insightDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#8B6FE8",
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
  objectifStatItem: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 0.5,
    marginBottom: 10,
  },
  objectifStatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  objectifStatNom: { fontSize: 14, fontWeight: "700" },
  objectifStatPct: { fontSize: 14, fontWeight: "700" },
  objectifStatFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  objectifStatMontant: { fontSize: 12, fontWeight: "600" },
  objectifStatDelta: { fontSize: 11, fontWeight: "700" },
});

