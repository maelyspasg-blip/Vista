import { useEffect, useMemo, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { dureeAnimation } from "./AccessibiliteContext";
import { formaterMontant } from "../utils/montant";
import { COULEURS } from "./ThemeContext";

// RÈGLE À NE JAMAIS CASSER : ce composant n'affiche QUE des montants déjà
// réalisés (enveloppe.depense, transactions réelles) — jamais un budget
// prévu, une projection ou un forecast. Il répond uniquement à "où est
// réellement allé mon argent ?". Le composant lui-même reste "bête" (aucun
// accès au store, aucun calcul de période) : toute l'agrégation par
// période/dédup par nom vit côté appelant (app/(tabs)/analytics.tsx).
//
// RÈGLE À NE JAMAIS CASSER : la vue initiale doit être COMPLÈTE et
// AUTONOME — l'utilisateur comprend "d'où vient son argent et où il est
// allé" en un coup d'œil, sans taper nulle part. Les colonnes fournies
// s'affichent TOUJOURS simultanément (jamais de navigation/changement de
// vue au tap) ; le tap sur un nœud n'ouvre qu'un panneau de détail EN PLUS
// de la vue complète, jamais à sa place.
//
// RÈGLE À NE JAMAIS CASSER — 4 CAS DE FLUX (colonne 1 = Entrées, colonne 2 =
// Catégories, colonne 3 = Destination) :
// Cas 1 — catégorie Variable avec 2+ transactions distinctes : apparaît
// dans TOUTES les colonnes (une barre en colonne 2, son détail de
// transactions en colonne 3 via `liensVersDestination`).
// Cas 2 — catégorie Fixe, ou Variable sans détail exploitable : AUCUNE
// barre en colonne 2 pour cette catégorie — le flux passe directement de
// la colonne 1 à la colonne 3, la colonne 2 restant invisible pour ce
// montant, cf. `idsNoeudsDirects`.
// Cas 3/4 — "Liquidités"/"Épargne" (l'argent pas affecté à une catégorie) :
// même mécanique que le Cas 2, direct colonne 1 → colonne 3.
// Dans les 3 derniers cas, le nœud de colonne 3 porte un vrai label (le nom
// de la catégorie, "Liquidités" ou "Épargne") — ce composant ne calcule
// jamais lui-même qui relève de quel cas, c'est à l'appelant de le décider
// (cf. RÈGLE dans app/(tabs)/analytics.tsx) et de fournir `idsNoeudsDirects`
// en conséquence ; ce composant se contente de dessiner les liens/nœuds
// fournis.
//
// RÈGLE — ORDRE FOURNI PAR L'APPELANT RESPECTÉ : ce composant NE TRIE PAS
// les nœuds par montant lui-même (seul le regroupement au-delà de 7 nœuds
// en "Autres" peut réordonner, cf. regrouperEtTrier). C'est à l'appelant de
// fournir chaque colonne déjà dans l'ordre voulu — décroissant par montant
// pour la plupart, mais groupé par catégorie source pour la colonne de
// destination (sous-catégories d'une même catégorie consécutives, jamais
// entrelacées avec celles d'une autre catégorie, cf. RÈGLE dans
// app/(tabs)/analytics.tsx). Trier ici casserait ce regroupement.
//
// RÈGLE À NE JAMAIS CASSER — PROPORTIONNALITÉ STRICTE : l'épaisseur de
// CHAQUE nœud/ruban est calculée à partir d'un total de référence COMMUN à
// tout le diagramme (`totalReference`, le plus grand total parmi les
// colonnes) — jamais du seul total de sa propre colonne. Une catégorie qui
// pèse 70% du total pèse 70% de la hauteur disponible, quelle que soit la
// colonne où elle apparaît ; une colonne dont le total est inférieur au
// total de référence ne remplit pas toute la hauteur (c'est honnête : ça
// reflète un écart réel, jamais artificiellement étiré à 100%). Seule
// exception : un plancher de lisibilité (HAUTEUR_MIN_LIGNE) protège les
// très petits montants d'un label illisible, en réempruntant l'espace sur
// les nœuds au-dessus du plancher (jamais en dépassant la hauteur totale).
//
// RÈGLE À NE JAMAIS CASSER — LISIBILITÉ :
// 1. La hauteur du graphique est calculée AVANT le rendu à partir du plus
//    grand nombre de nœuds parmi les colonnes (paliers ci-dessous) —
//    jamais une hauteur fixe indépendante du contenu.
// 2. Chaque barre est CENTRÉE dans sa colonne (un tiers de la largeur
//    disponible par colonne, barre au milieu) — jamais collée à un bord —
//    pour laisser un maximum d'espace aux rubans de part et d'autre.
// 3. Le label de chaque nœud (nom en gras + montant en dessous) s'affiche
//    À CÔTÉ de sa barre, JAMAIS dessus : à GAUCHE pour la première colonne
//    (texte aligné à droite, contre la barre), à DROITE pour toutes les
//    autres colonnes (texte aligné à gauche, contre la barre) — centré
//    verticalement sur la hauteur de la barre. Le nom est tronqué avec
//    "…" au-delà de LONGUEUR_MAX_LABEL caractères : jamais de débordement
//    du texte sur les rubans, la lisibilité du ruban prime. Un nœud à
//    label vide n'affiche rien (cf. RÈGLE plus haut).

export type NoeudFlux = {
  id: string;
  label: string;
  couleur: string;
  montant: number;
};

export type ColonneFlux = {
  titre: string;
  noeuds: NoeudFlux[]; // pas forcément triés/regroupés ; le composant s'en charge
};

// Lien explicite entre un nœud d'une colonne et un nœud de la colonne
// suivante — remplace toute déduction implicite : c'est à l'appelant de
// dire précisément "cette source alimente cette destination, pour ce
// montant". Plusieurs liens peuvent partager la même source (elle se
// subdivise) et/ou la même destination (plusieurs sources y convergent,
// ex: "Liquidités").
export type LienFlux = {
  sourceId: string;
  destId: string;
  montant: number;
};

type NoeudPositionne = {
  noeud: NoeudFlux;
  y: number;
  h: number;
};

type Props = {
  colonnes: ColonneFlux[];
  // Liens colonne 0 → colonne 1. Si omis, repli automatique : la colonne 0
  // entière alimente proportionnellement chaque nœud de la colonne 1 selon
  // sa part (pas de vraie correspondance source→catégorie dans ce modèle
  // de données, cf. Entrées → Catégories).
  liensEntreesCategories?: LienFlux[];
  // Liens colonne 1 → colonne 2 — uniquement pour les nœuds de colonne 1 du
  // Cas 1 (catégorie avec détail de transactions exploitable), vers leur
  // détail en colonne 2. Les catégories du Cas 2 (Fixe/sans détail)
  // n'apparaissent PAS en colonne 1 : leur flux passe par
  // `idsNoeudsDirects` à la place, cf. RÈGLE en tête de fichier.
  liensVersDestination?: LienFlux[];
  // Ids des nœuds de la DERNIÈRE colonne représentant de l'argent qui ne
  // passe jamais par une barre de la colonne intermédiaire — catégories
  // Fixe/sans détail exploitable (Cas 2), "Liquidités", "Épargne" (Cas
  // 3/4) : reçoivent un ruban directement depuis la colonne 0 (Entrées),
  // jamais depuis la colonne 1. Le composant calcule lui-même, pour chaque
  // nœud de la colonne 0, la part déjà affectée aux catégories du Cas 1
  // (via liensEntreesCategories) et répartit le reste PROPORTIONNELLEMENT
  // entre ces nœuds directs selon leur propre poids (même logique que
  // liensParDefaut) — jamais de double comptage, jamais un flux qui dépasse
  // la hauteur de sa source.
  idsNoeudsDirects?: string[];
  couleurs: typeof COULEURS.clair;
  fondCarte: string;
  reduireAnimations: boolean;
  onTapNoeud?: (colonneIndex: number, id: string) => void;
  variationParNoeud?: Record<string, number | null>;
  modeAffichage?: "euro" | "pct";
};

const NOEUD_AUTRES_ID = "__autres__";
const MAX_NOEUDS_VISIBLES = 6; // + "Autres" éventuel = 7 maximum par colonne
const NODE_W = 12;
const GAP_MIN = 8; // RÈGLE : espacement minimum entre deux flux, jamais compressé
const PADDING_V = 12;
// RÈGLE : largeur de la zone de label À CÔTÉ d'une barre (jamais dessus),
// et marge la séparant de la barre — bornée pour ne jamais empiéter sur
// les rubans voisins, cf. RÈGLE LISIBILITÉ #3.
const LARGEUR_LABEL_LATERAL = 92;
const MARGE_LABEL = 4;
// RÈGLE : au-delà de cette longueur, le nom est tronqué avec "…" — jamais
// de débordement du texte sur les rubans, cf. RÈGLE LISIBILITÉ #3.
const LONGUEUR_MAX_LABEL = 14;
function tronquerLabel(label: string): string {
  return label.length > LONGUEUR_MAX_LABEL
    ? `${label.slice(0, LONGUEUR_MAX_LABEL - 1)}…`
    : label;
}
// RÈGLE : hauteur minimum d'un emplacement (nœud + son label 2 lignes) —
// protège la lisibilité des tout petits montants, cf. RÈGLE proportionnalité.
const HAUTEUR_MIN_LIGNE = 36;
// RÈGLE : paliers de hauteur totale selon le plus grand nombre de nœuds
// parmi les colonnes — calculée AVANT le rendu, jamais une valeur fixe.
function hauteurParPalier(nMax: number): number {
  if (nMax <= 3) return 200;
  if (nMax <= 6) return 320;
  return 450;
}

// RÈGLE : ne réordonne PAS les nœuds gardés — seuls ceux regroupés dans
// "Autres" (au-delà de 7) sont retirés de la séquence, sans changer l'ordre
// relatif des autres. C'est ce qui permet à l'appelant de fournir une
// colonne "de destination" groupée par catégorie source (cf. RÈGLE en tête
// de fichier) sans que ce regroupement soit détruit par un tri global.
function regrouperEtTrier(noeuds: NoeudFlux[], couleurAutres: string): NoeudFlux[] {
  const valides = noeuds.filter((n) => n.montant > 0);
  if (valides.length <= MAX_NOEUDS_VISIBLES + 1) return valides;
  const parMontantDesc = [...valides].sort((a, b) => b.montant - a.montant);
  const gardes = new Set(parMontantDesc.slice(0, MAX_NOEUDS_VISIBLES).map((n) => n.id));
  const visibles = valides.filter((n) => gardes.has(n.id));
  const autres = valides.filter((n) => !gardes.has(n.id));
  return [
    ...visibles,
    {
      id: NOEUD_AUTRES_ID,
      label: "Autres",
      couleur: couleurAutres,
      montant: autres.reduce((acc, n) => acc + n.montant, 0),
    },
  ];
}

// Positionne les nœuds d'une colonne : hauteur strictement proportionnelle
// au total de RÉFÉRENCE commun à tout le diagramme (pas au total de cette
// seule colonne) — une colonne dont le total est inférieur à
// totalReference NE DOIT PAS remplir toute la hauteur disponible, cf. RÈGLE
// proportionnalité en tête de fichier. Le plancher de lisibilité emprunte
// STRICTEMENT le déficit (HAUTEUR_MIN_LIGNE - hauteur brute) aux nœuds
// au-dessus du plancher DE CETTE MÊME COLONNE, jamais un réétalement de
// toute la colonne sur 100% de hauteurDisponible (piège : diviser un nœud
// par la somme des nœuds au-dessus du plancher puis multiplier par tout
// l'espace restant normalise TOUJOURS la colonne à 100%, même quand aucun
// nœud n'est sous le plancher — bug confirmé, ex: une seule catégorie à
// 25% du total de référence occupait 100% de la colonne). Calcul purement
// fonctionnel (pas de mutation d'une variable externe pendant les
// .map/.reduce).
function positionnerColonne(
  noeuds: NoeudFlux[],
  hauteurDisponible: number,
  totalReference: number,
): NoeudPositionne[] {
  const n = noeuds.length;
  if (n === 0) return [];
  const disponibleNet = hauteurDisponible - PADDING_V * 2 - (n - 1) * GAP_MIN;
  const brutes = noeuds.map((v) =>
    totalReference > 0 ? (v.montant / totalReference) * disponibleNet : 0,
  );
  const enDessousPlancher = brutes.map((h) => h < HAUTEUR_MIN_LIGNE);
  const deficitTotal = brutes.reduce(
    (acc, h, i) => acc + (enDessousPlancher[i] ? HAUTEUR_MIN_LIGNE - h : 0),
    0,
  );
  const totalAuDessus = brutes.reduce(
    (acc, h, i) => acc + (enDessousPlancher[i] ? 0 : h),
    0,
  );
  const facteurReduction =
    totalAuDessus > deficitTotal ? (totalAuDessus - deficitTotal) / totalAuDessus : 0;
  const hauteurs = brutes.map((h, i) =>
    enDessousPlancher[i] ? HAUTEUR_MIN_LIGNE : h * facteurReduction,
  );
  const offsets = hauteurs.reduce<number[]>((acc, h, i) => {
    acc.push(i === 0 ? PADDING_V : acc[i - 1] + hauteurs[i - 1] + GAP_MIN);
    return acc;
  }, []);
  return noeuds.map((noeud, i) => ({ noeud, y: offsets[i], h: hauteurs[i] }));
}

// Sous-divise, pour chaque nœud d'une colonne, la hauteur de ses liens
// (entrants si `cle` vaut "destId", sortants si `cle` vaut "sourceId") —
// utilisé des deux côtés (source et destination) pour que chaque ruban
// naisse et arrive au bon endroit sur des barres qui portent plusieurs
// liens à la fois (ex: "Liquidités" reçoit de plusieurs catégories).
function offsetsParNoeud(
  liens: LienFlux[],
  noeuds: NoeudPositionne[],
  cle: "sourceId" | "destId",
): Map<LienFlux, { y0: number; y1: number }> {
  const groupes = new Map<string, LienFlux[]>();
  liens.forEach((l) => {
    const id = l[cle];
    const groupe = groupes.get(id) ?? [];
    groupe.push(l);
    groupes.set(id, groupe);
  });
  const resultat = new Map<LienFlux, { y0: number; y1: number }>();
  groupes.forEach((arr, id) => {
    const noeud = noeuds.find((p) => p.noeud.id === id);
    if (!noeud) return;
    const total = arr.reduce((acc, l) => acc + l.montant, 0);
    const tries = [...arr].sort((a, b) => b.montant - a.montant);
    tries.reduce((offset, l) => {
      const h = total > 0 ? (l.montant / total) * noeud.h : 0;
      resultat.set(l, { y0: offset, y1: offset + h });
      return offset + h;
    }, noeud.y);
  });
  return resultat;
}

function calculerRubansLiens(
  liens: LienFlux[],
  colGauche: NoeudPositionne[],
  colDroite: NoeudPositionne[],
  // Offsets côté source déjà calculés ailleurs (ex: partagés entre
  // plusieurs ponts qui partent de la même colonne, cf. le ruban direct
  // vers "Liquidités") — sinon calculés ici, localement à ce seul pont.
  offsetsSourceExternes?: Map<LienFlux, { y0: number; y1: number }>,
): { id: string; couleur: string; d: (xGauche: number, xDroite: number) => string }[] {
  const liensValides = liens.filter((l) => l.montant > 0);
  if (liensValides.length === 0) return [];
  const offsetsSource = offsetsSourceExternes ?? offsetsParNoeud(liensValides, colGauche, "sourceId");
  const offsetsDest = offsetsParNoeud(liensValides, colDroite, "destId");
  return liensValides.flatMap((l) => {
    const noeudDest = colDroite.find((p) => p.noeud.id === l.destId);
    const s = offsetsSource.get(l);
    const d = offsetsDest.get(l);
    if (!noeudDest || !s || !d) return [];
    return [
      {
        id: `${l.sourceId}->${l.destId}`,
        couleur: noeudDest.noeud.couleur,
        d: (xGauche: number, xDroite: number) => {
          const cx = (xGauche + xDroite) / 2;
          return [
            `M ${xGauche} ${s.y0}`,
            `C ${cx} ${s.y0} ${cx} ${d.y0} ${xDroite} ${d.y0}`,
            `L ${xDroite} ${d.y1}`,
            `C ${cx} ${d.y1} ${cx} ${s.y1} ${xGauche} ${s.y1}`,
            "Z",
          ].join(" ");
        },
      },
    ];
  });
}

// Repli par défaut pour un pont sans liens explicites (Entrées →
// Catégories) : la colonne source entière alimente chaque nœud
// destination proportionnellement à sa part — aucune vraie correspondance
// source→destination n'existe dans ce cas, donc chaque source contribue à
// chaque destination au prorata (matrice complète, mais bornée par le
// nombre de nœuds déjà limité à 7 par colonne).
//
// RÈGLE : dénominateur = total de la colonne SOURCE (colGauche), pas de la
// colonne destination — si colDroite pèse MOINS que colGauche (ex: total
// dépensé < total entrées), chaque source ne distribue que sa part
// proportionnelle du total effectivement dépensé, laissant le reste
// disponible pour d'éventuels rubans directs vers "Liquidités"/"Épargne"
// (cf. idsNoeudsDirects) sans jamais double-compter la même part de la
// source. Cette même fonction sert aussi à répartir ce reste entre
// plusieurs nœuds directs, proportionnellement à leur propre poids.
function liensParDefaut(colGauche: NoeudFlux[], colDroite: NoeudFlux[]): LienFlux[] {
  const totalGauche = colGauche.reduce((acc, n) => acc + n.montant, 0);
  if (totalGauche <= 0) return [];
  return colGauche.flatMap((source) =>
    colDroite.map((dest) => ({
      sourceId: source.id,
      destId: dest.id,
      montant: (source.montant * dest.montant) / totalGauche,
    })),
  );
}

export function GraphiqueFlux({
  colonnes,
  liensEntreesCategories,
  liensVersDestination,
  idsNoeudsDirects,
  couleurs: C,
  fondCarte,
  reduireAnimations,
  onTapNoeud,
  variationParNoeud,
  modeAffichage = "euro",
}: Props) {
  const [largeur, setLargeur] = useState(320);
  const [selection, setSelection] = useState<{ colonne: number; id: string } | null>(null);
  const cleAnimation = colonnes.map((c) => c.titre).join("|");
  // RÈGLE À NE JAMAIS CASSER : transition douce quand les données changent
  // (période...) — toujours placée AVANT le "return null" ci-dessous pour
  // ne jamais casser l'ordre des hooks React.
  const opacite = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    opacite.setValue(0);
    Animated.timing(opacite, {
      toValue: 1,
      duration: dureeAnimation(reduireAnimations, 220),
      useNativeDriver: true,
    }).start();
  }, [cleAnimation, opacite, reduireAnimations]);

  if (colonnes.length < 2) return null;

  const visiblesParColonne = colonnes.map((c) => regrouperEtTrier(c.noeuds, C.texteMuted));
  if (visiblesParColonne.every((v) => v.length === 0)) return null;

  const nMax = Math.max(...visiblesParColonne.map((v) => v.length), 1);
  const hauteurSvg = Math.max(
    hauteurParPalier(nMax),
    PADDING_V * 2 + nMax * HAUTEUR_MIN_LIGNE + (nMax - 1) * GAP_MIN,
  );

  // RÈGLE proportionnalité stricte : un seul total de référence pour tout
  // le diagramme (le plus grand total parmi les colonnes), jamais un total
  // recalculé par colonne.
  const totalReference = Math.max(
    ...visiblesParColonne.map((v) => v.reduce((acc, n) => acc + n.montant, 0)),
    1,
  );

  const positionsParColonneBase = visiblesParColonne.map((visibles) =>
    positionnerColonne(visibles, hauteurSvg, totalReference),
  );
  // RÈGLE À NE JAMAIS CASSER — BARRE COLONNE 2 CENTRÉE SUR SON GROUPE : la
  // colonne intermédiaire ("Catégories") reliée à la dernière colonne via
  // `liensVersDestination` ne s'empile PAS indépendamment du haut de sa
  // propre colonne (ça la désaligne visuellement de ses sous-catégories) —
  // sa hauteur reste celle calculée par positionnerColonne (proportionnelle
  // à totalReference), mais sa position Y est recentrée sur l'étendue
  // verticale exacte du groupe de nœuds qu'elle alimente en dernière
  // colonne. Comme la hauteur d'une catégorie = somme des hauteurs de ses
  // nœuds de destination (même totalReference des deux côtés), elle est
  // TOUJOURS ≤ l'étendue de son groupe (qui inclut en plus les GAP_MIN
  // entre ses membres) : aucun chevauchement possible avec la barre
  // centrée d'une autre catégorie, ces groupes ne se chevauchant jamais
  // entre eux en dernière colonne.
  const positionsParColonne = positionsParColonneBase.map((positions, colIndex) => {
    if (
      colIndex !== 1 ||
      colonnes.length < 3 ||
      !liensVersDestination ||
      liensVersDestination.length === 0
    ) {
      return positions;
    }
    const colDestination = positionsParColonneBase[colonnes.length - 1];
    return positions.map((p) => {
      const positionsDest = liensVersDestination
        .filter((l) => l.sourceId === p.noeud.id)
        .map((l) => colDestination?.find((d) => d.noeud.id === l.destId))
        .filter((d): d is NoeudPositionne => !!d);
      if (positionsDest.length === 0) return p;
      const yMin = Math.min(...positionsDest.map((d) => d.y));
      const yMax = Math.max(...positionsDest.map((d) => d.y + d.h));
      return { ...p, y: (yMin + yMax) / 2 - p.h / 2 };
    });
  });

  const nbColonnes = colonnes.length;
  // RÈGLE : chaque colonne occupe un tiers (ou une moitié, à 2 colonnes) de
  // la largeur totale, sa barre centrée au milieu de sa propre tranche —
  // ça laisse un espace généreux et symétrique de part et d'autre pour les
  // rubans, cf. RÈGLE LISIBILITÉ #2.
  const largeurSlot = largeur / nbColonnes;
  const xColonnes = colonnes.map((_, i) => i * largeurSlot + largeurSlot / 2 - NODE_W / 2);

  const liensCategories =
    positionsParColonne[0].length > 0 && positionsParColonne[1]?.length > 0
      ? liensEntreesCategories ?? liensParDefaut(visiblesParColonne[0], visiblesParColonne[1])
      : [];
  const derniereColonne = positionsParColonne[nbColonnes - 1];
  const noeudsDirects = (idsNoeudsDirects ?? [])
    .map((id) => derniereColonne?.find((p) => p.noeud.id === id))
    .filter((p): p is NoeudPositionne => !!p);
  const totalNoeudsDirects = noeudsDirects.reduce((acc, p) => acc + p.noeud.montant, 0);
  // RÈGLE : "Liquidités"/"Épargne" sont alimentés par ce que chaque nœud de
  // la colonne 0 N'A PAS DÉJÀ donné aux catégories (liensCategories),
  // réparti proportionnellement entre les nœuds directs selon leur propre
  // poids — jamais un recalcul indépendant, sinon une même part de la
  // source serait comptée deux fois.
  const liensDirects: LienFlux[] =
    noeudsDirects.length > 0 && totalNoeudsDirects > 0
      ? visiblesParColonne[0].flatMap((source) => {
          const dejaAlloue = liensCategories
            .filter((l) => l.sourceId === source.id)
            .reduce((acc, l) => acc + l.montant, 0);
          const restant = Math.max(0, source.montant - dejaAlloue);
          if (restant <= 0) return [];
          return noeudsDirects.map((p) => ({
            sourceId: source.id,
            destId: p.noeud.id,
            montant: restant * (p.noeud.montant / totalNoeudsDirects),
          }));
        })
      : [];
  // Offsets de sortie de la colonne 0 calculés UNE SEULE FOIS sur
  // l'ensemble des deux ponts qui en partent (catégories + directs) —
  // jamais deux calculs indépendants, qui feraient repartir chaque nœud à
  // son sommet deux fois et superposeraient les rubans.
  const offsetsSortieColonne0 = offsetsParNoeud(
    [...liensCategories, ...liensDirects],
    positionsParColonne[0],
    "sourceId",
  );
  const rubans01 =
    positionsParColonne[0].length > 0 && positionsParColonne[1]?.length > 0
      ? calculerRubansLiens(liensCategories, positionsParColonne[0], positionsParColonne[1], offsetsSortieColonne0)
      : [];
  const rubansDirects =
    noeudsDirects.length > 0 && positionsParColonne[0].length > 0
      ? calculerRubansLiens(liensDirects, positionsParColonne[0], derniereColonne, offsetsSortieColonne0)
      : [];
  const rubans12 =
    positionsParColonne[1]?.length > 0 && positionsParColonne[2]?.length > 0
      ? calculerRubansLiens(
          liensVersDestination ?? [],
          positionsParColonne[1],
          positionsParColonne[2],
        )
      : [];

  const tapperNoeud = (colonneIndex: number, id: string) => {
    if (id === NOEUD_AUTRES_ID) return;
    setSelection(
      selection?.colonne === colonneIndex && selection.id === id
        ? null
        : { colonne: colonneIndex, id },
    );
    onTapNoeud?.(colonneIndex, id);
  };

  const noeudSelectionne =
    selection !== null
      ? (positionsParColonne[selection.colonne]?.find((p) => p.noeud.id === selection.id) ?? null)
      : null;
  const totalColonneSelection =
    selection !== null
      ? visiblesParColonne[selection.colonne].reduce((acc, n) => acc + n.montant, 0)
      : 0;
  const variationSelection = noeudSelectionne
    ? variationParNoeud?.[noeudSelectionne.noeud.id]
    : undefined;

  return (
    <Animated.View style={{ opacity: opacite }}>
      {/* RÈGLE : le titre d'une colonne reste BORNÉ à sa propre tranche
          (largeurSlot, avec une petite marge), sinon les titres de
          colonnes voisines se chevauchent (bug confirmé). Autorisé à
          passer sur 2 lignes plutôt que déborder horizontalement. */}
      <View style={{ height: 28 }}>
        {colonnes.map((c, i) => (
          <Text
            key={c.titre}
            style={[
              styles.titreColonne,
              {
                color: C.texteMuted,
                position: "absolute",
                left: i * largeurSlot + 3,
                width: largeurSlot - 6,
                textAlign: "center",
              },
            ]}
            numberOfLines={2}
          >
            {c.titre}
          </Text>
        ))}
      </View>
      <View style={{ height: 8 }} />

      <View style={{ width: "100%" }} onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}>
        <Svg width={largeur} height={hauteurSvg}>
          {/* RÈGLE : les rubans directs vers "Liquidités"/"Épargne" (colonne
              0 → dernière colonne) se dessinent EN PREMIER, donc
              visuellement "derrière" les colonnes intermédiaires —
              cohérent avec le fait que cet argent ne passe jamais par une
              catégorie. */}
          {rubansDirects.map(({ id, couleur, d }) => (
            <Path
              key={`rdirect-${id}`}
              d={d(xColonnes[0] + NODE_W, xColonnes[nbColonnes - 1])}
              fill={couleur}
              fillOpacity={
                selection === null
                  ? 0.22
                  : (selection.colonne === 0 && id.startsWith(`${selection.id}->`)) ||
                      (selection.colonne === nbColonnes - 1 && id.endsWith(`->${selection.id}`))
                    ? 0.5
                    : 0.08
              }
            />
          ))}
          {rubans01.map(({ id, couleur, d }) => (
            <Path
              key={`r01-${id}`}
              d={d(xColonnes[0] + NODE_W, xColonnes[1])}
              fill={couleur}
              fillOpacity={
                selection === null
                  ? 0.28
                  : (selection.colonne === 0 && id.startsWith(`${selection.id}->`)) ||
                      (selection.colonne === 1 && id.endsWith(`->${selection.id}`))
                    ? 0.55
                    : 0.1
              }
            />
          ))}
          {rubans12.map(({ id, couleur, d }) => (
            <Path
              key={`r12-${id}`}
              d={d(xColonnes[1] + NODE_W, xColonnes[2])}
              fill={couleur}
              fillOpacity={
                selection === null
                  ? 0.28
                  : (selection.colonne === 1 && id.startsWith(`${selection.id}->`)) ||
                      (selection.colonne === 2 && id.endsWith(`->${selection.id}`))
                    ? 0.55
                    : 0.1
              }
            />
          ))}
          {positionsParColonne.map((positions, colIndex) =>
            positions.map(({ noeud, y, h }) => (
              <Rect
                key={`n-${colIndex}-${noeud.id}`}
                x={xColonnes[colIndex]}
                y={y}
                width={NODE_W}
                height={h}
                rx={3}
                fill={noeud.couleur}
                opacity={
                  selection === null ||
                  (selection.colonne === colIndex && selection.id === noeud.id)
                    ? 1
                    : 0.35
                }
              />
            )),
          )}
        </Svg>

        {/* RÈGLE À NE JAMAIS CASSER : zones tactiles en Views RN superposées
            au SVG plutôt qu'un onPress sur les formes SVG elles-mêmes —
            react-native-svg gère mal la précision de tap sur des formes
            fines ; une bande horizontale reste fiable sur mobile. Chaque
            label est positionné À CÔTÉ de SA PROPRE barre (jamais dessus),
            cf. RÈGLE LISIBILITÉ #3. */}
        {positionsParColonne.map((positions, colIndex) =>
          positions.map(({ noeud, y, h }) => {
            const totalColonne = visiblesParColonne[colIndex].reduce(
              (acc, n) => acc + n.montant,
              0,
            );
            const pct = totalColonne > 0 ? Math.round((noeud.montant / totalColonne) * 100) : 0;
            const estColonneCategories = colIndex === 1 && nbColonnes > 2;
            const estColonneGauche = colIndex === 0;
            return (
              <TouchableOpacity
                key={`hit-${colIndex}-${noeud.id}`}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: y,
                  height: h,
                }}
                activeOpacity={0.6}
                onPress={() => tapperNoeud(colIndex, noeud.id)}
                accessibilityLabel={`${noeud.label}, ${formaterMontant(noeud.montant)} euros`}
              >
                {noeud.label !== "" && (
                  <View
                    style={[
                      styles.noeudLabelZone,
                      {
                        left: estColonneGauche
                          ? xColonnes[colIndex] - LARGEUR_LABEL_LATERAL - MARGE_LABEL
                          : xColonnes[colIndex] + NODE_W + MARGE_LABEL,
                        width: LARGEUR_LABEL_LATERAL,
                        height: h,
                        alignItems: estColonneGauche ? "flex-end" : "flex-start",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.noeudLabel,
                        { color: C.texte, textAlign: estColonneGauche ? "right" : "left" },
                      ]}
                      numberOfLines={1}
                    >
                      {tronquerLabel(noeud.label)}
                    </Text>
                    <Text
                      style={[
                        styles.noeudMontant,
                        { color: C.texteMuted, textAlign: estColonneGauche ? "right" : "left" },
                      ]}
                      numberOfLines={1}
                    >
                      {estColonneCategories && modeAffichage === "pct"
                        ? `${pct}%`
                        : `${formaterMontant(noeud.montant)} €`}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }),
        )}
      </View>

      {noeudSelectionne && (
        <View
          style={[styles.detailPanel, { backgroundColor: fondCarte, borderColor: C.carteBorder }]}
        >
          <View style={[styles.detailDot, { backgroundColor: noeudSelectionne.noeud.couleur }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.detailNom, { color: C.texte }]}>{noeudSelectionne.noeud.label}</Text>
            <Text style={[styles.detailValeur, { color: C.texteMuted }]}>
              {formaterMontant(noeudSelectionne.noeud.montant)} € ·{" "}
              {totalColonneSelection > 0
                ? Math.round((noeudSelectionne.noeud.montant / totalColonneSelection) * 100)
                : 0}
              % du total
              {variationSelection !== undefined && variationSelection !== null
                ? ` · ${variationSelection >= 0 ? "+" : ""}${Math.round(variationSelection)}% vs période précédente`
                : ""}
            </Text>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  titreColonne: { fontSize: 11, fontWeight: "700" },
  noeudLabelZone: {
    position: "absolute",
    top: 0,
    justifyContent: "center",
  },
  noeudLabel: { fontSize: 13, fontWeight: "700" },
  noeudMontant: { fontSize: 11, fontWeight: "500", marginTop: 2 },
  detailPanel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  detailDot: { width: 10, height: 10, borderRadius: 5 },
  detailNom: { fontSize: 13, fontWeight: "700" },
  detailValeur: { fontSize: 12, fontWeight: "500", marginTop: 2 },
});
