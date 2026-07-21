import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { Fragment, useState } from "react";
import {
  Dimensions,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { useObjectifs } from "../store";
import { COULEURS, useTheme } from "../ThemeContext";
import { calculerSeries, TypeSerie } from "../../utils/series";
import { calculerScoreSante, MotCleScore } from "../../utils/score";
import { parseMontant, sanitizeMontantInput } from "../../utils/montant";
import { InfoBulle } from "../InfoBulle";

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
const PADDING_LEFT = 34;

type Vue = "global" | "categorie";

function calculerStepLisible(brut: number): number {
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(brut, 1))));
  const normalise = brut / magnitude;
  let step: number;
  if (normalise <= 1) step = 1;
  else if (normalise <= 2) step = 2;
  else if (normalise <= 5) step = 5;
  else step = 10;
  return Math.max(1, Math.round(step * magnitude));
}

function calculerTicksY(maxBrut: number, nbTicks = 4): number[] {
  const step = calculerStepLisible(maxBrut / nbTicks);
  const ticks: number[] = [];
  let v = 0;
  while (v < maxBrut) {
    ticks.push(v);
    v += step;
  }
  ticks.push(v);
  return ticks;
}

function formaterPeriode(nbMois: number): string {
  if (nbMois >= 12 && nbMois % 12 === 0) {
    const ans = nbMois / 12;
    return `${ans} an${ans > 1 ? "s" : ""}`;
  }
  return `${nbMois} mois`;
}

const PERIODE_MAX_MOIS = 120; // plafond fixe (10 ans), indépendant des données de l'utilisateur

type OptionPeriode = {
  valeur: number;
  label: string;
  disponible: boolean;
  prochaine: boolean;
};

function genererOptionsPeriode(nbMoisDisponibles: number): OptionPeriode[] {
  const options: OptionPeriode[] = [];
  let prochaineTrouvee = false;

  const ajouter = (valeur: number) => {
    const disponible = valeur <= nbMoisDisponibles;
    const prochaine = !disponible && !prochaineTrouvee;
    if (prochaine) prochaineTrouvee = true;
    options.push({ valeur, label: formaterPeriode(valeur), disponible, prochaine });
  };

  for (let m = 3; m <= 12; m++) ajouter(m);
  for (let a = 2; a * 12 <= PERIODE_MAX_MOIS; a++) ajouter(a * 12);

  return options;
}

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
  const maxBrut = Math.max(...toutes, 1);
  const ticks = calculerTicksY(maxBrut);
  const max = ticks[ticks.length - 1];
  const n = labels.length;
  const largeurUtile = CHART_W - PADDING_LEFT - PADDING_X;
  const espacement = n > 1 ? largeurUtile / (n - 1) : largeurUtile;

  const pointsReels = donneesReelles.map((v, i) => ({
    x: PADDING_LEFT + i * espacement,
    y: CHART_H - (v / max) * (CHART_H - 10) + 5,
  }));
  const pointsPrevus = donneesPrevisionnelles.map((v, i) => ({
    x: PADDING_LEFT + i * espacement,
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
      {ticks.map((t) => {
        const y = CHART_H - (t / max) * (CHART_H - 10) + 5;
        return (
          <Fragment key={t}>
            <Line
              x1={PADDING_LEFT}
              y1={y}
              x2={CHART_W - PADDING_X}
              y2={y}
              stroke={C.separateur}
              strokeWidth={1}
            />
            <SvgText
              x={PADDING_LEFT - 6}
              y={y + 3}
              fontSize={9}
              fill={C.texteMuted}
              textAnchor="end"
            >
              {t}€
            </SvgText>
          </Fragment>
        );
      })}
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
          x={PADDING_LEFT + i * espacement}
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

type SerieEvolution = {
  cle: string;
  label: string;
  couleur: string;
  donnees: number[];
};

function GraphiqueEvolutionMulti({
  series,
  labels,
  couleurs: C,
}: {
  series: SerieEvolution[];
  labels: string[];
  couleurs: typeof COULEURS.clair;
}) {
  const [selection, setSelection] = useState<number | null>(null);
  const toutes = series.flatMap((s) => s.donnees);
  const maxBrut = Math.max(...toutes, 1);
  const ticks = calculerTicksY(maxBrut);
  const max = ticks[ticks.length - 1];
  const n = labels.length;
  const largeurUtile = CHART_W - PADDING_LEFT - PADDING_X;
  const espacement = n > 1 ? largeurUtile / (n - 1) : largeurUtile;

  const pointsParSerie = series.map((s) => ({
    ...s,
    points: s.donnees.map((v, i) => ({
      x: PADDING_LEFT + i * espacement,
      y: CHART_H - (v / max) * (CHART_H - 10) + 5,
    })),
  }));

  return (
    <View>
      <View style={{ position: "relative" }}>
        <Svg width={CHART_W} height={CHART_H + 24}>
          {ticks.map((t) => {
            const y = CHART_H - (t / max) * (CHART_H - 10) + 5;
            return (
              <Fragment key={t}>
                <Line
                  x1={PADDING_LEFT}
                  y1={y}
                  x2={CHART_W - PADDING_X}
                  y2={y}
                  stroke={C.separateur}
                  strokeWidth={1}
                />
                <SvgText
                  x={PADDING_LEFT - 6}
                  y={y + 3}
                  fontSize={9}
                  fill={C.texteMuted}
                  textAnchor="end"
                >
                  {t}€
                </SvgText>
              </Fragment>
            );
          })}
          {selection !== null && (
            <Line
              x1={PADDING_LEFT + selection * espacement}
              y1={5}
              x2={PADDING_LEFT + selection * espacement}
              y2={CHART_H + 5}
              stroke={C.separateur}
              strokeWidth={1}
              strokeDasharray="4,3"
            />
          )}
          {pointsParSerie.map((s) => {
            const chemin = s.points
              .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
              .join(" ");
            return (
              <Fragment key={s.cle}>
                <Path
                  d={chemin}
                  stroke={s.couleur}
                  strokeWidth={2.5}
                  fill="none"
                  strokeLinejoin="round"
                />
                {s.points.map((p, i) => (
                  <Circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={selection === i ? 5 : 3.5}
                    fill={s.couleur}
                  />
                ))}
              </Fragment>
            );
          })}
          {labels.map((lbl, i) => (
            <SvgText
              key={`l${i}`}
              x={PADDING_LEFT + i * espacement}
              y={CHART_H + 18}
              fontSize={10}
              fontWeight={selection === i ? "700" : "400"}
              fill={selection === i ? C.texte : C.texteMuted}
              textAnchor="middle"
            >
              {lbl}
            </SvgText>
          ))}
        </Svg>
        <View
          style={[
            styles.evolutionTapZones,
            { width: CHART_W, height: CHART_H + 24 },
          ]}
          pointerEvents="box-none"
        >
          {labels.map((_, i) => (
            <TouchableOpacity
              key={i}
              style={[
                styles.evolutionTapZone,
                {
                  left: PADDING_LEFT + i * espacement - 16,
                  height: CHART_H + 24,
                },
              ]}
              activeOpacity={1}
              onPress={() => setSelection(selection === i ? null : i)}
            />
          ))}
        </View>
      </View>

      <View style={styles.legendeRow}>
        {series.map((s) => (
          <View key={s.cle} style={styles.legendeItem}>
            <View style={[styles.legendeDot, { backgroundColor: s.couleur }]} />
            <Text style={[styles.legendeTexte, { color: C.texteMuted }]}>
              {s.label}
            </Text>
          </View>
        ))}
      </View>

      {selection !== null && (
        <View
          style={[
            styles.evolutionInfoPanel,
            { backgroundColor: C.fondSecondaire },
          ]}
        >
          <Text style={[styles.evolutionInfoMois, { color: C.texte }]}>
            {labels[selection]}
          </Text>
          {series.map((s) => (
            <View key={s.cle} style={styles.evolutionInfoLigne}>
              <View
                style={[styles.legendeDot, { backgroundColor: s.couleur }]}
              />
              <Text
                style={[styles.evolutionInfoLabel, { color: C.texteMuted }]}
              >
                {s.label}
              </Text>
              <Text style={[styles.evolutionInfoValeur, { color: C.texte }]}>
                {s.donnees[selection]} €
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function JaugeRepartition({
  segments,
  couleurs: C,
}: {
  segments: { cle: string; label: string; couleur: string; montant: number }[];
  couleurs: typeof COULEURS.clair;
}) {
  const total = segments.reduce((acc, s) => acc + s.montant, 0);
  if (total <= 0) return null;

  return (
    <View>
      <View style={[styles.jaugeBarre, { backgroundColor: C.separateur }]}>
        {segments.map((s) => (
          <View
            key={s.cle}
            style={{ flex: s.montant, backgroundColor: s.couleur }}
          />
        ))}
      </View>
      <View style={styles.jaugeLegende}>
        {segments.map((s) => (
          <View key={s.cle} style={styles.jaugeLegendeItem}>
            <View style={[styles.jaugeDot, { backgroundColor: s.couleur }]} />
            <Text
              style={[styles.jaugeNom, { color: C.texte }]}
              numberOfLines={1}
            >
              {s.label}
            </Text>
            <Text style={[styles.jaugePct, { color: C.texteMuted }]}>
              {Math.round((s.montant / total) * 100)}% · {s.montant} €
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function Analytics() {
  const objStore = useObjectifs();
  const { theme, couleurs: C } = useTheme();
  const [nbMoisSelectionne, setNbMoisSelectionne] = useState(3);
  const [periodePickerVisible, setPeriodePickerVisible] = useState(false);
  const [vue, setVue] = useState<Vue>("global");
  const [titoirOuvert, setTiroirOuvert] = useState(false);
  const [categoriesSelectionnees, setCategoriesSelectionnees] = useState<
    string[]
  >([]);
  const [modalSeriesVisible, setModalSeriesVisible] = useState(false);
  const [vueModalStats, setVueModalStats] = useState<"score" | "series">(
    "score",
  );
  const [historiqueOuvert, setHistoriqueOuvert] = useState<
    Partial<Record<TypeSerie, boolean>>
  >({});
  const [editionSeuilOuverte, setEditionSeuilOuverte] = useState(false);
  const [seuilEpargneTemp, setSeuilEpargneTemp] = useState("");

  const series = calculerSeries({
    enveloppes: objStore.enveloppes,
    epargneMois: objStore.epargneMois,
    historiquesMois: objStore.historiquesMois,
    seuilEpargneConstante: objStore.seuilEpargneConstante,
  });

  const scoreSante = calculerScoreSante({
    enveloppes: objStore.enveloppes,
    epargneMois: objStore.epargneMois,
    historiquesMois: objStore.historiquesMois,
    seuilEpargneConstante: objStore.seuilEpargneConstante,
    objectifs: objStore.objectifs,
  });

  const ouvrirEditionSeuil = () => {
    setSeuilEpargneTemp(
      objStore.seuilEpargneConstante !== null
        ? String(objStore.seuilEpargneConstante)
        : "",
    );
    setEditionSeuilOuverte(true);
  };

  const validerSeuilEpargne = () => {
    const montant = parseMontant(seuilEpargneTemp);
    if (!montant || montant <= 0) return;
    objStore.modifierSeuilEpargneConstante(montant);
    setEditionSeuilOuverte(false);
  };

  const optionsPeriode = genererOptionsPeriode(
    objStore.historiquesMois.length + 1,
  );

  const nbMois = nbMoisSelectionne;

  const moisAffiches = Array.from({ length: nbMois }, (_, i) => {
    const d = new Date(ANNEE_ACTUELLE, MOIS_ACTUEL - nbMois + 1 + i, 1);
    return { mois: d.getMonth(), annee: d.getFullYear() };
  });

  const getDepenseMois = (
    mois: number,
    annee: number,
    enveloppeIds?: string[],
  ) => {
    if (mois === MOIS_ACTUEL && annee === ANNEE_ACTUELLE) {
      const envsFiltrees = (
        enveloppeIds
          ? objStore.enveloppes.filter((e) => enveloppeIds.includes(e.id))
          : objStore.enveloppes
      ).filter((e) => e.type !== "Entrée");
      return envsFiltrees.reduce((acc, e) => acc + e.depense, 0);
    }
    const snap = objStore.historiquesMois.find(
      (s) => s.mois === mois && s.annee === annee,
    );
    if (!snap) return null;
    const envsFiltrees = (
      enveloppeIds
        ? snap.enveloppes.filter((e) => enveloppeIds.includes(e.id))
        : snap.enveloppes
    ).filter((e) => e.type !== "Entrée");
    return envsFiltrees.reduce((acc, e) => acc + e.depense, 0);
  };

  const getBudgetMois = (
    mois: number,
    annee: number,
    enveloppeIds?: string[],
  ) => {
    if (mois === MOIS_ACTUEL && annee === ANNEE_ACTUELLE) {
      const envsFiltrees = (
        enveloppeIds
          ? objStore.enveloppes.filter((e) => enveloppeIds.includes(e.id))
          : objStore.enveloppes
      ).filter((e) => e.type !== "Entrée");
      return envsFiltrees.reduce((acc, e) => acc + e.budget, 0);
    }
    const snap = objStore.historiquesMois.find(
      (s) => s.mois === mois && s.annee === annee,
    );
    if (!snap) return null;
    const envsFiltrees = (
      enveloppeIds
        ? snap.enveloppes.filter((e) => enveloppeIds.includes(e.id))
        : snap.enveloppes
    ).filter((e) => e.type !== "Entrée");
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

  const getDisponibleMois = (mois: number, annee: number) => {
    if (mois === MOIS_ACTUEL && annee === ANNEE_ACTUELLE) {
      const enveloppesEntree = objStore.enveloppes.filter(
        (e) => e.type === "Entrée",
      );
      const totalEntreeRecue = enveloppesEntree.reduce(
        (acc, e) => acc + e.depense,
        0,
      );
      const totalEntreePrevue = enveloppesEntree.reduce(
        (acc, e) => acc + Math.max(0, e.budget - e.depense),
        0,
      );
      return objStore.argentDisponible + totalEntreeRecue + totalEntreePrevue;
    }
    const snap = objStore.historiquesMois.find(
      (s) => s.mois === mois && s.annee === annee,
    );
    if (!snap) return null;
    const enveloppesEntree = snap.enveloppes.filter(
      (e) => e.type === "Entrée",
    );
    const totalEntreeRecue = enveloppesEntree.reduce(
      (acc, e) => acc + e.depense,
      0,
    );
    const totalEntreePrevue = enveloppesEntree.reduce(
      (acc, e) => acc + Math.max(0, e.budget - e.depense),
      0,
    );
    return snap.disponible + totalEntreeRecue + totalEntreePrevue;
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
  const donneesDisponible = moisAffiches.map(
    ({ mois, annee }) => getDisponibleMois(mois, annee) ?? 0,
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

  const enveloppesEntreeStats = objStore.enveloppes.filter(
    (e) => e.type === "Entrée",
  );
  const totalEntreeRecueStats = enveloppesEntreeStats.reduce(
    (acc, e) => acc + e.depense,
    0,
  );
  const totalEntreePrevueStats = enveloppesEntreeStats.reduce(
    (acc, e) => acc + Math.max(0, e.budget - e.depense),
    0,
  );
  const disponible =
    objStore.argentDisponible + totalEntreeRecueStats + totalEntreePrevueStats;
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
        if (e.type !== "Entrée" && e.depense > 0)
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
        if (e.type !== "Entrée" && e.depense > 0)
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

  const repartitionDepenses = objStore.enveloppes
    .filter((e) => e.type !== "Entrée" && e.depense > 0)
    .map((e) => ({
      cle: e.id,
      label: e.nom,
      couleur: e.couleur,
      montant: e.depense,
    }));

  const repartitionEntrees = objStore.enveloppes
    .filter((e) => e.type === "Entrée" && e.depense > 0)
    .map((e) => ({
      cle: e.id,
      label: e.nom,
      couleur: e.couleur,
      montant: e.depense,
    }));

  const toggleCategorie = (id: string) => {
    setCategoriesSelectionnees((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: C.fondPage }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.header, styles.headerRow]}>
          <View>
            <Text style={[styles.titre, { color: C.texte }]}>Stats</Text>
            <Text style={[styles.sousTitre, { color: C.texteMuted }]}>
              {MOIS_LABELS[MOIS_ACTUEL]} {ANNEE_ACTUELLE}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.btnMenu,
              { backgroundColor: C.fondSecondaire, borderColor: C.carteBorder },
            ]}
            onPress={() => setModalSeriesVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={C.texte} />
          </TouchableOpacity>
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
                    <Ionicons name="checkmark" size={16} color={env.couleur} />
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

        <TouchableOpacity
          style={[
            styles.periodeBouton,
            { backgroundColor: C.fondSecondaire, borderColor: C.carteBorder },
          ]}
          onPress={() => setPeriodePickerVisible(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.periodeBoutonLabel, { color: C.texteMuted }]}>
            PÉRIODE
          </Text>
          <Text style={[styles.periodeBoutonValeur, { color: C.texte }]}>
            {formaterPeriode(nbMoisSelectionne)}
          </Text>
        </TouchableOpacity>

        <Modal
          visible={periodePickerVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setPeriodePickerVisible(false)}
        >
          <View style={styles.modalOverlayTouch}>
            <View style={[styles.modalCard, { backgroundColor: C.carte }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitre, { color: C.texte }]}>
                  Période
                </Text>
                <TouchableOpacity
                  onPress={() => setPeriodePickerVisible(false)}
                  activeOpacity={0.6}
                >
                  <Text style={[styles.modalTermine, { color: C.purple }]}>
                    Terminé
                  </Text>
                </TouchableOpacity>
              </View>
              <Picker
                selectedValue={nbMoisSelectionne}
                onValueChange={(valeur) =>
                  setNbMoisSelectionne(Number(valeur))
                }
                itemStyle={{ color: C.texte }}
              >
                {optionsPeriode.map((o) => (
                  <Picker.Item
                    key={o.valeur}
                    label={o.prochaine ? `${o.label} (bientôt disponible)` : o.label}
                    value={o.valeur}
                    enabled={o.disponible}
                    color={
                      Platform.OS === "android"
                        ? o.disponible
                          ? C.texte
                          : C.texteMuted
                        : undefined
                    }
                  />
                ))}
              </Picker>
            </View>
          </View>
        </Modal>

        {pasSuffisammentDonnees && (
          <View
            style={[
              styles.banniereInfo,
              theme === "sombre"
                ? {
                    backgroundColor: C.carte,
                    borderWidth: 0.5,
                    borderColor: C.carteBorder,
                  }
                : { backgroundColor: C.fond },
            ]}
          >
            <Text
              style={[
                styles.banniereInfoTexte,
                { color: theme === "sombre" ? C.purpleText : C.texte },
              ]}
            >
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
              theme === "sombre"
                ? {
                    backgroundColor: C.carte,
                    borderWidth: 0.5,
                    borderColor: C.carteBorder,
                    borderLeftWidth: 3,
                    borderLeftColor: C.accent,
                  }
                : {
                    backgroundColor: "#FFFFFF",
                    borderWidth: 0.5,
                    borderColor: "#E4E6EA",
                    borderLeftWidth: 3,
                    borderLeftColor: C.accent,
                  },
            ]}
          >
            <Text
              style={[
                styles.kpiLabel,
                { color: theme === "sombre" ? C.accent : C.texteMuted },
              ]}
            >
              DÉPENSE MOY. / JOUR
            </Text>
            <Text
              style={[
                styles.kpiVal,
                { color: theme === "sombre" ? C.accentText : C.texte },
              ]}
            >
              {depenseMoyJour} €
            </Text>
            <View style={styles.kpiDeltaRow}>
              <Ionicons
                name={deltaDepMoy > 0 ? "arrow-up" : "arrow-down"}
                size={11}
                color={deltaDepMoy <= 0 ? C.accentText : C.peachText}
              />
              <Text
                style={[
                  styles.kpiDelta,
                  { color: deltaDepMoy <= 0 ? C.accentText : C.peachText },
                ]}
              >
                {Math.abs(deltaDepMoy)}% vs mois dernier
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.kpiCard,
              theme === "sombre"
                ? {
                    backgroundColor: C.carte,
                    borderWidth: 0.5,
                    borderColor: C.carteBorder,
                    borderLeftWidth: 3,
                    borderLeftColor: C.peach,
                  }
                : {
                    backgroundColor: "#FFFFFF",
                    borderWidth: 0.5,
                    borderColor: "#E4E6EA",
                    borderLeftWidth: 3,
                    borderLeftColor: C.peach,
                  },
            ]}
          >
            <Text
              style={[
                styles.kpiLabel,
                { color: theme === "sombre" ? C.peach : C.texteMuted },
              ]}
            >
              TAUX D'ÉPARGNE
            </Text>
            <Text
              style={[
                styles.kpiVal,
                { color: theme === "sombre" ? C.peachText : C.texte },
              ]}
            >
              {tauxEpargne}%
            </Text>
            <Text
              style={[
                styles.kpiDelta,
                { color: theme === "sombre" ? C.peachText : C.texteMuted },
              ]}
            >
              Ce mois-ci
            </Text>
          </View>
        </View>

        <View style={[styles.sectionLabelRow, { marginTop: 8 }]}>
          <Ionicons name="trending-up" size={13} color={C.texteMuted} />
          <Text
            style={[
              styles.sectionLabel,
              { color: C.texteMuted, marginTop: 0, marginBottom: 0 },
            ]}
          >
            Évolution
          </Text>
        </View>
        <View
          style={[
            styles.chartCard,
            {
              backgroundColor: theme === "sombre" ? C.carte : "#FAFAFA",
              borderColor: C.carteBorder,
            },
          ]}
        >
          <GraphiqueEvolutionMulti
            key={nbMoisSelectionne}
            series={[
              {
                cle: "disponible",
                label: "Disponible",
                couleur: C.purple,
                donnees: donneesDisponible,
              },
              {
                cle: "epargne",
                label: "Épargne",
                couleur: C.bleuGris,
                donnees: donneesEpargne,
              },
              {
                cle: "depenses",
                label: "Dépenses",
                couleur: C.accent,
                donnees: donneesReelles,
              },
            ]}
            labels={labels}
            couleurs={C}
          />
        </View>

        <Text
          style={[
            styles.sectionLabel,
            { color: C.texteMuted, marginTop: 8 },
          ]}
        >
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

        <Text
          style={[
            styles.sectionLabel,
            { color: C.texteMuted, marginTop: 8 },
          ]}
        >
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

        {repartitionDepenses.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: C.texteMuted }]}>
              Répartition des dépenses
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
              <JaugeRepartition segments={repartitionDepenses} couleurs={C} />
            </View>
          </>
        )}

        {repartitionEntrees.length > 0 && (
          <>
            <Text
              style={[
                styles.sectionLabel,
                { color: C.texteMuted, marginTop: 8 },
              ]}
            >
              Entrées d&apos;argent
            </Text>
            <View
              style={[
                styles.chartCard,
                {
                  backgroundColor: theme === "sombre" ? C.carte : "#FAFAFA",
                  borderColor: C.vertLight,
                },
              ]}
            >
              <JaugeRepartition segments={repartitionEntrees} couleurs={C} />
            </View>
          </>
        )}

        {topDepensesTri.length > 0 && (
          <>
            <Text
              style={[
                styles.sectionLabel,
                { color: C.texteMuted, marginTop: 8 },
              ]}
            >
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

      <Modal
        visible={modalSeriesVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalSeriesVisible(false)}
      >
        <View style={styles.modalOverlayTouch}>
          <View style={[styles.modalCardBadges, { backgroundColor: C.carte }]}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitre, { color: C.texte }]}>
                  {vueModalStats === "score" ? "Santé financière" : "Séries"}
                </Text>
                <Text style={[styles.sousTitre, { color: C.texteMuted }]}>
                  {vueModalStats === "score"
                    ? "Vue d'ensemble de ta situation"
                    : "Régularité mois après mois"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setModalSeriesVisible(false)}
                activeOpacity={0.6}
              >
                <Text style={[styles.modalTermine, { color: C.purple }]}>
                  Terminé
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.chipRow}>
              {(["score", "series"] as const).map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[
                    styles.chip,
                    { backgroundColor: C.fondSecondaire, borderColor: C.carteBorder },
                    vueModalStats === v && {
                      backgroundColor: C.purple,
                      borderColor: C.purple,
                    },
                  ]}
                  onPress={() => setVueModalStats(v)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipTexte,
                      { color: C.texteMuted },
                      vueModalStats === v && styles.chipTexteActif,
                    ]}
                  >
                    {v === "score" ? "Score" : "Séries"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {vueModalStats === "score" && (
                <View
                  style={[styles.serieCarte, { backgroundColor: C.fondSecondaire }]}
                >
                  <View style={styles.serieEnTete}>
                    <View
                      style={[
                        styles.serieIconeFond,
                        { backgroundColor: couleurScoreTeinte(scoreSante.mot, C) },
                      ]}
                    >
                      <Ionicons
                        name="pulse"
                        size={18}
                        color={couleurScoreForte(scoreSante.mot, C)}
                      />
                    </View>
                    <Text style={[styles.serieTitre, { color: C.texte }]}>
                      Santé financière
                    </Text>
                    <InfoBulle
                      titre="Comment ce score est calculé"
                      texte={`Ton score combine 3 signaux, pondérés puis ramenés sur 100 :\n\n• Budget du mois (40%) : dépenses réelles vs budget total de tes catégories.\n• Tendance d'épargne (30%) : le streak "Épargne croissante" des Séries — jusqu'à 6 mois consécutifs pour le score maximum.\n• Objectifs actifs (30%) : ta progression moyenne vers tes objectifs d'épargne en cours.\n\nSi un signal n'est pas disponible (pas de budget défini, aucun objectif actif...), son poids est redistribué sur les autres.`}
                    />
                  </View>

                  <View style={styles.scoreNombreLigne}>
                    <Text style={[styles.scoreNombre, { color: C.texte }]}>
                      {scoreSante.score}
                    </Text>
                    <Text
                      style={[styles.scoreSur100, { color: C.texteMuted }]}
                    >
                      /100
                    </Text>
                    <View
                      style={[
                        styles.scoreMotPill,
                        {
                          backgroundColor: couleurScoreTeinte(
                            scoreSante.mot,
                            C,
                          ),
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.scoreMotTexte,
                          { color: couleurScoreForte(scoreSante.mot, C) },
                        ]}
                      >
                        {scoreSante.mot}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.scoreDetailsBloc}>
                    <View style={styles.scoreDetailLigne}>
                      <Text
                        style={[
                          styles.scoreDetailLabel,
                          { color: C.texteMuted },
                        ]}
                      >
                        Budget du mois
                      </Text>
                      <Text
                        style={[styles.scoreDetailValeur, { color: C.texte }]}
                      >
                        {scoreSante.details.budget !== null
                          ? `${Math.round(scoreSante.details.budget)}/100`
                          : "Non disponible"}
                      </Text>
                    </View>
                    <View style={styles.scoreDetailLigne}>
                      <Text
                        style={[
                          styles.scoreDetailLabel,
                          { color: C.texteMuted },
                        ]}
                      >
                        Tendance d&apos;épargne
                      </Text>
                      <Text
                        style={[styles.scoreDetailValeur, { color: C.texte }]}
                      >
                        {scoreSante.details.tendanceEpargne !== null
                          ? `${Math.round(scoreSante.details.tendanceEpargne)}/100`
                          : "Non disponible"}
                      </Text>
                    </View>
                    <View style={styles.scoreDetailLigne}>
                      <Text
                        style={[
                          styles.scoreDetailLabel,
                          { color: C.texteMuted },
                        ]}
                      >
                        Objectifs actifs
                      </Text>
                      <Text
                        style={[styles.scoreDetailValeur, { color: C.texte }]}
                      >
                        {scoreSante.details.objectifs !== null
                          ? `${Math.round(scoreSante.details.objectifs)}/100`
                          : "Non disponible"}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {vueModalStats === "series" &&
                series.map((serie) => {
                const config = CONFIG_SERIE[serie.type];
                const active = serie.enCours > 0;
                const seuilManquant =
                  serie.type === "epargne-constante" &&
                  objStore.seuilEpargneConstante === null;

                return (
                  <View
                    key={serie.type}
                    style={[
                      styles.serieCarte,
                      { backgroundColor: C.fondSecondaire },
                    ]}
                  >
                    <View style={styles.serieEnTete}>
                      <View
                        style={[
                          styles.serieIconeFond,
                          { backgroundColor: active ? config.light(C) : C.carte },
                        ]}
                      >
                        <Ionicons
                          name={active ? config.icone : config.iconeVide}
                          size={18}
                          color={active ? config.base(C) : C.texteMuted}
                        />
                      </View>
                      <View style={styles.serieTitreLigne}>
                        <Text
                          style={[
                            styles.serieTitre,
                            { color: C.texte, flex: 0 },
                          ]}
                        >
                          {serie.titre}
                        </Text>
                        {serie.type === "budget-respecte" && (
                          <InfoBulle
                            titre="Budget respecté"
                            texte="Le nombre de mois d'affilée où tes dépenses réelles sont restées sous ton budget total."
                          />
                        )}
                        {serie.type === "epargne-constante" && (
                          <InfoBulle
                            titre="Épargne constante"
                            texte={
                              objStore.seuilEpargneConstante !== null
                                ? `Le nombre de mois d'affilée où tu atteins ton seuil d'épargne personnalisé (actuellement ${objStore.seuilEpargneConstante}€).`
                                : "Le nombre de mois d'affilée où tu atteins ton seuil d'épargne personnalisé. Définis un seuil ci-dessous pour commencer à le suivre."
                            }
                          />
                        )}
                      </View>
                      <View style={styles.serieRecordPill}>
                        <Ionicons
                          name="trophy-outline"
                          size={13}
                          color={C.texteMuted}
                        />
                        <Text
                          style={[styles.serieRecordTexte, { color: C.texteMuted }]}
                        >
                          Record {serie.record}
                        </Text>
                      </View>
                    </View>

                    {serie.type === "epargne-constante" &&
                    editionSeuilOuverte ? (
                      <View style={styles.serieSeuilBloc}>
                        {seuilManquant && (
                          <Text
                            style={[
                              styles.serieDescription,
                              { color: C.texteMuted },
                            ]}
                          >
                            {serie.description}
                          </Text>
                        )}
                        <View style={styles.modalInputRow}>
                          <TextInput
                            style={[
                              styles.inputSeuil,
                              { backgroundColor: C.carte, color: C.texte },
                            ]}
                            placeholder="Ex : 100"
                            placeholderTextColor={C.texteMuted}
                            keyboardType="decimal-pad"
                            value={seuilEpargneTemp}
                            onChangeText={(t) =>
                              setSeuilEpargneTemp(sanitizeMontantInput(t))
                            }
                            autoFocus
                            returnKeyType="done"
                            onSubmitEditing={validerSeuilEpargne}
                          />
                          <TouchableOpacity
                            style={[
                              styles.btnSerieAction,
                              { backgroundColor: C.purple },
                            ]}
                            onPress={validerSeuilEpargne}
                            activeOpacity={0.7}
                          >
                            <Ionicons
                              name="checkmark"
                              size={18}
                              color="#FFFFFF"
                            />
                          </TouchableOpacity>
                          {!seuilManquant && (
                            <TouchableOpacity
                              style={[
                                styles.btnSerieAction,
                                { backgroundColor: C.carte },
                              ]}
                              onPress={() => setEditionSeuilOuverte(false)}
                              activeOpacity={0.7}
                            >
                              <Ionicons
                                name="close"
                                size={18}
                                color={C.texteMuted}
                              />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    ) : seuilManquant ? (
                      <View style={styles.serieSeuilBloc}>
                        <Text
                          style={[styles.serieDescription, { color: C.texteMuted }]}
                        >
                          {serie.description}
                        </Text>
                        <TouchableOpacity
                          style={styles.serieLienTexte}
                          onPress={ouvrirEditionSeuil}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[styles.serieLien, { color: C.purple }]}
                          >
                            Définir un seuil
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <>
                        {serie.enCours > 0 ? (
                          <View style={styles.serieNombreLigne}>
                            <Text
                              style={[styles.serieNombre, { color: C.texte }]}
                            >
                              {serie.enCours}
                            </Text>
                            <Text
                              style={[
                                styles.serieNombreLabel,
                                { color: C.texteMuted },
                              ]}
                            >
                              {serie.enCours > 1
                                ? "mois consécutifs"
                                : "mois en cours"}
                            </Text>
                          </View>
                        ) : (
                          <Text
                            style={[
                              styles.serieNombreLabel,
                              { color: C.texteMuted, marginBottom: 12 },
                            ]}
                          >
                            Aucune série en cours
                          </Text>
                        )}

                        <View style={styles.serieDots}>
                          {serie.parMois.slice(-12).map((ok, i) => (
                            <View
                              key={i}
                              style={[
                                styles.serieDot,
                                ok
                                  ? { backgroundColor: config.base(C) }
                                  : {
                                      backgroundColor: "transparent",
                                      borderWidth: 1.5,
                                      borderColor: C.separateur,
                                    },
                              ]}
                            />
                          ))}
                        </View>

                        {serie.type === "epargne-constante" && (
                          <TouchableOpacity
                            onPress={ouvrirEditionSeuil}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[styles.serieLien, { color: C.texteMuted }]}
                            >
                              Seuil : {objStore.seuilEpargneConstante} € · Modifier
                            </Text>
                          </TouchableOpacity>
                        )}

                        {serie.historique.length > 0 && (
                          <TouchableOpacity
                            style={styles.serieHistoriqueBouton}
                            onPress={() =>
                              setHistoriqueOuvert((prev) => ({
                                ...prev,
                                [serie.type]: !prev[serie.type],
                              }))
                            }
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.serieLien,
                                { color: C.texteMuted },
                              ]}
                            >
                              {historiqueOuvert[serie.type]
                                ? "Séries précédentes : " +
                                  serie.historique.join(", ") +
                                  " mois"
                                : "Voir l'historique"}
                            </Text>
                            <Ionicons
                              name={
                                historiqueOuvert[serie.type]
                                  ? "chevron-up"
                                  : "chevron-down"
                              }
                              size={14}
                              color={C.texteMuted}
                            />
                          </TouchableOpacity>
                        )}
                      </>
                    )}
                  </View>
                );
              })}
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const CONFIG_SERIE: Record<
  TypeSerie,
  {
    icone: keyof typeof Ionicons.glyphMap;
    iconeVide: keyof typeof Ionicons.glyphMap;
    base: (c: typeof COULEURS.clair) => string;
    light: (c: typeof COULEURS.clair) => string;
  }
> = {
  "epargne-croissante": {
    icone: "trending-up",
    iconeVide: "trending-up",
    base: (c) => c.vert,
    light: (c) => c.vertLight,
  },
  "budget-respecte": {
    icone: "checkmark-circle",
    iconeVide: "checkmark-circle-outline",
    base: (c) => c.purple,
    light: (c) => c.purpleLight,
  },
  "epargne-constante": {
    icone: "flame",
    iconeVide: "flame-outline",
    base: (c) => c.peach,
    light: (c) => c.peachLight,
  },
};

function couleurScoreTeinte(
  mot: MotCleScore,
  c: typeof COULEURS.clair,
): string {
  if (mot === "Solide") return c.vertLight;
  if (mot === "À surveiller") return c.peachLight;
  return c.peachText;
}

function couleurScoreForte(
  mot: MotCleScore,
  c: typeof COULEURS.clair,
): string {
  if (mot === "Solide") return c.vertText;
  if (mot === "À surveiller") return c.peachText;
  return "#FFFFFF";
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF", paddingHorizontal: 20 },
  header: { marginTop: 60, marginBottom: 16 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  btnMenu: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.5,
  },
  titre: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1A1A1A",
    letterSpacing: 1,
  },
  sousTitre: { fontSize: 13, color: "#999", marginTop: 2 },
  periodeBouton: {
    borderRadius: 13,
    borderWidth: 0.5,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 10,
    alignSelf: "flex-start",
  },
  periodeBoutonLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  periodeBoutonValeur: { fontSize: 15, fontWeight: "700" },
  modalOverlayTouch: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end",
  },
  modalCard: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 26,
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 20,
  },
  modalTitre: { fontSize: 18, fontWeight: "700" },
  modalTermine: { fontSize: 16, fontWeight: "600" },
  modalCardBadges: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 26,
    paddingBottom: 20,
    maxHeight: "80%",
  },
  serieCarte: {
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
  },
  serieEnTete: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  serieIconeFond: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  serieTitre: { fontSize: 15, fontWeight: "700", flex: 1 },
  serieTitreLigne: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  serieRecordPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  serieRecordTexte: { fontSize: 12, fontWeight: "600" },
  serieDescription: { fontSize: 13, lineHeight: 18 },
  serieNombreLigne: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 12,
  },
  serieNombre: { fontSize: 32, fontWeight: "700" },
  serieNombreLabel: { fontSize: 13, fontWeight: "500" },
  scoreNombreLigne: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    marginBottom: 14,
  },
  scoreNombre: { fontSize: 32, fontWeight: "700" },
  scoreSur100: { fontSize: 14, fontWeight: "500", marginRight: 6 },
  scoreMotPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  scoreMotTexte: { fontSize: 13, fontWeight: "700" },
  scoreDetailsBloc: { gap: 8 },
  scoreDetailLigne: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  scoreDetailLabel: { fontSize: 13 },
  scoreDetailValeur: { fontSize: 13, fontWeight: "700" },
  serieDots: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
  },
  serieDot: { width: 9, height: 9, borderRadius: 5 },
  serieLien: { fontSize: 12, fontWeight: "600" },
  serieLienTexte: { marginTop: 10, alignSelf: "flex-start" },
  serieSeuilBloc: { gap: 10 },
  modalInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  serieHistoriqueBouton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
  },
  inputSeuil: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  btnSerieAction: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
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
  tiroirReset: { padding: 14, alignItems: "center" },
  tiroirResetTexte: { fontSize: 13, color: "#999", fontWeight: "600" },
  banniereInfo: {
    backgroundColor: "#F0EEFF",
    borderRadius: 13,
    padding: 14,
    marginBottom: 10,
  },
  banniereInfoTexte: { fontSize: 13, color: "#26215C", lineHeight: 19 },
  sectionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 20,
    marginBottom: 10,
  },
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
  kpiDelta: { fontSize: 11, fontWeight: "600" },
  kpiDeltaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginTop: 3,
  },
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
  evolutionTapZones: { position: "absolute", top: 0, left: 0 },
  evolutionTapZone: { position: "absolute", top: 0, width: 32 },
  evolutionInfoPanel: {
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  evolutionInfoMois: { fontSize: 13, fontWeight: "700", marginBottom: 6 },
  evolutionInfoLigne: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  evolutionInfoLabel: { fontSize: 12, flex: 1 },
  evolutionInfoValeur: { fontSize: 12, fontWeight: "700" },
  jaugeBarre: {
    flexDirection: "row",
    height: 16,
    borderRadius: 8,
    overflow: "hidden",
  },
  jaugeLegende: { marginTop: 12, gap: 8 },
  jaugeLegendeItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  jaugeDot: { width: 9, height: 9, borderRadius: 5 },
  jaugeNom: { flex: 1, fontSize: 14, fontWeight: "600" },
  jaugePct: { fontSize: 13, fontWeight: "500" },
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

