import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { useIsFocused, useRouter } from "expo-router";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { Enveloppe, SnapshotMois, Transaction, useObjectifs } from "../store";
import { COULEURS, useTheme } from "../ThemeContext";
import { calculerSeries, Serie, TypeSerie } from "../../utils/series";
import {
  budgetDuMoisArchive,
  entreesBudgetDuMois,
  estCategorieActiveCeMois,
} from "../../utils/budget";
import {
  calculerScoreHistorique,
  calculerScoreSante,
  DecompositionScore,
  DonneesScore,
  genererExplicationsScore,
  MotCleScore,
  motPourScore,
  scoreBudget,
  ScoreSante,
} from "../../utils/score";
import {
  calculerDeltaTotal,
  calculerRythmeObjectif,
  calculerTauxEpargne,
  chargerNbAmeliorations,
} from "../../utils/conseils";
import { analyserFluxFinancier } from "../../utils/bilanVista";
import { situationsDejaAffichees } from "../../utils/situationsSession";
import { calculerTrophees, Trophee } from "../../utils/trophees";
import { supabase } from "../../supabaseClient";
import { PALETTE_COULEURS } from "../ColorPicker";
import { couleurLaPlusDistincte } from "../../utils/couleurs";
import { genererInsightsPeriode } from "../../utils/tendancesPeriode";
// Alias conservé tel quel malgré le nom : ce fichier utilisait auparavant
// une version abrégée localement pour les axes de graphiques (Jan/Fév/...),
// remplacée par les noms complets partout — y compris les axes — sur
// demande explicite. Le nom _COMPLETS reste pour éviter de renommer tous
// les usages existants (LABEL_MOIS_ACTUEL, "Variation d'un mois à
// l'autre", etc.), pas parce qu'il coexiste encore avec une version courte.
import { MOIS_LABELS as MOIS_LABELS_COMPLETS } from "../../utils/exportExcel";
import { formaterMontant, parseMontant, sanitizeMontantInput } from "../../utils/montant";
import { useGuest } from "../GuestContext";
import { bloquerSiInvite } from "../guestGate";
import { InfoBulle } from "../InfoBulle";
import {
  styleModaleTablette,
  useEstTablette,
} from "../useTablette";
import { Text } from "../Texte";
import { TextInput } from "../TexteInput";
import { dureeAnimation, useAccessibilite } from "../AccessibiliteContext";
import { useLargeurAnimee } from "../BarreProgression";
import { CibleTutoriel, useCiblesTutoriel } from "../CibleTutoriel";
import { InsightVerrouille, useDeblocagePub } from "../InsightVerrouille";
import { TonBilanVerrou } from "../TonBilanVerrou";
import { GraphiqueFlux, LienFlux, NoeudFlux } from "../GraphiqueFlux";
import { usePremium } from "../PremiumContext";
import { estComptePremium } from "../../utils/premium";
import { EtapeTutoriel, TutorielOverlay } from "../TutorielOverlay";
import { useTutoriel } from "../TutorielContext";
import { TiroirStats } from "../TiroirStats";
import { useEspacePartage } from "../EspacePartageContext";
import { SwitcherEspacePartage } from "../SwitcherEspacePartage";
import {
  chargerRemboursementsMois,
  EnveloppePartenaire,
  marquerRembourse,
  RemboursementEspace,
  SnapshotMoisPartenaire,
  TransactionPartenaire,
} from "../../utils/espacePartage";

const MOIS_ACTUEL = new Date().getMonth();
const ANNEE_ACTUELLE = new Date().getFullYear();
// Suffixe de titre pour les sections calculées sur le mois en cours (ex:
// "Vue d'ensemble — Août 2026"), par opposition à celles calculées sur la
// période sélectionnée (nbMois derniers mois, voir plus bas dans le
// composant).
const LABEL_MOIS_ACTUEL = `${MOIS_LABELS_COMPLETS[MOIS_ACTUEL]} ${ANNEE_ACTUELLE}`;

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
// Hauteur totale par défaut du <Svg> de GraphiqueLignes (CHART_H 160 + 24 +
// PADDING_HAUT 20), utilisée par "Dépensé vs dépenses prévues" (page pleine,
// aucun override). Le Simulateur (ci-dessous) passe une hauteur réduite via
// la prop `hauteurGraphique` de GraphiqueLignes, en dur, jamais recalculée
// depuis les données — la structure ne doit jamais bouger pendant le
// glissement du curseur, quelle que soit l'amplitude des courbes.
//
// Variante réduite pour le Simulateur (modale "Ton bilan", hauteur fixe à
// 80% de l'écran) : sur un petit écran (iPhone SE), la hauteur standard
// (204) laissait le curseur, la légende et les labels de mois déborder de
// la zone scrollable visible. 150 (littéral, comme demandé — CHART_H
// réduit à 106 + mêmes marges) redonne de la marge sans affecter le
// graphique "Dépensé vs dépenses prévues".
const HAUTEUR_GRAPHIQUE_SIMULATEUR = 150;
const CHART_H_SIMULATEUR = HAUTEUR_GRAPHIQUE_SIMULATEUR - 24 - PADDING_HAUT;

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

// Affiche la valeur de tous les points quand la période est courte, mais
// s'éclaircit par paliers fixes sur les longues périodes pour ne jamais
// produire un amas illisible : 1-6 mois → toutes ; 7-12 → 1/2 ; 13-24 → 1/3 ;
// 25+ → pas calculé dynamiquement pour ne jamais dépasser ~7 étiquettes.
// Le premier et le dernier point sont toujours affichés (bornes temporelles
// toujours visibles), quel que soit le pas.
function indicesLabelsAffiches(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0];

  let pas: number;
  if (n <= 6) pas = 1;
  else if (n <= 12) pas = 2;
  else if (n <= 24) pas = 3;
  else pas = Math.ceil(n / 7);

  const indices = new Set<number>();
  for (let i = 0; i < n; i += pas) indices.add(i);
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

// RÈGLE À NE JAMAIS CASSER : SEULE fonction qui construit une liste de
// {mois, annee} pour "les N derniers mois" — utilisée à la fois par le
// sélecteur de période principal (moisAffiches) et par celui du graphique
// de flux (Partie 3), qui a son propre nombre de mois indépendant. Ne
// jamais dupliquer cette formule ailleurs dans le fichier.
function construireMoisPeriode(
  nbMois: number,
  moisRef: number,
  anneeRef: number,
): { mois: number; annee: number }[] {
  return Array.from({ length: nbMois }, (_, i) => {
    const d = new Date(anneeRef, moisRef - nbMois + 1 + i, 1);
    return { mois: d.getMonth(), annee: d.getFullYear() };
  });
}

const PERIODE_MAX_MOIS = 120; // plafond fixe (10 ans), indépendant des données de l'utilisateur
// RÈGLE À NE JAMAIS CASSER — REFONTE MONÉTISATION DU 2026-09-12, SEUIL
// RELEVÉ LE 2026-09-13 (demande explicite) : 1 et 2 mois toujours
// accessibles sans pub — au-delà (3 mois et plus), le sélecteur de période
// est verrouillé derrière une pub (session-scoped par vue, cf.
// statsPeriodeDebloquePerso/statsPeriodeDebloquePartage), plus derrière
// Premium. Un compte invité (isGuest) reste exempté comme partout
// ailleurs. nbMoisSelectionne reste initialisé à 1 (cf. RÈGLE à sa
// définition) — le relèvement du seuil n'a pas besoin de changer le
// défaut affiché avant tout chargement AsyncStorage/calcul par ancienneté.
const LIMITE_MOIS_GRATUIT_STATS = 2;
// RÈGLE À NE JAMAIS CASSER — OPTIONS DU SÉLECTEUR DE PÉRIODE (redesign du
// 2026-09-13, remplace le Picker natif par une rangée de chips avec icône
// cadenas par option — un Picker natif ne peut pas afficher d'icône par
// option). Volontairement réduit à ces 5 valeurs (pas les 1-12 + paliers
// annuels de l'ancien Picker) : assez pour couvrir les 3 paliers du
// modèle (1/2 gratuit, 3+ pub) sans surcharger une rangée de boutons.
const OPTIONS_PERIODE_STATS = [1, 2, 3, 6, 12];

// RÈGLE : clé AsyncStorage namespacée par userId — même convention que
// PREFIXE_CLE_ETATS_INSIGHTS (utils/conseils.ts) : jamais un slot global
// partagé entre comptes sur le même appareil.
const PREFIXE_CLE_PERIODE_STATS = "vista_periode_stats_";

// RÈGLE À NE JAMAIS CASSER — PÉRIODE PAR DÉFAUT SELON L'ANCIENNETÉ DU
// COMPTE (demande du 2026-09-13) : ne donne JAMAIS un accès gratuit
// supplémentaire — la valeur retournée ici n'est qu'une PRÉ-SÉLECTION dans
// le Picker, toujours reclampée par LIMITE_MOIS_GRATUIT_STATS/le même
// verrou pub que n'importe quelle sélection manuelle (cf. `nbMois` plus
// bas). Ancienneté calculée en mois calendaires pleins (année*12+mois) —
// choix propre à cette règle (aAssezDeDonnees, utils/conseils.ts, calcule
// une ancienneté du même ordre mais en jours, pas en mois calendaires ;
// aucun utilitaire commun à réutiliser ici, juste une règle voisine).
function periodeParDefautSelonAnciennete(
  dateCreationCompte: string | null,
): number {
  if (!dateCreationCompte) return 1;
  const creation = new Date(dateCreationCompte);
  if (Number.isNaN(creation.getTime())) return 1;
  const maintenant = new Date();
  const moisEcoules =
    (maintenant.getFullYear() - creation.getFullYear()) * 12 +
    (maintenant.getMonth() - creation.getMonth());
  if (moisEcoules >= 4) return 6;
  if (moisEcoules >= 2) return 3;
  return 1;
}

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

  for (let m = 1; m <= 12; m++) ajouter(m);
  for (let a = 2; a * 12 <= PERIODE_MAX_MOIS; a++) ajouter(a * 12);

  return options;
}

function GraphiqueLignes({
  donneesReelles,
  donneesPrevisionnelles,
  labels,
  couleurs: C,
  hauteurGraphique,
}: {
  donneesReelles: number[];
  donneesPrevisionnelles: number[];
  labels: string[];
  couleurs: typeof COULEURS.clair;
  // Override optionnel de CHART_H, en dur côté appelant (jamais dérivé des
  // données) — utilisé par le Simulateur pour tenir dans la modale "Ton
  // bilan" (hauteur fixe à 80% de l'écran) sans affecter la taille du
  // graphique "Dépensé vs dépenses prévues", qui garde CHART_H par défaut.
  hauteurGraphique?: number;
}) {
  const chartH = hauteurGraphique ?? CHART_H;
  const hauteurSvg = chartH + 24 + PADDING_HAUT;
  const toutes = [...donneesReelles, ...donneesPrevisionnelles];
  const maxBrut = Math.max(...toutes, 1);
  const ticks = calculerTicksY(maxBrut);
  const max = ticks[ticks.length - 1];
  const n = labels.length;
  const largeurUtile = CHART_W - PADDING_LEFT - PADDING_X;
  const espacement = n > 1 ? largeurUtile / (n - 1) : largeurUtile;

  const pointsReels = donneesReelles.map((v, i) => ({
    x: PADDING_LEFT + i * espacement,
    y: PADDING_HAUT + chartH - (v / max) * (chartH - 10) + 5,
  }));
  const pointsPrevus = donneesPrevisionnelles.map((v, i) => ({
    x: PADDING_LEFT + i * espacement,
    y: PADDING_HAUT + chartH - (v / max) * (chartH - 10) + 5,
  }));

  const pathReels = pointsReels
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
  const pathPrevus = pointsPrevus
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const dernier = n - 1;
  const indicesAffiches = indicesLabelsAffiches(n);
  const labelsParPoint = indicesAffiches.map((i) => ({
    i,
    estPremier: i === 0,
    estDernier: i === dernier,
    // Une valeur nulle n'apporte rien et ajoute du bruit visuel — le point
    // reste affiché sur la courbe, juste sans étiquette au-dessus.
    items: positionsLabelsSansChevauchement(
      [
        { y: pointsReels[i].y, x: pointsReels[i].x, valeur: donneesReelles[i], couleur: C.accent },
        { y: pointsPrevus[i].y, x: pointsPrevus[i].x, valeur: donneesPrevisionnelles[i], couleur: C.peach },
      ].filter((it) => it.valeur !== 0),
    ),
  }));

  return (
    <Svg width={CHART_W} height={hauteurSvg} style={{ overflow: "hidden" }}>
      {ticks.map((t) => {
        const y = PADDING_HAUT + chartH - (t / max) * (chartH - 10) + 5;
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
          y={PADDING_HAUT + chartH + 18}
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
  const indicesAffiches = indicesLabelsAffiches(n);
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
      // Une valeur nulle n'apporte rien et ajoute du bruit visuel — le
      // point reste affiché sur la courbe, juste sans étiquette au-dessus.
      items: positionsLabelsSansChevauchement(
        pointsParSerie
          .map((s) => ({
            y: s.points[i].y,
            x: s.points[i].x,
            valeur: s.donnees[i],
            couleur: s.couleur,
          }))
          .filter((it) => it.valeur !== 0),
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

type SegmentBarreEmpilee = {
  cle: string;
  label: string;
  couleur: string;
  donnees: number[];
};

// Couleur de texte lisible sur un fond `hex` (#RRGGBB) donné — formule YIQ
// standard (poids perceptuels par canal), pas de dépendance au thème
// clair/sombre de l'app : c'est la couleur de la CATÉGORIE qui détermine le
// contraste, jamais le thème.
function couleurTexteSurFond(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#2D3A4A" : "#FFFFFF";
}

// Hauteur minimale d'un segment pour y afficher son label en son centre —
// en dessous, le texte déborderait du segment ou serait illisible.
const HAUTEUR_MIN_LABEL_SEGMENT = 30;

// Barres empilées par mois, un segment par catégorie. En mode "pct", la
// barre reste toujours à pleine hauteur (100% stacked bar chart) : chaque
// segment est dimensionné en proportion du total du mois. Retirer une
// catégorie du filtre redistribue donc automatiquement les segments
// restants sans code dédié — pure conséquence de diviser par le total des
// séries REÇUES (déjà filtrées par l'appelant), jamais par un total fixe.
// En mode "euro", la hauteur de la barre est proportionnelle au montant
// total du mois, comme les autres graphiques de la page.
function GraphiqueBarresEmpilees({
  series,
  labels,
  couleurs: C,
  mode,
  onTapLegende,
}: {
  series: SegmentBarreEmpilee[];
  labels: string[];
  couleurs: typeof COULEURS.clair;
  mode: "pct" | "euro";
  // Tap sur une entrée de légende (pastille + nom) — optionnel, l'appelant
  // garde le contrôle de ce qui se passe (ex: ouvrir un détail par mois).
  onTapLegende?: (cle: string) => void;
}) {
  const n = labels.length;
  const largeurUtile = CHART_W - PADDING_LEFT - PADDING_X;
  const espacement = n > 0 ? largeurUtile / n : largeurUtile;
  const largeurBarre = Math.min(28, espacement * 0.55);
  const hauteurUtile = CHART_H - 10;

  const totauxParMois = labels.map((_, i) =>
    series.reduce((acc, s) => acc + s.donnees[i], 0),
  );
  const maxTotal = Math.max(...totauxParMois, 1);
  const ticks =
    mode === "pct" ? [0, 25, 50, 75, 100] : calculerTicksY(maxTotal);
  const maxAxe = mode === "pct" ? 100 : ticks[ticks.length - 1];

  return (
    <View>
      <Svg width={CHART_W} height={CHART_H + 24 + PADDING_HAUT}>
        {ticks.map((t) => {
          const y = PADDING_HAUT + CHART_H - (t / maxAxe) * hauteurUtile + 5;
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
                {mode === "pct" ? `${t}%` : `${t}€`}
              </SvgText>
            </Fragment>
          );
        })}
        {labels.map((_, i) => {
          const total = totauxParMois[i];
          if (total <= 0) return null;
          const xBarre =
            PADDING_LEFT + espacement * i + (espacement - largeurBarre) / 2;
          let yCumul = PADDING_HAUT + CHART_H + 5;
          return (
            <Fragment key={i}>
              {series.map((s) => {
                const valeur = s.donnees[i];
                if (valeur <= 0) return null;
                const hauteurSegment =
                  mode === "pct"
                    ? (valeur / total) * hauteurUtile
                    : (valeur / maxAxe) * hauteurUtile;
                yCumul -= hauteurSegment;
                const texteSegment =
                  mode === "pct"
                    ? `${Math.round((valeur / total) * 100)}%`
                    : `${Math.round(valeur)}€`;
                return (
                  <Fragment key={s.cle}>
                    <Rect
                      x={xBarre}
                      y={yCumul}
                      width={largeurBarre}
                      height={hauteurSegment}
                      fill={s.couleur}
                      rx={2}
                    />
                    {hauteurSegment >= HAUTEUR_MIN_LABEL_SEGMENT && (
                      <SvgText
                        x={xBarre + largeurBarre / 2}
                        y={yCumul + hauteurSegment / 2 + 3}
                        fontSize={9}
                        fontWeight="700"
                        fill={couleurTexteSurFond(s.couleur)}
                        textAnchor="middle"
                      >
                        {texteSegment}
                      </SvgText>
                    )}
                  </Fragment>
                );
              })}
            </Fragment>
          );
        })}
        {labels.map((lbl, i) => (
          <SvgText
            key={`l${i}`}
            x={PADDING_LEFT + espacement * i + espacement / 2}
            y={PADDING_HAUT + CHART_H + 18}
            fontSize={10}
            fill={C.texteMuted}
            textAnchor="middle"
          >
            {lbl}
          </SvgText>
        ))}
      </Svg>
      <View style={styles.legendeRow}>
        {series.map((s) => {
          const contenu = (
            <>
              <View
                style={[styles.legendeDot, { backgroundColor: s.couleur }]}
              />
              <Text style={[styles.legendeTexte, { color: C.texteMuted }]}>
                {s.label}
              </Text>
            </>
          );
          return onTapLegende ? (
            <TouchableOpacity
              key={s.cle}
              style={styles.legendeItem}
              activeOpacity={0.6}
              onPress={() => onTapLegende(s.cle)}
            >
              {contenu}
            </TouchableOpacity>
          ) : (
            <View key={s.cle} style={styles.legendeItem}>
              {contenu}
            </View>
          );
        })}
      </View>
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

// RÈGLE : modelé sur DonutChart (app/(tabs)/index.tsx, non exporté — même
// convention que GraphiqueBarresEmpilees/JaugeRepartition ci-dessus, un
// composant de graphique local par écran, jamais partagé) : même technique
// SVG (cercle à segments via strokeDasharray/strokeDashoffset), mais 3
// segments FIXES Moi/Partenaire/Commun plutôt qu'un nombre variable de
// catégories, et une légende pourcentage/montant en dessous plutôt qu'un
// seul mot au centre — cf. demande explicite "Montant total au centre,
// pourcentage par personne". Légende réutilise les styles jaugeLegende*
// (JaugeRepartition ci-dessus) plutôt que d'en redéfinir des équivalents.
function GraphiqueDonutCouple({
  moi,
  partenaire,
  commun,
  labelPartenaire,
  couleurMoi,
  couleurPartenaire,
  couleurs: C,
}: {
  moi: number;
  partenaire: number;
  commun: number;
  labelPartenaire: string;
  couleurMoi: string;
  couleurPartenaire: string;
  couleurs: typeof COULEURS.clair;
}) {
  const total = moi + partenaire + commun;
  const taille = 140;
  const rayon = 55;
  const epaisseur = 20;
  const centre = taille / 2;
  const circonference = 2 * Math.PI * rayon;

  const segmentsBruts = [
    { cle: "moi", label: "Moi", couleur: couleurMoi, valeur: moi },
    {
      cle: "partenaire",
      label: labelPartenaire,
      couleur: couleurPartenaire,
      valeur: partenaire,
    },
    { cle: "commun", label: "Commun", couleur: "#1D9E75", valeur: commun },
  ];

  if (total <= 0) {
    return (
      <View style={{ alignItems: "center" }}>
        <View
          style={{
            width: taille,
            height: taille,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Svg width={taille} height={taille}>
            <Circle
              cx={centre}
              cy={centre}
              r={rayon}
              stroke={C.separateur}
              strokeWidth={epaisseur}
              fill="none"
            />
          </Svg>
          <Text
            style={{ position: "absolute", fontSize: 13, color: C.texteMuted }}
          >
            Aucune dépense
          </Text>
        </View>
      </View>
    );
  }

  const donnees = segmentsBruts.filter((d) => d.valeur > 0);
  const cumuls = donnees.reduce<number[]>((acc, d, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + donnees[i - 1].valeur / total);
    return acc;
  }, []);
  const segments = donnees.map((d, i) => {
    const pct = d.valeur / total;
    const dashArray = pct * circonference;
    const dashOffset = circonference * (1 - cumuls[i]);
    return { ...d, dashArray, dashOffset, key: i };
  });

  return (
    <View style={{ alignItems: "center" }}>
      <View
        style={{
          width: taille,
          height: taille,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Svg width={taille} height={taille}>
          {segments.map((seg) => (
            <Circle
              key={seg.key}
              cx={centre}
              cy={centre}
              r={rayon}
              stroke={seg.couleur}
              strokeWidth={epaisseur}
              strokeDasharray={`${seg.dashArray} ${circonference - seg.dashArray}`}
              strokeDashoffset={seg.dashOffset}
              fill="none"
              strokeLinecap="butt"
              transform={`rotate(-90 ${centre} ${centre})`}
            />
          ))}
        </Svg>
        <View style={{ position: "absolute", alignItems: "center" }}>
          <Text style={{ fontSize: 19, fontWeight: "700", color: C.texte }}>
            {formaterMontant(total)} €
          </Text>
          <Text style={{ fontSize: 11, color: C.texteMuted }}>
            dépenses communes
          </Text>
        </View>
      </View>
      {/* RÈGLE : styles dédiés (coupleLegende*), JAMAIS jaugeLegende*
          (JaugeRepartition ci-dessus, réutilisé ailleurs à l'identique) —
          demande explicite du 2026-09-06 : légende illisible (texte écrasé
          par les valeurs), corrigée ICI SEULEMENT pour ne pas modifier
          l'apparence de JaugeRepartition partout où elle est déjà utilisée.
          Nom de segment et montant/pourcentage sur deux lignes distinctes
          (jamais sur une même ligne resserrée), police plus grande,
          espacement généreux entre les 3 lignes. */}
      <View style={[styles.coupleLegende, { marginTop: 14 }]}>
        {segmentsBruts
          .filter((s) => s.valeur > 0)
          .map((s) => (
            <View key={s.cle} style={styles.coupleLegendeItem}>
              <View style={styles.coupleLegendeHautRow}>
                <View
                  style={[styles.coupleDot, { backgroundColor: s.couleur }]}
                />
                <Text
                  style={[styles.coupleNom, { color: C.texte }]}
                  numberOfLines={1}
                >
                  {s.label}
                </Text>
              </View>
              <Text style={[styles.couplePct, { color: C.texteMuted }]}>
                {formaterMontant(s.valeur)} € ·{" "}
                {Math.round((s.valeur / total) * 100)}%
              </Text>
            </View>
          ))}
      </View>
    </View>
  );
}

// RÈGLE À NE JAMAIS CASSER — GRAPHIQUE 3 "RÉPARTITION PAR PERSONNE", REFONTE
// DU 2026-09-06 (longueur proportionnelle au montant, cf. demande explicite
// du même jour) : une ligne PAR CATÉGORIE, triée par montant total
// décroissant (déjà l'ordre de `segments`, cf. repartitionParPersonne).
// Chaque ligne lit moiReel/partenaireReel (JAMAIS moi/partenaire, mis à 0
// pour une ligne fusionnée par repartitionParPersonne — cf. RÈGLE à son site
// de définition) pour afficher le VRAI split, y compris sur une catégorie
// "Commun". commun > 0 signale une catégorie fusionnée (même nom des deux
// côtés ce mois-ci) : si les deux personnes ont réellement contribué, split
// coloré + pourcentages ; si un seul côté a dépensé ce mois-ci malgré la
// fusion, réduit à "Commun 100%" plutôt qu'un split 100/0 peu informatif.
// Une catégorie non fusionnée (commun === 0) est entièrement à une seule
// personne, jamais un split.
//
// RÈGLE : LONGUEUR DE BARRE = total / PLUS GROS total DU MOIS, JAMAIS UNE
// LARGEUR FIXE : la catégorie la plus chère occupe 100% de la zone
// disponible (repartitionCategorieBarreZone, largeur du "rail" de fond),
// toutes les autres proportionnellement — recalculé à chaque rendu à partir
// de `segments` (déjà trié), jamais mémoïsé séparément. Largeur plancher de
// 3% pour qu'une catégorie très petite reste visible (un sliver) plutôt que
// de disparaître complètement.
function GraphiqueRepartitionCategoriePersonne({
  segments,
  labelPartenaire,
  couleurMoi,
  couleurPartenaire,
  couleurs: C,
}: {
  segments: {
    nom: string;
    moiReel: number;
    partenaireReel: number;
    commun: number;
    total: number;
  }[];
  labelPartenaire: string;
  couleurMoi: string;
  couleurPartenaire: string;
  couleurs: typeof COULEURS.clair;
}) {
  const totalMax = Math.max(...segments.map((s) => s.total), 1);
  return (
    <View style={styles.repartitionCategorieListe}>
      {segments.map((s) => {
        const fusionnee = s.commun > 0;
        const splitReel = s.moiReel > 0 && s.partenaireReel > 0;
        const largeurPct = Math.max((s.total / totalMax) * 100, 3);
        return (
          <View key={s.nom} style={styles.repartitionCategorieLigne}>
            <View style={styles.repartitionCategorieHautRow}>
              <Text
                style={[styles.repartitionCategorieNom, { color: C.texte }]}
                numberOfLines={1}
              >
                {s.nom}
              </Text>
              <View
                style={[
                  styles.repartitionCategorieBarreZone,
                  { backgroundColor: C.separateur },
                ]}
              >
                <View
                  style={[
                    styles.repartitionCategorieBarreFond,
                    { width: `${largeurPct}%` },
                  ]}
                >
                  {splitReel ? (
                    <>
                      <View
                        style={{
                          flex: s.partenaireReel,
                          backgroundColor: couleurPartenaire,
                        }}
                      />
                      <View
                        style={{ flex: s.moiReel, backgroundColor: couleurMoi }}
                      />
                    </>
                  ) : (
                    <View
                      style={{
                        flex: 1,
                        backgroundColor: fusionnee
                          ? "#1D9E75"
                          : s.moiReel > 0
                            ? couleurMoi
                            : couleurPartenaire,
                      }}
                    />
                  )}
                </View>
              </View>
              <Text
                style={[styles.repartitionCategorieMontant, { color: C.texte }]}
              >
                {formaterMontant(s.total)} €
              </Text>
            </View>
            <Text
              style={[
                styles.repartitionCategoriePct,
                { color: C.texteMuted },
              ]}
            >
              {splitReel
                ? `${labelPartenaire} ${Math.round((s.partenaireReel / s.total) * 100)}% · Moi ${Math.round((s.moiReel / s.total) * 100)}%`
                : fusionnee
                  ? "Commun 100%"
                  : s.moiReel > 0
                    ? "Moi 100%"
                    : `${labelPartenaire} 100%`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default function Analytics() {
  const router = useRouter();
  const estTablette = useEstTablette();
  const estFocusDebug = useIsFocused();
  const objStore = useObjectifs();
  const { estPremium, simulerNonPremium } = usePremium();
  const { isGuest } = useGuest();
  const {
    estDansUnEspace,
    vueActive,
    membrePartenaire,
    donneesPartenaire,
    espaceId,
    historiqueMoisPartenaire,
    epargneMoisPartenaireActuelle,
    modeBalance,
    ratioPersonnalise,
    changerModeBalance,
    couleurMoi,
    couleurPartenaire,
    rafraichirEspace,
    rafraichirDonneesPartenaire,
  } = useEspacePartage();

  // RÈGLE : cf. RÈGLE identique dans app/(tabs)/index.tsx — mêmes chargeurs
  // que ceux déjà appelés au montage/périodiquement, jamais un second
  // pipeline de fetch.
  const [rafraichissementEnCours, setRafraichissementEnCours] = useState(false);
  const gererRafraichissement = async () => {
    setRafraichissementEnCours(true);
    try {
      await Promise.all([
        objStore.chargerEnveloppes(),
        objStore.chargerObjectifs(),
        objStore.chargerTransactions(),
        objStore.chargerEvenements(),
        rafraichirEspace(),
        rafraichirDonneesPartenaire(),
      ]);
    } finally {
      setRafraichissementEnCours(false);
    }
  };
  // RÈGLE À NE JAMAIS CASSER — SPÉCIFIQUE AU MOIS AFFICHÉ ICI, JAMAIS DANS
  // EspacePartageContext : contrairement à donneesPartenaire/
  // evenementsPartenaire/historiqueMoisPartenaire (partagés par plusieurs
  // écrans), aucun autre écran n'a besoin de savoir si le mois courant est
  // déjà remboursé — chargé localement, comme d'autres écrans font déjà
  // leurs propres appels ponctuels.
  const [remboursements, setRemboursements] = useState<RemboursementEspace[]>(
    [],
  );
  useEffect(() => {
    if (!estDansUnEspace || vueActive !== "partage" || !espaceId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- réinitialisation synchrone volontaire en quittant la vue Partagé/l'espace, même précédent que EspacePartageContext.tsx : jamais laisser un ancien montant de remboursement visible après ce changement.
      setRemboursements([]);
      return;
    }
    let annule = false;
    chargerRemboursementsMois(espaceId, MOIS_ACTUEL, ANNEE_ACTUELLE).then(
      (liste) => {
        if (!annule) setRemboursements(liste);
      },
    );
    return () => {
      annule = true;
    };
  }, [estDansUnEspace, vueActive, espaceId]);
  // RÈGLE : épargneMoisPartenaireActuelle déplacée dans EspacePartageContext
  // le 2026-09-12 (cf. RÈGLE détaillée à sa définition) — Aperçu en a
  // maintenant besoin aussi, chargée dans le même Promise.all que
  // donneesPartenaire plutôt qu'un second cycle local ici.
  // RÈGLE À NE JAMAIS CASSER : point d'entrée unique pour tout Stats — voir
  // estComptePremium (utils/premium.ts) pour ce qu'il combine.
  const premium = estComptePremium(objStore.isAdmin, estPremium, simulerNonPremium, isGuest);
  const { theme, couleurs: C } = useTheme();
  const { reduireAnimations } = useAccessibilite();
  const { stats: tutorielStatsVu, marquerVu: marquerTutorielVu } =
    useTutoriel();
  const {
    positions: posCiblesTutoriel,
    mesurer: mesurerCibleTutoriel,
    cleFocus: cleFocusTutoriel,
  } = useCiblesTutoriel();
  const scrollRef = useRef<ScrollView>(null);
  // Tiroirs ouverts de force par le tutoriel (voir la prop forcerOuvert de
  // TiroirStats) — une fois ouvert, un tiroir le reste même après que
  // l'étape correspondante n'est plus active.
  const [tiroirsForcesOuverts, setTiroirsForcesOuverts] = useState<
    Set<string>
  >(new Set());
  // RÈGLE À NE JAMAIS CASSER : tiroirsOuvertsPourTutorielRef est OBLIGATOIRE
  // ici, pas juste une optimisation. ETAPES_STATS est un tableau recréé à
  // CHAQUE rendu d'Analytics (comme ETAPES_BUDGET dans budget.tsx) ; le
  // useEffect de TutorielOverlay dépend de `etapes`, donc il se
  // redéclenche à chaque rendu tant que l'étape "periode" est active, et
  // rappelle onAfficher à chaque fois. Sans ce ref, setTiroirsForcesOuverts
  // recevait un new Set(...) à CHAQUE appel (même avec un contenu
  // identique) — une nouvelle référence suffit à déclencher un re-render,
  // qui recrée ETAPES_STATS, qui redéclenche l'effet, qui rappelle
  // onAfficher : boucle infinie ("Maximum update depth exceeded"),
  // observée en pratique. Avec le ref, setTiroirsForcesOuverts n'est
  // appelé qu'une seule fois — la boucle ne peut plus s'amorcer.
  const tiroirsOuvertsPourTutorielRef = useRef(false);
  const ouvrirTousLesTiroirsTutoriel = () => {
    if (tiroirsOuvertsPourTutorielRef.current) return;
    tiroirsOuvertsPourTutorielRef.current = true;
    // Noms sans préfixe "tiroir-" : ce sont les clés lues par
    // tiroirsForcesOuverts.has(...) dans les 5 props forcerOuvert plus bas
    // (ex: forcerOuvert={tiroirsForcesOuverts.has("vue-ensemble")}) — à ne
    // pas confondre avec les ids "tiroir-vue-ensemble" etc. des étapes
    // ETAPES_STATS, qui identifient les CibleTutoriel, pas ces clés.
    setTiroirsForcesOuverts(
      new Set([
        "vue-ensemble",
        "evolution",
        "repartition",
        "par-categorie",
        "ce-mois",
      ]),
    );
  };
  // Offset de scroll (contentOffset.y) correspondant à la DERNIÈRE position
  // vers laquelle allerVersCibleTutoriel a scrollé — transmis à
  // TutorielOverlay (prop scrollOffset) pour qu'il recale le trou/la bulle
  // sur la position réellement affichée à l'écran, puisque rect.y
  // (measureInWindow) n'est mesuré qu'une fois, avant tout scroll, jamais
  // remis à jour ensuite (voir la règle sur allerVersCibleTutoriel
  // ci-dessous). État plutôt que ref : sans re-render au moment du scroll,
  // TutorielOverlay recevrait la valeur de scrollOffset d'un rendu
  // antérieur (les refs ne déclenchent pas de re-render), donc dessinerait
  // le trou avec un décalage périmé.
  const [scrollOffsetStats, setScrollOffsetStats] = useState(0);
  // RÈGLE À NE JAMAIS CASSER : scroll instantané vers la cible de l'étape
  // courante, appelé depuis onAfficher — SANS re-mesure après coup (c'est
  // cette combinaison scroll → re-mesure → nouveau scroll qui causait la
  // boucle infinie précédente). rect.y (measureInWindow, donc relatif à
  // l'écran) reste fiable comme position ABSOLUE de contenu ici : tous les
  // tiroirs sont ouverts d'un coup au tout début
  // (ouvrirTousLesTiroirsTutoriel), et chaque CibleTutoriel se remesure
  // alors naturellement via son propre onLayout — déclenché par le
  // changement de mise en page réel (LayoutAnimation), pas par un
  // cleFocus qu'on redéclencherait nous-mêmes — donc rect.y de CHAQUE
  // cible reflète déjà la mise en page finale (tiroirs ouverts) au moment
  // où ce scroll s'exécute, avant tout scroll ultérieur. Comme aucun
  // scroll ne redéclenche jamais de re-mesure, ces valeurs restent
  // valables du début à la fin du tutoriel pour calculer VERS OÙ scroller
  // — mais rect.y ne représente alors PLUS la position réellement affichée
  // à l'écran une fois qu'on a scrollé (measureInWindow avait mesuré la
  // position AVANT ce scroll) : c'est tout le rôle de scrollOffsetStats,
  // transmis à TutorielOverlay, de corriger cet écart pour le trou/la
  // bulle.
  const allerVersCibleTutoriel = (id: string) => {
    const rect = posCiblesTutoriel[id];
    if (!rect || !scrollRef.current) return;
    const y = Math.max(0, rect.y - 150);
    // RÈGLE À NE JAMAIS CASSER : animated: false, jamais true. Un scroll
    // animé donnait l'impression que l'app rame (glissement visible sur
    // une distance parfois longue) ; le tutoriel doit "sauter" directement
    // à la cible.
    scrollRef.current.scrollTo({ y, animated: false });
    setScrollOffsetStats(y);
  };
  // RÈGLE : défaut passé de 3 à 1 le 2026-09-12 (refonte monétisation,
  // demande explicite "Stats affiche par défaut uniquement le mois en
  // cours") — cf. RÈGLE détaillée sur LIMITE_MOIS_GRATUIT_STATS plus haut.
  // Valeur initiale 1 volontairement conservée ici (avant tout chargement
  // AsyncStorage, cf. l'effet juste en dessous) — jamais un flash visible
  // d'une autre période le temps du chargement.
  const [nbMoisSelectionne, setNbMoisSelectionne] = useState(1);
  // RÈGLE À NE JAMAIS CASSER — DÉFAUT SELON L'ANCIENNETÉ DU COMPTE (demande
  // du 2026-09-13) : au montage, restaure le choix déjà fait par
  // l'utilisateur (AsyncStorage, cf. PREFIXE_CLE_PERIODE_STATS plus haut)
  // s'il existe — sinon calcule un défaut qui grandit avec l'ancienneté du
  // compte (periodeParDefautSelonAnciennete). Ne débloque RIEN par
  // lui-même : `nbMois` (clamp plus bas) reste gardé par la même pub que
  // toute sélection manuelle au-delà de LIMITE_MOIS_GRATUIT_STATS.
  useEffect(() => {
    if (!objStore.userId) return;
    let annule = false;
    (async () => {
      try {
        const sauvegarde = await AsyncStorage.getItem(
          `${PREFIXE_CLE_PERIODE_STATS}${objStore.userId}`,
        );
        if (annule) return;
        // RÈGLE : garde NaN — une valeur AsyncStorage corrompue/illisible ne
        // doit jamais se propager jusqu'à construireMoisPeriode/
        // formaterPeriode (même rigueur que periodeParDefautSelonAnciennete
        // ci-dessus sur sa propre entrée).
        const valeurSauvegardee = sauvegarde ? Number(sauvegarde) : NaN;
        if (sauvegarde && !Number.isNaN(valeurSauvegardee)) {
          setNbMoisSelectionne(valeurSauvegardee);
        } else {
          setNbMoisSelectionne(
            periodeParDefautSelonAnciennete(objStore.dateCreationCompte),
          );
        }
      } catch {
        // best-effort — reste sur la valeur initiale (1 mois) en cas d'échec
      }
    })();
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objStore.userId]);
  // RÈGLE À NE JAMAIS CASSER — DÉVERROUILLAGE INDÉPENDANT PAR VUE (demande
  // du 2026-09-13) : vue perso et vue partagée ont chacune leur PROPRE
  // état de déverrouillage — regarder une pub en vue perso ne débloque pas
  // les périodes verrouillées en vue partagée, et inversement. Session-
  // scoped (comme tonBilanDebloque plus bas) — revient à false à la
  // prochaine ouverture de l'app. `statsPeriodeDebloque`/
  // `declencherPubPeriodeStats` ci-dessous résolvent vers la bonne paire
  // selon `vueActive` au moment du rendu — jamais un site d'appel plus bas
  // qui choisirait lui-même perso vs partagé, un seul point de résolution
  // ici.
  const [statsPeriodeDebloquePerso, setStatsPeriodeDebloquePerso] =
    useState(false);
  const [statsPeriodeDebloquePartage, setStatsPeriodeDebloquePartage] =
    useState(false);
  // RÈGLE : useDeblocagePub (app/InsightVerrouille.tsx) plutôt qu'un second
  // mécanisme de pub — même source unique que "Ton bilan"/Aperçu, jamais
  // dupliquée. Déclenché depuis le tap sur un chip de période verrouillé
  // plus bas (jamais depuis un composant <InsightVerrouille>/
  // <TonBilanVerrou> : ces chips gèrent leur propre icône cadenas, pas
  // besoin de l'habillage overlay de InsightVerrouille).
  const { declencherPub: declencherPubPeriodeStatsPerso } = useDeblocagePub(
    () => setStatsPeriodeDebloquePerso(true),
    statsPeriodeDebloquePerso,
  );
  // RÈGLE : `|| !estDansUnEspace` (revue du 2026-09-13) — évite de charger
  // une 2e pub RewardedAd pour la vue partagée sur un compte qui n'est même
  // pas dans un espace (jamais besoin de ce verrou dans ce cas). N'affecte
  // que le CHARGEMENT anticipé (cf. useDeblocagePub, dejaDeverrouille) —
  // declencherPub retombe de toute façon sur l'Alert simulée si jamais
  // appelé sans pub chargée, jamais un comportement cassé si estDansUnEspace
  // change en cours de session.
  const { declencherPub: declencherPubPeriodeStatsPartage } = useDeblocagePub(
    () => setStatsPeriodeDebloquePartage(true),
    statsPeriodeDebloquePartage || !estDansUnEspace,
  );
  const statsPeriodeDebloque =
    vueActive === "partage"
      ? statsPeriodeDebloquePartage
      : statsPeriodeDebloquePerso;
  const declencherPubPeriodeStats =
    vueActive === "partage"
      ? declencherPubPeriodeStatsPartage
      : declencherPubPeriodeStatsPerso;
  // RÈGLE À NE JAMAIS CASSER — VERROU UNIQUE POUR TOUT "TON BILAN" (refonte
  // monétisation du 2026-09-12, demande explicite — REVIENT sur l'ancienne
  // séparation en verrous individuels : 4 onglets PremiumVerrou distincts +
  // 2 InsightVerrouille distincts, cf. git log) : une seule pub débloque
  // désormais TOUT Ton bilan (onglets Vista/Santé/Trophées/Simulateur +
  // les 2 encarts d'insights ci-dessous) pour la session — state local (pas
  // persisté), revient à false à la prochaine ouverture de l'app.
  const [tonBilanDebloque, setTonBilanDebloque] = useState(false);
  // Comparaison mensuelle par catégorie : un seul état pour toute la
  // section (pas de toggle par ligne) — taper n'importe quelle valeur
  // affichée (une ligne ou le delta total en haut) bascule tout d'un coup.
  const [comparaisonEnPourcentage, setComparaisonEnPourcentage] =
    useState(false);
  // Même mécanique de toggle, indépendante de comparaisonEnPourcentage
  // ci-dessus (sections distinctes) : indicateur de variation réel vs
  // prévu sur toute la période sélectionnée, affiché sous le titre du
  // graphique "Dépensé vs dépenses prévues".
  const [depenseVsPrevuEnPourcentage, setDepenseVsPrevuEnPourcentage] =
    useState(false);
  // Toggle €/% du tiroir "Par catégorie" — un état par graphique (Dépenses
  // / Entrées d'argent), indépendants l'un de l'autre. "pct" par défaut, cf.
  // demande explicite (barres 100% empilées par défaut).
  const [modeDepensesCategorie, setModeDepensesCategorie] = useState<
    "pct" | "euro"
  >("pct");
  const [modeEntreesCategorie, setModeEntreesCategorie] = useState<
    "pct" | "euro"
  >("pct");
  const [categoriesInchangeesOuvert, setCategoriesInchangeesOuvert] =
    useState(false);
  const [vue, setVue] = useState<Vue>("global");
  const [titoirOuvert, setTiroirOuvert] = useState(false);
  const [categoriesSelectionnees, setCategoriesSelectionnees] = useState<
    string[]
  >([]);
  // Panel de détail par catégorie ouvert au tap sur une légende de
  // "Dépensé vs dépenses prévues" quand un filtre catégorie est actif —
  // null = fermé, "reel" = détail du Dépensé, "prevu" = détail des
  // Dépenses prévues.
  const [detailFiltreType, setDetailFiltreType] = useState<
    "reel" | "prevu" | null
  >(null);
  // Panel de détail par mois ouvert au tap sur une légende des graphiques
  // en barres empilées du tiroir "Entrées d'argent et dépenses par
  // catégorie" — null = fermé. `lignes` ne contient déjà que les mois où
  // le montant est non nul (filtré à la construction, pas ici).
  const [detailCategorieParMois, setDetailCategorieParMois] = useState<{
    label: string;
    couleur: string;
    lignes: { moisLabel: string; montant: number }[];
  } | null>(null);
  const [modalSeriesVisible, setModalSeriesVisible] = useState(false);
  // RÈGLE À NE JAMAIS CASSER : "Ton bilan" est structuré en 4 onglets
  // horizontaux (Vista / Santé / Trophées / Et si...), même principe que
  // Jour/Semaine/Mois sur Planning — chaque onglet a son propre ScrollView
  // indépendant (voir scrollVistaRef/scrollSanteRef/scrollTropheesRef/
  // scrollSimulateurRef plus bas), jamais un seul ScrollView partagé entre
  // onglets.
  const [vueModalStats, setVueModalStats] = useState<
    "vista" | "sante" | "trophees" | "simulateur"
  >("vista");
  const scrollVistaRef = useRef<ScrollView>(null);
  const scrollSanteRef = useRef<ScrollView>(null);
  const scrollTropheesRef = useRef<ScrollView>(null);
  const scrollSimulateurRef = useRef<ScrollView>(null);
  // RÈGLE À NE JAMAIS CASSER — HAUTEUR DE LA MODALE "TON BILAN" :
  // Cette modale doit TOUJOURS occuper 85-90% de l'écran.
  // Ne JAMAIS modifier cette valeur lors de corrections sur d'autres
  // fonctionnalités (scroll, onglets, insights...) — toute modification ici
  // casse l'affichage de TOUS les onglets. Valeur validée :
  // Dimensions.get('window').height * 0.88.
  // RÈGLE À NE JAMAIS CASSER — HAUTEUR FIXE, JAMAIS maxHeight : un
  // ScrollView `flex: 1` (cf. scrollVistaRef/scrollSanteRef/
  // scrollTropheesRef/scrollSimulateurRef plus bas, nécessaire pour que la
  // zone tactile de scroll couvre tout l'onglet) a besoin d'un parent à
  // hauteur DÉFINIE pour se dimensionner correctement — un `maxHeight` sur
  // le conteneur (comportement "s'adapte au contenu, plafonne à X%") ne
  // fournit PAS de base définie à un enfant flex:1, ce qui a déjà cassé la
  // hauteur de toute la modale une première fois (régression confirmée :
  // ajouter flex:1 aux ScrollView avec un conteneur en maxHeight fait
  // s'effondrer modalCardBadges). `height` (fixe, calculée une fois ici)
  // est la seule valeur sûre pour ce conteneur tant que ses enfants directs
  // utilisent flex:1.
  const HAUTEUR_MODALE_TON_BILAN = Dimensions.get("window").height * 0.88;
  // RÈGLE À NE JAMAIS CASSER : "Ton bilan" doit garder EXACTEMENT la même
  // hauteur de conteneur quel que soit l'onglet actif — modalCardBadges a
  // désormais une hauteur FIXE (HAUTEUR_MODALE_TON_BILAN ci-dessus, cf.
  // RÈGLE juste au-dessus), donc un onglet verrouillé (TonBilanVerrou,
  // contenu court par nature) ne rétrécit plus la modale par construction.
  // HAUTEUR_ONGLET_VERROUILLE reste néanmoins utile pour que le contenu
  // verrouillé lui-même remplisse visuellement l'espace disponible dans
  // cette hauteur fixe, plutôt que de laisser un grand vide sous
  // TonBilanVerrou.
  const HAUTEUR_ONGLET_VERROUILLE = Dimensions.get("window").height * 0.85 - 220;
  const changerVueModalStats = (
    v: "vista" | "sante" | "trophees" | "simulateur",
  ) => {
    setVueModalStats(v);
    const ref =
      v === "vista"
        ? scrollVistaRef
        : v === "sante"
          ? scrollSanteRef
          : v === "trophees"
            ? scrollTropheesRef
            : scrollSimulateurRef;
    ref.current?.scrollTo({ y: 0, animated: false });
  };
  // RÈGLE À NE JAMAIS CASSER : deep-link "Simuler" — utilisé par "Ta
  // prochaine meilleure décision" et "Ce qui fait bouger ta note" (leviers)
  // pour ouvrir directement l'onglet "Et si..." avec la bonne catégorie déjà
  // sélectionnée, plutôt que de laisser l'utilisateur la rechercher lui-même.
  const ouvrirSimulateurPour = (categorieId?: string) => {
    if (categorieId) setCategorieSimulee(categorieId);
    changerVueModalStats("simulateur");
  };
  const [historiqueOuvert, setHistoriqueOuvert] = useState<
    Partial<Record<TypeSerie, boolean>>
  >({});
  const [editionSeuilOuverte, setEditionSeuilOuverte] = useState(false);
  const [seuilEpargneTemp, setSeuilEpargneTemp] = useState("");

  const [categorieSimulee, setCategorieSimulee] = useState<string | null>(
    null,
  );
  // RÈGLE À NE JAMAIS CASSER — CURSEUR BIDIRECTIONNEL EN POURCENTAGE
  // (correctif du 2026-09-13) : le curseur manipule un pourcentage de
  // variation (-100 à +100), TOUJOURS centré sur 0% = budget actuel —
  // `budgetSimule` (plus bas, dérivé, plus un state) n'est jamais piloté
  // directement par le curseur. L'ancienne version pilotait un montant
  // absolu en € avec minimumValue:0/maximumValue:max(budgetActuel*2,100) :
  // pour toute catégorie à moins de 50€ de budget, le maximum retombait
  // sur le plancher fixe 100€ au lieu de 2×budgetActuel, désynchronisant
  // le centre visuel du curseur de la valeur actuelle (ex: catégorie à
  // 20€ → plage [0,100], "actuel" affiché à 20% du curseur, pas au
  // centre) — perçu comme "le curseur part de 0 à gauche, plus moyen de
  // diminuer". Ce state en pourcentage replace le curseur exactement au
  // centre quel que soit le budget, et garantit toujours -100%/+100%
  // symétriques.
  const [pourcentageSimule, setPourcentageSimule] = useState(0);
  const [tiroirSimulateurOuvert, setTiroirSimulateurOuvert] = useState(false);
  // Sous-section A du Simulateur : période de projection choisie par
  // l'utilisateur (remplace l'ancien NB_MOIS_PROJECTION fixe à 6).
  const [periodeSimulationMois, setPeriodeSimulationMois] = useState(6);
  // Sous-section B : simulation inverse ("Combien veux-tu économiser ?").
  const [montantCibleInverse, setMontantCibleInverse] = useState("");
  const [periodeInverseMois, setPeriodeInverseMois] = useState(6);
  // Onglet Trophées : compteur cumulé "Insight en action"/"Discipline
  // douce" (utils/conseils.ts::chargerNbAmeliorations) — chargé une fois au
  // montage, en lecture seule ici (c'est Aperçu qui l'incrémente).
  const [nbAmeliorations, setNbAmeliorations] = useState(0);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) return;
      setNbAmeliorations(await chargerNbAmeliorations(userId));
    })();
  }, []);
  const categoriesSimulables = objStore.enveloppes.filter(
    (e) => e.type !== "Entrée",
  );
  const enveloppeSimulee =
    categoriesSimulables.find((e) => e.id === categorieSimulee) ?? null;

  // RÈGLE : remet le curseur à 0% (= budget actuel, au centre) à chaque
  // changement de catégorie simulée — jamais un pourcentage hérité de la
  // catégorie précédente.
  useEffect(() => {
    setPourcentageSimule(0);
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
    transactions: objStore.transactions,
    historiquePaiements: objStore.historiquePaiements,
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

  // Mode espace partagé — Stats en vue "Partagé" : purement additif, jamais
  // recalculé pour "Moi" (scoreSante/series ci-dessus restent les SEULES
  // sources pour la vue personnelle). Tout ce bloc est scopé au mois en
  // cours (LABEL_MOIS_ACTUEL), comme "Vue d'ensemble" — jamais la période
  // sélectionnée (nbMois), qui n'a pas de sens pour les données du
  // partenaire (chargerDonneesPartenaire ne charge que l'état courant, pas
  // d'historique).
  const enveloppesPartenaireStats = donneesPartenaire?.enveloppes ?? [];
  const transactionsPartenaireStats = donneesPartenaire?.transactions ?? [];
  const totalDepensesMoiMois = objStore.enveloppes
    .filter(
      (e) =>
        e.type !== "Entrée" &&
        estCategorieActiveCeMois(e, ANNEE_ACTUELLE, MOIS_ACTUEL),
    )
    .reduce((acc, e) => acc + e.depense, 0);
  const { total: totalEntreesMoiMois } = entreesBudgetDuMois(
    objStore.enveloppes,
    ANNEE_ACTUELLE,
    MOIS_ACTUEL,
  );
  const totalDepensesPartenaireMois =
    vueActive === "partage"
      ? enveloppesPartenaireStats
          .filter(
            (e) =>
              e.type !== "Entrée" &&
              estCategorieActiveCeMois(e, ANNEE_ACTUELLE, MOIS_ACTUEL),
          )
          .reduce((acc, e) => acc + e.depense, 0)
      : 0;
  const totalEntreesPartenaireMois =
    vueActive === "partage" && enveloppesPartenaireStats.length > 0
      ? entreesBudgetDuMois(
          enveloppesPartenaireStats,
          ANNEE_ACTUELLE,
          MOIS_ACTUEL,
        ).total
      : 0;
  const revenusCombines = totalEntreesMoiMois + totalEntreesPartenaireMois;
  const depensesCombinees = totalDepensesMoiMois + totalDepensesPartenaireMois;

  // RÈGLE À NE JAMAIS CASSER — BASE DE LA BALANCE (Graphique 4) : "COMMUN"
  // SE DÉCIDE PAR FUSION DE NOM (les deux comptes ont une catégorie du même
  // nom), JAMAIS PAR enveloppe.partage : ce toggle manuel (Profil → "Gérer
  // mes catégories partagées") est désactivé par défaut sur toute nouvelle
  // catégorie — l'utiliser comme filtre d'ENTRÉE dans ce calcul masquait la
  // balance en permanence pour quiconque n'était jamais allé le basculer à
  // la main (bug confirmé, diagnostiqué via les logs [Balance] ci-dessus,
  // retirés maintenant que la cause est identifiée). Une catégorie est
  // "commune" si son NOM (trim+lowercase) existe des DEUX côtés ce mois-ci
  // — symétrique par construction (contrairement à l'ancien filtre, qui ne
  // s'appliquait qu'à mes propres catégories). Alimente contributionsCommunes
  // (Balance + nomsCommuns, réutilisé par Graphique 2 "évolution des
  // dépenses communes") — repartitionParPersonne (Graphique 3, cf. RÈGLE à
  // son site de définition plus bas) applique désormais exactement la même
  // politique, sur demande explicite, pour une cohérence totale entre les
  // graphiques de la vue partagée.
  const contributionsCommunes = (() => {
    if (vueActive !== "partage") {
      return {
        moiCommun: 0,
        partenaireCommun: 0,
        totalCommun: 0,
        nomsCommuns: new Set<string>(),
      };
    }
    const cleNom = (nom: string) => nom.trim().toLowerCase();
    const mesEnveloppesActives = objStore.enveloppes.filter(
      (e) =>
        e.type !== "Entrée" &&
        estCategorieActiveCeMois(e, ANNEE_ACTUELLE, MOIS_ACTUEL),
    );
    const enveloppesPartenaireActives = enveloppesPartenaireStats.filter(
      (e) =>
        e.type !== "Entrée" &&
        estCategorieActiveCeMois(e, ANNEE_ACTUELLE, MOIS_ACTUEL),
    );
    const nomsMoi = new Set(mesEnveloppesActives.map((e) => cleNom(e.nom)));
    const nomsPartenaire = new Set(
      enveloppesPartenaireActives.map((e) => cleNom(e.nom)),
    );
    const nomsCommuns = new Set(
      [...nomsMoi].filter((nom) => nomsPartenaire.has(nom)),
    );
    const moiCommun = mesEnveloppesActives
      .filter((e) => nomsCommuns.has(cleNom(e.nom)))
      .reduce((acc, e) => acc + e.depense, 0);
    const partenaireCommun = enveloppesPartenaireActives
      .filter((e) => nomsCommuns.has(cleNom(e.nom)))
      .reduce((acc, e) => acc + e.depense, 0);
    return {
      moiCommun,
      partenaireCommun,
      totalCommun: moiCommun + partenaireCommun,
      nomsCommuns,
    };
  })();

  // "Répartition" empilée par personne — regroupée par NOM de catégorie
  // (les deux comptes ont des enveloppes distinctes, jamais le même id).
  // RÈGLE À NE JAMAIS CASSER — "COMMUN" SE DÉCIDE PAR FUSION DE NOM, JAMAIS
  // PAR enveloppe.partage : même correction que contributionsCommunes
  // ci-dessus (ce toggle manuel, désactivé par défaut, masquait cette
  // répartition en quasi-totalité pour quiconque ne l'avait jamais activé —
  // TOUTES mes catégories actives entrent maintenant dans ce calcul, comme
  // celles du partenaire, jamais seulement celles marquées `partage`).
  // Clé de regroupement trim+lowercase (même convention que
  // fusionnerCategoriesParNom, utils/espacePartage.ts) — la casse/l'espace
  // du nom affiché (`ligne.nom`) reste celle rencontrée en premier (mon
  // côté, traité avant celui du partenaire), jamais recalculée. Une
  // catégorie du même nom des deux côtés (fusion) bascule tout son montant
  // dans le segment "Commun", jamais moitié "Moi" moitié "[Prénom]" — même
  // priorité que le badge "Commun" d'Aperçu/Budget.
  type SegmentRepartitionPartagee = {
    nom: string;
    couleur: string;
    moi: number;
    partenaire: number;
    commun: number;
    // RÈGLE : TOUJOURS le montant réel par personne, même pour une ligne
    // fusionnée (contrairement à moi/partenaire ci-dessus, mis à 0 pour une
    // ligne "Commun" par le collapse plus bas). Graphique 1 (donut,
    // totauxDonutCouple) continue de lire moi/partenaire/commun tels quels,
    // jamais ces deux champs — Graphique 3 (barres par catégorie, demande du
    // 2026-09-06) est seul consommateur, pour afficher le VRAI split
    // Moi/Partenaire même sur une catégorie "Commun".
    moiReel: number;
    partenaireReel: number;
    total: number;
  };
  const repartitionParPersonne: SegmentRepartitionPartagee[] = (() => {
    if (vueActive !== "partage") return [];
    const cleNomRepartition = (nom: string) => nom.trim().toLowerCase();
    const parNom = new Map<string, SegmentRepartitionPartagee>();
    objStore.enveloppes
      .filter(
        (e) =>
          e.type !== "Entrée" &&
          estCategorieActiveCeMois(e, ANNEE_ACTUELLE, MOIS_ACTUEL),
      )
      .forEach((e) => {
        const cle = cleNomRepartition(e.nom);
        const ligne = parNom.get(cle) ?? {
          nom: e.nom,
          couleur: e.couleur,
          moi: 0,
          partenaire: 0,
          commun: 0,
          moiReel: 0,
          partenaireReel: 0,
          total: 0,
        };
        ligne.moi += e.depense;
        ligne.moiReel += e.depense;
        ligne.total += e.depense;
        parNom.set(cle, ligne);
      });
    enveloppesPartenaireStats
      .filter(
        (e) =>
          e.type !== "Entrée" &&
          estCategorieActiveCeMois(e, ANNEE_ACTUELLE, MOIS_ACTUEL),
      )
      .forEach((e) => {
        const cle = cleNomRepartition(e.nom);
        const ligne = parNom.get(cle) ?? {
          nom: e.nom,
          couleur: e.couleur,
          moi: 0,
          partenaire: 0,
          commun: 0,
          moiReel: 0,
          partenaireReel: 0,
          total: 0,
        };
        ligne.partenaire += e.depense;
        ligne.partenaireReel += e.depense;
        ligne.total += e.depense;
        parNom.set(cle, ligne);
      });
    return Array.from(parNom.values())
      .map((ligne) =>
        ligne.moi > 0 && ligne.partenaire > 0
          ? { ...ligne, commun: ligne.moi + ligne.partenaire, moi: 0, partenaire: 0 }
          : ligne,
      )
      .sort((a, b) => b.total - a.total);
  })();

  // RÈGLE : Graphique 1 (donut de contribution) — simple ré-agrégation de
  // repartitionParPersonne (toutes catégories actives des deux côtés,
  // fusionnées par nom — cf. RÈGLE à son site de définition), jamais un
  // nouveau calcul indépendant qui pourrait diverger.
  const totauxDonutCouple = repartitionParPersonne.reduce(
    (acc, l) => ({
      moi: acc.moi + l.moi,
      partenaire: acc.partenaire + l.partenaire,
      commun: acc.commun + l.commun,
    }),
    { moi: 0, partenaire: 0, commun: 0 },
  );


  // RÈGLE À NE JAMAIS CASSER — GRAPHIQUE 2 "ÉVOLUTION 6 MOIS DES DÉPENSES
  // COMMUNES" : réutilise le même mécanisme d'archive que getDepenseMois
  // plus bas (snapshots_mois/snapshot_enveloppes côté moi,
  // historiqueMoisPartenaire côté partenaire, cf. RÈGLE détaillée sur
  // chargerHistoriqueMoisPartenaire, utils/espacePartage.ts) — JAMAIS
  // transactions/historique_paiements, qui ne couvrent pas les catégories
  // Fixe (loyer...). Le SET de noms "commun" (contributionsCommunes.
  // nomsCommuns, calculé plus haut) est déterminé sur l'état ACTUEL
  // uniquement et appliqué rétroactivement aux mois passés — même limite
  // déjà acceptée par repartitionParPersonne (la fusion par nom n'est
  // jamais recalculée sur l'historique, seulement sur les catégories
  // actives aujourd'hui).
  const moisEvolutionCommune = construireMoisPeriode(
    6,
    MOIS_ACTUEL,
    ANNEE_ACTUELLE,
  );
  const depenseCommuneMoisPourMoi = (mois: number, annee: number): number => {
    const noms = contributionsCommunes.nomsCommuns;
    if (mois === MOIS_ACTUEL && annee === ANNEE_ACTUELLE) {
      return objStore.enveloppes
        .filter(
          (e) =>
            e.type !== "Entrée" &&
            noms.has(e.nom.trim().toLowerCase()) &&
            estCategorieActiveCeMois(e, annee, mois),
        )
        .reduce((acc, e) => acc + e.depense, 0);
    }
    const snap = objStore.historiquesMois.find(
      (s) => s.mois === mois && s.annee === annee,
    );
    if (!snap) return 0;
    return snap.enveloppes
      .filter(
        (e) => e.type !== "Entrée" && noms.has(e.nom.trim().toLowerCase()),
      )
      .reduce((acc, e) => acc + e.depense, 0);
  };
  const depenseCommuneMoisPourPartenaire = (
    mois: number,
    annee: number,
  ): number => {
    const noms = contributionsCommunes.nomsCommuns;
    if (mois === MOIS_ACTUEL && annee === ANNEE_ACTUELLE) {
      return enveloppesPartenaireStats
        .filter(
          (e) =>
            e.type !== "Entrée" &&
            noms.has(e.nom.trim().toLowerCase()) &&
            estCategorieActiveCeMois(e, annee, mois),
        )
        .reduce((acc, e) => acc + e.depense, 0);
    }
    const snap = historiqueMoisPartenaire.find(
      (s) => s.mois === mois && s.annee === annee,
    );
    if (!snap) return 0;
    return snap.enveloppes
      .filter(
        (e) => e.type !== "Entrée" && noms.has(e.nom.trim().toLowerCase()),
      )
      .reduce((acc, e) => acc + e.depense, 0);
  };
  const labelsEvolutionCommune = moisEvolutionCommune.map(
    ({ mois }) => MOIS_LABELS_COMPLETS[mois],
  );
  const seriesEvolutionCommune: SegmentBarreEmpilee[] = [
    {
      cle: "moi",
      label: "Moi",
      couleur: couleurMoi,
      donnees: moisEvolutionCommune.map(({ mois, annee }) =>
        depenseCommuneMoisPourMoi(mois, annee),
      ),
    },
    {
      cle: "partenaire",
      label: membrePartenaire?.prenom || "Partenaire",
      couleur: couleurPartenaire,
      donnees: moisEvolutionCommune.map(({ mois, annee }) =>
        depenseCommuneMoisPourPartenaire(mois, annee),
      ),
    },
  ];

  // RÈGLE À NE JAMAIS CASSER — GRAPHIQUE 4 "BALANCE DU COUPLE" : ratio
  // attendu de contribution du PARTENAIRE selon modeBalance (réglage du
  // couple, cf. EspacePartageContext) — formule fournie explicitement par
  // l'utilisateur. Mode "revenus" retombe sur 0.5 si revenusCombines est nul
  // (aucun revenu déclaré des deux côtés : diviser par zéro n'aurait aucun
  // sens, 50/50 reste le repli le plus neutre). balanceMontant > 0 signifie
  // "le partenaire doit de l'argent" (il a payé moins que sa part attendue
  // du total COMMUN, cf. contributionsCommunes ci-dessus) ; < 0 signifie
  // qu'il a trop payé.
  const ratioAttenduPartenaire =
    modeBalance === "revenus"
      ? revenusCombines > 0
        ? totalEntreesPartenaireMois / revenusCombines
        : 0.5
      : modeBalance === "personnalise"
        ? ratioPersonnalise
        : 0.5;
  const contributionAttenduePartenaire =
    contributionsCommunes.totalCommun * ratioAttenduPartenaire;
  const balanceMontant =
    contributionAttenduePartenaire - contributionsCommunes.partenaireCommun;
  const pctEcartBalance =
    contributionsCommunes.totalCommun > 0
      ? (Math.abs(balanceMontant) / contributionsCommunes.totalCommun) * 100
      : 0;
  const balanceLabel =
    contributionsCommunes.totalCommun <= 0
      ? null
      : pctEcartBalance < 5
        ? "Vous êtes à l'équilibre ce mois-ci"
        : balanceMontant > 0
          ? `${membrePartenaire?.prenom || "Ton/ta partenaire"} te doit ${formaterMontant(Math.abs(balanceMontant))}€ ce mois-ci`
          : `Tu dois ${formaterMontant(Math.abs(balanceMontant))}€ à ${membrePartenaire?.prenom || "ton/ta partenaire"} ce mois-ci`;

  // RÈGLE : "remet la balance à zéro pour ce mois" est purement un effet
  // d'AFFICHAGE (cf. RÈGLE table append-only, migration
  // 20260905100000_stats_couple_schema.sql) — n'écrit jamais dans
  // enveloppes/transactions, uniquement une ligne remboursements_espace qui
  // fait passer remboursements.length de 0 à >0 pour ce mois.
  const confirmerRemboursement = () => {
    if (!espaceId || balanceMontant === 0) return;
    const montant = Math.abs(balanceMontant);
    const quiRembourse =
      balanceMontant > 0 ? membrePartenaire?.prenom || "Ton/ta partenaire" : "Tu";
    Alert.alert(
      "Marquer comme remboursé",
      `Confirmer que ${quiRembourse} ${balanceMontant > 0 ? "a" : "as"} remboursé ${formaterMontant(montant)}€ ce mois-ci ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Confirmer",
          onPress: async () => {
            const ok = await marquerRembourse(
              espaceId,
              MOIS_ACTUEL,
              ANNEE_ACTUELLE,
              montant,
            );
            if (ok) {
              const liste = await chargerRemboursementsMois(
                espaceId,
                MOIS_ACTUEL,
                ANNEE_ACTUELLE,
              );
              setRemboursements(liste);
            }
          },
        },
      ],
    );
  };

  // Scores "Partenaire" et "Commun" — RÈGLE À NE JAMAIS CASSER : APPROXIMATIONS
  // ÉTIQUETÉES, JAMAIS PRÉSENTÉES COMME LE VRAI SCORE — décision explicite de
  // l'utilisateur (question posée avant cette section) : calculerScoreSante a
  // besoin de TOUTES les données d'un compte (objectifs, épargne, historique
  // sur plusieurs mois) pour être fiable ; on n'a accès qu'aux enveloppes/
  // transactions 'commun' du partenaire (cf. étape 3, privacy by
  // attribution). objectifs/historiquesMois/epargneMois sont donc toujours
  // vides/à 0 ici — jamais une tentative de deviner ces valeurs. L'UI DOIT
  // toujours afficher un libellé "estimation" à côté de ces deux scores,
  // jamais les mêmes libellés que "Mon score" (RÈGLE dans le rendu plus bas).
  const scorePartenaireApprox: ScoreSante | null =
    vueActive === "partage" && enveloppesPartenaireStats.length > 0
      ? calculerScoreSante({
          enveloppes: enveloppesPartenaireStats,
          epargneMois: 0,
          historiquesMois: [],
          seuilEpargneConstante: null,
          objectifs: [],
          transactions: transactionsPartenaireStats,
          historiquePaiements: [],
        } satisfies DonneesScore)
      : null;
  // "Ensemble" — RÈGLE À NE JAMAIS CASSER : VRAIE MOYENNE ARITHMÉTIQUE de
  // "Moi" (le vrai score complet, jamais recalculé) et "Partenaire"
  // (l'estimation ci-dessus), jamais un troisième calculerScoreSante()
  // indépendant. Ancienne version pondérée par les dépenses du mois de
  // chaque compte (euros) — bug confirmé : cette pondération fait
  // structurellement dominer le compte qui a le plus dépensé au point que
  // "Ensemble" retombe systématiquement sur SON score, pas une vraie
  // moyenne (ex: 37 et 44 donnait toujours 37 dès que "Moi" pesait
  // largement plus que le partenaire en euros ce mois-ci — un score 0-100
  // déjà normalisé n'a aucune raison d'être repondéré par un montant en
  // euros, deux échelles sans rapport). Moyenne 50/50 désormais, jamais
  // pondérée par un montant : si le partenaire n'a pas de score estimable,
  // "Ensemble" retombe simplement sur mon score seul. Pas de `details`
  // fabriqués (jamais affichés pour "Ensemble", cf. rendu plus bas) :
  // uniquement score + mot.
  const scoreEnsemble: { score: number; mot: MotCleScore } | null =
    vueActive === "partage"
      ? scorePartenaireApprox
        ? (() => {
            const score = Math.round(
              (scoreSante.score + scorePartenaireApprox.score) / 2,
            );
            return { score, mot: motPourScore(score) };
          })()
        : { score: scoreSante.score, mot: scoreSante.mot }
      : null;

  // Note B/C/E : score "tel qu'il était" pour chaque mois archivé, avec la
  // même formule que le score live (utils/score.ts::calculerScoreHistorique)
  // — sert au delta "vs mois précédent" ET à la timeline (section E).
  const scoreTimeline = objStore.historiquesMois.map((snap, i) => ({
    mois: snap.mois,
    annee: snap.annee,
    score: calculerScoreHistorique(
      i,
      objStore.historiquesMois,
      objStore.transactions,
      objStore.historiquePaiements,
    ),
  }));
  const scoreSanteMoisPrecedent =
    scoreTimeline.length > 0 ? scoreTimeline[scoreTimeline.length - 1].score : null;

  // Sous-section A : période de projection choisie (1/3/6/12/24 mois),
  // remplace l'ancien NB_MOIS_PROJECTION fixé à 6.
  const NB_MOIS_PROJECTION = periodeSimulationMois;
  const budgetActuelSimule = enveloppeSimulee?.budget ?? 0;
  // RÈGLE : dérivé de pourcentageSimule (cf. RÈGLE sur ce state plus haut),
  // jamais piloté directement — pourcentageSimule=0 donne toujours
  // budgetSimule===budgetActuelSimule exactement (curseur au centre).
  const budgetSimule = Math.round(
    budgetActuelSimule * (1 + pourcentageSimule / 100),
  );
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
    (_, i) => MOIS_LABELS_COMPLETS[(MOIS_ACTUEL + i + 1) % 12],
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
  // Objectif accéléré par la simulation : rythme actuel + économie
  // mensuelle simulée, comparé au rythme sans changement — "environ N mois
  // plus tôt", jamais une date précise (projection, cf. RÈGLE formulations
  // prudentes).
  const moisPrecedentPourSimulation = new Date(ANNEE_ACTUELLE, MOIS_ACTUEL - 1, 1);
  const snapshotMoisPrecedentPourSimulation = objStore.historiquesMois.find(
    (s) =>
      s.mois === moisPrecedentPourSimulation.getMonth() &&
      s.annee === moisPrecedentPourSimulation.getFullYear(),
  );
  const objectifPourSimulation = objStore.objectifs
    .filter((o) => !o.ferme && o.cible > 0)
    .sort((a, b) => a.cible - a.actuel - (b.cible - b.actuel))[0];
  const rythmeObjectifSimulation = objectifPourSimulation
    ? calculerRythmeObjectif(
        objectifPourSimulation,
        objStore.historiquesMois,
        snapshotMoisPrecedentPourSimulation,
      )
    : null;
  const moisGagnesSimulation =
    objectifPourSimulation && rythmeObjectifSimulation && ecartMensuelSimule > 0
      ? (() => {
          const manque = objectifPourSimulation.cible - objectifPourSimulation.actuel;
          const rythmeActuel = rythmeObjectifSimulation.rythmeMensuel;
          const rythmeBoost = rythmeActuel + ecartMensuelSimule;
          if (rythmeActuel <= 0 || rythmeBoost <= 0) return null;
          const moisActuels = Math.ceil(manque / rythmeActuel);
          const moisBoostes = Math.ceil(manque / rythmeBoost);
          return Math.max(0, moisActuels - moisBoostes);
        })()
      : null;

  // === Sous-section B : simulation inverse ("Combien veux-tu économiser ?") ===
  const montantCibleInverseNum = parseMontant(montantCibleInverse) || 0;
  const manqueParMoisInverse =
    montantCibleInverseNum > 0 && periodeInverseMois > 0
      ? Math.max(0, montantCibleInverseNum / periodeInverseMois - epargneMoyenneMensuelle)
      : 0;
  const categoriesVariablesTriees = [...categoriesSimulables]
    .filter((e) => e.type === "Variable" && e.budget > 0)
    .sort((a, b) => b.budget - a.budget);
  const categorieInverseA = categoriesVariablesTriees[0];
  const categorieInverseB = categoriesVariablesTriees[1];
  const categoriesInverseCombinaison = categoriesVariablesTriees.slice(0, 3);
  const budgetVariableTotalInverse = categoriesInverseCombinaison.reduce(
    (acc, e) => acc + e.budget,
    0,
  );

  const creerObjectifDepuisSimulationInverse = async () => {
    if (bloquerSiInvite(isGuest, router)) return;
    if (montantCibleInverseNum <= 0) return;
    const couleur = couleurLaPlusDistincte(
      PALETTE_COULEURS,
      objStore.objectifs.map((o) => o.couleur),
    );
    await objStore.ajouterObjectif(
      `Objectif ${Math.round(montantCibleInverseNum)}€`,
      montantCibleInverseNum,
      0,
      couleur,
      false,
    );
  };

  // === Sous-section C : scénarios comparatifs (Prudent/Intermédiaire/Ambitieux) ===
  const SCENARIOS_COMPARATIFS = [
    { id: "prudent" as const, titre: "Prudent", pct: 0.1 },
    { id: "intermediaire" as const, titre: "Intermédiaire", pct: 0.2 },
    { id: "ambitieux" as const, titre: "Ambitieux", pct: 0.35 },
  ];
  const categoriesPourScenarios = [...categoriesSimulables]
    .filter((e) => e.type === "Variable" && e.budget > 0)
    .sort((a, b) => b.budget - a.budget)
    .slice(0, 3);
  const scenariosComparatifs = SCENARIOS_COMPARATIFS.map(({ id, titre, pct }) => {
    const reductions = categoriesPourScenarios.map((e) => ({
      enveloppe: e,
      reduction: Math.round(e.budget * pct),
    }));
    const economieMensuelle = reductions.reduce((acc, r) => acc + r.reduction, 0);
    const economie12Mois = economieMensuelle * 12;
    const moisGagnesScenario =
      objectifPourSimulation && rythmeObjectifSimulation && economieMensuelle > 0
        ? (() => {
            const manque = objectifPourSimulation.cible - objectifPourSimulation.actuel;
            const rythmeActuel = rythmeObjectifSimulation.rythmeMensuel;
            const rythmeBoost = rythmeActuel + economieMensuelle;
            if (rythmeActuel <= 0 || rythmeBoost <= 0) return null;
            return Math.max(
              0,
              Math.ceil(manque / rythmeActuel) - Math.ceil(manque / rythmeBoost),
            );
          })()
        : null;
    return { id, titre, reductions, economieMensuelle, economie12Mois, moisGagnesScenario };
  });

  // RÈGLE À NE JAMAIS CASSER : "Adopter ce scénario" effectue une vraie
  // mutation (budgets réels ou nouvel objectif), jamais une simulation
  // silencieuse — toujours précédée d'une confirmation explicite (Alert),
  // cf. appel dans le JSX de l'onglet Simulateur.
  const adopterScenario = async (scenario: (typeof scenariosComparatifs)[number]) => {
    const nouvellesEnveloppes = objStore.enveloppes.map((e) => {
      const reduction = scenario.reductions.find((r) => r.enveloppe.id === e.id);
      return reduction ? { ...e, budget: Math.max(0, e.budget - reduction.reduction) } : e;
    });
    objStore.modifierEnveloppes(nouvellesEnveloppes);
    if (!objectifPourSimulation && scenario.economie12Mois > 0) {
      const couleur = couleurLaPlusDistincte(
        PALETTE_COULEURS,
        objStore.objectifs.map((o) => o.couleur),
      );
      await objStore.ajouterObjectif(
        `Objectif ${scenario.titre}`,
        scenario.economie12Mois,
        0,
        couleur,
        false,
      );
    }
  };

  const confirmerAdoptionScenario = (scenario: (typeof scenariosComparatifs)[number]) => {
    if (bloquerSiInvite(isGuest, router)) return;
    const nomsCategories = scenario.reductions.map((r) => r.enveloppe.nom).join(", ");
    Alert.alert(
      `Adopter le scénario ${scenario.titre} ?`,
      `Le budget de ${nomsCategories || "tes catégories"} sera réduit dès maintenant${!objectifPourSimulation && scenario.economie12Mois > 0 ? `, et un nouvel objectif "Objectif ${scenario.titre}" sera créé.` : "."}`,
      [
        { text: "Annuler", style: "cancel" },
        { text: "Adopter", onPress: () => adopterScenario(scenario) },
      ],
    );
  };

  // Onglet Trophées.
  const trophees = calculerTrophees({
    historiquesMois: objStore.historiquesMois,
    transactions: objStore.transactions,
    historiquePaiements: objStore.historiquePaiements,
    objectifs: objStore.objectifs,
    enveloppes: objStore.enveloppes,
    nbAmeliorations,
  });

  // Note, section D : "Comment gagner 5 points" — 2-3 leviers heuristiques
  // accessibles, jamais de delta de points chiffré ici (c'est une
  // projection, pas un fait déjà survenu — cf. RÈGLE formulations prudentes
  // "pourrait améliorer ta note").
  type LevierScore = { texte: string; categorieId?: string };
  const leviersScore: LevierScore[] = (() => {
    const leviers: LevierScore[] = [];
    // RÈGLE À NE JAMAIS CASSER : un "levier" est par définition une action
    // d'ajustement ("réduire", "lisser") — jamais suggérée sur une catégorie
    // Fixe (loyer, assurance...), qui n'est justement pas ajustable
    // facilement. Les catégories Fixe restent visibles ailleurs (bilan,
    // observations), seuls les leviers d'action se limitent aux Variable.
    const enveloppesVariablesScore = objStore.enveloppes.filter((e) => e.type === "Variable");

    const pireDepassement = enveloppesVariablesScore
      .filter((e) => e.budget > 0 && e.depense > e.budget)
      .sort((a, b) => b.depense - b.budget - (a.depense - a.budget))[0];
    if (pireDepassement) {
      leviers.push({
        texte: `Réduire ${pireDepassement.nom} d'environ ${Math.round(pireDepassement.depense - pireDepassement.budget)}€/mois → pourrait améliorer ta note.`,
        categorieId: pireDepassement.id,
      });
    }

    const objectifPlusFaibleRythme = objStore.objectifs
      .filter((o) => !o.ferme && o.cible > 0)
      .map((o) => ({
        o,
        rythme: calculerRythmeObjectif(o, objStore.historiquesMois, snapshotMoisPrecedentPourSimulation),
      }))
      .filter(({ rythme }) => rythme.rythmeMensuel <= 0)
      .sort((a, b) => a.rythme.rythmeMensuel - b.rythme.rythmeMensuel)[0];
    if (objectifPlusFaibleRythme) {
      leviers.push({
        texte: `Maintenir un versement sur ${objectifPlusFaibleRythme.o.nom} ce mois → pourrait améliorer ta note.`,
      });
    }

    let pireVolatilite: { nom: string; id: string; cv: number } | null = null;
    enveloppesVariablesScore.forEach((e) => {
      const valeurs = objStore.historiquesMois
        .slice(-3)
        .map((s) => s.enveloppes.find((x) => x.id === e.id)?.depense ?? 0);
      if (valeurs.length < 2) return;
      const moyenne = valeurs.reduce((a, b) => a + b, 0) / valeurs.length;
      if (moyenne < 20) return;
      const variance = valeurs.reduce((acc, v) => acc + (v - moyenne) ** 2, 0) / valeurs.length;
      const cv = (Math.sqrt(variance) / moyenne) * 100;
      if (cv > 30 && (!pireVolatilite || cv > pireVolatilite.cv)) {
        pireVolatilite = { nom: e.nom, id: e.id, cv };
      }
    });
    if (pireVolatilite) {
      const cible = pireVolatilite as { nom: string; id: string; cv: number };
      leviers.push({
        texte: `Lisser tes dépenses ${cible.nom} d'un mois sur l'autre → pourrait améliorer ta note.`,
        categorieId: cible.id,
      });
    }

    return leviers.slice(0, 3);
  })();

  // Transition douce de la couleur du curseur/piste du simulateur quand
  // l'impact projeté change de signe, plutôt qu'un changement brutal.
  const impactSimulePositif = impactTotal6MoisSimulation >= 0;
  const animCouleurSlider = useMemo(
    () => new Animated.Value(impactSimulePositif ? 1 : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- valeur stable
    // voulue une seule fois au montage (comme l'ancien useRef().current
    // qu'elle remplace) ; Animated.timing s'occupe déjà de la faire évoluer
    // ensuite, la recréer à chaque changement de impactSimulePositif casserait
    // la transition animée.
    [],
  );
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

  // RÈGLE À NE JAMAIS CASSER : verrouillePub marque les options au-delà de
  // LIMITE_MOIS_GRATUIT_STATS tant que ni premium/invité ni
  // statsPeriodeDebloque (pub regardée cette session, POUR LA VUE
  // ACTIVE — cf. RÈGLE sur statsPeriodeDebloquePerso/Partage plus haut) —
  // chaque chip verrouillé affiche une icône cadenas (styles.periodeChip*
  // plus bas) et intercepte le tap pour déclencher la pub au lieu de
  // sélectionner directement.
  // RÈGLE : un compte invité (isGuest) est exempté ici comme partout
  // ailleurs — jamais de verrou sur ce sélecteur pour un invité, cf. RÈGLE
  // dans profil.tsx sur les autres éléments Premium.
  const optionsPeriode = genererOptionsPeriode(
    objStore.historiquesMois.length + 1,
  )
    .filter((o) => OPTIONS_PERIODE_STATS.includes(o.valeur))
    .map((o) => ({
      ...o,
      verrouillePub:
        !premium &&
        !isGuest &&
        !statsPeriodeDebloque &&
        o.valeur > LIMITE_MOIS_GRATUIT_STATS,
    }));

  // Clamp indépendant de la sélection courante du Picker : protège aussi
  // le cas d'un compte redevenu non-premium/session sans pub alors que
  // nbMoisSelectionne était encore réglé au-delà de la limite gratuite.
  const nbMois = premium || isGuest || statsPeriodeDebloque
    ? nbMoisSelectionne
    : Math.min(nbMoisSelectionne, LIMITE_MOIS_GRATUIT_STATS);
  // Suffixe de titre pour les sections calculées sur la période sélectionnée
  // (par opposition à LABEL_MOIS_ACTUEL, pour celles sur le mois en cours).
  const labelPeriode = `${nbMois} derniers mois`;

  const moisAffiches = construireMoisPeriode(nbMois, MOIS_ACTUEL, ANNEE_ACTUELLE);

  // RÈGLE À NE JAMAIS CASSER — ANTI-DOUBLON PAR MOIS_COMPTAGE : objStore.
  // enveloppes n'est PAS scopé au mois en cours — il contient TOUTES les
  // enveloppes vivantes, y compris celles taguées pour un AUTRE mois via
  // mois_comptage (ex: une entrée d'argent datée en août mais comptant pour
  // septembre reste une ligne vivante tant qu'elle n'a pas été archivée).
  // TOUJOURS filtrer par estCategorieActiveCeMois (utils/budget.ts, même
  // fonction que calculerResteEstimeCourant/index.tsx et
  // enveloppesCourantes/budget.tsx) avant de sommer "le mois en cours" —
  // sinon une telle enveloppe apparaît à la fois dans son mois par
  // mois_comptage ET, faute de filtre, dans n'importe quelle autre requête
  // qui prend `objStore.enveloppes` brut pour "le mois actuel". Un mois déjà
  // archivé (snapshot) n'a pas besoin de ce filtre : c'est déjà un
  // instantané figé "tel qu'il était à l'époque", sans mois_comptage à
  // interroger (snapshot_enveloppes n'a pas cette colonne).
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
      ).filter(
        (e) => e.type !== "Entrée" && estCategorieActiveCeMois(e, annee, mois),
      );
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
      ).filter(
        (e) => e.type !== "Entrée" && estCategorieActiveCeMois(e, annee, mois),
      );
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

  // Montant d'une enveloppe précise pour un mois donné, quel que soit son
  // type — contrairement à getDepenseMois/getBudgetMois ci-dessus, qui
  // excluent volontairement les entrées d'argent. Utilisé pour tracer
  // l'évolution mois par mois d'une entrée d'argent sélectionnée dans le
  // filtre (voir seriesEntrees plus bas).
  const getMontantEnveloppeMois = (
    mois: number,
    annee: number,
    enveloppeId: string,
  ): number => {
    if (mois === MOIS_ACTUEL && annee === ANNEE_ACTUELLE) {
      const env = objStore.enveloppes.find((e) => e.id === enveloppeId);
      return env && estCategorieActiveCeMois(env, annee, mois) ? env.depense : 0;
    }
    const snap = objStore.historiquesMois.find(
      (s) => s.mois === mois && s.annee === annee,
    );
    return snap?.enveloppes.find((e) => e.id === enveloppeId)?.depense ?? 0;
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

  // Vrai uniquement quand toutes les catégories sélectionnées dans le
  // filtre sont des entrées d'argent — les graphiques de dépenses n'ont
  // alors plus de sens et laissent place au graphique dédié "Évolution de
  // tes entrées d'argent" (voir seriesEntrees plus bas).
  const categoriesSelectionneesObj = objStore.enveloppes.filter((e) =>
    categoriesSelectionnees.includes(e.id),
  );
  const filtreEstEntreesUniquement =
    categoriesSelectionneesObj.length > 0 &&
    categoriesSelectionneesObj.every((e) => e.type === "Entrée");
  // Symétrique de filtreEstEntreesUniquement, pour "Évolution de tes
  // dépenses" (voir seriesDepenses plus bas) — vrai uniquement quand TOUTES
  // les catégories sélectionnées sont des dépenses (Fixe ou Variable),
  // jamais un mélange dépenses+entrées ni une sélection vide. Ces deux
  // booléens sont mutuellement exclusifs par construction (une catégorie
  // est soit "Entrée", soit "Fixe"/"Variable", jamais les deux), mais
  // aucun des deux n'est vrai pour une sélection vide ou mixte — dans ces
  // cas-là, "Dépensé vs dépenses prévues" (le graphique par défaut) reste
  // affiché, voir plus bas.
  const filtreEstDepensesUniquement =
    categoriesSelectionneesObj.length > 0 &&
    categoriesSelectionneesObj.every((e) => e.type !== "Entrée");

  // Nom affiché par l'indicateur entonnoir posé à côté des sections
  // réellement recalculées à partir de enveloppesFiltrees ci-dessus (pas
  // toutes les sections de la page — certaines, comme "Épargne dans le
  // temps" ou les objectifs, restent globales quel que soit ce filtre).
  const nomFiltreActif =
    categoriesSelectionnees.length === 1
      ? (objStore.enveloppes.find((e) => e.id === categoriesSelectionnees[0])
          ?.nom ?? null)
      : categoriesSelectionnees.length > 1
        ? `${categoriesSelectionnees.length} catégories`
        : null;

  const renderIndicateurFiltre = () => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <View>
        <Ionicons
          name="funnel-outline"
          size={13}
          color={nomFiltreActif ? C.accent : C.texteMuted}
        />
        {nomFiltreActif && (
          <Ionicons
            name="checkmark-circle"
            size={9}
            color={C.accent}
            style={{ position: "absolute", bottom: -3, right: -4 }}
          />
        )}
      </View>
      {nomFiltreActif && (
        <Text
          style={{ fontSize: 11, fontWeight: "600", color: C.accent }}
          numberOfLines={1}
        >
          {nomFiltreActif}
        </Text>
      )}
    </View>
  );

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

  // RÈGLE À NE JAMAIS CASSER — "ÉVOLUTION DANS LE TEMPS" CONSOLIDÉE (vue
  // partagée) : équivalents de getDepenseMois/getDisponibleMois/getEpargneMois
  // ci-dessus, mais pour le PARTENAIRE — mois courant via
  // enveloppesPartenaireStats (a de vrais ids/valeurs à jour), mois archivés
  // via historiqueMoisPartenaire (EspacePartageContext). Jamais fusionnées
  // avec les fonctions "moi" ci-dessus (predicats/branches légèrement
  // différents), toujours COMBINÉES en une passe séparée juste en dessous —
  // ces variables alimentent aussi "Dépensé vs dépenses prévues" (toujours
  // recalculé même avec un filtre catégorie actif), jamais un endroit où la
  // vue partagée doit interférer.
  const getDepenseMoisPartenaire = (mois: number, annee: number): number => {
    if (mois === MOIS_ACTUEL && annee === ANNEE_ACTUELLE) {
      return enveloppesPartenaireStats
        .filter(
          (e) =>
            e.type !== "Entrée" && estCategorieActiveCeMois(e, annee, mois),
        )
        .reduce((acc, e) => acc + e.depense, 0);
    }
    const snap = historiqueMoisPartenaire.find(
      (s) => s.mois === mois && s.annee === annee,
    );
    if (!snap) return 0;
    return snap.enveloppes
      .filter((e) => e.type !== "Entrée")
      .reduce((acc, e) => acc + e.depense, 0);
  };
  // RÈGLE : pendant de getDepenseMoisPartenaire ci-dessus, pour le BUDGET
  // (prévu) plutôt que la dépense (réel) — alimente
  // donneesPrevisionnellesConsolidees plus bas ("Dépensé vs dépenses
  // prévues" consolidé, demande du 2026-09-06).
  const getBudgetMoisPartenaire = (mois: number, annee: number): number => {
    if (mois === MOIS_ACTUEL && annee === ANNEE_ACTUELLE) {
      return enveloppesPartenaireStats
        .filter(
          (e) =>
            e.type !== "Entrée" && estCategorieActiveCeMois(e, annee, mois),
        )
        .reduce((acc, e) => acc + e.budget, 0);
    }
    const snap = historiqueMoisPartenaire.find(
      (s) => s.mois === mois && s.annee === annee,
    );
    if (!snap) return 0;
    return snap.enveloppes
      .filter((e) => e.type !== "Entrée")
      .reduce((acc, e) => acc + e.budget, 0);
  };
  const getDisponibleMoisPartenaire = (mois: number, annee: number): number => {
    if (mois === MOIS_ACTUEL && annee === ANNEE_ACTUELLE) {
      return entreesBudgetDuMois(enveloppesPartenaireStats, annee, mois).total;
    }
    const snap = historiqueMoisPartenaire.find(
      (s) => s.mois === mois && s.annee === annee,
    );
    if (!snap) return 0;
    return snap.enveloppes
      .filter((e) => e.type === "Entrée")
      .reduce((acc, e) => acc + e.depense, 0);
  };
  const getEpargneMoisPartenaire = (mois: number, annee: number): number => {
    if (mois === MOIS_ACTUEL && annee === ANNEE_ACTUELLE) {
      return epargneMoisPartenaireActuelle ?? 0;
    }
    const snap = historiqueMoisPartenaire.find(
      (s) => s.mois === mois && s.annee === annee,
    );
    return snap?.epargne ?? 0;
  };
  const affichagePartageEvolution = estDansUnEspace && vueActive === "partage";
  const donneesReellesConsolidees = affichagePartageEvolution
    ? moisAffiches.map(
        ({ mois, annee }) =>
          (getDepenseMois(mois, annee) ?? 0) +
          getDepenseMoisPartenaire(mois, annee),
      )
    : donneesReelles;
  // RÈGLE : pendant de donneesReellesConsolidees ci-dessus, pour le BUDGET
  // (prévu) — demande du 2026-09-06, "Dépensé vs dépenses prévues"
  // consolidé. Comme donneesReellesConsolidees, jamais filtre-aware
  // (toujours le total TOUTES catégories des deux comptes) : au site
  // d'appel, utilisé UNIQUEMENT quand enveloppesFiltrees est undefined (pas
  // de filtre catégorie actif) — avec un filtre actif, donneesPrevisionnelles
  // (individuel, filtré) reste la source, cf. RÈGLE au site d'appel.
  const donneesPrevisionnellesConsolidees = affichagePartageEvolution
    ? moisAffiches.map(
        ({ mois, annee }) =>
          (getBudgetMois(mois, annee) ?? 0) +
          getBudgetMoisPartenaire(mois, annee),
      )
    : donneesPrevisionnelles;
  const donneesDisponibleConsolidees = affichagePartageEvolution
    ? moisAffiches.map(
        ({ mois, annee }) =>
          (getDisponibleMois(mois, annee) ?? 0) +
          getDisponibleMoisPartenaire(mois, annee),
      )
    : donneesDisponible;
  const donneesEpargneConsolidees = affichagePartageEvolution
    ? moisAffiches.map(
        ({ mois, annee }) =>
          (getEpargneMois(mois, annee) ?? 0) +
          getEpargneMoisPartenaire(mois, annee),
      )
    : donneesEpargne;

  // Variation totale réel vs prévu sur toute la période affichée (pas un
  // mois précis) — indicateur affiché sous le titre de "Dépensé vs dépenses
  // prévues". RÈGLE : consolidé (moi + partenaire) en vue partagée SEULEMENT
  // hors filtre catégorie (demande du 2026-09-06) — même garde qu'au site
  // d'affichage du graphique (GraphiqueLignes, plus bas), pour que ce
  // delta reste cohérent avec ce que montre réellement le graphique.
  const donneesReellesPourGraphique =
    affichagePartageEvolution && !enveloppesFiltrees
      ? donneesReellesConsolidees
      : donneesReelles;
  const donneesPrevisionnellesPourGraphique =
    affichagePartageEvolution && !enveloppesFiltrees
      ? donneesPrevisionnellesConsolidees
      : donneesPrevisionnelles;
  const totalReelPeriode = donneesReellesPourGraphique.reduce(
    (acc, v) => acc + v,
    0,
  );
  const totalPrevuPeriode = donneesPrevisionnellesPourGraphique.reduce(
    (acc, v) => acc + v,
    0,
  );

  // Détail par catégorie pour le panel ouvert au tap sur une légende de
  // "Dépensé vs dépenses prévues" (voir detailFiltreType) — mêmes
  // catégories et même période que donneesReelles/donneesPrevisionnelles
  // ci-dessus, dont les totaux affichés dans ce panel doivent rester la
  // somme exacte des lignes affichées. .filter(type !== "Entrée") reproduit
  // volontairement le même filtre que getDepenseMois/getBudgetMois (qui
  // excluent toujours les entrées d'argent de ces totaux, même si une
  // entrée fait partie de la sélection) — sinon une sélection mixte
  // dépenses+entrées ferait apparaître ici une catégorie qui ne contribue
  // en réalité pas au total affiché.
  const detailParCategorieReel = categoriesSelectionneesObj
    .filter((e) => e.type !== "Entrée")
    .map((env) => ({
      id: env.id,
      nom: env.nom,
      couleur: env.couleur,
      montant: moisAffiches.reduce(
        (acc, { mois, annee }) =>
          acc + (getDepenseMois(mois, annee, [env.id]) ?? 0),
        0,
      ),
    }))
    .sort((a, b) => b.montant - a.montant);
  const detailParCategoriePrevu = categoriesSelectionneesObj
    .filter((e) => e.type !== "Entrée")
    .map((env) => ({
      id: env.id,
      nom: env.nom,
      couleur: env.couleur,
      montant: moisAffiches.reduce(
        (acc, { mois, annee }) =>
          acc + (getBudgetMois(mois, annee, [env.id]) ?? 0),
        0,
      ),
    }))
    .sort((a, b) => b.montant - a.montant);
  const deltaPeriodeEuros = totalReelPeriode - totalPrevuPeriode;
  const deltaPeriodePct =
    totalPrevuPeriode > 0
      ? Math.round((deltaPeriodeEuros / totalPrevuPeriode) * 100)
      : totalReelPeriode > 0
        ? 100
        : 0;
  const labels = moisAffiches.map(({ mois }) => MOIS_LABELS_COMPLETS[mois]);
  // Mois + année, pour le panel de détail par catégorie du tiroir "Entrées
  // d'argent et dépenses par catégorie" (labels seuls seraient ambigus dès
  // que la période couvre un changement d'année).
  const labelsAvecAnnee = moisAffiches.map(
    ({ mois, annee }) => `${MOIS_LABELS_COMPLETS[mois]} ${annee}`,
  );

  // Ouvre le panel de détail par mois pour la catégorie `cle` au sein de
  // `series` (l'un des deux tableaux du tiroir "Entrées d'argent et
  // dépenses par catégorie") — ne garde que les mois à montant non nul,
  // l'idée du panel étant justement de repérer les mois où la catégorie
  // était active.
  const ouvrirDetailCategorieParMois = (
    series: SegmentBarreEmpilee[],
    cle: string,
  ) => {
    const s = series.find((x) => x.cle === cle);
    if (!s) return;
    setDetailCategorieParMois({
      label: s.label,
      couleur: s.couleur,
      lignes: labelsAvecAnnee
        .map((moisLabel, i) => ({ moisLabel, montant: s.donnees[i] }))
        .filter((l) => l.montant > 0),
    });
  };

  // Une courbe par entrée d'argent sélectionnée dans le filtre, dans sa
  // propre couleur — alimente "Évolution de tes entrées d'argent",
  // affiché uniquement quand filtreEstEntreesUniquement est vrai.
  const seriesEntrees: SerieEvolution[] = categoriesSelectionneesObj.map(
    (env) => ({
      cle: env.id,
      label: env.nom,
      couleur: env.couleur,
      donnees: moisAffiches.map(({ mois, annee }) =>
        getMontantEnveloppeMois(mois, annee, env.id),
      ),
    }),
  );
  // Symétrique de seriesEntrees ci-dessus — même helper type-agnostic
  // (getMontantEnveloppeMois), seule la source de la sélection change
  // (des catégories de dépenses au lieu d'entrées d'argent). Alimente
  // "Évolution de tes dépenses", affiché uniquement quand
  // filtreEstDepensesUniquement est vrai.
  const seriesDepenses: SerieEvolution[] = categoriesSelectionneesObj.map(
    (env) => ({
      cle: env.id,
      label: env.nom,
      couleur: env.couleur,
      donnees: moisAffiches.map(({ mois, annee }) =>
        getMontantEnveloppeMois(mois, annee, env.id),
      ),
    }),
  );

  // Catégories du tiroir "Par catégorie" : toutes les catégories du type
  // concerné sans filtre actif, ou uniquement celles sélectionnées (déjà
  // intersectées par type) quand un filtre l'est — c'est ce même filtrage
  // qui fait disparaître/redistribuer les segments des graphiques en
  // barres empilées, sans logique supplémentaire côté composant.
  const categoriesDepensesParCategorie =
    categoriesSelectionnees.length > 0
      ? categoriesSelectionneesObj.filter((e) => e.type !== "Entrée")
      : objStore.enveloppes.filter((e) => e.type !== "Entrée");
  const categoriesEntreesParCategorie =
    categoriesSelectionnees.length > 0
      ? categoriesSelectionneesObj.filter((e) => e.type === "Entrée")
      : objStore.enveloppes.filter((e) => e.type === "Entrée");

  // RÈGLE : regroupe par NOM (jamais par id) — même raison que
  // construireRepartitionSurPeriode plus bas (deux catégories actives
  // portant le même nom doivent apparaître comme UNE SEULE série de la
  // barre empilée, montants sommés mois par mois, jamais deux segments
  // dupliqués). `cle` devient le nom normalisé (jamais un id d'enveloppe) —
  // c'est déjà comme ça que fonctionne onTapLegende/ouvrirDetailCategorieParMois
  // ci-dessus, une simple clé de lookup dans `series`, sans autre usage
  // externe. `couleur` : celle de la DERNIÈRE enveloppe rencontrée pour ce
  // nom l'emporte, même convention que construireRepartitionSurPeriode.
  const construireSeriesParCategorie = (
    enveloppes: Enveloppe[],
  ): SegmentBarreEmpilee[] => {
    const parNom = new Map<
      string,
      { nom: string; couleur: string; ids: string[] }
    >();
    enveloppes.forEach((env) => {
      const cleNom = env.nom.trim();
      const existante = parNom.get(cleNom);
      parNom.set(cleNom, {
        nom: cleNom,
        couleur: env.couleur,
        ids: [...(existante?.ids ?? []), env.id],
      });
    });
    return [...parNom.entries()].map(([cle, v]) => ({
      cle,
      label: v.nom,
      couleur: v.couleur,
      donnees: moisAffiches.map(({ mois, annee }) =>
        v.ids.reduce(
          (acc, id) => acc + getMontantEnveloppeMois(mois, annee, id),
          0,
        ),
      ),
    }));
  };

  const seriesDepensesParCategorie: SegmentBarreEmpilee[] =
    construireSeriesParCategorie(categoriesDepensesParCategorie);
  const seriesEntreesParCategorie: SegmentBarreEmpilee[] =
    construireSeriesParCategorie(categoriesEntreesParCategorie);

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
  const disponible = entreesBudgetDuMois(
    objStore.enveloppes,
    ANNEE_ACTUELLE,
    MOIS_ACTUEL,
  ).total;
  const epargne = objStore.epargneMois;
  // RÈGLE À NE JAMAIS CASSER — CONSOLIDÉ (MOI + PARTENAIRE) EN VUE PARTAGÉE :
  // demande explicite du 2026-09-06, formule fournie
  // (epargneMoi+epargnePartenaire)/(revenusMoi+revenusPartenaire)*100 — même
  // sources que revenusCombines/depensesCombinees plus haut et que
  // "Évolution dans le temps" consolidée (getDisponibleMoisPartenaire/
  // getEpargneMoisPartenaire, jamais un second calcul indépendant). Un
  // compte qui n'a pas épargné ne bloque pas le taux : la somme reflète
  // quand même l'épargne de l'autre.
  const tauxEpargne =
    estDansUnEspace && vueActive === "partage"
      ? calculerTauxEpargne(
          epargne + getEpargneMoisPartenaire(MOIS_ACTUEL, ANNEE_ACTUELLE),
          disponible + getDisponibleMoisPartenaire(MOIS_ACTUEL, ANNEE_ACTUELLE),
        )
      : calculerTauxEpargne(epargne, disponible);

  // RÈGLE À NE JAMAIS CASSER — SANTÉ DU COUPLE (refonte du 2026-09-06) :
  // remplace l'ancienne carte "Scores partagés" (MOI/PARTENAIRE/ENSEMBLE, 3
  // chiffres bruts sans analyse) — la vue partagée affiche désormais UN
  // SEUL score global (scoreEnsemble, moyenne 50/50 déjà établie plus haut,
  // jamais repondérée par un montant — cf. RÈGLE à son site de définition)
  // puis 3 critères CONSOLIDÉS propres au couple (épargne/dépenses/équilibre
  // communs), distincts des 5 critères individuels (CRITERES_SCORE) qui
  // n'ont pas de sens à cette échelle.
  //
  // budgetCommun : même ensemble de catégories que contributionsCommunes
  // (fusion par nom ce mois-ci), mais leur BUDGET plutôt que leur dépense —
  // alimente scoreDepensesCommunes via scoreBudget (utils/score.ts), même
  // formule que le critère individuel "budget".
  const budgetCommun = (() => {
    if (vueActive !== "partage" || !estDansUnEspace) return 0;
    const cleNom = (nom: string) => nom.trim().toLowerCase();
    const noms = contributionsCommunes.nomsCommuns;
    const budgetMoi = objStore.enveloppes
      .filter(
        (e) =>
          e.type !== "Entrée" &&
          estCategorieActiveCeMois(e, ANNEE_ACTUELLE, MOIS_ACTUEL) &&
          noms.has(cleNom(e.nom)),
      )
      .reduce((acc, e) => acc + e.budget, 0);
    const budgetPartenaire = enveloppesPartenaireStats
      .filter(
        (e) =>
          e.type !== "Entrée" &&
          estCategorieActiveCeMois(e, ANNEE_ACTUELLE, MOIS_ACTUEL) &&
          noms.has(cleNom(e.nom)),
      )
      .reduce((acc, e) => acc + e.budget, 0);
    return budgetMoi + budgetPartenaire;
  })();
  // Épargne commune : taux d'épargne consolidé (tauxEpargne ci-dessus) mis à
  // l'échelle 0-100 — 20% de taux d'épargne (repère courant de bonne santé
  // financière) atteint déjà 100 pts. Calibrage assumé, distinct de la
  // formule "streak" du critère individuel "epargne" (pas d'historique
  // multi-mois fiable du partenaire pour reproduire un streak couple, cf.
  // RÈGLE sur scorePartenaireApprox).
  const scoreEpargneCommune = Math.max(
    0,
    Math.min(100, Math.round(tauxEpargne * 5)),
  );
  // Dépenses communes : même formule que le critère individuel "budget"
  // (scoreBudget, utils/score.ts), appliquée au total commun plutôt qu'à mes
  // seules catégories.
  const scoreDepensesCommunes =
    vueActive === "partage" && estDansUnEspace
      ? scoreBudget([
          {
            depense: contributionsCommunes.totalCommun,
            budget: budgetCommun,
            type: "Variable",
          },
        ])
      : null;
  // Équilibre : 50/50 = 100 pts, s'éloigne de 2 pts par point de pourcentage
  // d'écart — même seuil "équilibré" (<10 points d'écart) que l'ancien bloc
  // "Équilibre du mois" d'Aperçu (retiré le 2026-09-06), recalculé ici
  // indépendamment (contributionsCommunes n'est jamais partagé entre
  // écrans, cf. RÈGLE à son site de définition).
  const pctMoiCommunPourScore =
    contributionsCommunes.totalCommun > 0
      ? (contributionsCommunes.moiCommun / contributionsCommunes.totalCommun) *
        100
      : null;
  const scoreEquilibre =
    pctMoiCommunPourScore === null
      ? null
      : Math.round(100 - Math.abs(pctMoiCommunPourScore - 50) * 2);

  // "Ce qui pourrait améliorer le score de [Partenaire]" — RÈGLE À NE JAMAIS
  // CASSER : contrairement à leviersScore (Moi), limité à UN SEUL levier
  // heuristique (le pire dépassement de budget Variable ce mois-ci) — je
  // n'ai ni ses objectifs ni son historique multi-mois (cf. RÈGLE sur
  // scorePartenaireApprox), donc les 2 autres types de leviers de
  // leviersScore (rythme d'objectif, volatilité multi-mois) ne sont pas
  // reproductibles de façon fiable pour son compte.
  const leviersPartenaireScore: LevierScore[] = (() => {
    if (vueActive !== "partage" || !estDansUnEspace) return [];
    const pireDepassementPartenaire = enveloppesPartenaireStats
      .filter(
        (e) => e.type === "Variable" && e.budget > 0 && e.depense > e.budget,
      )
      .sort((a, b) => b.depense - b.budget - (a.depense - a.budget))[0];
    if (!pireDepassementPartenaire) return [];
    return [
      {
        texte: `Réduire ${pireDepassementPartenaire.nom} d'environ ${Math.round(pireDepassementPartenaire.depense - pireDepassementPartenaire.budget)}€/mois → pourrait améliorer son score.`,
      },
    ];
  })();

  const deltaTotal = calculerDeltaTotal(depenseMoisActuel, depenseMoisPrec);
  const deltaTotalEuros = depenseMoisActuel - depenseMoisPrec;

  // Regroupé par NOM de catégorie, pas par id — contrairement à
  // categoriesComparees plus bas (qui compare un mois précis à SON mois
  // précédent immédiat, où l'id est fiable), le Top dépenses cumule sur
  // plusieurs mois potentiellement non consécutifs : si une catégorie a été
  // supprimée puis recréée entre-temps (ex: "Loyer" supprimé puis rajouté),
  // ou si deux catégories actives portent le même nom (aucun garde-fou à la
  // création, cf. budget.tsx), l'une et l'autre enveloppe ont des id
  // différents pour le même nom, et regrouper par id les faisait apparaître
  // deux fois dans le classement — sur des rangs distincts — au lieu d'une
  // fois avec son vrai total cumulé (somme des montants). nom/couleur sont
  // ceux du mois le plus RÉCENT rencontré (moisAffiches va du plus ancien
  // au plus récent, donc la dernière écriture gagne) : le classement
  // reflète la couleur actuelle de la catégorie, pas celle d'une ancienne
  // version supprimée.
  const topDepensesParCategorie = new Map<
    string,
    { nom: string; montant: number; couleur: string }
  >();
  moisAffiches.forEach(({ mois, annee }) => {
    // RÈGLE : filtré par estCategorieActiveCeMois pour le mois en cours —
    // cf. RÈGLE ANTI-DOUBLON PAR MOIS_COMPTAGE sur getDepenseMois plus haut.
    const enveloppesMoisBrutes =
      mois === MOIS_ACTUEL && annee === ANNEE_ACTUELLE
        ? objStore.enveloppes.filter((e) =>
            estCategorieActiveCeMois(e, annee, mois),
          )
        : (objStore.historiquesMois.find(
            (s) => s.mois === mois && s.annee === annee,
          )?.enveloppes ?? []);
    // RÈGLE : déduplique par ID (jamais par nom) avant de sommer — protège
    // contre une même ligne comptée deux fois (glitch d'état), sans perdre
    // la dépense d'une VRAIE deuxième catégorie de même nom : c'est la
    // boucle ci-dessous (regroupement par `e.nom` + somme) qui fusionne ce
    // cas-là, jamais cette étape.
    const enveloppesMois =
      mois === MOIS_ACTUEL && annee === ANNEE_ACTUELLE
        ? [...new Map(enveloppesMoisBrutes.map((e) => [e.id, e])).values()]
        : enveloppesMoisBrutes;
    enveloppesMois.forEach((e) => {
      if (e.type === "Entrée" || e.depense <= 0) return;
      // RÈGLE : clé normalisée (espaces superflus retirés) — "Loyer" et
      // "Loyer " (espace de fin, faute de frappe possible à la création,
      // aucune validation d'unicité de nom n'existe dans le formulaire de
      // création) doivent fusionner en une seule ligne, jamais deux.
      const cleNom = e.nom.trim();
      const existante = topDepensesParCategorie.get(cleNom);
      topDepensesParCategorie.set(cleNom, {
        nom: cleNom,
        couleur: e.couleur,
        montant: (existante?.montant ?? 0) + e.depense,
      });
    });
  });
  const topDepensesTri = [...topDepensesParCategorie.values()]
    .sort((a, b) => b.montant - a.montant)
    .slice(0, 3);

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

  // Dépense de chaque catégorie (hors Entrée d'argent) sur les mêmes mois
  // que donneesReelles — utilisé par les insights pour identifier la
  // catégorie qui accélère le plus (règle 1) et celle qui explique le pic
  // de dépense de la période (règle 5).
  const depensesParCategorie = objStore.enveloppes
    .filter((e): e is Enveloppe & { type: "Fixe" | "Variable" } => e.type !== "Entrée")
    .map((env) => ({
      id: env.id,
      nom: env.nom,
      type: env.type,
      parMois: moisAffiches.map(
        ({ mois, annee }) => getDepenseMois(mois, annee, [env.id]) ?? 0,
      ),
    }));

  const insights = genererInsightsPeriode({
    donneesReelles,
    donneesEpargne,
    donneesPrevisionnelles,
    labels,
    nbMoisAvecDonnees,
    // RÈGLE : `nbMois` (clampé), pas `nbMoisSelectionne` (brut) — correctif
    // du 2026-09-13, cf. RÈGLE sur periodeParDefautSelonAnciennete plus
    // haut. `nbMoisSelectionne` peut désormais dépasser
    // LIMITE_MOIS_GRATUIT_STATS pour un compte gratuit (défaut par
    // ancienneté, ou restauration AsyncStorage d'un choix fait pendant une
    // session débloquée par pub) sans que le contenu affiché suive — cette
    // fonction ne doit piloter que le STYLE de formulation d'un bilan sur
    // la fenêtre RÉELLEMENT montrée, jamais une fenêtre plus large que ce
    // que l'utilisateur voit vraiment.
    nbMoisSelectionne: nbMois,
    series,
    depensesParCategorie,
    objectifs: objectifsAvecDelta,
    enveloppes: objStore.enveloppes,
    moisActuel: MOIS_ACTUEL,
    anneeActuelle: ANNEE_ACTUELLE,
    situationsExclues: situationsDejaAffichees(),
  });
  // RÈGLE À NE JAMAIS CASSER : premium/invité voient toujours tout Ton
  // bilan sans pub — même condition que les 4 anciens PremiumVerrou
  // (Vista/Santé/Trophées/Simulateur, cf. leur site d'appel plus bas),
  // désormais partagée par TOUT le contenu de "Ton bilan" via une seule
  // variable, cf. RÈGLE sur tonBilanDebloque plus haut.
  const tonBilanVisible = premium || isGuest || tonBilanDebloque;

  // Comparaison mensuelle par catégorie : uniquement les catégories présentes
  // dans LES DEUX mois comparés (sinon la comparaison n'a pas de sens), plus
  // chère en premier. Séparées en deux groupes : celles qui ont vraiment
  // varié (affichées par défaut) et celles à delta nul (masquées derrière le
  // tiroir "Voir les catégories sans changement").
  const categoriesComparees = objStore.enveloppes
    .filter((env) =>
      snapshotMoisPrecedent?.enveloppes.some((e) => e.id === env.id),
    )
    .map((env) => {
      const depensePrec =
        snapshotMoisPrecedent?.enveloppes.find((e) => e.id === env.id)
          ?.depense ?? 0;
      return { env, depensePrec, delta: env.depense - depensePrec };
    })
    .sort((a, b) => b.env.depense - a.env.depense);
  const categoriesCompareesChangees = categoriesComparees.filter(
    (c) => c.delta !== 0,
  );
  const categoriesCompareesInchangees = categoriesComparees.filter(
    (c) => c.delta === 0,
  );

  // RÈGLE À NE JAMAIS CASSER : Répartition doit refléter TOUTE la période
  // sélectionnée (moisAffiches), exactement comme Top dépenses juste en
  // dessous — jamais le seul mois en cours (objStore.enveloppes seul). Même
  // technique que topDepensesParCategorie : pour chaque mois de la période,
  // mois en cours → objStore.enveloppes, mois archivé → le snapshot
  // correspondant, puis on cumule PAR NOM de catégorie (jamais par id : une
  // catégorie supprimée puis recréée, ou deux catégories actives portant le
  // même nom sans garde-fou à la création, cf. budget.tsx, ont des id
  // différents mais doivent apparaître UNE SEULE FOIS avec leur total
  // sommé). Paramétrée par `moisListe` (plutôt que de fermer sur
  // moisAffiches) pour être réutilisable par le graphique de flux (Partie
  // 3), qui a son propre sélecteur de période indépendant — SEULE fonction
  // qui sait agréger des dépenses/entrées réelles sur une période de mois
  // donnée, ne jamais la dupliquer.
  // RÈGLE À NE JAMAIS CASSER — enveloppesSource/historiquesMoisSource,
  // PARAMÈTRES OPTIONNELS AVEC VALEUR PAR DÉFAUT = objStore.* : ajoutés pour
  // le graphique de flux consolidé (vue partagée, mois courant uniquement),
  // qui doit reconstruire EXACTEMENT la même répartition pour le partenaire
  // (enveloppesPartenaireStats à la place de objStore.enveloppes). Défauts
  // = comportement exact d'avant cet ajout : chaque site d'appel SOLO
  // existant (repartitionDepenses, repartitionEntrees, fluxEntrees,
  // fluxCategories...) continue de fonctionner sans aucune modification.
  // Types acceptés structurellement compatibles avec EnveloppePartenaire
  // (déjà conçu pour ça, cf. RÈGLE sur EnveloppePartenaire dans
  // utils/espacePartage.ts) et SnapshotMoisPartenaire.
  const construireRepartitionSurPeriode = (
    predicat: (e: { type: string; depense: number; nom: string }) => boolean,
    moisListe: { mois: number; annee: number }[],
    enveloppesSource: Enveloppe[] | EnveloppePartenaire[] = objStore.enveloppes,
    historiquesMoisSource: SnapshotMois[] | SnapshotMoisPartenaire[] = objStore.historiquesMois,
  ) => {
    const parCategorie = new Map<string, { nom: string; couleur: string; montant: number }>();
    moisListe.forEach(({ mois, annee }) => {
      // RÈGLE : filtré par estCategorieActiveCeMois pour le mois en cours —
      // cf. RÈGLE ANTI-DOUBLON PAR MOIS_COMPTAGE sur getDepenseMois plus
      // haut (même fichier). Sans ce filtre, une enveloppe taguée pour un
      // AUTRE mois via mois_comptage (ex: entrée d'argent datée le mois
      // précédent mais comptant pour celui-ci) apparaissait à tort dans
      // n'importe quelle période incluant le mois en cours, en plus de son
      // vrai mois — double comptage.
      // RÈGLE : déduplique par ID (jamais par nom ici) — protège contre une
      // même ligne apparaissant deux fois dans le tableau (glitch d'état),
      // sans jeter la dépense d'une VRAIE deuxième catégorie qui porterait
      // le même nom : c'est la boucle ci-dessous (regroupement par
      // `e.nom` + somme) qui se charge de fusionner ces cas-là. Dédupliqué
      // DANS la même branche que le filtre (plutôt que dans un second
      // ternary séparé sur la même condition, comme avant cette
      // généralisation) : historiquesMoisSource peut désormais être un type
      // sans `id` (SnapshotMoisPartenaire, jamais utilisé en pratique sans
      // id puisque ce chemin n'est emprunté qu'au mois courant, mais
      // TypeScript ne peut pas relier deux ternaires indépendants pour le
      // prouver) — regrouper les deux évite toute ambiguïté de type.
      const enveloppesMois =
        mois === MOIS_ACTUEL && annee === ANNEE_ACTUELLE
          ? [
              ...new Map(
                enveloppesSource
                  .filter((e) => estCategorieActiveCeMois(e, annee, mois))
                  .map((e) => [e.id, e]),
              ).values(),
            ]
          : (historiquesMoisSource.find((s) => s.mois === mois && s.annee === annee)
              ?.enveloppes ?? []);
      enveloppesMois.forEach((e) => {
        if (!predicat(e)) return;
        // RÈGLE : clé normalisée, même raison que topDepensesParCategorie
        // plus haut — jamais deux lignes pour "Loyer" et "Loyer ".
        const cleNom = e.nom.trim();
        const existante = parCategorie.get(cleNom);
        parCategorie.set(cleNom, {
          nom: cleNom,
          couleur: e.couleur,
          montant: (existante?.montant ?? 0) + e.depense,
        });
      });
    });
    return [...parCategorie.entries()]
      .map(([cle, v]) => ({ cle, label: v.nom, couleur: v.couleur, montant: v.montant }))
      .sort((a, b) => b.montant - a.montant);
  };

  const repartitionDepenses = construireRepartitionSurPeriode(
    (e) => e.type !== "Entrée" && e.depense > 0,
    moisAffiches,
  );

  // "Budget" est le nom réservé de l'entrée créée par la migration de
  // l'ancien montant scalaire (cf. migration
  // 20260731100100_migrer_budget_vers_entrees.sql) — elle représente le
  // salaire principal, pas une "vraie" entrée d'argent secondaire au même
  // titre que Salaire secondaire/Vinted/remboursements, donc on l'exclut de
  // cette répartition.
  const repartitionEntrees = construireRepartitionSurPeriode(
    (e) => e.type === "Entrée" && e.depense > 0 && e.nom !== "Budget",
    moisAffiches,
  );

  // RÈGLE À NE JAMAIS CASSER : même condition que le rendu du tiroir
  // "Répartition" plus bas — extraite ici pour être réutilisable par
  // ETAPES_STATS (filtrage de l'étape "tiroir-repartition" quand ce tiroir
  // ne s'affiche pas du tout, ex: un compte flambant neuf sans aucune
  // dépense/entrée). Sans ce filtrage, toutesCiblesActivesMesurees dans
  // TutorielOverlay resterait bloqué en attendant une cible qui ne sera
  // jamais montée, et AUCUNE étape du tutoriel Stats — pas seulement
  // celle-ci — ne pourrait jamais s'afficher.
  const repartitionTiroirVisible =
    !filtreEstEntreesUniquement &&
    (repartitionDepenses.length > 0 ||
      repartitionEntrees.length > 0 ||
      topDepensesTri.length > 0);

  // === "Flux de votre argent" (Ton bilan, Partie 3) ===========================
  // RÈGLE À NE JAMAIS CASSER : ne montre QUE des montants réels déjà
  // enregistrés (enveloppe.depense, épargne réelle), jamais un budget prévu
  // ni une projection — voir aussi la RÈGLE en tête de GraphiqueFlux.tsx.
  // Graphique réservé (cf. TonBilanVerrou dans le JSX, verrou consolidé
  // "Ton bilan" depuis le 2026-09-12) : pas de palier gratuit ici,
  // contrairement aux autres tiroirs de Stats.
  const [nbMoisFlux, setNbMoisFlux] = useState(1);
  // RÈGLE À NE JAMAIS CASSER — VERROUILLÉ AU MOIS EN COURS EN VUE PARTAGÉE
  // (décision explicite de l'utilisateur) : reproduire le détail par
  // transaction nommée du partenaire (Cas 1, colonne Destination) sur des
  // mois ARCHIVÉS demanderait un id d'enveloppe exploitable dans son
  // historique (SnapshotMoisPartenaire n'en a pas, cf. RÈGLE sur ce type
  // dans utils/espacePartage.ts) — un chantier à part, écarté. Ignore donc
  // `nbMoisFlux` (même s'il a été changé avant de passer en vue partagée)
  // tant que affichagePartageFlux est vrai — jamais besoin de resynchroniser
  // le state du sélecteur lui-même, qui reste simplement masqué (cf. JSX).
  const affichagePartageFlux = estDansUnEspace && vueActive === "partage";
  const moisFluxAffiches = affichagePartageFlux
    ? construireMoisPeriode(1, MOIS_ACTUEL, ANNEE_ACTUELLE)
    : construireMoisPeriode(nbMoisFlux, MOIS_ACTUEL, ANNEE_ACTUELLE);
  // Bornes calendaires strictes de la période affichée — 1er jour du premier
  // mois de moisFluxAffiches au dernier jour du dernier (toujours le mois en
  // cours, cf. construireMoisPeriode). Sert UNIQUEMENT à borner les
  // transactions BRUTES d'une catégorie Variable persistante dans
  // transactionsGroupeesParNomFlux plus bas — cf. RÈGLE à ce site d'appel
  // pour pourquoi ids.has(t.enveloppeId) seul ne suffit pas.
  const debutPeriodeFlux = new Date(
    moisFluxAffiches[0].annee,
    moisFluxAffiches[0].mois,
    1,
  );
  const finPeriodeFlux = new Date(
    moisFluxAffiches[moisFluxAffiches.length - 1].annee,
    moisFluxAffiches[moisFluxAffiches.length - 1].mois + 1,
    0,
    23,
    59,
    59,
    999,
  );
  // Mois immédiatement avant le premier mois de moisFluxAffiches (Date gère
  // nativement le débordement d'année en passant un index de mois négatif),
  // point de départ de la "période précédente de même durée" utilisée pour
  // la variation affichée au tap sur un flux, et de la fenêtre de calcul
  // des versements d'objectifs sur la période (colonne 3).
  const finPeriodePrecedenteFlux = new Date(
    moisFluxAffiches[0].annee,
    moisFluxAffiches[0].mois - 1,
    1,
  );
  const moisFluxPrecedents = construireMoisPeriode(
    nbMoisFlux,
    finPeriodePrecedenteFlux.getMonth(),
    finPeriodePrecedenteFlux.getFullYear(),
  );
  // Colonne 1 : Entrées d'argent par catégorie (même exclusion de "Budget"
  // que repartitionEntrees plus haut).
  const fluxEntrees = construireRepartitionSurPeriode(
    (e) => e.type === "Entrée" && e.depense > 0 && e.nom !== "Budget",
    moisFluxAffiches,
  );
  const fluxNoeudsEntrees: NoeudFlux[] = fluxEntrees.map((e) => ({
    id: e.cle,
    label: e.label,
    couleur: e.couleur,
    montant: e.montant,
  }));
  // Catégories de dépense réelles (Fixe/Variable) sur la période — toutes,
  // pour le calcul de "Liquidités" plus bas ; seules celles du Cas 1
  // (cf. RÈGLE ci-dessous) obtiennent une barre en colonne 2.
  const fluxCategories = construireRepartitionSurPeriode(
    (e) => e.type !== "Entrée" && e.depense > 0,
    moisFluxAffiches,
  );
  // RÈGLE À NE JAMAIS CASSER — ÉQUIVALENT PARTENAIRE, MOIS EN COURS
  // UNIQUEMENT (cf. RÈGLE sur affichagePartageFlux plus haut) : mêmes
  // fonctions généralisées que "moi" ci-dessus, jamais un pipeline
  // dupliqué — seule la source change (enveloppesPartenaireStats a de
  // vrais ids, exploitables ici puisqu'on ne regarde jamais l'archive du
  // partenaire pour ce graphique). `historiquesMoisSource` volontairement
  // omis (reste objStore.historiquesMois par défaut) : sans effet ici
  // puisque moisFluxAffiches ne contient que le mois courant en vue
  // partagée, qui n'est jamais archivé.
  const fluxEntreesPartenaire = affichagePartageFlux
    ? construireRepartitionSurPeriode(
        (e) => e.type === "Entrée" && e.depense > 0 && e.nom !== "Budget",
        moisFluxAffiches,
        enveloppesPartenaireStats,
      )
    : [];
  const fluxNoeudsEntreesPartenaire: NoeudFlux[] = fluxEntreesPartenaire.map(
    (e) => ({
      id: e.cle,
      label: e.label,
      couleur: e.couleur,
      montant: e.montant,
    }),
  );
  const fluxCategoriesPartenaire = affichagePartageFlux
    ? construireRepartitionSurPeriode(
        (e) => e.type !== "Entrée" && e.depense > 0,
        moisFluxAffiches,
        enveloppesPartenaireStats,
      )
    : [];
  const fluxCategoriesPrecedentes = construireRepartitionSurPeriode(
    (e) => e.type !== "Entrée" && e.depense > 0,
    moisFluxPrecedents,
  );
  const fluxVariationParCategorie: Record<string, number | null> = {};
  fluxCategories.forEach((c) => {
    const precedent = fluxCategoriesPrecedentes.find((p) => p.cle === c.cle);
    fluxVariationParCategorie[c.cle] =
      precedent && precedent.montant > 0
        ? ((c.montant - precedent.montant) / precedent.montant) * 100
        : null;
  });

  // Une catégorie recréée sous le même nom (après suppression) a un nouvel
  // id à chaque fois — rassemble tous les id ayant jamais porté ce nom
  // (même principe que construireRepartitionSurPeriode) pour ne rater
  // aucune transaction historique.
  //
  // RÈGLE À NE JAMAIS CASSER : comparaison par nom TRIMMÉ des deux côtés —
  // `nom` reçu ici est déjà trimmé (cf. cleNom dans
  // construireRepartitionSurPeriode), donc comparer contre `e.nom` brut
  // échouait silencieusement dès qu'une enveloppe portait un espace
  // superflu en base (legacy ou faute de frappe à la création) : `ids`
  // restait vide, `transactionsGroupeesParNomFlux` ne trouvait aucune
  // transaction, et la catégorie basculait à tort en Cas 2 (aucune
  // sous-catégorie affichée) malgré des transactions nommées bien réelles.
  //
  // RÈGLE À NE JAMAIS CASSER — CÔTÉ VIVANT FILTRÉ PAR MOIS_COMPTAGE : le
  // côté archivé (boucle moisFluxAffiches ci-dessous) est déjà correctement
  // scopé par construction (un id de snapshot n'existe que dans LE snapshot
  // du mois où il a été archivé) — mais objStore.enveloppes (côté vivant)
  // n'est PAS scopé au mois en cours, il contient aussi des enveloppes
  // taguées pour un AUTRE mois via mois_comptage tant qu'elles n'ont pas
  // été archivées. Sans estCategorieActiveCeMois ici, une telle enveloppe
  // (ex: entrée d'argent datée le mois précédent mais comptant pour
  // celui-ci) ajoutait son id inconditionnellement, et ses transactions se
  // retrouvaient doublées entre son vrai mois et n'importe quel autre mois
  // affiché.
  // RÈGLE À NE JAMAIS CASSER — enveloppesSource/historiquesMoisSource,
  // MÊME CONVENTION QUE construireRepartitionSurPeriode PLUS HAUT : ajoutés
  // pour le graphique de flux consolidé (vue partagée). `historiquesMoisSource`
  // n'est PAS unioné avec un type partenaire : le flux consolidé se
  // limite au mois en cours (décision explicite de l'utilisateur, cf.
  // RÈGLE sur moisFluxAffichesEffectifs plus bas) — l'appel côté partenaire
  // passe donc toujours `[]` ici (aucune recherche d'archive n'est
  // pertinente), jamais des données SnapshotMoisPartenaire (qui n'ont pas
  // d'id d'enveloppe exploitable, cf. RÈGLE sur ce type dans
  // utils/espacePartage.ts).
  const idsPourNomCategorieFlux = (
    nom: string,
    enveloppesSource: Enveloppe[] | EnveloppePartenaire[] = objStore.enveloppes,
    historiquesMoisSource: SnapshotMois[] = objStore.historiquesMois,
  ): Set<string> => {
    const ids = new Set<string>();
    enveloppesSource.forEach((e) => {
      if (
        e.nom.trim() === nom &&
        estCategorieActiveCeMois(e, ANNEE_ACTUELLE, MOIS_ACTUEL)
      ) {
        ids.add(e.id);
      }
    });
    moisFluxAffiches.forEach(({ mois, annee }) => {
      historiquesMoisSource
        .find((s) => s.mois === mois && s.annee === annee)
        ?.enveloppes.forEach((e) => {
          if (e.nom.trim() === nom) ids.add(e.id);
        });
    });
    return ids;
  };
  // RÈGLE À NE JAMAIS CASSER — DEUX FILTRES COMPLÉMENTAIRES, JAMAIS UN SEUL :
  // bug confirmé — `ids.has(t.enveloppeId)` SEUL ne suffit PAS ici, contrairement
  // à ce qu'un commentaire précédent affirmait. Raison : une catégorie
  // Variable (Alimentation, Loisirs...) est un enveloppe PERSISTANTE — le
  // même id vit indéfiniment d'un mois sur l'autre (seul `depense` est remis
  // à 0 au rollover, cf. archiverMoisActuelInterne dans app/store.ts),
  // pendant qu'objStore.transactions contient TOUT l'historique de
  // transactions jamais filtré par date (cf. chargerTransactions). Résultat :
  // `ids` (scopé par mois_comptage de l'ENVELOPPE) inclut le même id
  // persistant pour n'importe quelle période affichée, mais
  // `ids.has(t.enveloppeId)` ne dit RIEN sur le MOIS de la transaction
  // elle-même — une dépense de juillet liée à "Loisirs" réapparaissait dans
  // le graphique de flux d'août (bug confirmé : "Voyage 240€" en juillet
  // affiché comme dépense du mois d'août alors que Loisirs n'avait que 20€
  // ce mois-ci). D'où le second filtre par date ci-dessous, sur
  // [debutPeriodeFlux, finPeriodeFlux] (bornes calendaires de
  // moisFluxAffiches, cf. site de définition plus haut).
  //
  // Ceci NE CONTREDIT PAS la RÈGLE "mois_comptage, jamais date brute" de
  // idsEnveloppesPeriodeFlux/transactionsPeriodeFlux plus bas (qui reste
  // correcte à SON site d'appel) : cette fonction-ci n'est appelée QUE pour
  // des catégories `type === "Variable"` (cf. classificationsFlux plus bas),
  // JAMAIS pour une catégorie "Entrée" — le scénario "date ≠ mois_comptage"
  // (ex: salaire daté fin de mois précédent mais compté pour le suivant),
  // qui justifiait de ne PAS filtrer par date brute côté Entrée, ne peut
  // structurellement pas se produire ici. Le filtre de date est donc un
  // COMPLÉMENT nécessaire à `ids`, jamais un remplacement : `ids` reste
  // indispensable pour exclure les transactions d'une AUTRE catégorie (et
  // agréger les id d'une catégorie recréée sous le même nom, cf. RÈGLE plus
  // haut) — le filtre de date exclut ensuite ce qui reste mais n'appartient
  // pas au bon mois.
  // RÈGLE : mêmes paramètres optionnels que idsPourNomCategorieFlux
  // ci-dessus (mêmes valeurs par défaut, même raison pour
  // historiquesMoisSource resté non-unioné) — transactionsSource accepte en
  // plus TransactionPartenaire[] (structurellement compatible avec
  // Transaction pour les champs lus ici : id/nom/montant/enveloppeId/date).
  const transactionsGroupeesParNomFlux = (
    nomCategorie: string,
    enveloppesSource: Enveloppe[] | EnveloppePartenaire[] = objStore.enveloppes,
    historiquesMoisSource: SnapshotMois[] = objStore.historiquesMois,
    transactionsSource: Transaction[] | TransactionPartenaire[] = objStore.transactions,
  ) => {
    const ids = idsPourNomCategorieFlux(
      nomCategorie,
      enveloppesSource,
      historiquesMoisSource,
    );
    const parNom = new Map<string, number>();
    transactionsSource
      .filter((t) => ids.has(t.enveloppeId))
      .filter((t) => {
        const d = new Date(t.date);
        return d >= debutPeriodeFlux && d <= finPeriodeFlux;
      })
      .forEach((t) => {
        // RÈGLE : une transaction sans nom précis (vide/blanc) rejoint le
        // groupe "Non précisé" plutôt que de créer un nœud sans label.
        const cle = t.nom.trim() === "" ? "Non précisé" : t.nom;
        parNom.set(cle, (parNom.get(cle) ?? 0) + t.montant);
      });
    return [...parNom.entries()]
      .map(([nom, montant]) => ({ nom, montant }))
      .filter((x) => x.montant > 0);
  };

  // RÈGLE À NE JAMAIS CASSER — 4 CAS DE FLUX, RECALCULÉS À CHAQUE RENDU
  // (cf. RÈGLE en tête de GraphiqueFlux.tsx) : cette classification lit
  // `objStore.transactions` (via transactionsGroupeesParNomFlux) et
  // `fluxCategories` directement à chaque rendu du composant, jamais
  // mémoïsée avec des dépendances figées — dès qu'une transaction nommée
  // est ajoutée/renommée/supprimée, la structure des colonnes doit
  // basculer automatiquement au rendu suivant, sans action de
  // l'utilisateur ni recalcul manuel.
  // Cas 1 — catégorie Variable avec AU MOINS 1 transaction nommée sur la
  // période → barre en colonne 2, détail en colonne 3 (un nœud par nom de
  // transaction, regroupé ; une transaction sans nom rejoint "Non
  // précisé"). Ex: "Courses" avec une seule transaction "Super U" bascule
  // en Cas 1 — colonne 2 "Courses", colonne 3 "Super U". Si la somme des
  // transactions nommées est inférieure au total réel de la catégorie
  // (dépenses non détaillées), l'écart devient un nœud "Autre" en colonne
  // 3, TOUJOURS en dernière position de son groupe, jamais affiché si
  // l'écart est nul/négligeable.
  // Cas 2 — catégorie Fixe, ou Variable SANS AUCUNE transaction nommée sur
  // la période → AUCUNE barre en colonne 2, le flux passe directement
  // colonne 1 → colonne 3 (cf. idsNoeudsDirects au site d'appel), colonne
  // 3 affichant le nom réel de la catégorie.
  // Cas 3/4 — "Liquidités"/"Épargne", calculées globalement ci-dessous,
  // jamais par catégorie — flux direct colonne 1 → colonne 3, exactement
  // comme le Cas 2.
  //
  // RÈGLE À NE JAMAIS CASSER : un même nom de transaction ne doit
  // apparaître qu'une seule fois en colonne 3 — s'il ressort sous deux
  // catégories Cas 1 différentes, fusionner en un seul nœud alimenté par
  // plusieurs liens (noeudsDestinationParLabel ci-dessous). "Autre" n'est
  // JAMAIS fusionné entre catégories : chaque catégorie a son propre écart
  // (id scindé par cat.cle), seuls les vrais noms de transactions se
  // fusionnent.
  const classificationsFlux = fluxCategories.map((cat) => {
    // RÈGLE : même comparaison par nom trimmé qu'idsPourNomCategorieFlux
    // ci-dessus — cat.label est déjà trimmé, jamais e.nom brut.
    const type = objStore.enveloppes.find((e) => e.nom.trim() === cat.label)?.type;
    const brut =
      type === "Variable"
        ? transactionsGroupeesParNomFlux(cat.label).sort((a, b) => b.montant - a.montant)
        : [];
    if (brut.length < 1) {
      return { cas: 2 as const, cat };
    }
    const sommeDetail = brut.reduce((acc, d) => acc + d.montant, 0);
    const ecart = cat.montant - sommeDetail;
    const detail = ecart > 0.005 ? [...brut, { nom: "Autre", montant: ecart }] : brut;
    return { cas: 1 as const, cat, detail };
  });
  const fluxNoeudsCategories: NoeudFlux[] = classificationsFlux
    .filter((c) => c.cas === 1)
    .map(({ cat }) => ({ id: cat.cle, label: cat.label, couleur: cat.couleur, montant: cat.montant }));

  // RÈGLE À NE JAMAIS CASSER — CLASSIFICATION PARTENAIRE, MÊME LOGIQUE QUE
  // "MOI" CI-DESSUS, JAMAIS UN PIPELINE DIFFÉRENT : cf. RÈGLE sur
  // fluxCategoriesPartenaire plus haut — mois en cours uniquement, ids
  // réels via enveloppesPartenaireStats/transactionsPartenaireStats.
  const classificationsFluxPartenaire = affichagePartageFlux
    ? fluxCategoriesPartenaire.map((cat) => {
        const type = enveloppesPartenaireStats.find(
          (e) => e.nom.trim() === cat.label,
        )?.type;
        const brut =
          type === "Variable"
            ? transactionsGroupeesParNomFlux(
                cat.label,
                enveloppesPartenaireStats,
                [],
                transactionsPartenaireStats,
              ).sort((a, b) => b.montant - a.montant)
            : [];
        if (brut.length < 1) {
          return { cas: 2 as const, cat };
        }
        const sommeDetail = brut.reduce((acc, d) => acc + d.montant, 0);
        const ecart = cat.montant - sommeDetail;
        const detail =
          ecart > 0.005 ? [...brut, { nom: "Autre", montant: ecart }] : brut;
        return { cas: 1 as const, cat, detail };
      })
    : [];
  const fluxNoeudsCategoriesPartenaire: NoeudFlux[] = classificationsFluxPartenaire
    .filter((c) => c.cas === 1)
    .map(({ cat }) => ({ id: cat.cle, label: cat.label, couleur: cat.couleur, montant: cat.montant }));
  // RÈGLE À NE JAMAIS CASSER — BADGE Moi/Partenaire/Commun, DEMANDE
  // EXPLICITE : NoeudFlux (GraphiqueFlux.tsx) n'a aucun champ dédié pour un
  // badge — encodé en suffixe de `label` plutôt que de modifier le
  // composant (qui doit rester EXACTEMENT inchangé, cf. RÈGLE en tête de
  // GraphiqueFlux.tsx). Fusion par id (nom) : un id présent des deux côtés
  // devient "Commun", jamais moitié affiché sous un badge moitié sous
  // l'autre.
  const fluxNoeudsCategoriesFusionnees: NoeudFlux[] = affichagePartageFlux
    ? (() => {
        const nomsMoi = new Set(fluxNoeudsCategories.map((n) => n.id));
        const nomsPartenaire = new Set(
          fluxNoeudsCategoriesPartenaire.map((n) => n.id),
        );
        const parId = new Map<string, NoeudFlux>();
        [...fluxNoeudsCategories, ...fluxNoeudsCategoriesPartenaire].forEach(
          (n) => {
            const existant = parId.get(n.id);
            parId.set(
              n.id,
              existant
                ? { ...existant, montant: existant.montant + n.montant }
                : n,
            );
          },
        );
        return [...parId.values()].map((n) => {
          const badge =
            nomsMoi.has(n.id) && nomsPartenaire.has(n.id)
              ? "Commun"
              : nomsPartenaire.has(n.id)
                ? membrePartenaire?.prenom || "Partenaire"
                : "Moi";
          return { ...n, label: `${n.label} · ${badge}` };
        });
      })()
    : fluxNoeudsCategories;

  // RÈGLE À NE JAMAIS CASSER : "Liquidités" = totalEntrées - totalDépensé -
  // totalÉpargné (TOUTE dépense de catégorie, Cas 1 ET Cas 2 confondus —
  // jamais seulement les catégories visibles en colonne 2), JAMAIS
  // resteEstime ni totalDepensePrevue — uniquement des montants déjà
  // réalisés. C'est l'argent disponible EN CE MOMENT (déjà reçu, pas encore
  // affecté à une catégorie ni épargné), pas une projection de fin de mois.
  // "Épargne" = argent réellement mis de côté sur la période
  // (getEpargneMois, déjà défini plus haut : epargneMois du store pour le
  // mois en cours, snapshot.epargne pour les mois archivés) — apparaît en
  // colonne 3, alimentée directement depuis la colonne 1 (Entrées) comme
  // "Liquidités", jamais via une catégorie.
  const ID_NOEUD_LIQUIDITES = "liquidites";
  const ID_NOEUD_EPARGNE = "epargne";
  const totalEntreesFlux = fluxNoeudsEntrees.reduce((acc, n) => acc + n.montant, 0);
  const totalDepenseCategoriesFlux = fluxCategories.reduce((acc, c) => acc + c.montant, 0);
  const totalEpargneFlux = moisFluxAffiches.reduce(
    (acc, { mois, annee }) => acc + (getEpargneMois(mois, annee) ?? 0),
    0,
  );
  const totalLiquiditesFlux = Math.max(
    0,
    totalEntreesFlux - totalDepenseCategoriesFlux - totalEpargneFlux,
  );
  // RÈGLE À NE JAMAIS CASSER — LIQUIDITÉS CONSOLIDÉES, FORMULE DISTINCTE ET
  // PLUS SIMPLE, DEMANDE EXPLICITE : "entrées combinées - dépenses
  // combinées", JAMAIS moins l'épargne (contrairement à totalLiquiditesFlux
  // ci-dessus, la version solo) — aucun nœud "Épargne" dans la vue
  // consolidée non plus (cf. RÈGLE au site d'assemblage plus bas). Les deux
  // formules n'ont pas besoin de coexister dans un seul calcul : la vue
  // solo garde exactement son comportement actuel, la vue consolidée a la
  // sienne, propre.
  const totalEntreesFluxPartenaire = fluxEntreesPartenaire.reduce(
    (acc, e) => acc + e.montant,
    0,
  );
  const totalDepenseCategoriesFluxPartenaire = fluxCategoriesPartenaire.reduce(
    (acc, c) => acc + c.montant,
    0,
  );
  const totalLiquiditesFluxConsolide = Math.max(
    0,
    totalEntreesFlux +
      totalEntreesFluxPartenaire -
      (totalDepenseCategoriesFlux + totalDepenseCategoriesFluxPartenaire),
  );

  // RÈGLE À NE JAMAIS CASSER — MÊME PRINCIPE QUE idsPourNomCategorieFlux
  // PLUS HAUT, SANS FILTRE DE NOM : ids de TOUTES les enveloppes
  // appartenant à moisFluxAffiches (vivante ce mois-ci via
  // estCategorieActiveCeMois, ou archivée dans un des snapshots de la
  // période) — sert à scoper transactionsPeriodeFlux par mois_comptage de
  // l'enveloppe liée, jamais par la date brute de la transaction (même
  // RÈGLE que transactionsGroupeesParNomFlux).
  const idsEnveloppesPeriodeFlux = (): Set<string> => {
    const ids = new Set<string>();
    objStore.enveloppes.forEach((e) => {
      if (estCategorieActiveCeMois(e, ANNEE_ACTUELLE, MOIS_ACTUEL)) ids.add(e.id);
    });
    moisFluxAffiches.forEach(({ mois, annee }) => {
      objStore.historiquesMois
        .find((s) => s.mois === mois && s.annee === annee)
        ?.enveloppes.forEach((e) => ids.add(e.id));
    });
    return ids;
  };

  // "Ce que Vista a remarqué" (onglet Vista) : analyse automatique du
  // graphique de flux ci-dessus, adaptée à la période choisie (nbMoisFlux) —
  // remplace l'ancien contenu "tout historique" de cette carte, cf. RÈGLE
  // EXCEPTION DE ZONE en tête de analyserFluxFinancier (utils/bilanVista.ts).
  // RÈGLE : scopé par mois_comptage de l'enveloppe liée
  // (idsEnveloppesPeriodeFlux), pas par date brute de transaction — même
  // risque de doublon sinon que sur transactionsGroupeesParNomFlux plus
  // haut. La détection de "concentration sur une seule journée" dans
  // analyserFluxFinancier utilise ensuite la date PROPRE de chaque
  // transaction déjà correctement scopée — volontaire, elle mesure une
  // répartition intra-période, pas une appartenance à un mois.
  const transactionsPeriodeFlux = objStore.transactions.filter((t) =>
    idsEnveloppesPeriodeFlux().has(t.enveloppeId),
  );
  // RÈGLE À NE JAMAIS CASSER : `fluxCategories.cle` est une clé de
  // regroupement par NOM (peut fusionner plusieurs enveloppes recréées sous
  // le même nom au fil des mois, cf. construireRepartitionSurPeriode plus
  // haut) — jamais un vrai id d'enveloppe. analyserFluxFinancier a besoin du
  // VRAI id de l'enveloppe ACTIVE correspondante aujourd'hui pour
  // validerConseil (sinon warning en boucle, catégorie jamais retrouvée) :
  // résolu ici par nom trimmé, `undefined` si plus aucune enveloppe active
  // ne porte ce nom.
  const categoriesParMontantFlux = fluxCategories.map((c) => {
    const enveloppeActuelle = objStore.enveloppes.find((e) => e.nom.trim() === c.label);
    return {
      cle: c.cle,
      label: c.label,
      montant: c.montant,
      categorieId: enveloppeActuelle?.id,
      type: enveloppeActuelle?.type,
    };
  });
  const analyseFlux = analyserFluxFinancier({
    entreesTotal: totalEntreesFlux,
    depensesTotal: totalDepenseCategoriesFlux,
    liquidites: totalLiquiditesFlux,
    epargne: totalEpargneFlux,
    categoriesParMontant: categoriesParMontantFlux,
    historiquesMois: objStore.historiquesMois,
    nbMoisSelectionne: nbMoisFlux,
    transactions: transactionsPeriodeFlux,
    enveloppes: objStore.enveloppes,
    moisActuel: MOIS_ACTUEL,
    anneeActuelle: ANNEE_ACTUELLE,
  });

  // RÈGLE À NE JAMAIS CASSER — TRI DÉCROISSANT STRICT PAR GROUPE : la
  // colonne 3 est triée par montant décroissant, mais un groupe (le détail
  // d'une catégorie Cas 1, une catégorie Cas 2, "Liquidités" ou "Épargne")
  // ne doit jamais être éclaté — c'est le TOTAL du groupe qui est comparé
  // aux autres pour décider de sa position, ses membres restant consécutifs
  // et déjà triés entre eux (cf. `detail` plus haut, "Autre" toujours en
  // dernière position puisque toujours ajouté en fin de tableau). On
  // construit des "blocs" (sortKey = total du groupe, ids = membres déjà
  // dans l'ordre voulu), triés une seule fois à la fin — jamais un tri
  // direct de fluxNoeudsDestination, qui casserait le regroupement (cf.
  // RÈGLE dans GraphiqueFlux.tsx : "ordre fourni par l'appelant respecté").
  const fluxLiensVersDestination: LienFlux[] = [];
  const noeudsDestinationParLabel = new Map<string, NoeudFlux>();
  const noeudsAutresParId = new Map<string, NoeudFlux>();
  const noeudsDirectsCategoriesParId = new Map<string, NoeudFlux>();
  const idsCategoriesDirectes: string[] = [];
  const blocsDestination: { sortKey: number; ids: string[] }[] = [];
  classificationsFlux.forEach((classe) => {
    const { cat } = classe;
    if (classe.cas === 1) {
      const idsNouveaux: string[] = [];
      classe.detail.forEach((d) => {
        if (d.nom === "Autre") {
          const idNoeud = `${cat.cle}__autre`;
          noeudsAutresParId.set(idNoeud, {
            id: idNoeud,
            label: "Autre",
            couleur: cat.couleur,
            montant: d.montant,
            groupeId: cat.cle,
          });
          fluxLiensVersDestination.push({ sourceId: cat.cle, destId: idNoeud, montant: d.montant });
          idsNouveaux.push(idNoeud);
          return;
        }
        const existant = noeudsDestinationParLabel.get(d.nom);
        if (existant) {
          noeudsDestinationParLabel.set(d.nom, {
            ...existant,
            montant: existant.montant + d.montant,
          });
          fluxLiensVersDestination.push({ sourceId: cat.cle, destId: existant.id, montant: d.montant });
        } else {
          const idNoeud = `transaction__${d.nom}`;
          noeudsDestinationParLabel.set(d.nom, {
            id: idNoeud,
            label: d.nom,
            couleur: cat.couleur,
            montant: d.montant,
            groupeId: cat.cle,
          });
          fluxLiensVersDestination.push({ sourceId: cat.cle, destId: idNoeud, montant: d.montant });
          idsNouveaux.push(idNoeud);
        }
      });
      // Si toutes les transactions de cette catégorie fusionnent dans des
      // nœuds déjà créés par une catégorie précédente, aucun nouveau bloc à
      // positionner ici : ces nœuds restent à la position de leur bloc
      // d'origine.
      if (idsNouveaux.length > 0) {
        blocsDestination.push({ sortKey: cat.montant, ids: idsNouveaux });
      }
      return;
    }
    // Cas 2 : flux direct colonne 1 → colonne 3, cf. RÈGLE plus haut —
    // aucune barre en colonne 2 pour cette catégorie.
    idsCategoriesDirectes.push(cat.cle);
    noeudsDirectsCategoriesParId.set(cat.cle, {
      id: cat.cle,
      label: cat.label,
      couleur: cat.couleur,
      montant: cat.montant,
    });
    blocsDestination.push({ sortKey: cat.montant, ids: [cat.cle] });
  });
  if (totalLiquiditesFlux > 0) {
    blocsDestination.push({ sortKey: totalLiquiditesFlux, ids: [ID_NOEUD_LIQUIDITES] });
  }
  if (totalEpargneFlux > 0) {
    blocsDestination.push({ sortKey: totalEpargneFlux, ids: [ID_NOEUD_EPARGNE] });
  }
  const noeudsDestinationParId = new Map<string, NoeudFlux>([
    ...[...noeudsDestinationParLabel.values()].map((n): [string, NoeudFlux] => [n.id, n]),
    ...noeudsAutresParId,
    ...noeudsDirectsCategoriesParId,
    ...(totalLiquiditesFlux > 0
      ? ([
          [
            ID_NOEUD_LIQUIDITES,
            { id: ID_NOEUD_LIQUIDITES, label: "Liquidités", couleur: C.texteMuted, montant: totalLiquiditesFlux },
          ],
        ] as [string, NoeudFlux][])
      : []),
    ...(totalEpargneFlux > 0
      ? ([
          [
            ID_NOEUD_EPARGNE,
            { id: ID_NOEUD_EPARGNE, label: "Épargne", couleur: C.vert, montant: totalEpargneFlux },
          ],
        ] as [string, NoeudFlux][])
      : []),
  ]);
  const fluxNoeudsDestination: NoeudFlux[] = [...blocsDestination]
    .sort((a, b) => b.sortKey - a.sortKey)
    .flatMap((bloc) => bloc.ids.map((id) => noeudsDestinationParId.get(id)).filter((n): n is NoeudFlux => !!n));

  // RÈGLE À NE JAMAIS CASSER — ÉQUIVALENT PARTENAIRE : même boucle
  // EXACTEMENT que celle qui construit fluxLiensVersDestination/
  // noeudsDestinationParLabel/noeudsAutresParId/
  // noeudsDirectsCategoriesParId/idsCategoriesDirectes/blocsDestination
  // ci-dessus, jamais une variante — seules les variables cibles changent
  // (suffixées Partenaire), rien de la boucle "moi" n'est touché. Les ids
  // "Autre" sont préfixés `partenaire:` : ils ne doivent JAMAIS fusionner
  // avec les miens (cf. RÈGLE "Autre n'est jamais fusionné entre
  // catégories" dans GraphiqueFlux.tsx, qui s'étend ici entre comptes) —
  // contrairement aux ids de transaction nommée/catégorie directe
  // (volontairement PAS préfixés), qui doivent au contraire fusionner par
  // construction avec ceux de "moi" s'ils portent le même nom.
  const fluxLiensVersDestinationPartenaire: LienFlux[] = [];
  const noeudsDestinationParLabelPartenaire = new Map<string, NoeudFlux>();
  const noeudsAutresParIdPartenaire = new Map<string, NoeudFlux>();
  const noeudsDirectsCategoriesParIdPartenaire = new Map<string, NoeudFlux>();
  const idsCategoriesDirectesPartenaire: string[] = [];
  const blocsDestinationPartenaire: { sortKey: number; ids: string[] }[] = [];
  if (affichagePartageFlux) {
    classificationsFluxPartenaire.forEach((classe) => {
      const { cat } = classe;
      if (classe.cas === 1) {
        const idsNouveaux: string[] = [];
        classe.detail.forEach((d) => {
          if (d.nom === "Autre") {
            const idNoeud = `partenaire:${cat.cle}__autre`;
            noeudsAutresParIdPartenaire.set(idNoeud, {
              id: idNoeud,
              label: "Autre",
              couleur: cat.couleur,
              montant: d.montant,
              groupeId: cat.cle,
            });
            fluxLiensVersDestinationPartenaire.push({
              sourceId: cat.cle,
              destId: idNoeud,
              montant: d.montant,
            });
            idsNouveaux.push(idNoeud);
            return;
          }
          const existant = noeudsDestinationParLabelPartenaire.get(d.nom);
          if (existant) {
            noeudsDestinationParLabelPartenaire.set(d.nom, {
              ...existant,
              montant: existant.montant + d.montant,
            });
            fluxLiensVersDestinationPartenaire.push({
              sourceId: cat.cle,
              destId: existant.id,
              montant: d.montant,
            });
          } else {
            const idNoeud = `transaction__${d.nom}`;
            noeudsDestinationParLabelPartenaire.set(d.nom, {
              id: idNoeud,
              label: d.nom,
              couleur: cat.couleur,
              montant: d.montant,
              groupeId: cat.cle,
            });
            fluxLiensVersDestinationPartenaire.push({
              sourceId: cat.cle,
              destId: idNoeud,
              montant: d.montant,
            });
            idsNouveaux.push(idNoeud);
          }
        });
        if (idsNouveaux.length > 0) {
          blocsDestinationPartenaire.push({ sortKey: cat.montant, ids: idsNouveaux });
        }
        return;
      }
      idsCategoriesDirectesPartenaire.push(cat.cle);
      noeudsDirectsCategoriesParIdPartenaire.set(cat.cle, {
        id: cat.cle,
        label: cat.label,
        couleur: cat.couleur,
        montant: cat.montant,
      });
      blocsDestinationPartenaire.push({ sortKey: cat.montant, ids: [cat.cle] });
    });
  }

  // RÈGLE À NE JAMAIS CASSER — FUSION COLONNE 3 (Destination), PAR ID :
  // les ids de transaction nommée (`transaction__${nom}`) et de catégorie
  // directe (`cat.cle`, un nom) sont VOLONTAIREMENT partagés entre "moi" et
  // "partenaire" (cf. RÈGLE juste au-dessus) — la fusion se fait donc PAR
  // CONSTRUCTION en sommant les montants d'un même id, jamais un second
  // mécanisme de correspondance par nom. Liquidités consolidée = UN SEUL
  // nœud (jamais "moi"/"partenaire" séparés, cf. RÈGLE sur
  // totalLiquiditesFluxConsolide) ; aucun nœud "Épargne" dans cette vue.
  const noeudsDestinationParIdFusionne = affichagePartageFlux
    ? (() => {
        const combine = new Map<string, NoeudFlux>();
        const fusionner = (n: NoeudFlux) => {
          const existant = combine.get(n.id);
          combine.set(
            n.id,
            existant
              ? { ...existant, montant: existant.montant + n.montant }
              : n,
          );
        };
        [
          ...noeudsDestinationParLabel.values(),
          ...noeudsDestinationParLabelPartenaire.values(),
        ].forEach(fusionner);
        [...noeudsAutresParId.values(), ...noeudsAutresParIdPartenaire.values()].forEach(
          fusionner,
        );
        [
          ...noeudsDirectsCategoriesParId.values(),
          ...noeudsDirectsCategoriesParIdPartenaire.values(),
        ].forEach(fusionner);
        if (totalLiquiditesFluxConsolide > 0) {
          combine.set(ID_NOEUD_LIQUIDITES, {
            id: ID_NOEUD_LIQUIDITES,
            label: "Liquidités",
            couleur: C.texteMuted,
            montant: totalLiquiditesFluxConsolide,
          });
        }
        return combine;
      })()
    : noeudsDestinationParId;
  // RÈGLE : blocs "moi" + "partenaire" combinés puis DÉDUPLIQUÉS — un id
  // fusionné (ex: "Loyer" catégorie directe des deux côtés) peut apparaître
  // dans un bloc "moi" ET un bloc "partenaire" : jamais rendu deux fois,
  // jamais un groupe éclaté (cf. RÈGLE "un bloc ne doit jamais être éclaté"
  // dans GraphiqueFlux.tsx). sortKey recalculé depuis le montant RÉELLEMENT
  // FUSIONNÉ (noeudsDestinationParIdFusionne), jamais le montant d'un seul
  // côté, pour trier par le vrai total combiné. blocsDestination "moi"
  // exclut ici son bloc Liquidités/Épargne (formule différente en vue
  // consolidée, cf. RÈGLE sur totalLiquiditesFluxConsolide) — un seul bloc
  // Liquidités combiné est ajouté séparément à la fin.
  const blocsDestinationFusionnes = affichagePartageFlux
    ? (() => {
        const blocsMoiSansLiquiditesNiEpargne = blocsDestination.filter(
          (bloc) =>
            !bloc.ids.includes(ID_NOEUD_LIQUIDITES) &&
            !bloc.ids.includes(ID_NOEUD_EPARGNE),
        );
        const idsDejaVus = new Set<string>();
        const blocs: { sortKey: number; ids: string[] }[] = [];
        [...blocsMoiSansLiquiditesNiEpargne, ...blocsDestinationPartenaire].forEach(
          (bloc) => {
            const idsRestants = bloc.ids.filter((id) => !idsDejaVus.has(id));
            idsRestants.forEach((id) => idsDejaVus.add(id));
            if (idsRestants.length === 0) return;
            const sortKey = idsRestants.reduce(
              (acc, id) =>
                acc + (noeudsDestinationParIdFusionne.get(id)?.montant ?? 0),
              0,
            );
            blocs.push({ sortKey, ids: idsRestants });
          },
        );
        if (totalLiquiditesFluxConsolide > 0) {
          blocs.push({
            sortKey: totalLiquiditesFluxConsolide,
            ids: [ID_NOEUD_LIQUIDITES],
          });
        }
        return blocs;
      })()
    : blocsDestination;
  const fluxNoeudsDestinationFusionnes: NoeudFlux[] = affichagePartageFlux
    ? [...blocsDestinationFusionnes]
        .sort((a, b) => b.sortKey - a.sortKey)
        .flatMap((bloc) =>
          bloc.ids
            .map((id) => noeudsDestinationParIdFusionne.get(id))
            .filter((n): n is NoeudFlux => !!n),
        )
    : fluxNoeudsDestination;
  const fluxNoeudsEntreesFusionnees: NoeudFlux[] = affichagePartageFlux
    ? (() => {
        const parId = new Map<string, NoeudFlux>();
        [...fluxNoeudsEntrees, ...fluxNoeudsEntreesPartenaire].forEach((n) => {
          const existant = parId.get(n.id);
          parId.set(
            n.id,
            existant
              ? { ...existant, montant: existant.montant + n.montant }
              : n,
          );
        });
        return [...parId.values()];
      })()
    : fluxNoeudsEntrees;
  const idsNoeudsDirectsFusionnes = affichagePartageFlux
    ? [...new Set([...idsCategoriesDirectes, ...idsCategoriesDirectesPartenaire])]
    : [
        ...idsCategoriesDirectes,
        ...(totalEpargneFlux > 0 ? [ID_NOEUD_EPARGNE] : []),
        ...(totalLiquiditesFlux > 0 ? [ID_NOEUD_LIQUIDITES] : []),
      ];

  const [modeAffichageFlux, setModeAffichageFlux] = useState<"euro" | "pct">("euro");

  // Défini ici (état de la page, pas au niveau module comme les autres
  // pages) car la première étape doit ouvrir tous les tiroirs d'un coup via
  // ouvrirTousLesTiroirsTutoriel plus haut, avant que la bulle ne s'affiche
  // (cf. onAfficher dans TutorielOverlay.tsx) — et parce que le filtrage de
  // "tiroir-repartition" et "tiroir-ce-mois" (juste en dessous) dépend de
  // repartitionTiroirVisible/objectifsAvecDelta, calculés seulement à ce
  // point du composant.
  // Même structure que ETAPES_BUDGET dans budget.tsx : un tableau simple
  // passé tel quel à <TutorielOverlay etapes={...}>, sans expression
  // supplémentaire au site d'appel JSX.
  const ETAPES_STATS: EtapeTutoriel[] = [
    {
      id: "periode",
      texte:
        "Choisis la période à analyser — de 3 mois jusqu'à tout ton historique disponible.",
      onAfficher: () => {
        ouvrirTousLesTiroirsTutoriel();
        allerVersCibleTutoriel("periode");
      },
    },
    {
      id: "filtre",
      texte: "Filtre par catégorie pour analyser une dépense précise.",
      onAfficher: () => allerVersCibleTutoriel("filtre"),
    },
    {
      id: "tiroir-vue-ensemble",
      texte:
        "Tes indicateurs clés du mois : dépense moyenne, taux d'épargne et variation vs mois précédent.",
      onAfficher: () => allerVersCibleTutoriel("tiroir-vue-ensemble"),
    },
    {
      id: "tiroir-evolution",
      texte: "Suis l'évolution de ton budget et tes dépenses mois après mois.",
      onAfficher: () => allerVersCibleTutoriel("tiroir-evolution"),
    },
    {
      id: "tiroir-repartition",
      texte: "Visualise la répartition de tes dépenses par catégorie.",
      onAfficher: () => allerVersCibleTutoriel("tiroir-repartition"),
    },
    {
      id: "tiroir-par-categorie",
      texte: "Compare chaque catégorie dans le temps.",
      onAfficher: () => allerVersCibleTutoriel("tiroir-par-categorie"),
    },
    {
      id: "tiroir-ce-mois",
      texte: "Suis la progression de tes objectifs d'épargne.",
      onAfficher: () => allerVersCibleTutoriel("tiroir-ce-mois"),
    },
    {
      id: "bilan",
      texte: "Accède à ton score, tes séries et le simulateur.",
      onAfficher: () => allerVersCibleTutoriel("bilan"),
    },
  ]
    // RÈGLE À NE JAMAIS CASSER (les deux .filter() ci-dessous) : chaque
    // nouvelle étape ETAPES_STATS ciblant un tiroir dont le montage dépend
    // de données (pas juste de son état ouvert/fermé) doit avoir un filtre
    // symétrique à celui-ci — sinon un compte sans les données correspon-
    // dantes bloque tout le tutoriel Stats, pas seulement cette étape.
    .filter((e) => e.id !== "tiroir-repartition" || repartitionTiroirVisible)
    // Même raisonnement, encore : "tiroir-par-categorie" ("Entrées et
    // dépenses par catégorie") ne se monte plus du tout en vue partagée
    // (cf. RÈGLE au site de rendu, plus bas — trop individuel pour avoir une
    // valeur "couple") — sans ce filtre, un compte en vue Partagé bloquerait
    // le tutoriel Stats sur cette étape devenue non montée.
    .filter(
      (e) =>
        e.id !== "tiroir-par-categorie" ||
        !(estDansUnEspace && vueActive === "partage"),
    )
    // Même raisonnement que pour "tiroir-repartition" : le tiroir "Ce
    // mois-ci" (header ET contenu) n'est monté du tout que si
    // objectifsAvecDelta.length > 0 (voir le JSX plus bas, gated par
    // {objectifsAvecDelta.length > 0 && (<CibleTutoriel id="tiroir-ce-mois"
    // ...)}) — un compte sans aucun objectif d'épargne ne rend jamais ce
    // header, donc sa cible n'est jamais mesurée. Sans ce filtre,
    // toutesCiblesActivesMesurees reste bloqué indéfiniment sur cette
    // seule étape et aucune étape du tutoriel Stats ne s'affiche jamais.
    .filter((e) => e.id !== "tiroir-ce-mois" || objectifsAvecDelta.length > 0);

  const toggleCategorie = (id: string) => {
    setCategoriesSelectionnees((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const depensesFiltre = objStore.enveloppes.filter(
    (e) => e.type !== "Entrée",
  );
  const entreesFiltre = objStore.enveloppes.filter(
    (e) => e.type === "Entrée",
  );

  const renderPastilleCategorie = (env: Enveloppe) => {
    const sel = categoriesSelectionnees.includes(env.id);
    return (
      <TouchableOpacity
        key={env.id}
        style={[
          styles.tiroirPastille,
          { backgroundColor: theme === "sombre" ? C.fondPage : "#FFFFFF", borderColor: C.separateur },
          sel && { backgroundColor: env.couleur + "22", borderColor: env.couleur },
        ]}
        onPress={() => toggleCategorie(env.id)}
        activeOpacity={0.7}
      >
        <View style={[styles.tiroirRond, { backgroundColor: env.couleur }]} />
        <Text
          style={[styles.tiroirNomGrille, { color: C.texte }]}
          numberOfLines={1}
        >
          {env.nom}
        </Text>
        {sel && <Ionicons name="checkmark" size={13} color={env.couleur} />}
      </TouchableOpacity>
    );
  };

  console.log("[TUTORIEL Stats]", {
    tutorielStatsVu,
    estFocus: estFocusDebug,
    nbCibles: Object.keys(posCiblesTutoriel).length,
    ciblesPresentes: Object.keys(posCiblesTutoriel),
  });

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: C.fondPage },
        // RÈGLE — iPad : marge horizontale généreuse plutôt que des
        // tiroirs/graphiques étirés bord à bord sur toute la largeur d'un
        // iPad — même esprit que styleModaleTablette pour les modales.
        estTablette && { paddingHorizontal: 80 },
      ]}
    >
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={rafraichissementEnCours}
            onRefresh={gererRafraichissement}
            tintColor={C.accent}
          />
        }
      >
        <View style={[styles.header, styles.headerRow]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View>
              <Text style={[styles.titre, { color: C.texte }]}>Statistiques</Text>
              <Text style={[styles.sousTitre, { color: C.texteMuted }]}>
                {MOIS_LABELS_COMPLETS[MOIS_ACTUEL]} {ANNEE_ACTUELLE}
              </Text>
            </View>
            <SwitcherEspacePartage />
          </View>
          <CibleTutoriel
            id="bilan"
            onMesure={mesurerCibleTutoriel}
            cleFocus={cleFocusTutoriel}
          >
          <TouchableOpacity
            style={[
              styles.btnMenu,
              { backgroundColor: C.fondSecondaire, borderColor: C.carteBorder },
            ]}
            onPress={() => {
              setModalSeriesVisible(true);
              setVueModalStats("vista");
              scrollVistaRef.current?.scrollTo({ y: 0, animated: false });
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

        <CibleTutoriel
          id="filtre"
          onMesure={mesurerCibleTutoriel}
          cleFocus={cleFocusTutoriel}
        >
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
        </CibleTutoriel>

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
            {depensesFiltre.length > 0 && (
              <>
                <Text style={[styles.tiroirGroupeLabel, { color: C.texteMuted }]}>
                  DÉPENSES
                </Text>
                <View style={styles.tiroirGrille}>
                  {depensesFiltre.map(renderPastilleCategorie)}
                </View>
              </>
            )}
            {entreesFiltre.length > 0 && (
              <>
                <Text style={[styles.tiroirGroupeLabel, { color: C.texteMuted }]}>
                  ENTRÉES D&apos;ARGENT
                </Text>
                <View style={styles.tiroirGrille}>
                  {entreesFiltre.map(renderPastilleCategorie)}
                </View>
              </>
            )}
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

        {/* Seul le tiroir "Évolution dans le temps" recalcule réellement
            son contenu à partir de categoriesSelectionnees (via
            enveloppesFiltrees, cf. donneesReelles/donneesPrevisionnelles
            plus bas) — Répartition/Top dépenses ne filtrent pas par
            catégorie aujourd'hui, donc ne sont volontairement pas listés
            ici : l'annoncer serait trompeur tant que ce n'est pas vrai. */}
        {nomFiltreActif && (
          <Text style={[styles.filtreImpactTexte, { color: C.texteMuted }]}>
            Filtre appliqué sur : Évolution dans le temps
          </Text>
        )}

        {/* RÈGLE À NE JAMAIS CASSER — REDESIGN DU 2026-09-13 (remplace le
            Picker natif modal) : rangée de chips, un par valeur de
            OPTIONS_PERIODE_STATS — chaque chip verrouillé (verrouillePub)
            affiche une icône cadenas et déclenche la pub au tap au lieu de
            sélectionner directement ; "prochaine" (pas assez d'historique)
            reste désactivé (disabled), jamais cliquable. La sélection
            visible (fond plein) suit `nbMois` (déjà clampé), jamais
            `nbMoisSelectionne` brut — même RÈGLE que le label déjà en place
            plus bas pour "Ce qu'il faut retenir", jamais une valeur non
            réellement affichée montrée comme sélectionnée. */}
        <CibleTutoriel
          id="periode"
          onMesure={mesurerCibleTutoriel}
          cleFocus={cleFocusTutoriel}
        >
          <View style={styles.periodeChipsRow}>
            {optionsPeriode.map((o) => {
              const actif = nbMois === o.valeur && !o.verrouillePub;
              return (
                <TouchableOpacity
                  key={o.valeur}
                  style={[
                    styles.periodeChip,
                    {
                      backgroundColor: C.fondSecondaire,
                      borderColor: C.carteBorder,
                    },
                    actif && { backgroundColor: C.purple, borderColor: C.purple },
                  ]}
                  disabled={!o.disponible}
                  onPress={() => {
                    if (o.verrouillePub) {
                      declencherPubPeriodeStats();
                      return;
                    }
                    setNbMoisSelectionne(o.valeur);
                    // RÈGLE : persisté UNIQUEMENT sur un choix explicite de
                    // l'utilisateur (jamais la valeur calculée par
                    // periodeParDefautSelonAnciennete) — cf. RÈGLE sur
                    // l'effet de chargement plus haut, "si l'utilisateur a
                    // déjà choisi une période, garder son choix".
                    if (objStore.userId) {
                      AsyncStorage.setItem(
                        `${PREFIXE_CLE_PERIODE_STATS}${objStore.userId}`,
                        String(o.valeur),
                      ).catch(() => {});
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.periodeChipTexte,
                      {
                        color: actif
                          ? "#FFFFFF"
                          : o.disponible
                            ? C.texte
                            : C.texteMuted,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {/* RÈGLE : suffixe "bientôt" pour une option pas encore
                        disponible faute d'historique suffisant (o.prochaine)
                        — sans lui, un chip grisé était indiscernable d'un
                        bug (revue du 2026-09-13). Même esprit que l'ancien
                        suffixe "(bientôt disponible)" du Picker retiré,
                        raccourci pour tenir dans un chip. */}
                    {o.prochaine ? `${o.label} (bientôt)` : o.label}
                  </Text>
                  {/* RÈGLE : le cadenas ne s'affiche que si l'option est
                      RÉELLEMENT accessible via une pub (o.disponible) —
                      une option pas encore disponible faute d'historique
                      suffisant est juste grisée/désactivée, jamais un
                      cadenas trompeur suggérant qu'une pub suffirait. */}
                  {o.verrouillePub && o.disponible && (
                    <Ionicons
                      name="lock-closed-outline"
                      size={13}
                      color={actif ? "#FFFFFF" : C.texteMuted}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </CibleTutoriel>

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

        <CibleTutoriel
          id="tiroir-vue-ensemble"
          onMesure={mesurerCibleTutoriel}
          cleFocus={cleFocusTutoriel}
        >
        <TiroirStats
          titre="Vue d'ensemble"
          labelTemporel={LABEL_MOIS_ACTUEL}
          ouvertParDefaut
          forcerOuvert={tiroirsForcesOuverts.has("vue-ensemble")}
        >
          {/* RÈGLE : bloc "Partagé" purement additif — la grille de KPI
              "Moi" ci-dessous n'est jamais modifiée, cf. RÈGLE dans
              app/(tabs)/index.tsx. */}
          {estDansUnEspace && vueActive === "partage" && (
            <View style={styles.kpiFusionneRow}>
              <View
                style={[
                  styles.kpiFusionneCard,
                  { backgroundColor: C.carte, borderColor: C.carteBorder },
                ]}
              >
                <Text style={[styles.kpiLabel, { color: C.texteMuted }]}>
                  REVENUS COMBINÉS
                </Text>
                <Text style={[styles.kpiVal, { color: C.texte }]}>
                  {formaterMontant(revenusCombines)} €
                </Text>
              </View>
              <View
                style={[
                  styles.kpiFusionneCard,
                  { backgroundColor: C.carte, borderColor: C.carteBorder },
                ]}
              >
                <Text style={[styles.kpiLabel, { color: C.texteMuted }]}>
                  DÉPENSES TOTALES (2 COMPTES)
                </Text>
                <Text style={[styles.kpiVal, { color: C.texte }]}>
                  {formaterMontant(depensesCombinees)} €
                </Text>
              </View>
            </View>
          )}
          {/* Graphique 1 — donut de contribution : ré-agrégation de
              repartitionParPersonne (totauxDonutCouple, calculé plus haut),
              jamais un nouveau total indépendant. Titre explicite au-dessus
              (demande du 2026-09-06, remplace l'ancien intitulé "dépenses
              communes" qui n'apparaissait qu'en petit au centre du donut) —
              même convention que le sectionLabelRow "Évolution" plus bas. */}
          {estDansUnEspace &&
            vueActive === "partage" &&
            totauxDonutCouple.moi +
              totauxDonutCouple.partenaire +
              totauxDonutCouple.commun >
              0 && (
              <>
                <View style={[styles.sectionLabelRow, { marginTop: 16 }]}>
                  <View
                    style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                  >
                    <Ionicons
                      name="pie-chart-outline"
                      size={13}
                      color={C.texteMuted}
                    />
                    <Text
                      style={[
                        styles.sectionLabel,
                        { color: C.texteMuted, marginTop: 0, marginBottom: 0 },
                      ]}
                    >
                      Répartition des dépenses communes
                    </Text>
                  </View>
                </View>
              <View
                style={[
                  styles.chartCard,
                  {
                    backgroundColor: theme === "sombre" ? C.carte : "#FAFAFA",
                    borderColor: C.carteBorder,
                    alignItems: "center",
                  },
                ]}
              >
                <GraphiqueDonutCouple
                  moi={totauxDonutCouple.moi}
                  partenaire={totauxDonutCouple.partenaire}
                  commun={totauxDonutCouple.commun}
                  labelPartenaire={membrePartenaire?.prenom || "Partenaire"}
                  couleurMoi={couleurMoi}
                  couleurPartenaire={couleurPartenaire}
                  couleurs={C}
                />
              </View>
              </>
            )}
          {/* RÈGLE : remplace l'ancienne carte "DÉPENSE MOY. / JOUR" (retirée
              du 2026-09-06, cf. git log) — vue individuelle UNIQUEMENT
              (pendant de kpiFusionneRow "REVENUS COMBINÉS"/"DÉPENSES
              TOTALES (2 COMPTES)" plus haut, vue partagée), même style
              (kpiFusionneRow/kpiFusionneCard), jamais un nouveau style ad
              hoc. disponible/depenseMoisActuel déjà calculés plus haut pour
              TAUX D'ÉPARGNE/le reste de cet écran — jamais un second calcul
              indépendant. */}
          {!(estDansUnEspace && vueActive === "partage") && (
            <View style={styles.kpiFusionneRow}>
              <View
                style={[
                  styles.kpiFusionneCard,
                  { backgroundColor: C.carte, borderColor: C.carteBorder },
                ]}
              >
                <Text style={[styles.kpiLabel, { color: C.texteMuted }]}>
                  REVENUS TOTAUX
                </Text>
                <Text style={[styles.kpiVal, { color: C.texte }]}>
                  {formaterMontant(disponible)} €
                </Text>
              </View>
              <View
                style={[
                  styles.kpiFusionneCard,
                  { backgroundColor: C.carte, borderColor: C.carteBorder },
                ]}
              >
                <Text style={[styles.kpiLabel, { color: C.texteMuted }]}>
                  DÉPENSES TOTALES
                </Text>
                <Text style={[styles.kpiVal, { color: C.texte }]}>
                  {formaterMontant(depenseMoisActuel)} €
                </Text>
              </View>
            </View>
          )}
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

          {/* RÈGLE À NE JAMAIS CASSER — MASQUÉ EN VUE PARTAGÉE (bug corrigé
              le 2026-09-12) : categoriesComparees (et donc
              categoriesCompareesChangees/Inchangees, depenseMoisActuel,
              depenseMoisPrec) dérive de objStore.enveloppes SEUL, jamais
              fusionné avec le partenaire — contrairement à tauxEpargne/
              revenusCombines/depensesCombinees juste au-dessus, qui sont
              déjà correctement consolidés. Cette carte affichait donc à tort
              les chiffres personnels, sans le signaler, juste après la
              ligne KPI correctement fusionnée — même limite documentée que
              "Entrées et dépenses par catégorie" (masquée pour la même
              raison) : reproduire cette comparaison par catégorie pour le
              partenaire demanderait d'étendre son historique mensuel
              archivé (cf. plan "Ajustements vue partagée"), un chantier à
              part, jamais un second calcul bricolé ici. */}
          {!(estDansUnEspace && vueActive === "partage") && (
          <View
            style={[
              styles.compareCard,
              {
                backgroundColor: theme === "sombre" ? C.carte : "#FAFAFA",
                borderColor: C.carteBorder,
                marginTop: 12,
              },
            ]}
          >
            <View style={{ marginBottom: 14 }}>
              <Text style={[styles.compareTitle, { color: C.texte }]}>
                Variation d&apos;un mois à l&apos;autre — {MOIS_LABELS_COMPLETS[MOIS_ACTUEL]}{" "}
                vs {MOIS_LABELS_COMPLETS[moisPrecedent.getMonth()]}
              </Text>
              <TouchableOpacity
                style={{ alignSelf: "flex-end", marginTop: 8 }}
                onPress={() => setComparaisonEnPourcentage((v) => !v)}
                activeOpacity={0.6}
              >
                <Text
                  style={[
                    styles.compareDelta,
                    { color: deltaTotal <= 0 ? C.accentText : C.peachText },
                  ]}
                >
                  {comparaisonEnPourcentage
                    ? `${deltaTotal > 0 ? "+" : ""}${deltaTotal}%`
                    : `${deltaTotalEuros > 0 ? "+" : ""}${formaterMontant(deltaTotalEuros)} €`}
                </Text>
              </TouchableOpacity>
            </View>
            {categoriesCompareesChangees.map(({ env, depensePrec, delta }) => {
              const pct =
                env.budget > 0 ? Math.round((env.depense / env.budget) * 100) : 0;
              const deltaPct =
                depensePrec !== 0
                  ? Math.round((delta / Math.abs(depensePrec)) * 100)
                  : env.depense > 0
                    ? 100
                    : 0;
              const texteDelta = comparaisonEnPourcentage
                ? `${deltaPct > 0 ? "+" : ""}${deltaPct}%`
                : `${delta > 0 ? "+" : ""}${formaterMontant(delta)} €`;
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
                  <TouchableOpacity
                    onPress={() => setComparaisonEnPourcentage((v) => !v)}
                    activeOpacity={0.6}
                  >
                    <Text
                      style={[
                        styles.cbarVal,
                        { color: delta <= 0 ? C.accentText : C.peachText },
                      ]}
                    >
                      {texteDelta}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}

            {categoriesCompareesInchangees.length > 0 && (
              <View style={{ marginTop: categoriesCompareesChangees.length > 0 ? 4 : 0 }}>
                <TouchableOpacity
                  style={[styles.tiroirBouton, { backgroundColor: C.fondSecondaire }]}
                  onPress={() =>
                    setCategoriesInchangeesOuvert(!categoriesInchangeesOuvert)
                  }
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tiroirBoutonTexte, { color: C.texte }]}>
                    Voir les catégories sans changement (
                    {categoriesCompareesInchangees.length})
                  </Text>
                  <Text style={[styles.tiroirChevron, { color: C.texteMuted }]}>
                    {categoriesInchangeesOuvert ? "▾" : "▸"}
                  </Text>
                </TouchableOpacity>
                {categoriesInchangeesOuvert &&
                  categoriesCompareesInchangees.map(({ env }) => {
                    const pct =
                      env.budget > 0
                        ? Math.round((env.depense / env.budget) * 100)
                        : 0;
                    return (
                      <View
                        key={env.id}
                        style={[styles.cbarRow, { marginTop: 10 }]}
                      >
                        <Text
                          style={[styles.cbarLabel, { color: C.texte }]}
                          numberOfLines={1}
                        >
                          {env.nom}
                        </Text>
                        <View
                          style={[
                            styles.cbarTrack,
                            { backgroundColor: C.separateur },
                          ]}
                        >
                          <BarreCbarAnimee
                            pourcentage={Math.min(pct, 100)}
                            couleur={env.couleur}
                            style={styles.cbarFill}
                          />
                        </View>
                        <TouchableOpacity
                          onPress={() => setComparaisonEnPourcentage((v) => !v)}
                          activeOpacity={0.6}
                        >
                          <Text
                            style={[styles.cbarVal, { color: C.texteMuted }]}
                          >
                            {comparaisonEnPourcentage ? "0%" : "0 €"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
              </View>
            )}

            {depenseMoisPrec > 0 && (
              <Text style={[styles.compareFooter, { color: C.texteMuted }]}>
                Total ce mois : {formaterMontant(depenseMoisActuel)} € vs {formaterMontant(depenseMoisPrec)} € le
                mois dernier
              </Text>
            )}
          </View>
          )}
        </TiroirStats>
        </CibleTutoriel>

        {/* Graphique 4 — balance du couple : remplace l'ancienne bannière
            texte equilibreLabel (comparaison 50/50 implicite sur TOUTES les
            dépenses) par un calcul réel sur les dépenses COMMUNES
            uniquement (contributionsCommunes), adaptable à 3 modes, avec
            action de remboursement. */}
        {estDansUnEspace &&
          vueActive === "partage" &&
          contributionsCommunes.totalCommun > 0 && (
            <CibleTutoriel
              id="tiroir-balance-couple"
              onMesure={mesurerCibleTutoriel}
              cleFocus={cleFocusTutoriel}
            >
              <TiroirStats
                titre="Balance partagée"
                labelTemporel={LABEL_MOIS_ACTUEL}
                forcerOuvert={tiroirsForcesOuverts.has("balance-couple")}
              >
                <View style={styles.modeBalanceRow}>
                  {(
                    [
                      { valeur: "50_50" as const, label: "50/50", info: null },
                      {
                        valeur: "revenus" as const,
                        label: "Revenus",
                        info: {
                          titre: "Contribution proportionnelle aux revenus",
                          message:
                            "Chacun contribue selon ce qu'il gagne. Si Maëlys gagne 2x plus que Louis, elle contribue 2x plus aux dépenses communes.",
                        },
                      },
                      {
                        valeur: "personnalise" as const,
                        label: "Personnalisé",
                        info: {
                          titre: "Contribution personnalisée",
                          message:
                            "Définissez librement le pourcentage de contribution de chaque personne avec le curseur ci-dessous.",
                        },
                      },
                    ]
                  ).map((option) => (
                    <TouchableOpacity
                      key={option.valeur}
                      style={[
                        styles.modeBalanceChip,
                        { borderColor: C.separateur },
                        modeBalance === option.valeur && {
                          backgroundColor: C.purple,
                          borderColor: C.purple,
                        },
                      ]}
                      onPress={() =>
                        changerModeBalance(option.valeur, ratioPersonnalise)
                      }
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.modeBalanceChipTexte,
                          {
                            color:
                              modeBalance === option.valeur
                                ? "#FFFFFF"
                                : C.texte,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {option.label}
                      </Text>
                      {/* RÈGLE : bulle d'info — demande du 2026-09-13. Pas de
                          tooltip flottant custom (trop complexe) : un simple
                          Alert au tap. TouchableOpacity imbriqué dans le chip
                          parent — React Native ne fait remonter le press qu'au
                          responder le plus interne, jamais aux deux à la
                          fois, donc pas de risque de déclencher aussi
                          changerModeBalance en tapant l'icône. hitSlop élargit
                          la zone tactile sans agrandir visuellement l'icône
                          (14px max, cf. contrainte visuelle). */}
                      {option.info && (
                        <TouchableOpacity
                          onPress={() =>
                            Alert.alert(option.info!.titre, option.info!.message)
                          }
                          hitSlop={8}
                          activeOpacity={0.6}
                        >
                          <Ionicons
                            name="information-circle-outline"
                            size={14}
                            color={
                              modeBalance === option.valeur
                                ? "#FFFFFFB3"
                                : "#1D9E75B3"
                            }
                          />
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>

                {modeBalance === "personnalise" && (
                  <View style={{ marginBottom: 14 }}>
                    <Text
                      style={{
                        fontSize: 12,
                        color: C.texteMuted,
                        marginBottom: 4,
                      }}
                    >
                      {membrePartenaire?.prenom || "Ton/ta partenaire"}{" "}
                      contribue {Math.round(ratioPersonnalise * 100)}% des
                      dépenses communes
                    </Text>
                    <Slider
                      style={{ width: "100%", height: 40 }}
                      minimumValue={0}
                      maximumValue={1}
                      value={ratioPersonnalise}
                      onSlidingComplete={(v) =>
                        changerModeBalance("personnalise", v)
                      }
                      minimumTrackTintColor={C.purple}
                      maximumTrackTintColor={C.separateur}
                      thumbTintColor={C.purple}
                    />
                  </View>
                )}

                <View style={styles.jaugeBarre}>
                  <View
                    style={{
                      flex: Math.max(contributionsCommunes.moiCommun, 0),
                      backgroundColor: couleurMoi,
                    }}
                  />
                  <View
                    style={{
                      flex: Math.max(
                        contributionsCommunes.partenaireCommun,
                        0,
                      ),
                      backgroundColor: couleurPartenaire,
                    }}
                  />
                </View>
                <View style={styles.balanceBarreLabelsRow}>
                  <Text
                    style={[styles.balanceBarreMontant, { color: C.texte }]}
                  >
                    Toi · {formaterMontant(contributionsCommunes.moiCommun)} €
                  </Text>
                  <Text
                    style={[styles.balanceBarreMontant, { color: C.texte }]}
                  >
                    {membrePartenaire?.prenom || "Partenaire"} ·{" "}
                    {formaterMontant(contributionsCommunes.partenaireCommun)} €
                  </Text>
                </View>

                {balanceLabel && (
                  <View
                    style={[
                      styles.equilibreLigne,
                      {
                        backgroundColor: C.carte,
                        borderColor: C.carteBorder,
                        marginTop: 12,
                      },
                    ]}
                  >
                    <Ionicons
                      name="scale-outline"
                      size={14}
                      color={C.texteMuted}
                    />
                    <Text
                      style={[styles.equilibreLigneTexte, { color: C.texte }]}
                      numberOfLines={2}
                    >
                      {balanceLabel}
                    </Text>
                  </View>
                )}

                {Math.abs(balanceMontant) > 0.5 &&
                  (remboursements.length > 0 ? (
                    <View
                      style={[
                        styles.banniereInfo,
                        { backgroundColor: C.vertLight, marginTop: 10 },
                      ]}
                    >
                      <Text
                        style={[styles.banniereInfoTexte, { color: C.texte }]}
                      >
                        Remboursé ce mois-ci
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.btnAdopterScenario,
                        { backgroundColor: C.purple },
                      ]}
                      onPress={confirmerRemboursement}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.btnAdopterScenarioTexte}>
                        Marquer comme remboursé
                      </Text>
                    </TouchableOpacity>
                  ))}
              </TiroirStats>
            </CibleTutoriel>
          )}

        <CibleTutoriel
          id="tiroir-evolution"
          onMesure={mesurerCibleTutoriel}
          cleFocus={cleFocusTutoriel}
        >
        <TiroirStats
          titre="Évolution dans le temps"
          labelTemporel={labelPeriode}
          indicateurFiltre={nomFiltreActif ? renderIndicateurFiltre() : undefined}
          forcerOuvert={tiroirsForcesOuverts.has("evolution")}
        >
          {/* Masqué quand un filtre "Par catégorie" est actif : Budget et
              Épargne ne varient pas selon la catégorie sélectionnée, donc ce
              graphique n'apporte plus d'information pertinente dans ce
              contexte — seul "Dépensé vs dépenses prévues" (plus bas) reste
              recalculé et utile avec un filtre catégorie. */}
          {!nomFiltreActif && (
            <>
              <View
                style={[
                  styles.sectionLabelRow,
                  { marginTop: 0, justifyContent: "space-between" },
                ]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
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
                      label: "Budget",
                      couleur: C.purple,
                      donnees: donneesDisponibleConsolidees,
                    },
                    {
                      cle: "epargne",
                      label: "Épargne",
                      couleur: C.bleuGris,
                      donnees: donneesEpargneConsolidees,
                    },
                    {
                      cle: "depenses",
                      label: "Dépenses",
                      couleur: C.accent,
                      donnees: donneesReellesConsolidees,
                    },
                  ]}
                  labels={labels}
                  couleurs={C}
                  fondCarte={theme === "sombre" ? C.carte : "#FAFAFA"}
                />
              </View>
            </>
          )}

          {!filtreEstEntreesUniquement && !filtreEstDepensesUniquement && (
            <>
              <View
                style={[
                  styles.sectionLabelRow,
                  { justifyContent: "space-between", alignItems: "flex-start" },
                ]}
              >
                <View>
                  <Text
                    style={[
                      styles.sectionLabel,
                      { color: C.texteMuted, marginTop: 8, marginBottom: 0 },
                    ]}
                  >
                    Dépensé vs dépenses prévues
                  </Text>
                  <TouchableOpacity
                    onPress={() => setDepenseVsPrevuEnPourcentage((v) => !v)}
                    activeOpacity={0.6}
                    hitSlop={{ top: 4, bottom: 4, left: 0, right: 8 }}
                  >
                    <Text
                      style={[
                        styles.depensePrevuDelta,
                        {
                          color:
                            deltaPeriodeEuros <= 0 ? C.accentText : C.peachText,
                        },
                      ]}
                    >
                      {depenseVsPrevuEnPourcentage
                        ? `${deltaPeriodePct > 0 ? "+" : ""}${deltaPeriodePct}%`
                        : `${deltaPeriodeEuros > 0 ? "+" : ""}${formaterMontant(deltaPeriodeEuros)} €`}{" "}
                      vs prévu
                    </Text>
                  </TouchableOpacity>
                </View>
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
                <GraphiqueLignes
                  donneesReelles={donneesReellesPourGraphique}
                  donneesPrevisionnelles={donneesPrevisionnellesPourGraphique}
                  labels={labels}
                  couleurs={C}
                />
                <View style={styles.legendeRow}>
                  {/* Détail par catégorie tapable uniquement quand un
                      filtre est actif : sans filtre, le total EST déjà le
                      détail (une seule "catégorie" implicite : tout), donc
                      il n'y a rien de plus pertinent à montrer. */}
                  {nomFiltreActif ? (
                    <TouchableOpacity
                      style={styles.legendeItem}
                      onPress={() => setDetailFiltreType("reel")}
                      activeOpacity={0.6}
                    >
                      <View
                        style={[styles.legendeDot, { backgroundColor: C.accent }]}
                      />
                      <Text
                        style={[
                          styles.legendeTexte,
                          { color: C.texteMuted, textDecorationLine: "underline" },
                        ]}
                      >
                        Dépensé
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.legendeItem}>
                      <View
                        style={[styles.legendeDot, { backgroundColor: C.accent }]}
                      />
                      <Text style={[styles.legendeTexte, { color: C.texteMuted }]}>
                        Dépensé
                      </Text>
                    </View>
                  )}
                  {nomFiltreActif ? (
                    <TouchableOpacity
                      style={styles.legendeItem}
                      onPress={() => setDetailFiltreType("prevu")}
                      activeOpacity={0.6}
                    >
                      <View
                        style={[styles.legendeDot, { backgroundColor: C.peach }]}
                      />
                      <Text
                        style={[
                          styles.legendeTexte,
                          { color: C.texteMuted, textDecorationLine: "underline" },
                        ]}
                      >
                        Dépenses prévues
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.legendeItem}>
                      <View
                        style={[styles.legendeDot, { backgroundColor: C.peach }]}
                      />
                      <Text style={[styles.legendeTexte, { color: C.texteMuted }]}>
                        Dépenses prévues
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </>
          )}

          {filtreEstEntreesUniquement && (
            <>
              <Text
                style={[
                  styles.sectionLabel,
                  { color: C.texteMuted, marginTop: 8, marginBottom: 0 },
                ]}
              >
                Évolution de tes entrées d&apos;argent
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
                <GraphiqueEvolutionMulti
                  key={nbMoisSelectionne}
                  series={seriesEntrees}
                  labels={labels}
                  couleurs={C}
                  fondCarte={theme === "sombre" ? C.carte : "#FAFAFA"}
                />
              </View>
            </>
          )}

          {filtreEstDepensesUniquement && (
            <>
              <Text
                style={[
                  styles.sectionLabel,
                  { color: C.texteMuted, marginTop: 8, marginBottom: 0 },
                ]}
              >
                Évolution de tes dépenses
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
                <GraphiqueEvolutionMulti
                  key={nbMoisSelectionne}
                  series={seriesDepenses}
                  labels={labels}
                  couleurs={C}
                  fondCarte={theme === "sombre" ? C.carte : "#FAFAFA"}
                />
              </View>
            </>
          )}
        </TiroirStats>
        </CibleTutoriel>

        {repartitionTiroirVisible && (
          <CibleTutoriel
            id="tiroir-repartition"
            onMesure={mesurerCibleTutoriel}
            cleFocus={cleFocusTutoriel}
          >
            <TiroirStats
              titre="Répartition"
              labelTemporel={labelPeriode}
              forcerOuvert={tiroirsForcesOuverts.has("repartition")}
            >
              {/* Graphique 2 — évolution 6 mois des dépenses communes :
                  même composant GraphiqueBarresEmpilees que "Répartition par
                  personne" juste en dessous, labels = mois (au lieu de
                  noms de catégorie), 2 séries Moi/Partenaire (au lieu de 3
                  Moi/Partenaire/Commun — ici tout est déjà "commun" par
                  construction, cf. RÈGLE sur seriesEvolutionCommune plus
                  haut). */}
              {estDansUnEspace &&
                vueActive === "partage" &&
                contributionsCommunes.nomsCommuns.size > 0 && (
                  <>
                    <Text
                      style={[
                        styles.sectionLabel,
                        { color: C.texteMuted, marginTop: 0 },
                      ]}
                    >
                      Évolution des dépenses communes (6 derniers mois)
                    </Text>
                    <View
                      style={[
                        styles.chartCard,
                        {
                          backgroundColor:
                            theme === "sombre" ? C.carte : "#FAFAFA",
                          borderColor: C.carteBorder,
                        },
                      ]}
                    >
                      <GraphiqueBarresEmpilees
                        series={seriesEvolutionCommune}
                        labels={labelsEvolutionCommune}
                        couleurs={C}
                        mode="euro"
                      />
                    </View>
                  </>
                )}

              {estDansUnEspace &&
                vueActive === "partage" &&
                repartitionParPersonne.length > 0 && (
                  <>
                    <Text
                      style={[
                        styles.sectionLabel,
                        { color: C.texteMuted, marginTop: 16 },
                      ]}
                    >
                      Répartition par personne ({LABEL_MOIS_ACTUEL})
                    </Text>
                    <View
                      style={[
                        styles.chartCard,
                        {
                          backgroundColor:
                            theme === "sombre" ? C.carte : "#FAFAFA",
                          borderColor: C.carteBorder,
                        },
                      ]}
                    >
                      <GraphiqueRepartitionCategoriePersonne
                        segments={repartitionParPersonne}
                        labelPartenaire={membrePartenaire?.prenom || "Partenaire"}
                        couleurMoi={couleurMoi}
                        couleurPartenaire={couleurPartenaire}
                        couleurs={C}
                      />
                    </View>
                  </>
                )}

              {repartitionDepenses.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { color: C.texteMuted, marginTop: 0 }]}>
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
                    Top dépenses
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
                      <Text style={[styles.topMontant, { color: C.texte }]}>
                        {formaterMontant(dep.montant)} €
                      </Text>
                    </View>
                  ))}
                </>
              )}
            </TiroirStats>
          </CibleTutoriel>
        )}

        {/* RÈGLE : masqué entièrement en vue partagée — "Entrées et dépenses
            par catégorie" est un détail trop individuel pour avoir une
            valeur "couple" (demande explicite). Cf. le filtre symétrique
            sur ETAPES_STATS plus haut, sinon le tutoriel Stats resterait
            bloqué sur cette étape pour un compte en vue Partagé. */}
        {!(estDansUnEspace && vueActive === "partage") && (
        <CibleTutoriel
          id="tiroir-par-categorie"
          onMesure={mesurerCibleTutoriel}
          cleFocus={cleFocusTutoriel}
        >
        <TiroirStats
          titre="Entrées et dépenses par catégorie"
          labelTemporel={labelPeriode}
          indicateurFiltre={nomFiltreActif ? renderIndicateurFiltre() : undefined}
          forcerOuvert={tiroirsForcesOuverts.has("par-categorie")}
        >
          {seriesDepensesParCategorie.length > 0 && (
            <>
              <View
                style={[
                  styles.sectionLabelRow,
                  {
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 0,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.sectionLabel,
                    { color: C.texteMuted, marginTop: 0, marginBottom: 0 },
                  ]}
                >
                  Dépenses par catégorie
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <TouchableOpacity
                    onPress={() => setModeDepensesCategorie("pct")}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 2 }}
                  >
                    <Text
                      style={[
                        styles.toggleModeTexte,
                        {
                          color:
                            modeDepensesCategorie === "pct"
                              ? C.accent
                              : C.texteMuted,
                        },
                      ]}
                    >
                      %
                    </Text>
                  </TouchableOpacity>
                  <Text style={{ color: C.texteMuted, fontSize: 12 }}>/</Text>
                  <TouchableOpacity
                    onPress={() => setModeDepensesCategorie("euro")}
                    hitSlop={{ top: 6, bottom: 6, left: 2, right: 6 }}
                  >
                    <Text
                      style={[
                        styles.toggleModeTexte,
                        {
                          color:
                            modeDepensesCategorie === "euro"
                              ? C.accent
                              : C.texteMuted,
                        },
                      ]}
                    >
                      €
                    </Text>
                  </TouchableOpacity>
                </View>
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
                <GraphiqueBarresEmpilees
                  series={seriesDepensesParCategorie}
                  labels={labels}
                  couleurs={C}
                  mode={modeDepensesCategorie}
                  onTapLegende={(cle) =>
                    ouvrirDetailCategorieParMois(seriesDepensesParCategorie, cle)
                  }
                />
              </View>
            </>
          )}

          {seriesEntreesParCategorie.length > 0 && (
            <>
              <View
                style={[
                  styles.sectionLabelRow,
                  {
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 8,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.sectionLabel,
                    { color: C.texteMuted, marginTop: 0, marginBottom: 0 },
                  ]}
                >
                  Entrées d&apos;argent par catégorie
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <TouchableOpacity
                    onPress={() => setModeEntreesCategorie("pct")}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 2 }}
                  >
                    <Text
                      style={[
                        styles.toggleModeTexte,
                        {
                          color:
                            modeEntreesCategorie === "pct"
                              ? C.accent
                              : C.texteMuted,
                        },
                      ]}
                    >
                      %
                    </Text>
                  </TouchableOpacity>
                  <Text style={{ color: C.texteMuted, fontSize: 12 }}>/</Text>
                  <TouchableOpacity
                    onPress={() => setModeEntreesCategorie("euro")}
                    hitSlop={{ top: 6, bottom: 6, left: 2, right: 6 }}
                  >
                    <Text
                      style={[
                        styles.toggleModeTexte,
                        {
                          color:
                            modeEntreesCategorie === "euro"
                              ? C.accent
                              : C.texteMuted,
                        },
                      ]}
                    >
                      €
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View
                style={[
                  styles.chartCard,
                  {
                    backgroundColor: theme === "sombre" ? C.carte : "#FAFAFA",
                    borderColor: C.vertLight,
                  },
                ]}
              >
                <GraphiqueBarresEmpilees
                  series={seriesEntreesParCategorie}
                  labels={labels}
                  couleurs={C}
                  mode={modeEntreesCategorie}
                  onTapLegende={(cle) =>
                    ouvrirDetailCategorieParMois(seriesEntreesParCategorie, cle)
                  }
                />
              </View>
            </>
          )}
        </TiroirStats>
        </CibleTutoriel>
        )}

        {objectifsAvecDelta.length > 0 && (
          <CibleTutoriel
            id="tiroir-ce-mois"
            onMesure={mesurerCibleTutoriel}
            cleFocus={cleFocusTutoriel}
          >
          <TiroirStats
            titre="Ce mois-ci"
            labelTemporel={LABEL_MOIS_ACTUEL}
            forcerOuvert={tiroirsForcesOuverts.has("ce-mois")}
          >
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
          </TiroirStats>
          </CibleTutoriel>
        )}

        <TiroirStats
          titre="Ce qu'il faut retenir"
          labelTemporel={labelPeriode}
          ouvertParDefaut
        >
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
            {/* RÈGLE À NE JAMAIS CASSER : le tout premier insight reste
                toujours gratuit, quel que soit tonBilanVisible — les
                suivants sont regroupés derrière un seul bloc verrouillé
                (InsightVerrouille), pas un par insight. */}
            {insights.length > 0 && (
              <View style={styles.insightItem}>
                <View style={[styles.insightDot, { backgroundColor: C.purple }]} />
                <Text style={[styles.insightTexte, { color: C.purpleText }]}>
                  {insights[0]}
                </Text>
              </View>
            )}
            {insights.length > 1 && (
              <InsightVerrouille
                deverrouille={tonBilanVisible}
                onDeverrouille={() => setTonBilanDebloque(true)}
              >
                {insights.slice(1).map((txt, i) => (
                  <View
                    key={i + 1}
                    style={[styles.insightItem, styles.insightItemBorder, { borderTopColor: C.separateur }]}
                  >
                    <View style={[styles.insightDot, { backgroundColor: C.purple }]} />
                    <Text style={[styles.insightTexte, { color: C.purpleText }]}>
                      {txt}
                    </Text>
                  </View>
                ))}
              </InsightVerrouille>
            )}
          </View>
        </TiroirStats>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={modalSeriesVisible}
        transparent
        animationType={reduireAnimations ? "none" : "slide"}
        onRequestClose={() => setModalSeriesVisible(false)}
      >
        {/* RÈGLE À NE JAMAIS CASSER — View SIMPLE, PAS TouchableOpacity :
            un TouchableOpacity ici (même avec un onPress no-op côté carte
            pour absorber le tap) interfère avec la négociation de geste du
            ScrollView (symptôme confirmé : scroll peu fluide/qui répond mal
            malgré un ScrollView par ailleurs correctement configuré). La
            fermeture au tap sur le fond n'existe donc plus ici — seuls le
            bouton "Terminé" et onRequestClose (bouton retour Android)
            ferment la modale désormais, jamais un TouchableOpacity qui
            enveloppe le contenu scrollable. */}
        <View
          style={[
            styles.modalOverlayTouch,
            estTablette && styles.modalOverlayTouchTablette,
          ]}
        >
          <View
            style={[
              styles.modalCardBadges,
              { backgroundColor: C.carte, height: HAUTEUR_MODALE_TON_BILAN },
              // RÈGLE — iPad : "Ton bilan" a droit à une largeur plus
              // généreuse (760) que les autres modales (600 par défaut,
              // cf. styleModaleTablette) — 4 onglets riches en graphiques,
              // pas un simple formulaire.
              styleModaleTablette(estTablette, 760),
            ]}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitre, { color: C.texte }]}>
                  Ton bilan
                </Text>
                <Text style={[styles.sousTitre, { color: C.texteMuted }]}>
                  {vueModalStats === "vista"
                    ? "Vue d'ensemble de ta situation"
                    : vueModalStats === "sante"
                      ? "Ta santé financière"
                      : vueModalStats === "trophees"
                        ? "Tes réussites, débloquées au fil du temps"
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

            {/* RÈGLE À NE JAMAIS CASSER : "Ton bilan" est structuré en 4
                onglets horizontaux (Vista / Santé / Trophées / Et si...),
                pas une seule page scrollable — chaque onglet vit dans son
                PROPRE ScrollView indépendant (jamais partagé), TOUJOURS
                monté dès l'ouverture de la modale (visibilité basculée via
                `style={{ display }}`, jamais un montage/démontage au
                changement d'onglet — cf. RÈGLE "TOUJOURS MONTÉ" plus bas).
                Chaque section vit dans sa propre carte (styles.serieCarte)
                avec un titre — jamais de texte flottant hors d'un bloc
                identifié. */}
            <View style={[styles.tabsRow, { backgroundColor: C.fondSecondaire }]}>
              {(["vista", "sante", "trophees", "simulateur"] as const).map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[
                    styles.tabBtn,
                    vueModalStats === v && [styles.tabBtnActif, { backgroundColor: C.carte }],
                  ]}
                  onPress={() => changerVueModalStats(v)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.tabTexte,
                      { color: C.texteMuted },
                      vueModalStats === v && { color: C.purple },
                    ]}
                  >
                    {v === "vista"
                      ? "Vista"
                      : v === "sante"
                        ? "Santé"
                        : v === "trophees"
                          ? "Trophées"
                          : "Simulation"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* === Onglet 1 : "Vista" — RÈGLE mise à jour le 2026-09-12 :
                les 4 onglets (Vista/Santé/Trophées/Simulateur) partagent
                désormais le même verrou consolidé "Ton bilan" (une seule
                pub débloque les 4, cf. tonBilanVisible/TonBilanVerrou) —
                plus de distinction "Vista gratuit vs les 3 autres Premium
                uniquement". Ordre vertical : graphique de flux → "Ce que
                Vista a remarqué". */}
            {/* RÈGLE À NE JAMAIS CASSER — TOUJOURS MONTÉ, VISIBILITÉ VIA
                `display` : les 4 ScrollView des onglets restent montés en
                permanence dès l'ouverture de la modale (jamais un
                montage/démontage conditionnel au changement d'onglet) —
                un ScrollView RN fraîchement monté APRÈS que son parent soit
                déjà stable peut avoir une mesure de contentSize incorrecte
                tant qu'aucun geste ne force un re-layout (symptôme : scroll
                bloqué jusqu'à un premier aller-retour). display: "none"
                masque l'onglet inactif sans jamais le démonter, donc sans
                jamais revivre ce problème au changement d'onglet — cf.
                RÈGLE identique sur les 3 autres onglets ci-dessous. */}
            <ScrollView
              ref={scrollVistaRef}
              showsVerticalScrollIndicator
              indicatorStyle={theme === "sombre" ? "white" : "black"}
              scrollEventThrottle={16}
              scrollEnabled
              bounces
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              style={{ flex: 1, width: "100%", display: vueModalStats === "vista" ? "flex" : "none" }}
              contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 26, paddingBottom: 60 }}
            >
            <View style={[styles.serieCarte, { backgroundColor: C.fondSecondaire }]}>
              <View style={styles.serieEnTete}>
                <View
                  style={[styles.serieIconeFond, { backgroundColor: C.bleuGrisLight }]}
                >
                  <Ionicons name="git-network-outline" size={18} color={C.bleuGris} />
                </View>
                <Text style={[styles.serieTitre, { color: C.texte }]}>
                  Flux de votre argent
                </Text>
                <InfoBulle
                  titre="D'où viennent ces chiffres ?"
                  texte="Uniquement vos dépenses déjà réalisées (jamais un budget prévu ni une projection) — répond à une seule question : où est réellement allé votre argent sur la période choisie ?"
                />
              </View>

              {/* RÈGLE À NE JAMAIS CASSER — INVITÉ = ACCÈS COMPLET À "TON
                  BILAN" (SAUF SIMULATEUR) : un compte invité (isGuest) n'est
                  jamais `premium` (cf. estComptePremium, utils/premium.ts),
                  mais doit quand même voir tout le contenu des onglets
                  Vista/Santé/Trophées comme un compte premium — seul
                  l'onglet Simulateur reste réservé, et seulement pour ses
                  actions qui écrivent réellement en base (cf.
                  bloquerSiInvite sur creerObjectifDepuisSimulationInverse/
                  confirmerAdoptionScenario plus bas), jamais pour la
                  consultation. */}
              {tonBilanVisible ? (
                <>
                  <View style={styles.chipRow}>
                    {/* RÈGLE À NE JAMAIS CASSER : sélecteur de période masqué
                        en vue partagée — décision explicite de l'utilisateur,
                        le flux consolidé se limite au mois en cours (cf.
                        RÈGLE sur affichagePartageFlux plus haut). moisFluxAffiches
                        retombe déjà sur 1 mois automatiquement quel que soit
                        nbMoisFlux, ce masquage n'est qu'une cohérence
                        visuelle en plus. */}
                    {!affichagePartageFlux &&
                      [1, 3, 6, 12].map((m) => {
                      const actif = nbMoisFlux === m;
                      return (
                        <TouchableOpacity
                          key={m}
                          style={[
                            styles.chip,
                            { backgroundColor: C.carte, borderColor: C.carteBorder },
                            actif && { backgroundColor: C.purple, borderColor: C.purple },
                          ]}
                          onPress={() => setNbMoisFlux(m)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.chipTexte,
                              { color: C.texteMuted },
                              actif && styles.chipTexteActif,
                            ]}
                          >
                            {/* "Mois en cours" plutôt que "1 mois" (seul ce
                                chip-ci, pas formaterPeriode globalement qui
                                sert aussi au picker "PÉRIODE" plus haut,
                                lignes 255/3037) : plus explicite pour
                                l'utilisateur que la période "1 mois" du
                                graphique de flux correspond au mois en
                                cours, pas à une fenêtre glissante. */}
                            {m === 1 ? "Mois en cours" : formaterPeriode(m)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity
                      style={[styles.chip, { backgroundColor: C.carte, borderColor: C.carteBorder }]}
                      onPress={() =>
                        setModeAffichageFlux(modeAffichageFlux === "euro" ? "pct" : "euro")
                      }
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.chipTexte, { color: C.texteMuted }]}>
                        {modeAffichageFlux === "euro" ? "€" : "%"}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {(affichagePartageFlux
                    ? fluxNoeudsEntreesFusionnees.length > 0 &&
                      fluxNoeudsDestinationFusionnes.length > 0
                    : fluxNoeudsEntrees.length > 0 &&
                      fluxNoeudsDestination.length > 0) ? (
                    <GraphiqueFlux
                      colonnes={[
                        {
                          titre: "Entrées d'argent",
                          noeuds: affichagePartageFlux
                            ? fluxNoeudsEntreesFusionnees
                            : fluxNoeudsEntrees,
                        },
                        {
                          titre: "Catégories",
                          noeuds: affichagePartageFlux
                            ? fluxNoeudsCategoriesFusionnees
                            : fluxNoeudsCategories,
                        },
                        {
                          titre: "Destination",
                          noeuds: affichagePartageFlux
                            ? fluxNoeudsDestinationFusionnes
                            : fluxNoeudsDestination,
                        },
                      ]}
                      liensVersDestination={
                        affichagePartageFlux
                          ? [...fluxLiensVersDestination, ...fluxLiensVersDestinationPartenaire]
                          : fluxLiensVersDestination
                      }
                      idsNoeudsDirects={idsNoeudsDirectsFusionnes}
                      couleurs={C}
                      fondCarte={C.carte}
                      reduireAnimations={reduireAnimations}
                      // RÈGLE : pas de variation affichée en vue partagée —
                      // fluxVariationParCategorie ne compare que MON mois
                      // précédent, jamais celui du partenaire (hors scope,
                      // le flux consolidé se limite au mois en cours) ;
                      // omis plutôt qu'à moitié fusionné. Prop optionnelle
                      // (GraphiqueFlux.tsx), aucun changement de composant.
                      variationParNoeud={
                        affichagePartageFlux ? undefined : fluxVariationParCategorie
                      }
                      modeAffichage={modeAffichageFlux}
                    />
                  ) : (
                    <Text style={[styles.fluxVideTexte, { color: C.texteMuted }]}>
                      Pas encore assez de données sur cette période.
                    </Text>
                  )}
                </>
              ) : (
                <TonBilanVerrou
                  hauteur={260}
                  onDeverrouille={() => setTonBilanDebloque(true)}
                />
              )}
            </View>

            {analyseFlux && (
              <View
                style={[styles.serieCarte, { backgroundColor: C.fondSecondaire }]}
              >
                <View style={styles.serieEnTete}>
                  <View
                    style={[styles.serieIconeFond, { backgroundColor: C.purpleLight }]}
                  >
                    <Ionicons name="sparkles" size={18} color={C.purple} />
                  </View>
                  <Text style={[styles.serieTitre, { color: C.texte }]}>
                    Ce que Vista a remarqué
                  </Text>
                </View>
                {/* RÈGLE À NE JAMAIS CASSER : 2 insights générés par
                    analyserFluxFinancier (utils/bilanVista.ts) à partir du
                    graphique de flux ci-dessus — le premier reste toujours
                    gratuit, exactement comme "Ce qu'il faut retenir" plus
                    bas ; le second est verrouillé (InsightVerrouille). Se
                    recalculent automatiquement à chaque changement de
                    nbMoisFlux puisque analyseFlux est recalculé à chaque
                    rendu, sans mémoïsation figée. */}
                <View style={styles.observationLigne}>
                  <View style={[styles.insightDot, { backgroundColor: C.purple }]} />
                  <Text style={[styles.observationTexte, { color: C.texte }]}>
                    {analyseFlux.insight1}
                  </Text>
                </View>
                <InsightVerrouille
                  deverrouille={tonBilanVisible}
                  onDeverrouille={() => setTonBilanDebloque(true)}
                >
                  <View style={[styles.observationLigne, { marginTop: 6 }]}>
                    <View style={[styles.insightDot, { backgroundColor: C.purple }]} />
                    <Text style={[styles.observationTexte, { color: C.texte }]}>
                      {analyseFlux.insight2}
                    </Text>
                  </View>
                </InsightVerrouille>
              </View>
            )}

            <View style={{ height: 32 }} />
            </ScrollView>

            {/* === Onglet 2 : "Santé" — verrou consolidé "Ton bilan" depuis
                le 2026-09-12 (TonBilanVerrou, déblocage par pub), sauf
                invité (cf. RÈGLE sur l'onglet Vista plus haut). */}
            {/* RÈGLE À NE JAMAIS CASSER — TOUJOURS MONTÉ, VISIBILITÉ VIA
                `display` : cf. RÈGLE identique sur l'onglet Vista plus haut
                — le ScrollView reste monté dès que `premium` est vrai
                (indépendamment de l'onglet actif), seule sa visibilité
                bascule via `display`, jamais un montage/démontage au
                changement d'onglet. */}
            {!tonBilanVisible && vueModalStats === "sante" && (
              <TonBilanVerrou
                hauteur={HAUTEUR_ONGLET_VERROUILLE}
                onDeverrouille={() => setTonBilanDebloque(true)}
              />
            )}
            {tonBilanVisible && (
              <ScrollView
                ref={scrollSanteRef}
                showsVerticalScrollIndicator
                indicatorStyle={theme === "sombre" ? "white" : "black"}
                scrollEventThrottle={16}
                scrollEnabled
                bounces
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                style={{ flex: 1, width: "100%", display: vueModalStats === "sante" ? "flex" : "none" }}
                contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 26, paddingBottom: 60 }}
              >
              {/* RÈGLE À NE JAMAIS CASSER — REFONTE DU 2026-09-06 : en vue
                  partagée, remplace la carte individuelle (A-E ci-dessous,
                  scoreSante) + l'ancienne carte séparée "Scores partagés"
                  (MOI/PARTENAIRE/ENSEMBLE bruts) par UNE analyse globale du
                  couple (scoreEnsemble + 3 critères consolidés + détail par
                  personne). vueActive === "personnel" (ou hors espace)
                  retombe sur EXACTEMENT le rendu d'origine (branche `else`),
                  jamais modifié — demande explicite. */}
              {vueActive === "partage" && estDansUnEspace && scoreEnsemble ? (
                <View
                  style={[styles.serieCarte, { backgroundColor: C.fondSecondaire }]}
                >
                  {/* Score global unique — moyenne 50/50 (scoreEnsemble,
                      jamais repondérée par un montant, cf. RÈGLE à son site
                      de définition), même présentation (pill/delta absent
                      volontairement : pas de "scoreEnsembleMoisPrecedent"
                      fiable, le partenaire n'a pas d'historique accessible). */}
                  <View style={styles.serieEnTete}>
                    <View
                      style={[
                        styles.serieIconeFond,
                        { backgroundColor: couleurScoreTeinte(scoreEnsemble.mot, C) },
                      ]}
                    >
                      <Ionicons
                        name="pulse"
                        size={18}
                        color={couleurScoreForte(scoreEnsemble.mot, C)}
                      />
                    </View>
                    <Text style={[styles.serieTitre, { color: C.texte }]}>
                      Santé financière du couple
                    </Text>
                    <InfoBulle
                      titre="Comment ce score est calculé"
                      texte="Moyenne à 50/50 de ton score et de celui, estimé, de ton/ta partenaire — jamais pondérée par les montants dépensés (un score déjà sur 100 n'a aucune raison d'être repondéré par un montant en euros). Les 3 critères ci-dessous analysent votre situation à deux : épargne commune, dépenses communes et équilibre de contribution."
                    />
                  </View>

                  <View style={styles.scoreNombreLigne}>
                    <Text style={[styles.scoreNombre, { color: C.texte }]}>
                      {scoreEnsemble.score}
                    </Text>
                    <Text style={[styles.scoreSur100, { color: C.texteMuted }]}>
                      /100
                    </Text>
                    <View
                      style={[
                        styles.scoreMotPill,
                        { backgroundColor: couleurScoreTeinte(scoreEnsemble.mot, C) },
                      ]}
                    >
                      <Text
                        style={[
                          styles.scoreMotTexte,
                          { color: couleurScoreForte(scoreEnsemble.mot, C) },
                        ]}
                      >
                        {scoreEnsemble.mot}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.scoreContexteTexte, { color: C.texteMuted }]}>
                    Moyenne de ton score et de celui, estimé, de{" "}
                    {membrePartenaire?.prenom || "ton/ta partenaire"}.
                  </Text>

                  {/* Critères consolidés — épargne/dépenses/équilibre
                      communs, distincts des 5 critères individuels
                      (n'ont pas de sens à l'échelle du couple). */}
                  <View style={styles.scoreDetailsBloc}>
                    <View style={styles.scoreDetailLigne}>
                      <Text style={[styles.scoreDetailLabel, { color: C.texteMuted }]}>
                        Épargne commune
                      </Text>
                      <Text style={[styles.scoreDetailValeur, { color: C.texte }]}>
                        {scoreEpargneCommune}/100
                      </Text>
                    </View>
                    <View style={styles.scoreDetailLigne}>
                      <Text style={[styles.scoreDetailLabel, { color: C.texteMuted }]}>
                        Dépenses communes
                      </Text>
                      <Text style={[styles.scoreDetailValeur, { color: C.texte }]}>
                        {scoreDepensesCommunes !== null
                          ? `${Math.round(scoreDepensesCommunes)}/100`
                          : "Non disponible"}
                      </Text>
                    </View>
                    <View style={styles.scoreDetailLigne}>
                      <Text style={[styles.scoreDetailLabel, { color: C.texteMuted }]}>
                        Équilibre
                      </Text>
                      <Text style={[styles.scoreDetailValeur, { color: C.texte }]}>
                        {scoreEquilibre !== null ? `${scoreEquilibre}/100` : "Non disponible"}
                      </Text>
                    </View>
                  </View>

                  {/* Détail par personne — mêmes leviers que la vue
                      individuelle pour "Moi" (leviersScore, inchangé) ;
                      pendant plus limité pour le partenaire
                      (leviersPartenaireScore, cf. RÈGLE à sa définition —
                      un seul type de levier, pas d'objectifs/historique
                      accessibles pour son compte). */}
                  <View style={styles.scoreExplicationsBloc}>
                    <Text
                      style={[styles.scoreExplicationsLabel, { color: C.texteMuted }]}
                    >
                      Ce qui pourrait améliorer le score de{" "}
                      {objStore.prenom || "toi"}
                    </Text>
                    {leviersScore.length > 0 ? (
                      leviersScore.map((levier, i) => (
                        <View key={i} style={styles.levierLigne}>
                          <Text style={[styles.levierTexte, { color: C.texte }]}>
                            {i + 1}. {levier.texte}
                          </Text>
                          <TouchableOpacity
                            style={[styles.levierBouton, { borderColor: C.purple }]}
                            onPress={() => ouvrirSimulateurPour(levier.categorieId)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.levierBoutonTexte, { color: C.purple }]}>
                              Simuler
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ))
                    ) : (
                      <Text style={[styles.scorePartageIndispo, { color: C.texteMuted }]}>
                        Rien à signaler pour l&apos;instant.
                      </Text>
                    )}
                  </View>
                  <View style={styles.scoreExplicationsBloc}>
                    <Text
                      style={[styles.scoreExplicationsLabel, { color: C.texteMuted }]}
                    >
                      Ce qui pourrait améliorer le score de{" "}
                      {membrePartenaire?.prenom || "ton/ta partenaire"}
                    </Text>
                    {leviersPartenaireScore.length > 0 ? (
                      leviersPartenaireScore.map((levier, i) => (
                        <View key={i} style={styles.levierLigne}>
                          <Text style={[styles.levierTexte, { color: C.texte }]}>
                            {i + 1}. {levier.texte}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text style={[styles.scorePartageIndispo, { color: C.texteMuted }]}>
                        Rien à signaler pour l&apos;instant.
                      </Text>
                    )}
                    <Text
                      style={[
                        styles.scorePartageNote,
                        { color: C.texteMuted, marginTop: 8 },
                      ]}
                    >
                      Basé uniquement sur les catégories de{" "}
                      {membrePartenaire?.prenom || "ton/ta partenaire"} visibles
                      dans l&apos;espace partagé — son vrai score détaillé
                      reste privé.
                    </Text>
                  </View>
                </View>
              ) : (
                <View
                  style={[styles.serieCarte, { backgroundColor: C.fondSecondaire }]}
                >
                  {/* A. Score principal + delta + phrase de contexte */}
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
                      texte={`Ton score combine 5 signaux, pondérés puis ramenés sur 100 :\n\n• Maîtrise des dépenses (25 pts) : dépenses réelles vs budget total de tes catégories.\n• Régularité de suivi (20 pts) : la part de tes derniers jours où tu as enregistré une dépense.\n• Capacité d'épargne (20 pts) : ton rythme d'épargne récent.\n• Respect des objectifs (25 pts) : ta progression moyenne vers tes objectifs d'épargne en cours — ignoré si tu n'as aucun objectif actif, ses points sont alors répartis sur les autres critères.\n• Stabilité des dépenses (10 pts) : la régularité de tes dépenses totales d'un mois sur l'autre.\n\nUn signal indisponible ne pénalise jamais ta note, son poids est redistribué sur les autres.`}
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
                  {scoreSanteMoisPrecedent && (
                    <Text
                      style={[
                        styles.scoreDeltaTexte,
                        {
                          color:
                            scoreSante.score >= scoreSanteMoisPrecedent.score
                              ? C.vertText
                              : C.peachText,
                        },
                      ]}
                    >
                      {scoreSante.score >= scoreSanteMoisPrecedent.score ? "+" : ""}
                      {scoreSante.score - scoreSanteMoisPrecedent.score} pts ce mois
                    </Text>
                  )}
                  <Text style={[styles.scoreContexteTexte, { color: C.texteMuted }]}>
                    {scoreSante.score >= 75
                      ? "Situation globalement saine."
                      : scoreSante.score >= 50
                        ? "Quelques points à surveiller."
                        : "Plusieurs points méritent ton attention."}
                  </Text>

                  {/* B. Décomposition du score, 5 critères */}
                  <View style={styles.scoreDetailsBloc}>
                    {CRITERES_SCORE.map((cle) => (
                      <View key={cle} style={styles.scoreDetailLigne}>
                        <Text
                          style={[styles.scoreDetailLabel, { color: C.texteMuted }]}
                        >
                          {LIBELLES_CRITERE_SCORE[cle]}
                        </Text>
                        <Text style={[styles.scoreDetailValeur, { color: C.texte }]}>
                          {scoreSante.details[cle] !== null
                            ? `${Math.round(scoreSante.details[cle] as number)}/${POIDS_CRITERE_SCORE[cle]}`
                            : "Non disponible"}
                        </Text>
                      </View>
                    ))}
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

                  {/* C. Ce qui fait bouger ta note — deltas exacts (faits déjà
                      survenus), pas une projection. */}
                  {scoreSanteMoisPrecedent && (
                    <View style={styles.scoreExplicationsBloc}>
                      <Text
                        style={[styles.scoreExplicationsLabel, { color: C.texteMuted }]}
                      >
                        Ce qui fait bouger ta note
                      </Text>
                      {CRITERES_SCORE.filter(
                        (cle) =>
                          scoreSante.details[cle] !== null &&
                          scoreSanteMoisPrecedent.details[cle] !== null &&
                          Math.round(
                            (scoreSante.details[cle] as number) -
                              (scoreSanteMoisPrecedent.details[cle] as number),
                          ) !== 0,
                      ).map((cle) => {
                        const delta = Math.round(
                          (scoreSante.details[cle] as number) -
                            (scoreSanteMoisPrecedent.details[cle] as number),
                        );
                        return (
                          <View key={cle} style={styles.scoreExplicationItem}>
                            <View
                              style={[
                                styles.scoreExplicationDot,
                                { backgroundColor: delta > 0 ? C.vert : C.rouge },
                              ]}
                            />
                            <Text
                              style={[styles.scoreExplicationTexte, { color: C.texte }]}
                            >
                              {delta > 0 ? "+" : ""}
                              {delta} pts — {libellePourEvolutionCritere(cle, delta > 0)}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* D. Comment gagner des points — toujours "pourrait", jamais
                      de delta de points chiffré (projection). */}
                  {leviersScore.length > 0 && (
                    <View style={styles.scoreExplicationsBloc}>
                      <Text
                        style={[styles.scoreExplicationsLabel, { color: C.texteMuted }]}
                      >
                        Comment gagner des points
                      </Text>
                      {leviersScore.map((levier, i) => (
                        <View key={i} style={styles.levierLigne}>
                          <Text style={[styles.levierTexte, { color: C.texte }]}>
                            {i + 1}. {levier.texte}
                          </Text>
                          <TouchableOpacity
                            style={[styles.levierBouton, { borderColor: C.purple }]}
                            onPress={() => ouvrirSimulateurPour(levier.categorieId)}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.levierBoutonTexte, { color: C.purple }]}>
                              Simuler
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* E. Évolution dans le temps */}
                  {scoreTimeline.length > 0 && (
                    <View style={styles.scoreExplicationsBloc}>
                      <Text
                        style={[styles.scoreExplicationsLabel, { color: C.texteMuted }]}
                      >
                        Évolution dans le temps
                      </Text>
                      {scoreTimeline.map((point, i) => {
                        const precedent = i > 0 ? scoreTimeline[i - 1].score : null;
                        const raison = precedent
                          ? raisonPrincipaleVariation(point.score.details, precedent.details)
                          : null;
                        return (
                          <View key={`${point.annee}-${point.mois}`} style={styles.timelineLigne}>
                            <Text style={[styles.timelineMois, { color: C.texteMuted }]}>
                              {MOIS_LABELS_COMPLETS[point.mois]}
                            </Text>
                            <Text style={[styles.timelineScoreTexte, { color: C.texte }]}>
                              {point.score.score}/100
                            </Text>
                            {raison && (
                              <Text style={[styles.timelineRaisonTexte, { color: C.texteMuted }]}>
                                {raison}
                              </Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              <View style={{ height: 32 }} />
              </ScrollView>
            )}

            {/* === Onglet 3 : "Trophées" — regroupe les cartes de séries
                (déjà chacune sa propre carte) et la grille de trophées.
                Verrou consolidé "Ton bilan" depuis le 2026-09-12
                (TonBilanVerrou, déblocage par pub), sauf invité (cf. RÈGLE
                sur l'onglet Vista plus haut). */}
            {/* RÈGLE À NE JAMAIS CASSER — TOUJOURS MONTÉ, VISIBILITÉ VIA
                `display` : cf. RÈGLE identique sur l'onglet Vista plus haut. */}
            {!tonBilanVisible && vueModalStats === "trophees" && (
              <TonBilanVerrou
                hauteur={HAUTEUR_ONGLET_VERROUILLE}
                onDeverrouille={() => setTonBilanDebloque(true)}
              />
            )}
            {tonBilanVisible && (
              <ScrollView
                ref={scrollTropheesRef}
                showsVerticalScrollIndicator
                indicatorStyle={theme === "sombre" ? "white" : "black"}
                scrollEventThrottle={16}
                scrollEnabled
                bounces
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                style={{ flex: 1, width: "100%", display: vueModalStats === "trophees" ? "flex" : "none" }}
                contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 26, paddingBottom: 60 }}
              >
              {series.map((serie) => {
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

              <Text style={[styles.sousSectionTitreGroupe, { color: C.texteMuted }]}>
                TES TROPHÉES
              </Text>
              <View style={styles.trophesGrille}>
                {trophees.map((trophee) => (
                  <View
                    key={trophee.id}
                    style={[
                      styles.tropheeCarte,
                      { backgroundColor: C.fondSecondaire, borderColor: C.carteBorder },
                      !trophee.debloque && { opacity: 0.55 },
                    ]}
                  >
                    <View
                      style={[
                        styles.tropheeIconeFond,
                        { backgroundColor: trophee.debloque ? C.vertLight : C.carte },
                      ]}
                    >
                      <Ionicons
                        name={trophee.debloque ? "trophy" : "lock-closed-outline"}
                        size={18}
                        color={trophee.debloque ? C.vertText : C.texteMuted}
                      />
                    </View>
                    <Text
                      style={[
                        styles.tropheeTitre,
                        { color: trophee.debloque ? C.texte : C.texteMuted },
                      ]}
                    >
                      {trophee.titre}
                    </Text>
                    <Text
                      style={[styles.tropheeDescription, { color: C.texteMuted }]}
                      numberOfLines={3}
                    >
                      {trophee.description}
                    </Text>
                    {trophee.niveau && (
                      <View
                        style={[
                          styles.tropheeNiveauPill,
                          { backgroundColor: couleurNiveauTrophee(trophee.niveau) },
                        ]}
                      >
                        <Text style={styles.tropheeNiveauTexte}>
                          {trophee.niveau === "bronze"
                            ? "Bronze"
                            : trophee.niveau === "argent"
                              ? "Argent"
                              : "Or"}
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>

              <View style={{ height: 32 }} />
              </ScrollView>
            )}

            {/* === Onglet 4 : "Et si..." (Simulateur) — verrou consolidé
                "Ton bilan" depuis le 2026-09-12 (TonBilanVerrou, déblocage
                par pub), comme les 3 autres onglets. Un invité PEUT
                consulter cet onglet comme les 3 autres (cf. RÈGLE sur
                l'onglet Vista plus haut) — c'est le seul onglet où,
                contrairement aux 3 autres, le blocage invité reste actif,
                mais déplacé au niveau des
                actions qui écrivent réellement en base (bloquerSiInvite sur
                creerObjectifDepuisSimulationInverse/
                confirmerAdoptionScenario), jamais sur la simple lecture. */}
            {/* RÈGLE À NE JAMAIS CASSER — TOUJOURS MONTÉ, VISIBILITÉ VIA
                `display` : cf. RÈGLE identique sur l'onglet Vista plus haut. */}
            {!tonBilanVisible && vueModalStats === "simulateur" && (
              <TonBilanVerrou
                hauteur={HAUTEUR_ONGLET_VERROUILLE}
                onDeverrouille={() => setTonBilanDebloque(true)}
              />
            )}
            {tonBilanVisible && (
              <ScrollView
                ref={scrollSimulateurRef}
                showsVerticalScrollIndicator
                indicatorStyle={theme === "sombre" ? "white" : "black"}
                scrollEventThrottle={16}
                scrollEnabled
                bounces
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                style={{ flex: 1, width: "100%", display: vueModalStats === "simulateur" ? "flex" : "none" }}
                contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 26, paddingBottom: 60 }}
              >
              {(
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
                      texte="Choisis une catégorie et ajuste le curseur pour voir l'impact sur ton budget. Ex : si tu réduis tes sorties de 30€/mois, tu économises 360€ sur un an."
                      taille={18}
                      couleur={C.texteMuted}
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
                                <View style={styles.tiroirNomColonne}>
                                  <Text
                                    style={[styles.tiroirNom, { color: C.texte }]}
                                    numberOfLines={1}
                                  >
                                    {env.nom}
                                  </Text>
                                  {/* RÈGLE À NE JAMAIS CASSER : une catégorie
                                      Fixe reste sélectionnable ici (ex:
                                      simuler un déménagement qui change le
                                      loyer) mais jamais suggérée comme un
                                      "levier" d'économie facile — cette
                                      mention discrète le rappelle sans
                                      bloquer la sélection. */}
                                  {env.type === "Fixe" && (
                                    <Text
                                      style={[styles.tiroirNomFixe, { color: C.texteMuted }]}
                                      numberOfLines={1}
                                    >
                                      Dépense fixe — difficile à modifier
                                    </Text>
                                  )}
                                </View>
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
                            value={pourcentageSimule}
                            minimumValue={-100}
                            maximumValue={100}
                            step={5}
                            onValueChange={setPourcentageSimule}
                            minimumTrackTintColor={couleurSliderSimulation}
                            maximumTrackTintColor={C.separateur}
                            thumbTintColor={couleurSliderSimulation}
                            accessibilityLabel={`Budget simulé pour ${enveloppeSimulee.nom}, ${pourcentageSimule > 0 ? "+" : ""}${pourcentageSimule}% du budget actuel`}
                            style={styles.simulateurSlider}
                          />

                          {/* Barre de temporalité : période de projection. */}
                          <View style={styles.temporaliteEnTete}>
                            <Text
                              style={[styles.serieDescription, { color: C.texteMuted, flex: 1 }]}
                            >
                              Durée de la simulation
                            </Text>
                            <InfoBulle
                              titre="Durée de la simulation"
                              texte="Choisis la durée de ta simulation. Ex : une réduction de 20€/mois représente 240€ économisés sur 12 mois."
                              taille={18}
                              couleur={C.texteMuted}
                            />
                          </View>
                          <View style={styles.periodeSimulationRow}>
                            {[1, 3, 6, 12, 24].map((mois) => (
                              <TouchableOpacity
                                key={mois}
                                style={[
                                  styles.chip,
                                  { backgroundColor: C.fondSecondaire, borderColor: C.carteBorder },
                                  periodeSimulationMois === mois && {
                                    backgroundColor: C.purple,
                                    borderColor: C.purple,
                                  },
                                ]}
                                onPress={() => setPeriodeSimulationMois(mois)}
                                activeOpacity={0.7}
                              >
                                <Text
                                  style={[
                                    styles.chipTexte,
                                    { color: C.texteMuted },
                                    periodeSimulationMois === mois && styles.chipTexteActif,
                                  ]}
                                >
                                  {mois < 12 ? `${mois} mois` : mois === 12 ? "1 an" : "2 ans"}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>

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
                            {/* Toujours montées (opacité togglée, jamais
                                démontées) pour que leur hauteur reste
                                réservée en permanence : les démonter quand
                                ecartMensuelSimule passe par 0 pendant le
                                glissement du curseur faisait sauter tout ce
                                qui suit (graphique + légende) à chaque
                                aller-retour, donnant l'impression que le
                                graphique se redimensionnait. */}
                            <View
                              style={{
                                opacity: ecartMensuelSimule !== 0 ? 1 : 0,
                              }}
                              accessibilityElementsHidden={
                                ecartMensuelSimule === 0
                              }
                              importantForAccessibility={
                                ecartMensuelSimule !== 0
                                  ? "yes"
                                  : "no-hide-descendants"
                              }
                            >
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
                              <View style={styles.serieExplicationLigne}>
                                <View
                                  style={[
                                    styles.serieExplicationDot,
                                    { backgroundColor: ecartMensuelSimule > 0 ? C.vert : C.peach },
                                  ]}
                                />
                                <Text
                                  style={[styles.serieExplicationTexte, { color: C.texte }]}
                                >
                                  {ecartMensuelSimule > 0
                                    ? objectifPourSimulation && moisGagnesSimulation
                                      ? `Cela te permettrait d'atteindre ${objectifPourSimulation.nom} environ ${moisGagnesSimulation} mois plus tôt.`
                                      : !objectifPourSimulation
                                        ? `Cela représente ${formaterMontant(Math.abs(impactTotal6MoisSimulation))}€ d'épargne supplémentaire sur ${NB_MOIS_PROJECTION} mois — de quoi démarrer un objectif ou constituer une réserve.`
                                        : `Cette modification libère ${formaterMontant(ecartMensuelSimule)}€/mois sur cette catégorie.`
                                    : `Cette modification coûte ${formaterMontant(Math.abs(ecartMensuelSimule))}€/mois de plus sur cette catégorie.`}
                                </Text>
                                <InfoBulle
                                  titre="Impact sur ton objectif"
                                  texte="Vista calcule automatiquement l'impact de ta simulation sur ton objectif d'épargne. Ex : réduire les restaurants de 30€/mois te permettrait d'atteindre ton objectif Vacances 4 mois plus tôt."
                                  taille={18}
                                  couleur={C.texteMuted}
                                />
                              </View>
                            </View>
                          </View>

                          {/* Hauteur fixée en dur (HAUTEUR_GRAPHIQUE_SIMULATEUR
                              = 150, littéral, identique à celle du <Svg>
                              interne via hauteurGraphique) et overflow
                              hidden : quelle que soit l'amplitude des
                              courbes au fil du glissement du curseur, ce
                              conteneur n'est jamais redimensionné, donc la
                              légende juste en dessous ne peut plus être
                              poussée hors de l'écran. */}
                          <View
                            style={{
                              height: HAUTEUR_GRAPHIQUE_SIMULATEUR,
                              overflow: "hidden",
                            }}
                          >
                            <GraphiqueLignes
                              donneesReelles={donneesReellesSimulation}
                              donneesPrevisionnelles={donneesPrevisionnellesSimulation}
                              labels={labelsSimulation}
                              couleurs={C}
                              hauteurGraphique={CHART_H_SIMULATEUR}
                            />
                          </View>
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

                  {/* B. Simulation inverse */}
                  <View style={[styles.simulateurSousSection, { borderTopColor: C.separateur }]}>
                    <View style={styles.serieEnTete}>
                      <Text style={[styles.serieTitre, { color: C.texte, fontSize: 15 }]}>
                        Combien veux-tu économiser ?
                      </Text>
                      <InfoBulle
                        titre="Simulation inverse"
                        texte="Indique combien tu veux économiser et Vista te propose comment y arriver. Ex : objectif 600€ en 6 mois → il te manque 100€/mois → Vista suggère 3 façons d'y arriver."
                        taille={18}
                        couleur={C.texteMuted}
                      />
                    </View>
                    <TextInput
                      style={[styles.inputSeuil, { color: C.texte, backgroundColor: C.carte, marginTop: 10 }]}
                      placeholder="Montant en €"
                      placeholderTextColor={C.texteMuted}
                      keyboardType="numeric"
                      value={montantCibleInverse}
                      onChangeText={(t) => setMontantCibleInverse(sanitizeMontantInput(t))}
                    />
                    <View style={styles.periodeSimulationRow}>
                      {[3, 6, 12, 24].map((mois) => (
                        <TouchableOpacity
                          key={mois}
                          style={[
                            styles.chip,
                            { backgroundColor: C.fondSecondaire, borderColor: C.carteBorder },
                            periodeInverseMois === mois && {
                              backgroundColor: C.purple,
                              borderColor: C.purple,
                            },
                          ]}
                          onPress={() => setPeriodeInverseMois(mois)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.chipTexte,
                              { color: C.texteMuted },
                              periodeInverseMois === mois && styles.chipTexteActif,
                            ]}
                          >
                            {mois < 12 ? `${mois} mois` : mois === 12 ? "1 an" : "2 ans"}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {montantCibleInverseNum > 0 &&
                      (manqueParMoisInverse <= 0 ? (
                        <Text
                          style={[styles.serieExplicationTexte, { color: C.texte, marginTop: 10 }]}
                        >
                          Ton rythme d&apos;épargne actuel suffit déjà pour atteindre{" "}
                          {formaterMontant(montantCibleInverseNum)}€ sur {periodeInverseMois} mois.
                        </Text>
                      ) : (
                        <>
                          <Text
                            style={[
                              styles.serieExplicationTexte,
                              { color: C.texte, marginTop: 10, fontWeight: "700" },
                            ]}
                          >
                            Il te manque environ {formaterMontant(manqueParMoisInverse)}€/mois.
                          </Text>
                          {categorieInverseA && (
                            <Text
                              style={[
                                styles.serieExplicationTexte,
                                { color: C.texteMuted, marginTop: 6 },
                              ]}
                            >
                              Option A : réduire {categorieInverseA.nom} de{" "}
                              {formaterMontant(Math.min(manqueParMoisInverse, categorieInverseA.budget))}€
                            </Text>
                          )}
                          {categorieInverseB && (
                            <Text
                              style={[styles.serieExplicationTexte, { color: C.texteMuted }]}
                            >
                              Option B : réduire {categorieInverseB.nom} de{" "}
                              {formaterMontant(Math.min(manqueParMoisInverse, categorieInverseB.budget))}€
                            </Text>
                          )}
                          {categoriesInverseCombinaison.length > 1 && (
                            <Text
                              style={[styles.serieExplicationTexte, { color: C.texteMuted }]}
                            >
                              Option C : combiner {categoriesInverseCombinaison.map((e) => e.nom).join(", ")}{" "}
                              pour {formaterMontant(Math.min(manqueParMoisInverse, budgetVariableTotalInverse))}€ au total
                            </Text>
                          )}
                          {objStore.objectifs.filter((o) => !o.ferme).length === 0 && (
                            <TouchableOpacity
                              style={[styles.tiroirBouton, { backgroundColor: C.purpleLight, borderColor: C.purple, marginTop: 10 }]}
                              onPress={creerObjectifDepuisSimulationInverse}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.tiroirBoutonTexte, { color: C.purple }]}>
                                Créer un objectif à partir de cette simulation
                              </Text>
                            </TouchableOpacity>
                          )}
                        </>
                      ))}
                  </View>

                  {/* C. Scénarios comparatifs */}
                  <View style={[styles.simulateurSousSection, { borderTopColor: C.separateur }]}>
                    <View style={styles.serieEnTete}>
                      <Text style={[styles.serieTitre, { color: C.texte, fontSize: 15 }]}>
                        Scénarios comparatifs
                      </Text>
                      <InfoBulle
                        titre="Scénarios comparatifs"
                        texte="Compare plusieurs niveaux d'effort pour atteindre ton objectif. Ex : scénario prudent (-20€ restaurants), intermédiaire (-30€ restaurants -20€ loisirs), ambitieux (-50€ restaurants -40€ loisirs)."
                        taille={18}
                        couleur={C.texteMuted}
                      />
                    </View>
                    {scenariosComparatifs.map((scenario) => (
                      <View
                        key={scenario.id}
                        style={[styles.scenarioCarte, { borderColor: C.carteBorder }]}
                      >
                        <Text style={[styles.scenarioTitre, { color: C.texte }]}>
                          {scenario.titre}
                        </Text>
                        <Text style={[styles.scenarioDetail, { color: C.texteMuted }]}>
                          {scenario.reductions.length > 0
                            ? scenario.reductions.map((r) => r.enveloppe.nom).join(", ")
                            : "Aucune catégorie éligible"}
                        </Text>
                        <Text style={[styles.scenarioDetail, { color: C.texte }]}>
                          Économie sur 12 mois : environ {formaterMontant(scenario.economie12Mois)}€
                        </Text>
                        {scenario.moisGagnesScenario !== null && scenario.moisGagnesScenario > 0 && (
                          <Text style={[styles.scenarioDetail, { color: C.vertText }]}>
                            Objectif atteint environ {scenario.moisGagnesScenario} mois plus tôt
                          </Text>
                        )}
                        <TouchableOpacity
                          style={[styles.btnAdopterScenario, { backgroundColor: C.purple }]}
                          onPress={() => confirmerAdoptionScenario(scenario)}
                          activeOpacity={0.8}
                          disabled={scenario.reductions.length === 0}
                        >
                          <Text style={styles.btnAdopterScenarioTexte}>Adopter ce scénario</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <View style={{ height: 32 }} />
              </ScrollView>
            )}

            {/* RÈGLE À NE JAMAIS CASSER — PAS DE VERROU GLOBAL "TON BILAN"
                POUR LES INVITÉS : un compte invité a accès en LECTURE aux 4
                onglets (Vista/Santé/Trophées/Simulateur, cf. RÈGLE sur
                l'onglet Vista plus haut) — seules les actions qui écrivent
                réellement en base dans l'onglet Simulateur sont bloquées
                (bloquerSiInvite sur creerObjectifDepuisSimulationInverse/
                confirmerAdoptionScenario), jamais la modale entière. Un
                ancien overlay `{isGuest && ...}` bloquait ici
                inconditionnellement les 4 onglets derrière "Crée un compte
                pour accéder aux statistiques complètes" — supprimé
                volontairement, ne pas le réintroduire. */}
          </View>
        </View>
      </Modal>

      <Modal
        visible={detailFiltreType !== null}
        transparent
        animationType={reduireAnimations ? "none" : "fade"}
        onRequestClose={() => setDetailFiltreType(null)}
      >
        <TouchableOpacity
          style={[
            styles.modalOverlayTouch,
            estTablette && styles.modalOverlayTouchTablette,
          ]}
          activeOpacity={1}
          onPress={() => setDetailFiltreType(null)}
        >
          <TouchableOpacity
            style={[
              styles.modalCard,
              { backgroundColor: C.carte },
              styleModaleTablette(estTablette),
            ]}
            activeOpacity={1}
            onPress={() => {}}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitre, { color: C.texte }]}>
                Détail — {detailFiltreType === "prevu" ? "Dépenses prévues" : "Dépensé"}
              </Text>
              <TouchableOpacity
                onPress={() => setDetailFiltreType(null)}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel="Fermer"
              >
                <Ionicons name="close" size={22} color={C.texteMuted} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.detailFiltreSousTitre, { color: C.texteMuted }]}>
              {labelPeriode} · Total {formaterMontant(
                detailFiltreType === "prevu" ? totalPrevuPeriode : totalReelPeriode,
              )}{" "}
              €
            </Text>
            <ScrollView
              style={styles.detailFiltreListe}
              showsVerticalScrollIndicator={false}
            >
              {(detailFiltreType === "prevu"
                ? detailParCategoriePrevu
                : detailParCategorieReel
              ).map((c) => (
                <View key={c.id} style={styles.detailFiltreLigne}>
                  <View
                    style={[styles.legendeDot, { backgroundColor: c.couleur }]}
                  />
                  <Text
                    style={[styles.detailFiltreNom, { color: C.texte }]}
                    numberOfLines={1}
                  >
                    {c.nom}
                  </Text>
                  <Text style={[styles.detailFiltreMontant, { color: C.texte }]}>
                    {formaterMontant(c.montant)} €
                  </Text>
                </View>
              ))}
              <View style={{ height: 12 }} />
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={detailCategorieParMois !== null}
        transparent
        animationType={reduireAnimations ? "none" : "fade"}
        onRequestClose={() => setDetailCategorieParMois(null)}
      >
        <TouchableOpacity
          style={[
            styles.modalOverlayTouch,
            estTablette && styles.modalOverlayTouchTablette,
          ]}
          activeOpacity={1}
          onPress={() => setDetailCategorieParMois(null)}
        >
          <TouchableOpacity
            style={[
              styles.modalCard,
              { backgroundColor: C.carte },
              styleModaleTablette(estTablette),
            ]}
            activeOpacity={1}
            onPress={() => {}}
          >
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View
                  style={[
                    styles.legendeDot,
                    { backgroundColor: detailCategorieParMois?.couleur },
                  ]}
                />
                <Text style={[styles.modalTitre, { color: C.texte }]}>
                  {detailCategorieParMois?.label}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setDetailCategorieParMois(null)}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel="Fermer"
              >
                <Ionicons name="close" size={22} color={C.texteMuted} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.detailFiltreSousTitre, { color: C.texteMuted }]}>
              Mois où cette catégorie a eu des données
            </Text>
            <ScrollView
              style={styles.detailFiltreListe}
              showsVerticalScrollIndicator={false}
            >
              {detailCategorieParMois?.lignes.map((l) => (
                <View key={l.moisLabel} style={styles.detailFiltreLigne}>
                  <Text
                    style={[styles.detailFiltreNom, { color: C.texte }]}
                    numberOfLines={1}
                  >
                    {l.moisLabel}
                  </Text>
                  <Text style={[styles.detailFiltreMontant, { color: C.texte }]}>
                    {formaterMontant(l.montant)} €
                  </Text>
                </View>
              ))}
              <View style={{ height: 12 }} />
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <TutorielOverlay
        actif={!tutorielStatsVu}
        etapes={ETAPES_STATS}
        positions={posCiblesTutoriel}
        scrollOffset={scrollOffsetStats}
        onTerminer={() => {
          marquerTutorielVu("stats");
          tiroirsOuvertsPourTutorielRef.current = false;
          setScrollOffsetStats(0);
        }}
        onFermer={() => {
          marquerTutorielVu("stats");
          tiroirsOuvertsPourTutorielRef.current = false;
          setScrollOffsetStats(0);
        }}
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

// Couleurs "médaille" simples pour le trophée à paliers "Régularité" — pas
// de dépendance au thème, un bronze/argent/or reste reconnaissable dans les
// deux modes.
function couleurNiveauTrophee(niveau: "bronze" | "argent" | "or"): string {
  if (niveau === "or") return "#D4AF37";
  if (niveau === "argent") return "#A8A8B3";
  return "#CD7F32";
}

const CRITERES_SCORE = ["budget", "regularite", "epargne", "objectifs", "stabilite"] as const;

const LIBELLES_CRITERE_SCORE: Record<(typeof CRITERES_SCORE)[number], string> = {
  budget: "Maîtrise des dépenses",
  regularite: "Régularité de suivi",
  epargne: "Capacité d'épargne",
  objectifs: "Respect des objectifs",
  stabilite: "Stabilité des dépenses",
};

// Échelle d'affichage de chaque critère — doit rester synchronisée avec
// POIDS dans utils/score.ts (non exporté, ce sont ici uniquement les
// libellés "/25", "/20"... affichés, pas la logique de calcul elle-même).
const POIDS_CRITERE_SCORE: Record<(typeof CRITERES_SCORE)[number], number> = {
  budget: 25,
  regularite: 20,
  epargne: 25,
  objectifs: 20,
  stabilite: 10,
};

// Note, section C : phrase courte associée à l'évolution d'un critère —
// jamais le nom brut du critère seul, une vraie narration ("Budget mieux
// respecté" plutôt que "Maîtrise des dépenses : +8").
function libellePourEvolutionCritere(
  cle: (typeof CRITERES_SCORE)[number],
  positif: boolean,
): string {
  switch (cle) {
    case "budget":
      return positif ? "Budget respecté ce mois" : "Dépassements plus marqués";
    case "regularite":
      return positif ? "Suivi plus régulier" : "Suivi moins régulier";
    case "epargne":
      return positif ? "Épargne plus régulière" : "Épargne moins régulière";
    case "objectifs":
      return positif ? "Objectifs mieux tenus" : "Objectifs qui ralentissent";
    case "stabilite":
      return positif ? "Dépenses plus stables" : "Dépenses plus irrégulières";
  }
}

// Note, section E : le critère qui explique le mieux la variation d'un
// mois à l'autre (le plus gros |delta|), pour donner une "raison
// principale" à chaque point de la timeline sans avoir à tout détailler.
function raisonPrincipaleVariation(
  actuel: DecompositionScore,
  precedent: DecompositionScore,
): string | null {
  let meilleur: { cle: (typeof CRITERES_SCORE)[number]; delta: number } | null = null;
  CRITERES_SCORE.forEach((cle) => {
    const a = actuel[cle];
    const p = precedent[cle];
    if (a === null || p === null) return;
    const delta = a - p;
    if (!meilleur || Math.abs(delta) > Math.abs(meilleur.delta)) {
      meilleur = { cle, delta };
    }
  });
  if (!meilleur || Math.abs((meilleur as { delta: number }).delta) < 1) return null;
  const { cle, delta } = meilleur as { cle: (typeof CRITERES_SCORE)[number]; delta: number };
  return libellePourEvolutionCritere(cle, delta > 0);
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
  // RÈGLE : remplace periodeBouton/periodeBoutonLabel/periodeBoutonValeur
  // (ancien bouton ouvrant le Picker modal, retiré au redesign du
  // 2026-09-13).
  periodeChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  periodeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  // RÈGLE : flexShrink:1 (contrainte visuelle demandée) — le label rétrécit
  // plutôt que de forcer le chip (ou la rangée) à déborder.
  periodeChipTexte: { fontSize: 13, fontWeight: "600", flexShrink: 1 },
  modalOverlayTouch: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end",
  },
  // RÈGLE — iPad : centre horizontalement une modale bottom-sheet plutôt
  // que de la laisser s'étirer sur toute la largeur d'un iPad — combinée à
  // styleModaleTablette() sur le conteneur de contenu lui-même (qui pose la
  // largeur max). Jamais appliqué seul, toujours avec modalOverlayTouch en
  // premier élément du tableau de style.
  modalOverlayTouchTablette: {
    alignItems: "center",
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
    // RÈGLE À NE JAMAIS CASSER : paddingHorizontal posé ICI (et sur tabsRow),
    // PAS sur modalCardBadges — cf. RÈGLE juste en dessous, sur
    // modalCardBadges, pour la raison exacte.
    paddingHorizontal: 26,
  },
  modalTitre: { fontSize: 18, fontWeight: "700" },
  modalTermine: { fontSize: 16, fontWeight: "600" },
  detailFiltreSousTitre: { fontSize: 13, marginTop: 4, marginBottom: 14 },
  detailFiltreListe: { maxHeight: 340 },
  detailFiltreLigne: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  detailFiltreNom: { flex: 1, fontSize: 14, fontWeight: "600" },
  detailFiltreMontant: { fontSize: 14, fontWeight: "700" },
  modalCardBadges: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    // RÈGLE À NE JAMAIS CASSER — JAMAIS DE paddingHorizontal/paddingBottom
    // ICI : ce conteneur est le PARENT direct des 4 ScrollView de "Ton
    // bilan" — tout padding posé ici les rétrécit, laissant une bande
    // (le padding) EN DEHORS des limites tactiles du ScrollView, où le
    // scroll ne répond pas (bug confirmé : "le scroll ne fonctionne que
    // sur la zone grisée, pas sur les bords blancs"). Le padding
    // équivalent vit désormais DANS le contenu scrollable
    // (contentContainerStyle de chaque ScrollView, cf.
    // scrollVistaRef/scrollSanteRef/scrollTropheesRef/scrollSimulateurRef)
    // et sur modalHeader/tabsRow (qui restent, eux, hors du ScrollView par
    // design) — jamais sur ce conteneur partagé.
    // RÈGLE À NE JAMAIS CASSER — HAUTEUR FIXE (`height`, JAMAIS `maxHeight`) :
    // `height` est posé au site d'appel via HAUTEUR_MODALE_TON_BILAN (cf.
    // RÈGLE "À NE JAMAIS CASSER — HAUTEUR DE LA MODALE" dans le corps du
    // composant) — jamais ici en dur, ni remplacé par `maxHeight`, qui ne
    // fournit pas de base définie aux 4 ScrollView `flex: 1` de "Ton bilan"
    // (scrollVistaRef/scrollSanteRef/scrollTropheesRef/scrollSimulateurRef)
    // et fait s'effondrer toute la modale (régression déjà rencontrée).
    // "Ton bilan" a 4 onglets, CHACUN avec son propre ScrollView — jamais un
    // second ScrollView imbriqué DANS un onglet, ni une View à hauteur
    // fixe séparée, sous peine de retrouver le problème "tiroirs/onglets
    // écrasés en bas de page" déjà rencontré.
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
  temporaliteEnTete: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
  },
  serieIconeFond: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  serieTitre: { fontSize: 15, fontWeight: "700", flex: 1 },
  tabsRow: {
    flexDirection: "row",
    borderRadius: 14,
    padding: 4,
    // RÈGLE : marginHorizontal (pas paddingHorizontal, déjà `padding: 4`
    // ci-dessus pour l'espacement interne des boutons) — aligne ce sélecteur
    // sur modalHeader et le contenu scrollable, cf. RÈGLE sur
    // modalCardBadges (plus de paddingHorizontal partagé).
    marginHorizontal: 26,
    marginBottom: 12,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: "center",
  },
  tabBtnActif: {},
  tabTexte: { fontSize: 13, fontWeight: "600" },
  sousSectionTitreGroupe: {
    fontSize: 12,
    fontWeight: "700",
    marginTop: 14,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
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
  scoreDeltaTexte: { fontSize: 13, fontWeight: "700", marginTop: -8, marginBottom: 6 },
  scoreContexteTexte: { fontSize: 13, marginBottom: 14 },
  scoreDetailsBloc: { gap: 8 },
  scoreDetailLigne: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  scoreDetailLabel: { fontSize: 13 },
  scoreDetailValeur: { fontSize: 13, fontWeight: "700" },
  scorePartageIndispo: { fontSize: 13, fontStyle: "italic" },
  scorePartageNote: { fontSize: 11, marginTop: 12, lineHeight: 16 },
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
  levierLigne: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  levierTexte: { flex: 1, fontSize: 13, lineHeight: 19 },
  levierBouton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  levierBoutonTexte: { fontSize: 12, fontWeight: "700" },
  timelineLigne: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  timelineMois: { fontSize: 12, width: 72 },
  timelineScoreTexte: { fontSize: 13, fontWeight: "700", width: 52 },
  timelineRaisonTexte: { flex: 1, fontSize: 12 },
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
  fluxVideTexte: { fontSize: 13, fontWeight: "500", marginTop: 8 },
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
  tiroirNomColonne: { flex: 1 },
  tiroirNom: { fontSize: 14, color: "#1A1A1A", fontWeight: "500" },
  tiroirNomFixe: { fontSize: 11, fontWeight: "500", marginTop: 1 },
  tiroirReset: { padding: 14, alignItems: "center" },
  tiroirResetTexte: { fontSize: 13, color: "#999", fontWeight: "600" },
  filtreImpactTexte: {
    fontSize: 12,
    marginBottom: 10,
    fontStyle: "italic",
  },
  tiroirGroupeLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  // Grille de pastilles (3 par ligne) — width en % plutôt que gap seul, pour
  // garantir exactement 3 par ligne quelle que soit la largeur de l'écran
  // (un simple flexWrap+gap laisserait le nombre par ligne varier).
  tiroirGrille: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 12,
    rowGap: 8,
  },
  tiroirPastille: {
    width: "31%",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  tiroirNomGrille: { flexShrink: 1, fontSize: 12, fontWeight: "500" },
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
  periodeSimulationRow: { flexDirection: "row", gap: 6, marginTop: 10, flexWrap: "wrap" },
  simulateurSousSection: { borderTopWidth: 0.5, marginTop: 20, paddingTop: 16 },
  scenarioCarte: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  scenarioTitre: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
  scenarioDetail: { fontSize: 12, lineHeight: 18 },
  btnAdopterScenario: {
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center",
    marginTop: 10,
  },
  btnAdopterScenarioTexte: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  trophesGrille: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tropheeCarte: {
    width: "47%",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  tropheeIconeFond: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  tropheeTitre: { fontSize: 13, fontWeight: "700", marginBottom: 4 },
  tropheeDescription: { fontSize: 11, lineHeight: 15 },
  tropheeNiveauPill: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 8,
  },
  tropheeNiveauTexte: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
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
  kpiFusionneRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
  kpiFusionneCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    borderWidth: 0.5,
  },
  equilibreLigne: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 0.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  equilibreLigneTexte: { fontSize: 12, fontWeight: "600", flex: 1 },
  kpiLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 4,
    flexShrink: 1,
  },
  // RÈGLE À NE JAMAIS CASSER : flexShrink vaut 0 par défaut en React Native
  // (contrairement au web) — sans flexShrink:1 sur kpiLabel ET flexWrap sur
  // cette rangée, le libellé ("DÉPENSE MOY. / JOUR") ne pouvait ni rétrécir
  // ni passer à la ligne quand la taille de texte d'accessibilité augmente
  // (cf. app/AccessibiliteContext.tsx, ECHELLES_TEXTE jusqu'à 1.3x) : il
  // débordait de la kpiCard et poussait/coupait la bulle d'info hors de sa
  // position. flexWrap fait retomber la bulle sur la ligne suivante,
  // toujours immédiatement après le texte, plutôt que de la faire déborder.
  kpiLabelRow: {
    flexDirection: "row",
    flexWrap: "wrap",
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
  // RÈGLE À NE JAMAIS CASSER : flexWrap obligatoire — sans lui, une légende
  // avec beaucoup de catégories déborde du cadre sur une seule ligne au
  // lieu de passer automatiquement à la ligne suivante (bug confirmé).
  legendeRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, rowGap: 8, marginTop: 12 },
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
  // Légende du donut couple (GraphiqueDonutCouple) — dédiée, JAMAIS
  // jaugeLegende* ci-dessus (réutilisée telle quelle par JaugeRepartition
  // ailleurs) : nom et montant/pourcentage sur deux lignes, police plus
  // grande, espacement généreux (corrige la légende illisible, demande du
  // 2026-09-06).
  coupleLegende: { gap: 14 },
  coupleLegendeItem: { gap: 4 },
  coupleLegendeHautRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  coupleDot: { width: 10, height: 10, borderRadius: 5 },
  coupleNom: { flex: 1, fontSize: 16, fontWeight: "700" },
  couplePct: { fontSize: 14, fontWeight: "500", marginLeft: 18 },
  // Graphique 3 "Répartition par personne" (refonte du 2026-09-06) — une
  // ligne par catégorie, plus d'espace vertical assumé (demande explicite).
  repartitionCategorieListe: { gap: 18 },
  repartitionCategorieLigne: { gap: 4 },
  repartitionCategorieHautRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  repartitionCategorieNom: { width: 84, fontSize: 14, fontWeight: "600" },
  // Rail de fond (largeur = zone disponible) : toujours pleine largeur,
  // C.separateur — cf. RÈGLE détaillée au composant, "largeur du rail" est
  // la référence des 100% (catégorie la plus chère du mois).
  repartitionCategorieBarreZone: {
    flex: 1,
    height: 16,
    borderRadius: 8,
    overflow: "hidden",
  },
  // Barre colorée elle-même : largeur posée dynamiquement en inline style
  // (proportionnelle au montant, cf. composant) — jamais flex:1 ici.
  repartitionCategorieBarreFond: {
    flexDirection: "row",
    height: "100%",
  },
  repartitionCategorieMontant: {
    width: 60,
    textAlign: "right",
    fontSize: 14,
    fontWeight: "700",
  },
  // marginLeft = largeur de repartitionCategorieNom + son gap dans
  // repartitionCategorieHautRow, pour aligner ce texte sous la barre plutôt
  // que sous le nom de catégorie.
  repartitionCategoriePct: { fontSize: 12, fontWeight: "500", marginLeft: 92 },
  modeBalanceRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  modeBalanceChip: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  // RÈGLE : flexShrink:1 (demande du 2026-09-13) — permet au label de
  // rétrécir plutôt que de pousser l'icône info hors du chip ou de passer
  // à la ligne, sur les libellés les plus longs ("Personnalisé").
  modeBalanceChipTexte: { fontSize: 13, fontWeight: "600", flexShrink: 1 },
  balanceBarreLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  balanceBarreMontant: { fontSize: 12, fontWeight: "600" },
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
  depensePrevuDelta: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  toggleModeTexte: { fontSize: 12, fontWeight: "700" },
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
  observationLigne: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  observationTexte: { flex: 1, fontSize: 13, lineHeight: 19 },
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

