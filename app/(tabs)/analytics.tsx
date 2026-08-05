import { Ionicons } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import Slider from "@react-native-community/slider";
import { useRouter } from "expo-router";
import { Fragment, ReactNode, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { useObjectifs } from "../store";
import { COULEURS, useTheme } from "../ThemeContext";
import { calculerSeries, Serie, TypeSerie } from "../../utils/series";
import {
  budgetDuMoisArchive,
  entreesBudgetDuMois,
  estCategorieActiveCeMois,
} from "../../utils/budget";
import {
  calculerScoreSante,
  genererExplicationsScore,
  MotCleScore,
} from "../../utils/score";
import {
  calculerDeltaDepenseJournaliere,
  calculerDeltaTotal,
  calculerRythmeObjectif,
  calculerTauxEpargne,
} from "../../utils/conseils";
import { genererInsightsPeriode } from "../../utils/tendancesPeriode";
import { formaterMontant, parseMontant, sanitizeMontantInput } from "../../utils/montant";
import { BoutonPrincipal } from "../BoutonPrincipal";
import { useGuest } from "../GuestContext";
import { InfoBulle } from "../InfoBulle";
import { Text } from "../Texte";
import { TextInput } from "../TexteInput";
import { dureeAnimation, useAccessibilite } from "../AccessibiliteContext";
import { useLargeurAnimee } from "../BarreProgression";
import { CibleTutoriel, RectCible } from "../CibleTutoriel";
import {
  CouleursTheme,
  EtapeTutoriel,
  TutorielOverlay,
} from "../TutorielOverlay";
import { useTutoriel } from "../TutorielContext";

function maquettePeriode(C: CouleursTheme) {
  const options = ["3 mois", "6 mois", "1 an"];
  return (
    <View style={{ flexDirection: "row", gap: 6, marginBottom: 12 }}>
      {options.map((label, i) => (
        <View
          key={label}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 10,
            backgroundColor: i === 0 ? C.purple : C.fondSecondaire,
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontWeight: "600",
              color: i === 0 ? "#FFFFFF" : C.texteMuted,
            }}
          >
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function maquetteSectionsStats(C: CouleursTheme) {
  const carte = (contenu: ReactNode, label: string) => (
    <View
      style={{
        flex: 1,
        backgroundColor: C.fondSecondaire,
        borderRadius: 10,
        paddingVertical: 8,
        alignItems: "center",
      }}
    >
      {contenu}
      <Text style={{ fontSize: 9, color: C.texteMuted, marginTop: 4 }}>
        {label}
      </Text>
    </View>
  );
  return (
    <View style={{ flexDirection: "row", gap: 6, marginBottom: 12 }}>
      {carte(
        <Svg width={40} height={20}>
          <Path
            d="M2 16 L12 8 L22 12 L38 4"
            stroke={C.purple}
            strokeWidth={2}
            fill="none"
          />
        </Svg>,
        "Évolution",
      )}
      {carte(
        <View
          style={{
            flexDirection: "row",
            gap: 3,
            height: 20,
            alignItems: "flex-end",
          }}
        >
          <View style={{ width: 5, height: 10, backgroundColor: C.accent, borderRadius: 2 }} />
          <View style={{ width: 5, height: 18, backgroundColor: C.peach, borderRadius: 2 }} />
          <View style={{ width: 5, height: 6, backgroundColor: C.bleuGris, borderRadius: 2 }} />
        </View>,
        "Répartition",
      )}
      {carte(
        <Text style={{ fontSize: 14, fontWeight: "800", color: C.purple }}>
          82<Text style={{ fontSize: 9, fontWeight: "600" }}>/100</Text>
        </Text>,
        "Ton bilan",
      )}
    </View>
  );
}

const ETAPES_STATS: EtapeTutoriel[] = [
  {
    texte:
      "Explore tes finances en détail : évolution dans le temps, répartition par catégorie, et dans Ton bilan — ton score de santé financière et le simulateur.",
    maquette: maquetteSectionsStats,
  },
  {
    id: "periode",
    texte:
      "Choisis la période à analyser — de 3 mois jusqu'à tout ton historique disponible.",
    maquette: maquettePeriode,
  },
  {
    id: "graphique",
    texte: "Ce graphique montre l'évolution de ton budget, ton épargne et tes dépenses dans le temps.",
  },
  {
    id: "bilan",
    texte: "Retrouve ici ton score financier et tes séries de suivi.",
  },
];

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

// Défini au niveau module (pas dans le composant) pour ne pas recréer le
// composant animé — et donc démonter/remonter la vue native du slider — à
// chaque rendu.
const SliderAnime = Animated.createAnimatedComponent(Slider);

// Segment "cbarFill" (comparaison catégories / objectifs) avec largeur
// animée — composant maison plutôt que BarreProgression car son rayon est
// fixe (4px), pas la forme "pilule" (rayon = hauteur/2) du composant
// partagé. Même raison que SliderAnime pour être au niveau module : garder
// une identité de composant stable entre les rendus.
function BarreCbarAnimee({
  pourcentage,
  couleur,
  style,
}: {
  pourcentage: number;
  couleur: string;
  style?: object | object[];
}) {
  const largeur = useLargeurAnimee(pourcentage);
  return (
    <Animated.View style={[style, { width: largeur, backgroundColor: couleur }]} />
  );
}

const { width: SCREEN_W } = Dimensions.get("window");
const CHART_W = SCREEN_W - 80;
const CHART_H = 160;
const PADDING_X = 16;
const PADDING_LEFT = 34;
// Marge en haut du graphique pour laisser la place à la valeur affichée en
// permanence au-dessus du dernier point de chaque courbe (jamais coupée,
// même quand ce point touche le maximum de l'échelle).
const PADDING_HAUT = 20;

// Étale verticalement les libellés de "dernier point" pour éviter qu'ils se
// chevauchent quand plusieurs courbes ont des valeurs proches à la fin de
// la période affichée.
function positionsLabelsSansChevauchement<T extends { y: number }>(
  items: T[],
  ecartMin = 12,
): (T & { yLabel: number })[] {
  const tries = items
    .map((item, index) => ({ item, index, naturel: item.y - 10 }))
    .sort((a, b) => a.naturel - b.naturel);

  let precedent = -Infinity;
  const positionnes = tries.map(({ item, index, naturel }) => {
    const yLabel = Math.max(naturel, precedent + ecartMin);
    precedent = yLabel;
    return { item, index, yLabel };
  });

  const resultat: (T & { yLabel: number })[] = new Array(items.length);
  positionnes.forEach(({ item, index, yLabel }) => {
    resultat[index] = { ...item, yLabel };
  });
  return resultat;
}

// Largeur minimale (px) pour qu'un libellé de valeur reste lisible sans
// chevaucher son voisin horizontal.
const LARGEUR_MIN_LABEL_POINT = 34;

// Affiche la valeur de tous les points quand la période est courte (le cas
// courant), mais s'éclaircit automatiquement sur les longues périodes
// (jusqu'à 10 ans) pour ne jamais produire un amas illisible — toujours en
// gardant le premier et le dernier point.
function indicesLabelsAffiches(n: number, espacement: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0];

  const largeurDisponible = (n - 1) * espacement;
  const maxLabels = Math.max(
    2,
    Math.floor(largeurDisponible / LARGEUR_MIN_LABEL_POINT) + 1,
  );
  if (maxLabels >= n) {
    return Array.from({ length: n }, (_, i) => i);
  }

  const pas = (n - 1) / (maxLabels - 1);
  const indices = new Set<number>();
  for (let k = 0; k < maxLabels; k++) {
    indices.add(Math.round(k * pas));
  }
  indices.add(n - 1);
  return [...indices].sort((a, b) => a - b);
}

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
const HAUTEUR_TRACK_EPARGNE = 90; // hauteur de la zone de tracé du graphique "Épargne dans le temps"

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
    y: PADDING_HAUT + CHART_H - (v / max) * (CHART_H - 10) + 5,
  }));
  const pointsPrevus = donneesPrevisionnelles.map((v, i) => ({
    x: PADDING_LEFT + i * espacement,
    y: PADDING_HAUT + CHART_H - (v / max) * (CHART_H - 10) + 5,
  }));

  const pathReels = pointsReels
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
  const pathPrevus = pointsPrevus
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const dernier = n - 1;
  const indicesAffiches = indicesLabelsAffiches(n, espacement);
  const labelsParPoint = indicesAffiches.map((i) => ({
    i,
    estPremier: i === 0,
    estDernier: i === dernier,
    items: positionsLabelsSansChevauchement([
      { y: pointsReels[i].y, x: pointsReels[i].x, valeur: donneesReelles[i], couleur: C.accent },
      { y: pointsPrevus[i].y, x: pointsPrevus[i].x, valeur: donneesPrevisionnelles[i], couleur: C.peach },
    ]),
  }));

  return (
    <Svg width={CHART_W} height={CHART_H + 24 + PADDING_HAUT}>
      {ticks.map((t) => {
        const y = PADDING_HAUT + CHART_H - (t / max) * (CHART_H - 10) + 5;
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
      {labelsParPoint.map(({ i, estPremier, estDernier, items }) =>
        items.map((l, j) => (
          <SvgText
            key={`dp${i}-${j}`}
            x={estDernier ? l.x + 2 : estPremier ? l.x - 2 : l.x}
            y={l.yLabel}
            fontSize={estDernier ? 11 : 9}
            fontWeight={estDernier ? "700" : "500"}
            fill={l.couleur}
            textAnchor={estDernier ? "end" : estPremier ? "start" : "middle"}
          >
            {Math.round(l.valeur)}€
          </SvgText>
        )),
      )}
      {labels.map((lbl, i) => (
        <SvgText
          key={`l${i}`}
          x={PADDING_LEFT + i * espacement}
          y={PADDING_HAUT + CHART_H + 18}
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
  fondCarte,
}: {
  series: SerieEvolution[];
  labels: string[];
  couleurs: typeof COULEURS.clair;
  fondCarte: string;
}) {
  const [selection, setSelection] = useState<number | null>(null);
  const toutes = series.flatMap((s) => s.donnees);
  const maxBrut = Math.max(...toutes, 1);
  const ticks = calculerTicksY(maxBrut);
  const max = ticks[ticks.length - 1];
  const n = labels.length;
  const largeurUtile = CHART_W - PADDING_LEFT - PADDING_X;
  const espacement = n > 1 ? largeurUtile / (n - 1) : largeurUtile;
  const FONT_SIZE_LABEL = 9;

  const pointsParSerie = series.map((s) => ({
    ...s,
    points: s.donnees.map((v, i) => ({
      x: PADDING_LEFT + i * espacement,
      y: PADDING_HAUT + CHART_H - (v / max) * (CHART_H - 10) + 5,
    })),
  }));

  const dernier = n - 1;
  const indicesAffiches = indicesLabelsAffiches(n, espacement);
  // Écart minimum entre étiquettes empilées verticalement quand plusieurs
  // courbes ont des valeurs proches au même mois. Toutes les étiquettes
  // partagent désormais la même taille de police (voir FONT_SIZE_LABEL plus
  // bas), donc un seul écart suffit ; en plus de cet espacement, chaque
  // étiquette reçoit un fond opaque (voir le Rect sous chaque SvgText) qui
  // garantit qu'aucun glyphe — y compris le "€" final — ne peut être
  // recouvert par une étiquette voisine, même si deux valeurs sont
  // quasiment identiques.
  const ECART_MIN_LABEL = 15;
  const labelsParPoint = indicesAffiches.map((i) => {
    const estDernier = i === dernier;
    return {
      i,
      estPremier: i === 0,
      estDernier,
      items: positionsLabelsSansChevauchement(
        pointsParSerie.map((s) => ({
          y: s.points[i].y,
          x: s.points[i].x,
          valeur: s.donnees[i],
          couleur: s.couleur,
        })),
        ECART_MIN_LABEL,
      ),
    };
  });

  return (
    <View>
      <View style={{ position: "relative" }}>
        <Svg width={CHART_W} height={CHART_H + 24 + PADDING_HAUT}>
          {ticks.map((t) => {
            const y = PADDING_HAUT + CHART_H - (t / max) * (CHART_H - 10) + 5;
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
              y1={PADDING_HAUT + 5}
              x2={PADDING_LEFT + selection * espacement}
              y2={PADDING_HAUT + CHART_H + 5}
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
          {labelsParPoint.map(({ i, estPremier, estDernier, items }) =>
            items.map((l, j) => {
              // Même taille pour tous les points : seul le gras distingue le
              // dernier point (mise en avant légère, sans écart de taille).
              const texte = `${Math.round(l.valeur)}€`;
              const x = estDernier ? l.x + 2 : estPremier ? l.x - 2 : l.x;
              const anchor = estDernier ? "end" : estPremier ? "start" : "middle";
              // Largeur approximative (pas de mesure de texte synchrone
              // disponible en RN/SVG) : sert uniquement de fond opaque sous
              // l'étiquette, pour qu'elle ne puisse jamais se faire
              // partiellement recouvrir par une étiquette voisine.
              const largeurApprox = texte.length * FONT_SIZE_LABEL * 0.62 + 4;
              const rectX =
                anchor === "end"
                  ? x - largeurApprox
                  : anchor === "start"
                    ? x
                    : x - largeurApprox / 2;
              return (
                <Fragment key={`dp${i}-${j}`}>
                  <Rect
                    x={rectX}
                    y={l.yLabel - FONT_SIZE_LABEL}
                    width={largeurApprox}
                    height={FONT_SIZE_LABEL + 3}
                    rx={3}
                    fill={fondCarte}
                  />
                  <SvgText
                    x={x}
                    y={l.yLabel}
                    fontSize={FONT_SIZE_LABEL}
                    fontWeight={estDernier ? "700" : "500"}
                    fill={l.couleur}
                    textAnchor={anchor}
                  >
                    {texte}
                  </SvgText>
                </Fragment>
              );
            }),
          )}
          {labels.map((lbl, i) => (
            <SvgText
              key={`l${i}`}
              x={PADDING_LEFT + i * espacement}
              y={PADDING_HAUT + CHART_H + 18}
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
            { width: CHART_W, height: CHART_H + 24 + PADDING_HAUT },
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
                  height: CHART_H + 24 + PADDING_HAUT,
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
                {formaterMontant(s.donnees[selection])} €
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
              {Math.round((s.montant / total) * 100)}% · {formaterMontant(s.montant)} €
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function Analytics() {
  const router = useRouter();
  const objStore = useObjectifs();
  const { theme, couleurs: C } = useTheme();
  const { reduireAnimations } = useAccessibilite();
  const { isGuest } = useGuest();
  const { stats: tutorielStatsVu, marquerVu: marquerTutorielVu } =
    useTutoriel();
  const [posCiblesTutoriel, setPosCiblesTutoriel] = useState<
    Record<string, RectCible>
  >({});
  const mesurerCibleTutoriel = (id: string, rect: RectCible) =>
    setPosCiblesTutoriel((p) => ({ ...p, [id]: rect }));
  const [nbMoisSelectionne, setNbMoisSelectionne] = useState(3);
  const [deltaDepMoyPourcentage, setDeltaDepMoyPourcentage] = useState(true);
  const [periodePickerVisible, setPeriodePickerVisible] = useState(false);
  const [vue, setVue] = useState<Vue>("global");
  const [titoirOuvert, setTiroirOuvert] = useState(false);
  const [categoriesSelectionnees, setCategoriesSelectionnees] = useState<
    string[]
  >([]);
  const [modalSeriesVisible, setModalSeriesVisible] = useState(false);
  const [vueModalStats, setVueModalStats] = useState<
    "score" | "series" | "simulateur"
  >("score");
  // Les 3 onglets (Score/Séries/Simulateur) partagent le même ScrollView —
  // sans reset explicite, changer d'onglet garde l'ancien contentOffset, qui
  // peut dépasser la hauteur du nouveau contenu et donner l'impression que le
  // scroll est bloqué (impossible d'atteindre le bas des cartes Séries après
  // avoir consulté un autre onglet plus court).
  const scrollStatsRef = useRef<ScrollView>(null);
  const changerVueModalStats = (v: "score" | "series" | "simulateur") => {
    setVueModalStats(v);
    scrollStatsRef.current?.scrollTo({ y: 0, animated: false });
  };
  const [historiqueOuvert, setHistoriqueOuvert] = useState<
    Partial<Record<TypeSerie, boolean>>
  >({});
  const [editionSeuilOuverte, setEditionSeuilOuverte] = useState(false);
  const [seuilEpargneTemp, setSeuilEpargneTemp] = useState("");

  const [categorieSimulee, setCategorieSimulee] = useState<string | null>(
    null,
  );
  const [budgetSimule, setBudgetSimule] = useState(0);
  const [tiroirSimulateurOuvert, setTiroirSimulateurOuvert] = useState(false);
  const categoriesSimulables = objStore.enveloppes.filter(
    (e) => e.type !== "Entrée",
  );
  const enveloppeSimulee =
    categoriesSimulables.find((e) => e.id === categorieSimulee) ?? null;

  useEffect(() => {
    if (enveloppeSimulee) setBudgetSimule(enveloppeSimulee.budget);
  }, [categorieSimulee]);

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
  const explicationsScore = genererExplicationsScore(
    {
      enveloppes: objStore.enveloppes,
      epargneMois: objStore.epargneMois,
      historiquesMois: objStore.historiquesMois,
      seuilEpargneConstante: objStore.seuilEpargneConstante,
      objectifs: objStore.objectifs,
    },
    scoreSante.details,
  );

  const NB_MOIS_PROJECTION = 6;
  const budgetActuelSimule = enveloppeSimulee?.budget ?? 0;
  const ecartMensuelSimule = budgetActuelSimule - budgetSimule;
  const pointsRecentsEpargne = [
    ...objStore.historiquesMois.slice(-5).map((s) => s.epargne),
    objStore.epargneMois,
  ];
  const epargneMoyenneMensuelle =
    pointsRecentsEpargne.reduce((a, b) => a + b, 0) /
    pointsRecentsEpargne.length;
  const labelsSimulation = Array.from(
    { length: NB_MOIS_PROJECTION },
    (_, i) => MOIS_LABELS[(MOIS_ACTUEL + i + 1) % 12],
  );
  const donneesReellesSimulation = Array.from(
    { length: NB_MOIS_PROJECTION },
    (_, i) => Math.round(epargneMoyenneMensuelle * (i + 1)),
  );
  const donneesPrevisionnellesSimulation = donneesReellesSimulation.map(
    (v, i) => Math.round(v + ecartMensuelSimule * (i + 1)),
  );
  const impactTotal6MoisSimulation = Math.round(
    ecartMensuelSimule * NB_MOIS_PROJECTION,
  );
  // Transition douce de la couleur du curseur/piste du simulateur quand
  // l'impact projeté change de signe, plutôt qu'un changement brutal.
  const impactSimulePositif = impactTotal6MoisSimulation >= 0;
  const animCouleurSlider = useRef(
    new Animated.Value(impactSimulePositif ? 1 : 0),
  ).current;
  useEffect(() => {
    Animated.timing(animCouleurSlider, {
      toValue: impactSimulePositif ? 1 : 0,
      duration: dureeAnimation(reduireAnimations, 350),
      useNativeDriver: false,
    }).start();
  }, [impactSimulePositif, reduireAnimations, animCouleurSlider]);
  const couleurSliderSimulation = animCouleurSlider.interpolate({
    inputRange: [0, 1],
    outputRange: [C.peachText, C.vertText],
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
      return entreesBudgetDuMois(objStore.enveloppes, annee, mois).total;
    }
    const snap = objStore.historiquesMois.find(
      (s) => s.mois === mois && s.annee === annee,
    );
    if (!snap) return null;
    return budgetDuMoisArchive(snap);
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
  const budgetMoisActuel = getBudgetMois(MOIS_ACTUEL, ANNEE_ACTUELLE) ?? 0;
  const moisPrecedent = new Date(ANNEE_ACTUELLE, MOIS_ACTUEL - 1, 1);
  const depenseMoisPrec =
    getDepenseMois(moisPrecedent.getMonth(), moisPrecedent.getFullYear()) ?? 0;
  const joursEcoules = new Date().getDate();
  const depenseMoyJour =
    joursEcoules > 0 ? Math.round(depenseMoisActuel / joursEcoules) : 0;
  const { pct: deltaDepMoy, deltaEuros: deltaDepMoyEuros } =
    calculerDeltaDepenseJournaliere(depenseMoisActuel, depenseMoisPrec, joursEcoules);

  const disponible = entreesBudgetDuMois(
    objStore.enveloppes,
    ANNEE_ACTUELLE,
    MOIS_ACTUEL,
  ).total;
  const epargne = objStore.epargneMois;
  const tauxEpargne = calculerTauxEpargne(epargne, disponible);

  const deltaTotal = calculerDeltaTotal(depenseMoisActuel, depenseMoisPrec);

  const insights = genererInsightsPeriode({
    donneesReelles,
    donneesEpargne,
    donneesPrevisionnelles,
    labels,
    nbMoisAvecDonnees,
    series,
  });

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
  const epargneMoisPrec = snapshotMoisPrecedent?.epargne ?? null;
  const objectifsAvecDelta = objStore.objectifs.map((obj) => {
    const { pct, delta, moisRestants, rythmeInsuffisant } =
      calculerRythmeObjectif(obj, objStore.historiquesMois, snapshotMoisPrecedent);
    return { ...obj, pct, delta, moisRestants, rythmeInsuffisant };
  });

  const repartitionDepenses = objStore.enveloppes
    .filter(
      (e) =>
        e.type !== "Entrée" &&
        e.depense > 0 &&
        estCategorieActiveCeMois(e, ANNEE_ACTUELLE, MOIS_ACTUEL),
    )
    .map((e) => ({
      cle: e.id,
      label: e.nom,
      couleur: e.couleur,
      montant: e.depense,
    }));

  const repartitionEntrees = objStore.enveloppes
    // "Budget" est le nom réservé de l'entrée créée par la migration de
    // l'ancien montant scalaire (cf. migration
    // 20260731100100_migrer_budget_vers_entrees.sql) — elle représente le
    // salaire principal, pas une "vraie" entrée d'argent secondaire au même
    // titre que Salaire secondaire/Vinted/remboursements, donc on l'exclut
    // de cette répartition.
    .filter(
      (e) =>
        e.type === "Entrée" &&
        e.depense > 0 &&
        e.nom !== "Budget" &&
        estCategorieActiveCeMois(e, ANNEE_ACTUELLE, MOIS_ACTUEL),
    )
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
          <CibleTutoriel id="bilan" onMesure={mesurerCibleTutoriel}>
          <TouchableOpacity
            style={[
              styles.btnMenu,
              { backgroundColor: C.fondSecondaire, borderColor: C.carteBorder },
            ]}
            onPress={() => {
              setModalSeriesVisible(true);
              scrollStatsRef.current?.scrollTo({ y: 0, animated: false });
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Voir la santé financière et les séries"
          >
            <Text style={[styles.btnMenuTexte, { color: C.texte }]}>
              Ton bilan
            </Text>
          </TouchableOpacity>
          </CibleTutoriel>
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
                  <Text
                    style={[styles.tiroirNom, { color: C.texte }]}
                    numberOfLines={1}
                  >
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

        <CibleTutoriel id="periode" onMesure={mesurerCibleTutoriel}>
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
        </CibleTutoriel>

        <Modal
          visible={periodePickerVisible}
          transparent
          animationType={reduireAnimations ? "none" : "slide"}
          onRequestClose={() => setPeriodePickerVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlayTouch}
            activeOpacity={1}
            onPress={() => setPeriodePickerVisible(false)}
          >
            <TouchableOpacity
              style={[styles.modalCard, { backgroundColor: C.carte }]}
              activeOpacity={1}
              onPress={() => {}}
            >
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
            </TouchableOpacity>
          </TouchableOpacity>
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
            <View style={styles.kpiLabelRow}>
              <Text
                style={[
                  styles.kpiLabel,
                  {
                    marginBottom: 0,
                    color: theme === "sombre" ? C.accent : C.texteMuted,
                  },
                ]}
              >
                DÉPENSE MOY. / JOUR
              </Text>
              <InfoBulle
                titre="Dépense moyenne par jour"
                texte="Calculée en divisant tes dépenses totales par le nombre de jours écoulés depuis le début du mois. En début de mois, ce chiffre peut paraître élevé — il s'étale et se stabilise naturellement au fil des jours."
                taille={12}
                couleur={theme === "sombre" ? C.accent : C.texteMuted}
              />
            </View>
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
              <TouchableOpacity
                activeOpacity={0.6}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => setDeltaDepMoyPourcentage((v) => !v)}
              >
                <Text
                  style={[
                    styles.kpiDelta,
                    { color: deltaDepMoy <= 0 ? C.accentText : C.peachText },
                  ]}
                >
                  {deltaDepMoyPourcentage
                    ? `${Math.abs(deltaDepMoy)}%`
                    : `${deltaDepMoyEuros > 0 ? "+" : ""}${deltaDepMoyEuros} €`}
                  {" vs mois dernier"}
                </Text>
              </TouchableOpacity>
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
        <CibleTutoriel
          id="graphique"
          onMesure={mesurerCibleTutoriel}
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
                label: "Budget",
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
            fondCarte={theme === "sombre" ? C.carte : "#FAFAFA"}
          />
        </CibleTutoriel>

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
          {(() => {
            const maxBrutEpargne = Math.max(...donneesEpargne, 1);
            const ticksEpargne = calculerTicksY(maxBrutEpargne);
            const maxEpargne = ticksEpargne[ticksEpargne.length - 1];
            return (
              <View style={styles.epargneChartRow}>
                <View style={[styles.epargneAxeY, { height: HAUTEUR_TRACK_EPARGNE }]}>
                  {[...ticksEpargne].reverse().map((t) => (
                    <Text
                      key={t}
                      style={[styles.epargneAxeYTexte, { color: C.texteMuted }]}
                    >
                      {t}€
                    </Text>
                  ))}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.barresEpargneValeursRow}>
                    {donneesEpargne.map((val, i) => (
                      <Text
                        key={i}
                        style={[styles.barreEpargneVal, { color: C.bleuGris }]}
                      >
                        {val > 0 ? `${formaterMontant(val)}€` : ""}
                      </Text>
                    ))}
                  </View>
                  <View
                    style={[
                      styles.epargnePlotZone,
                      { height: HAUTEUR_TRACK_EPARGNE },
                    ]}
                  >
                    {ticksEpargne.map((t) => (
                      <View
                        key={t}
                        style={[
                          styles.epargneGridline,
                          {
                            top:
                              HAUTEUR_TRACK_EPARGNE -
                              (t / maxEpargne) * HAUTEUR_TRACK_EPARGNE,
                            backgroundColor: C.separateur,
                          },
                        ]}
                      />
                    ))}
                    <View style={styles.barresEpargne}>
                      {donneesEpargne.map((val, i) => {
                        const h = Math.round(
                          (val / maxEpargne) * HAUTEUR_TRACK_EPARGNE,
                        );
                        return (
                          <View key={i} style={styles.barreEpargneCol}>
                            <View
                              style={[
                                styles.barreEpargneRemplissage,
                                { height: h, backgroundColor: C.bleuGris },
                              ]}
                            />
                          </View>
                        );
                      })}
                    </View>
                  </View>
                  <View style={styles.barresEpargneValeursRow}>
                    {labels.map((lbl, i) => (
                      <Text
                        key={i}
                        style={[styles.barreEpargneLabel, { color: C.texteMuted }]}
                      >
                        {lbl}
                      </Text>
                    ))}
                  </View>
                </View>
              </View>
            );
          })()}
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
          {objStore.enveloppes
            // Comparaison honnête uniquement entre catégories présentes dans
            // LES DEUX mois comparés — une catégorie qui n'existait pas le
            // mois dernier (ou plus ce mois-ci) n'a rien de comparable à
            // afficher ici.
            .filter((env) =>
              snapshotMoisPrecedent?.enveloppes.some((e) => e.id === env.id),
            )
            // Plus chère en premier, pas alphabétique.
            .sort((a, b) => b.depense - a.depense)
            .map((env) => {
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
                  <BarreCbarAnimee
                    pourcentage={Math.min(pct, 100)}
                    couleur={env.couleur}
                    style={styles.cbarFill}
                  />
                </View>
                <Text style={[styles.cbarVal, { color: C.texte }]}>
                  {formaterMontant(env.depense)} €
                </Text>
              </View>
            );
          })}
          {depenseMoisPrec > 0 && (
            <Text style={[styles.compareFooter, { color: C.texteMuted }]}>
              Total ce mois : {formaterMontant(depenseMoisActuel)} € vs {formaterMontant(depenseMoisPrec)} € le
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
                  <Text
                    style={[styles.objectifStatNom, { color: C.texte }]}
                    numberOfLines={1}
                  >
                    {obj.nom}
                  </Text>
                  <Text style={[styles.objectifStatPct, { color: obj.couleur }]}>
                    {Math.round(obj.pct)}%
                  </Text>
                </View>
                <View style={[styles.cbarTrack, { backgroundColor: C.separateur }]}>
                  <BarreCbarAnimee
                    pourcentage={obj.pct}
                    couleur={obj.couleur}
                    style={styles.cbarFill}
                  />
                </View>
                {obj.moisRestants !== null && (
                  <Text
                    style={[styles.objectifStatEstimation, { color: C.texteMuted }]}
                  >
                    À ce rythme, encore environ {obj.moisRestants} mois.
                  </Text>
                )}
                {obj.rythmeInsuffisant && (
                  <Text
                    style={[styles.objectifStatEstimation, { color: C.texteMuted }]}
                  >
                    Rythme actuel insuffisant pour estimer une date
                  </Text>
                )}
                <View style={styles.objectifStatFooter}>
                  <Text
                    style={[styles.objectifStatMontant, { color: C.texteMuted }]}
                  >
                    {formaterMontant(obj.actuel)} € / {formaterMontant(obj.cible)} €
                  </Text>
                  {obj.delta !== null && (
                    <Text
                      style={[
                        styles.objectifStatDelta,
                        { color: obj.delta >= 0 ? C.accentText : C.peachText },
                      ]}
                    >
                      {obj.delta >= 0 ? "+" : ""}
                      {formaterMontant(obj.delta)}€ vs mois dernier
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
                <Text
                  style={[styles.topNom, { color: C.texte }]}
                  numberOfLines={1}
                >
                  {dep.nom}
                </Text>
                <Text style={[styles.topMois, { color: C.texteMuted }]}>
                  {dep.mois}
                </Text>
                <Text style={[styles.topMontant, { color: C.texte }]}>
                  {formaterMontant(dep.montant)} €
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
        animationType={reduireAnimations ? "none" : "slide"}
        onRequestClose={() => setModalSeriesVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlayTouch}
          activeOpacity={1}
          onPress={() => setModalSeriesVisible(false)}
        >
          <TouchableOpacity
            style={[styles.modalCardBadges, { backgroundColor: C.carte }]}
            activeOpacity={1}
            onPress={() => {}}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitre, { color: C.texte }]}>
                  {vueModalStats === "score"
                    ? "Santé financière"
                    : vueModalStats === "series"
                      ? "Séries"
                      : "Simulateur"}
                </Text>
                <Text style={[styles.sousTitre, { color: C.texteMuted }]}>
                  {vueModalStats === "score"
                    ? "Vue d'ensemble de ta situation"
                    : vueModalStats === "series"
                      ? "Régularité mois après mois"
                      : "Et si tu ajustais un budget ?"}
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
              {(["score", "series", "simulateur"] as const).map((v) => (
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
                  onPress={() => changerVueModalStats(v)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipTexte,
                      { color: C.texteMuted },
                      vueModalStats === v && styles.chipTexteActif,
                    ]}
                  >
                    {v === "score"
                      ? "Score"
                      : v === "series"
                        ? "Séries"
                        : "Simulateur"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flex: 1 }}>
            <ScrollView
              ref={scrollStatsRef}
              style={{ flex: 1 }}
              showsVerticalScrollIndicator={false}
            >
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

                  {explicationsScore.length > 0 && (
                    <View style={styles.scoreExplicationsBloc}>
                      <Text
                        style={[
                          styles.scoreExplicationsLabel,
                          { color: C.texteMuted },
                        ]}
                      >
                        Ce qui influence ton score ce mois-ci
                      </Text>
                      {explicationsScore.map((exp, i) => (
                        <View key={i} style={styles.scoreExplicationItem}>
                          <View
                            style={[
                              styles.scoreExplicationDot,
                              { backgroundColor: exp.positif ? C.vert : C.rouge },
                            ]}
                          />
                          <Text
                            style={[
                              styles.scoreExplicationTexte,
                              { color: C.texte },
                            ]}
                          >
                            {exp.texte}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {vueModalStats === "series" &&
                series.map((serie) => {
                const config = CONFIG_SERIE[serie.type];
                const active = serie.enCours > 0;
                const seuilManquant =
                  serie.type === "epargne-constante" &&
                  objStore.seuilEpargneConstante === null;
                const explicationSerie = texteExplicationSerie(serie, {
                  epargneMois: objStore.epargneMois,
                  epargneMoisPrec,
                  depenseMoisActuel,
                  budgetMoisActuel,
                  seuilEpargneConstante: objStore.seuilEpargneConstante,
                });

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
                                ? `Le nombre de mois d'affilée où tu atteins ton seuil d'épargne personnalisé (actuellement ${formaterMontant(objStore.seuilEpargneConstante)}€).`
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
                            accessibilityRole="button"
                            accessibilityLabel="Valider le seuil d'épargne"
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
                              accessibilityRole="button"
                              accessibilityLabel="Annuler la modification du seuil"
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

                        {explicationSerie && (
                          <View style={styles.serieExplicationLigne}>
                            <View
                              style={[
                                styles.serieExplicationDot,
                                { backgroundColor: active ? C.vert : C.rouge },
                              ]}
                            />
                            <Text
                              style={[
                                styles.serieExplicationTexte,
                                { color: C.texteMuted },
                              ]}
                            >
                              {explicationSerie}
                            </Text>
                          </View>
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
                              Seuil : {formaterMontant(objStore.seuilEpargneConstante ?? 0)} € · Modifier
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

              {vueModalStats === "simulateur" && (
                <View
                  style={[styles.serieCarte, { backgroundColor: C.fondSecondaire }]}
                >
                  <View style={styles.serieEnTete}>
                    <View
                      style={[styles.serieIconeFond, { backgroundColor: C.purpleLight }]}
                    >
                      <Ionicons name="flask-outline" size={18} color={C.purple} />
                    </View>
                    <Text style={[styles.serieTitre, { color: C.texte }]}>
                      Et si...
                    </Text>
                    <InfoBulle
                      titre="Comment ce simulateur fonctionne"
                      texte={`Choisis une catégorie et ajuste son budget hypothétique avec le curseur. La courbe compare ta trajectoire d'épargne actuelle (moyenne de tes derniers mois) à ce qu'elle serait sur ${NB_MOIS_PROJECTION} mois avec ce budget ajusté. C'est purement indicatif : rien n'est enregistré ni modifié dans tes vraies données.`}
                    />
                  </View>

                  {categoriesSimulables.length === 0 ? (
                    <Text
                      style={[styles.serieDescription, { color: C.texteMuted }]}
                    >
                      Crée d&apos;abord une catégorie Fixe ou Variable pour
                      utiliser le simulateur.
                    </Text>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={[
                          styles.tiroirBouton,
                          { backgroundColor: C.fondSecondaire, borderColor: C.carteBorder },
                        ]}
                        onPress={() =>
                          setTiroirSimulateurOuvert(!tiroirSimulateurOuvert)
                        }
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.tiroirBoutonTexte, { color: C.texte }]}>
                          {enveloppeSimulee
                            ? enveloppeSimulee.nom
                            : "Choisir une catégorie"}
                        </Text>
                        <Text style={[styles.tiroirChevron, { color: C.texteMuted }]}>
                          {tiroirSimulateurOuvert ? "▾" : "▸"}
                        </Text>
                      </TouchableOpacity>

                      {tiroirSimulateurOuvert && (
                        <View
                          style={[
                            styles.tiroirContenu,
                            {
                              backgroundColor:
                                theme === "sombre" ? C.carte : "#FAFAFA",
                              borderColor: C.carteBorder,
                            },
                          ]}
                        >
                          {categoriesSimulables.map((env) => {
                            const sel = env.id === categorieSimulee;
                            return (
                              <TouchableOpacity
                                key={env.id}
                                style={[
                                  styles.tiroirItem,
                                  { borderBottomColor: C.separateur },
                                  sel && { backgroundColor: env.couleur + "22" },
                                ]}
                                onPress={() => {
                                  setCategorieSimulee(env.id);
                                  setTiroirSimulateurOuvert(false);
                                }}
                                activeOpacity={0.7}
                              >
                                <View
                                  style={[
                                    styles.tiroirRond,
                                    { backgroundColor: env.couleur },
                                  ]}
                                />
                                <Text
                                  style={[styles.tiroirNom, { color: C.texte }]}
                                  numberOfLines={1}
                                >
                                  {env.nom}
                                </Text>
                                <Text
                                  style={[
                                    styles.simulateurBudgetActuelTexte,
                                    { color: C.texteMuted },
                                  ]}
                                >
                                  {formaterMontant(env.budget)} €
                                </Text>
                                {sel && (
                                  <Ionicons
                                    name="checkmark"
                                    size={16}
                                    color={env.couleur}
                                  />
                                )}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}

                      {enveloppeSimulee && (
                        <>
                          <View style={styles.simulateurBudgetLigne}>
                            <Text
                              style={[
                                styles.simulateurBudgetTexte,
                                { color: C.texte },
                              ]}
                            >
                              Budget simulé : {Math.round(budgetSimule)} €
                            </Text>
                            <Text
                              style={[
                                styles.simulateurDeltaTexte,
                                {
                                  color:
                                    budgetSimule === budgetActuelSimule
                                      ? C.texteMuted
                                      : budgetSimule > budgetActuelSimule
                                        ? C.peachText
                                        : C.vertText,
                                },
                              ]}
                            >
                              {budgetSimule === budgetActuelSimule
                                ? "= budget actuel"
                                : `${budgetSimule > budgetActuelSimule ? "+" : ""}${Math.round(budgetSimule - budgetActuelSimule)} € vs actuel`}
                            </Text>
                          </View>
                          <SliderAnime
                            value={budgetSimule}
                            minimumValue={0}
                            maximumValue={Math.max(budgetActuelSimule * 2, 100)}
                            step={5}
                            onValueChange={setBudgetSimule}
                            minimumTrackTintColor={couleurSliderSimulation}
                            maximumTrackTintColor={C.separateur}
                            thumbTintColor={couleurSliderSimulation}
                            accessibilityLabel={`Budget simulé pour ${enveloppeSimulee.nom}`}
                            style={styles.simulateurSlider}
                          />

                          <View style={styles.simulateurExplicationsBloc}>
                            <View style={styles.serieExplicationLigne}>
                              <View
                                style={[
                                  styles.serieExplicationDot,
                                  { backgroundColor: C.purple },
                                ]}
                              />
                              <Text
                                style={[
                                  styles.serieExplicationTexte,
                                  { color: C.texte },
                                ]}
                              >
                                Ta moyenne d&apos;épargne actuelle est de{" "}
                                {Math.round(epargneMoyenneMensuelle)}€/mois,
                                calculée sur tes {pointsRecentsEpargne.length}{" "}
                                derniers mois.
                              </Text>
                            </View>
                            {ecartMensuelSimule !== 0 && (
                              <>
                                <View style={styles.serieExplicationLigne}>
                                  <View
                                    style={[
                                      styles.serieExplicationDot,
                                      {
                                        backgroundColor:
                                          ecartMensuelSimule > 0
                                            ? C.vert
                                            : C.peach,
                                      },
                                    ]}
                                  />
                                  <Text
                                    style={[
                                      styles.serieExplicationTexte,
                                      { color: C.texte },
                                    ]}
                                  >
                                    Ce changement représente{" "}
                                    {formaterMontant(Math.abs(ecartMensuelSimule))}€ de{" "}
                                    {ecartMensuelSimule > 0 ? "plus" : "moins"}{" "}
                                    par mois sur cette catégorie.
                                  </Text>
                                </View>
                                <View style={styles.serieExplicationLigne}>
                                  <View
                                    style={[
                                      styles.serieExplicationDot,
                                      {
                                        backgroundColor:
                                          impactTotal6MoisSimulation >= 0
                                            ? C.vert
                                            : C.peach,
                                      },
                                    ]}
                                  />
                                  <Text
                                    style={[
                                      styles.serieExplicationTexte,
                                      { color: C.texte },
                                    ]}
                                  >
                                    Sur {NB_MOIS_PROJECTION} mois, cela
                                    représente{" "}
                                    {impactTotal6MoisSimulation >= 0 ? "+" : ""}
                                    {formaterMontant(impactTotal6MoisSimulation)}€ d&apos;épargne
                                    projetée.
                                  </Text>
                                </View>
                              </>
                            )}
                          </View>

                          <GraphiqueLignes
                            donneesReelles={donneesReellesSimulation}
                            donneesPrevisionnelles={donneesPrevisionnellesSimulation}
                            labels={labelsSimulation}
                            couleurs={C}
                          />
                          <View style={styles.simulateurLegende}>
                            <View style={styles.simulateurLegendeItem}>
                              <View
                                style={[
                                  styles.simulateurLegendePastille,
                                  { backgroundColor: C.accent },
                                ]}
                              />
                              <Text
                                style={[
                                  styles.simulateurLegendeTexte,
                                  { color: C.texteMuted },
                                ]}
                              >
                                Trajectoire actuelle
                              </Text>
                            </View>
                            <View style={styles.simulateurLegendeItem}>
                              <View
                                style={[
                                  styles.simulateurLegendePastille,
                                  { backgroundColor: C.peach },
                                ]}
                              />
                              <Text
                                style={[
                                  styles.simulateurLegendeTexte,
                                  { color: C.texteMuted },
                                ]}
                              >
                                Trajectoire simulée
                              </Text>
                            </View>
                          </View>
                        </>
                      )}
                    </>
                  )}
                </View>
              )}

              <View style={{ height: 20 }} />
            </ScrollView>
            {isGuest && (
              <View style={styles.overlayGuestStats}>
                <Ionicons name="lock-closed-outline" size={28} color="#FFFFFF" />
                <Text style={styles.overlayGuestTexte}>
                  Crée un compte pour accéder aux statistiques complètes
                </Text>
                <BoutonPrincipal
                  style={[styles.overlayGuestBouton, { backgroundColor: C.purple }]}
                  onPress={() => {
                    setModalSeriesVisible(false);
                    router.push("/onboarding/inscription");
                  }}
                >
                  <Text style={styles.overlayGuestBoutonTexte}>
                    Créer un compte
                  </Text>
                </BoutonPrincipal>
              </View>
            )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <TutorielOverlay
        visible={
          !tutorielStatsVu &&
          ETAPES_STATS.every((e) => !e.id || posCiblesTutoriel[e.id])
        }
        etapes={ETAPES_STATS}
        positions={posCiblesTutoriel}
        onTerminer={() => marquerTutorielVu("stats")}
      />
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

// Explique, pour une série donnée, ce qui se joue précisément ce mois-ci —
// même esprit que "Ce qui influence ton score" : concret, basé sur les
// vrais chiffres du mois, jamais une phrase générique. Retourne `null`
// quand la donnée nécessaire n'existe pas encore (premier mois d'usage,
// pas de budget défini, etc.), plutôt que d'afficher une phrase trompeuse.
function texteExplicationSerie(
  serie: Serie,
  donnees: {
    epargneMois: number;
    epargneMoisPrec: number | null;
    depenseMoisActuel: number;
    budgetMoisActuel: number;
    seuilEpargneConstante: number | null;
  },
): string | null {
  const continueSerie = serie.enCours > 0;
  if (serie.type === "epargne-croissante") {
    if (donnees.epargneMoisPrec === null) return null;
    return continueSerie
      ? `Ce mois-ci : ton épargne (${formaterMontant(donnees.epargneMois)}€) dépasse celle du mois dernier (${formaterMontant(donnees.epargneMoisPrec)}€) — la série continue.`
      : `Ce mois-ci : ton épargne (${formaterMontant(donnees.epargneMois)}€) n'a pas dépassé celle du mois dernier (${formaterMontant(donnees.epargneMoisPrec)}€) — la série est repartie à zéro.`;
  }
  if (serie.type === "budget-respecte") {
    if (donnees.budgetMoisActuel <= 0) return null;
    return continueSerie
      ? `Ce mois-ci : tu as dépensé ${formaterMontant(donnees.depenseMoisActuel)}€ sur un budget de ${formaterMontant(donnees.budgetMoisActuel)}€ — la série continue.`
      : `Ce mois-ci : tu as dépassé ton budget (${formaterMontant(donnees.depenseMoisActuel)}€ pour ${formaterMontant(donnees.budgetMoisActuel)}€ prévus) — la série est repartie à zéro.`;
  }
  if (donnees.seuilEpargneConstante === null) return null;
  return continueSerie
    ? `Ce mois-ci : ton épargne (${formaterMontant(donnees.epargneMois)}€) atteint ton seuil de ${formaterMontant(donnees.seuilEpargneConstante)}€ — la série continue.`
    : `Ce mois-ci : ton épargne (${formaterMontant(donnees.epargneMois)}€) est sous ton seuil de ${formaterMontant(donnees.seuilEpargneConstante)}€ — la série est repartie à zéro.`;
}

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
  overlayGuestStats: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(20,20,30,0.82)",
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 14,
  },
  overlayGuestTexte: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 21,
  },
  overlayGuestBouton: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  overlayGuestBoutonTexte: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  container: { flex: 1, backgroundColor: "#FFFFFF", paddingHorizontal: 20 },
  header: { marginTop: 60, marginBottom: 16 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  btnMenu: {
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0.5,
  },
  btnMenuTexte: { fontSize: 13, fontWeight: "600" },
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
    // Hauteur fixe (pas un maxHeight) : les 3 onglets (Score/Séries/
    // Simulateur) ont des contenus de longueurs très différentes — une
    // hauteur qui s'adapte au contenu ferait sauter la fenêtre en changeant
    // d'onglet. Le ScrollView interne (flex: 1) gère le défilement pour les
    // contenus plus longs que cette hauteur, et laisse simplement de
    // l'espace pour les contenus plus courts.
    height: "80%",
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
  scoreExplicationsBloc: { marginTop: 16 },
  scoreExplicationsLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  scoreExplicationItem: { flexDirection: "row", gap: 10, paddingVertical: 6 },
  scoreExplicationDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 6,
    flexShrink: 0,
  },
  scoreExplicationTexte: { flex: 1, fontSize: 13, lineHeight: 19 },
  serieExplicationLigne: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  serieExplicationDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 5,
    flexShrink: 0,
  },
  serieExplicationTexte: { flex: 1, fontSize: 13, lineHeight: 18 },
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
  simulateurBudgetActuelTexte: { fontSize: 12, fontWeight: "500" },
  simulateurBudgetLigne: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 4,
  },
  simulateurBudgetTexte: { fontSize: 15, fontWeight: "700" },
  simulateurDeltaTexte: { fontSize: 13, fontWeight: "600" },
  simulateurSlider: { width: "100%", height: 40, marginBottom: 4 },
  simulateurExplicationsBloc: { marginVertical: 14 },
  simulateurLegende: {
    flexDirection: "row",
    gap: 16,
    marginTop: 10,
    justifyContent: "center",
  },
  simulateurLegendeItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  simulateurLegendePastille: { width: 10, height: 10, borderRadius: 5 },
  simulateurLegendeTexte: { fontSize: 12, fontWeight: "500" },
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
  kpiLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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
  epargneChartRow: { flexDirection: "row" },
  epargneAxeY: { width: 32, justifyContent: "space-between", marginRight: 6 },
  epargneAxeYTexte: { fontSize: 9, textAlign: "right" },
  barresEpargneValeursRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-around",
  },
  epargnePlotZone: { position: "relative" },
  epargneGridline: {
    position: "absolute",
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  barresEpargne: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-end",
    justifyContent: "space-around",
    height: "100%",
  },
  barreEpargneCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  barreEpargneVal: {
    flex: 1,
    fontSize: 9,
    fontWeight: "700",
    textAlign: "center",
  },
  barreEpargneRemplissage: { width: "60%", borderRadius: 6 },
  barreEpargneLabel: {
    flex: 1,
    fontSize: 10,
    color: "#999",
    textAlign: "center",
  },
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
  objectifStatNom: { fontSize: 14, fontWeight: "700", flexShrink: 1, marginRight: 8 },
  objectifStatPct: { fontSize: 14, fontWeight: "700", flexShrink: 0 },
  objectifStatEstimation: { fontSize: 11, fontWeight: "500", marginTop: 6 },
  objectifStatFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  objectifStatMontant: { fontSize: 12, fontWeight: "600" },
  objectifStatDelta: { fontSize: 11, fontWeight: "700" },
});

