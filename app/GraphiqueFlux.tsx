import { useEffect, useMemo, useState } from "react";
import { Animated, Dimensions, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { dureeAnimation } from "./AccessibiliteContext";
import { formaterMontant } from "../utils/montant";
import { COULEURS } from "./ThemeContext";

// ============================================================================
// RÈGLE À NE JAMAIS CASSER — GRAPHIQUE DE FLUX VALIDÉ SUR DEVICE PHYSIQUE.
// Chaque point ci-dessous a été ajusté/confirmé en conditions réelles après
// plusieurs itérations — ne JAMAIS le modifier "en passant" au fil d'une
// correction sur un autre sujet. Toute régression ici doit être un choix
// délibéré et explicite, jamais un effet de bord.
//
// 1. ESPACEMENT_MIN = 14 — validé sur device physique (labels 2 lignes qui
//    ne se chevauchent plus en colonne Destination). Ne JAMAIS réduire cette
//    valeur ; cf. RÈGLE ESPACEMENT PROTÉGÉ plus bas pour le détail.
// 2. totalReference = total de la colonne "Entrées d'argent" — PARTAGÉ entre
//    les 3 colonnes. Ne JAMAIS repasser à un total calculé par colonne (déjà
//    fait par erreur, corrigé après diagnostic sur device : un nœud seul
//    dans une petite colonne se retrouvait plus grand qu'un nœud 10x plus
//    gros ailleurs) — cf. RÈGLE PROPORTIONNALITÉ STRICTE plus bas.
// 3. hauteurNoeud = (montant / totalReference) * disponibleNet — IDENTIQUE
//    pour les 3 colonnes, aucune exception, aucun calcul alternatif pour une
//    colonne en particulier.
// 4. Aucun nœud ne s'affiche sans AU MOINS un flux entrant OU sortant réel
//    (montant > 0) — cf. RÈGLE AUCUN FLUX ORPHELIN plus bas.
// 5. "Autre" n'existe QU'EN DERNIÈRE COLONNE (Destination) — jamais de
//    second bloc "Autre" en colonne "Catégories" (retirerGroupesReplies
//    retire les nœuds repliés sans jamais créer de remplaçant) — cf. RÈGLE
//    UN SEUL "AUTRE" plus bas.
// 6. Le graphique n'occupe JAMAIS plus de Dimensions.get('window').height *
//    0.45 (HAUTEUR_GRAPHIQUE_RATIO_MIN) — cf. RÈGLE HAUTEUR MINIMALE plus
//    bas. Ne JAMAIS modifier cette valeur dans le même changement que la
//    hauteur de la modale "Ton bilan" (app/(tabs)/analytics.tsx,
//    HAUTEUR_MODALE_TON_BILAN) — déjà mélangées par erreur une fois.
// 7. Taille de police UNIFORME (TAILLE_LABEL_UNIFORME = 11px) pour tous les
//    labels — jamais réduite pour faire tenir un nom trop long ; passage à 2
//    lignes (word wrap) à la place, jamais de troncature "…" — cf. RÈGLE
//    TAILLE DE POLICE UNIFORME plus bas.
// ============================================================================

// RÈGLE À NE JAMAIS CASSER — AUCUNE ÉCRITURE SUPABASE DANS CE FICHIER : ce
// composant ne doit JAMAIS contenir d'appel .delete()/.update()/.insert()/
// .upsert() vers Supabase, ni même import du store — composant 100%
// props-in (cf. RÈGLE juste en dessous), toute écriture vit dans
// app/store.ts (cf. RÈGLE DE SÉCURITÉ en tête de ce fichier).
//
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
// Cas 1 — catégorie Variable avec AU MOINS 1 transaction nommée : apparaît
// dans TOUTES les colonnes (une barre en colonne 2, son détail de
// transactions en colonne 3 via `liensVersDestination`). Recalculé par
// l'appelant à CHAQUE rendu à partir des transactions disponibles — jamais
// figé, une catégorie bascule automatiquement de Cas 2 à Cas 1 dès qu'une
// transaction nommée apparaît.
// Cas 2 — catégorie Fixe, ou Variable sans aucune transaction nommée :
// AUCUNE barre en colonne 2 pour cette catégorie — le flux passe
// directement de la colonne 1 à la colonne 3, la colonne 2 restant
// invisible pour ce montant, cf. `idsNoeudsDirects`.
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
// en "Autre" peut réordonner, cf. regrouperEtTrier). C'est à l'appelant de
// fournir chaque colonne déjà dans l'ordre voulu — décroissant par montant
// pour la plupart, mais groupé par catégorie source pour la colonne de
// destination (sous-catégories d'une même catégorie consécutives, jamais
// entrelacées avec celles d'une autre catégorie, cf. RÈGLE dans
// app/(tabs)/analytics.tsx). Trier ici casserait ce regroupement.
//
// RÈGLE À NE JAMAIS CASSER — PROPORTIONNALITÉ STRICTE, TOTAL PARTAGÉ ENTRE
// LES 3 COLONNES : la hauteur de CHAQUE nœud est STRICTEMENT proportionnelle
// à son montant par rapport à `totalReference` — LE MÊME total pour les 3
// colonnes (le total de la colonne "Entrées d'argent", cf. site d'appel),
// JAMAIS le total de sa propre colonne. hauteurNoeud = (montantNoeud /
// totalReference) * disponibleNet, appliqué à TOUS les nœuds de TOUTES les
// colonnes sans exception — c'est ce qui rend deux nœuds de colonnes
// DIFFÉRENTES comparables en absolu (ex: Salaire en colonne "Entrées" et
// Courses en colonne "Catégories" : Courses, plus petit en €, doit rester
// visuellement plus petit — jamais un total par colonne, qui gonflerait
// artificiellement un nœud isolé dans une colonne à peu de nœuds, bug
// confirmé par les logs device). Une catégorie qui pèse 70% du total de
// référence pèse 70% de la hauteur disponible, quelle que soit la colonne
// où elle apparaît ; une colonne dont le total est inférieur au total de
// référence ne remplit pas toute la hauteur (c'est honnête : ça reflète un
// écart réel, jamais artificiellement étiré à 100%). Seule exception à la
// proportionnalité : un plancher de lisibilité (HAUTEUR_MIN_NOEUD) protège
// les très petits montants d'un label illisible, en réempruntant l'espace
// sur les nœuds au-dessus du plancher DE LA MÊME COLONNE (jamais en
// dépassant la hauteur totale).
//
// RÈGLE À NE JAMAIS CASSER — HAUTEUR MINIMALE : le graphique occupe TOUJOURS
// AU MOINS Dimensions.get('window').height * 0.45 (cf.
// HAUTEUR_GRAPHIQUE_RATIO_MIN) pour rester lisible — jamais un plafond qui
// l'écraserait en dessous. hauteurSvg = Math.max(hauteurNaturelle,
// hauteurMinDisponible) : si le contenu a naturellement besoin de PLUS que
// 45% (beaucoup de nœuds), le graphique grandit au-delà sans jamais être
// comprimé — le ScrollView de l'appelant (app/(tabs)/analytics.tsx) absorbe
// alors le dépassement par le scroll. RÈGLE À NE JAMAIS CASSER (process) :
// ne JAMAIS modifier cette hauteur (HAUTEUR_GRAPHIQUE_RATIO_MIN) dans le
// même changement que la hauteur de la modale "Ton bilan"
// (app/(tabs)/analytics.tsx, HAUTEUR_MODALE_TON_BILAN) — les deux ont déjà
// été mélangées par erreur une fois, chacune doit être corrigée
// indépendamment.
//
// RÈGLE À NE JAMAIS CASSER — LISIBILITÉ :
// 1. La hauteur du graphique est calculée AVANT le rendu, linéairement à
//    partir du plus grand nombre de nœuds parmi les colonnes (nMax) :
//    hauteurSvg = max(PADDING_V*2 + nMax * (HAUTEUR_MIN_NOEUD + ESPACEMENT_MIN),
//    hauteurMinDisponible) — jamais une hauteur fixe ou par palier
//    indépendante du contenu, jamais un plafond qui compresse.
// 2. Chaque barre est CENTRÉE dans sa colonne (un tiers de la largeur
//    disponible par colonne, barre au milieu) — jamais collée à un bord —
//    pour laisser un maximum d'espace aux rubans de part et d'autre.
// 3. Le label de chaque nœud (nom en gras + montant en dessous) s'affiche
//    À CÔTÉ de sa barre, JAMAIS dessus : à GAUCHE pour la première colonne
//    (texte aligné à droite, contre la barre), à DROITE pour toutes les
//    autres colonnes (texte aligné à gauche, contre la barre) — centré
//    verticalement sur la hauteur de la barre. Le NOM s'affiche TOUJOURS EN
//    ENTIER, JAMAIS tronqué avec "…" (cf. calculerNbLignesLabel et RÈGLE
//    "TAILLE DE POLICE UNIFORME" plus bas) : TOUJOURS à
//    TAILLE_LABEL_UNIFORME, sur 1 ou 2 lignes selon l'espace. Un nœud à
//    label vide n'affiche rien (cf. RÈGLE plus haut).

export type NoeudFlux = {
  id: string;
  label: string;
  couleur: string;
  montant: number;
  // RÈGLE À NE JAMAIS CASSER : identifie le GROUPE auquel ce nœud
  // appartient (ex: l'id de la catégorie source, pour un nœud de détail
  // de transaction en dernière colonne) — plusieurs nœuds peuvent
  // partager le même groupeId. Optionnel : par défaut, chaque nœud est
  // son propre groupe (singleton). Sert UNIQUEMENT à décider quoi replier
  // dans "Autre" au-delà de 7 nœuds — un groupe entier reste toujours
  // affiché ou toujours replié, JAMAIS scindé entre les deux (cf. RÈGLE
  // dans regrouperEtTrier) : "Autre" ne doit jamais contenir une partie
  // seulement des sous-catégories d'une catégorie par ailleurs affichée.
  groupeId?: string;
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
  // (via liensEntreesCategories) et assigne le reste GLOUTONNEMENT à ces
  // nœuds directs (même logique anti-croisements que liensParDefaut, cf.
  // assignerGloutonnement) — jamais de double comptage, jamais un flux qui
  // dépasse la hauteur de sa source.
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
// RÈGLE À NE JAMAIS CASSER — ESPACEMENT PROTÉGÉ, JAMAIS COMPRESSÉ : contrairement
// à la hauteur des NŒUDS (qui peut se réduire, cf. plancher/plafond dans
// positionnerColonne), cette valeur ne baisse JAMAIS — c'est elle qui évite
// que le label d'un nœud (potentiellement 2 lignes, cf. RÈGLE "JAMAIS DE
// TRONCATURE" plus bas) chevauche visuellement celui du nœud suivant (bug
// confirmé, ex: "Électricité" par-dessus "Épargne"). Si l'espace manque
// globalement, c'est la hauteur des NŒUDS qui se réduit pour compenser,
// jamais cet espacement.
const ESPACEMENT_MIN = 14;
const PADDING_V = 12;
// RÈGLE À NE JAMAIS CASSER — HAUTEUR MINIMALE : le graphique occupe TOUJOURS
// AU MOINS cette fraction de la hauteur d'écran (jamais moins), pour rester
// lisible même avec peu de nœuds — hauteurSvg = Math.max(hauteurNaturelle,
// hauteurMinDisponible), jamais l'inverse (un plafond qui écraserait le
// contenu). RÈGLE À NE JAMAIS CASSER (process) : ne JAMAIS modifier cette
// valeur dans le même changement que la hauteur de la modale "Ton bilan"
// (app/(tabs)/analytics.tsx, HAUTEUR_MODALE_TON_BILAN) — chacune doit être
// corrigée indépendamment.
const HAUTEUR_GRAPHIQUE_RATIO_MIN = 0.45;
// RÈGLE À NE JAMAIS CASSER — LABEL BORNÉ AU COMPOSANT, MAIS AUSSI LONG QUE
// POSSIBLE : la largeur RÉELLE de la zone de label À CÔTÉ d'une barre
// (jamais dessus) est calculée au rendu à partir de la position de sa
// colonne — colonne 0 (gauche) bornée au bord GAUCHE du composant (x=0),
// colonnes suivantes (droite) bornées au bord DROIT (x=largeur) —
// plafonnée par LARGEUR_LABEL_LATERAL_MAX (généreux, pas une contrainte de
// lisibilité mais un garde-fou anti-débordement sur très grand écran),
// jamais l'inverse (le composant ne doit jamais déborder). MARGE_LABEL
// sépare la zone de la barre elle-même.
//
// RÈGLE À NE JAMAIS CASSER — TAILLE DE POLICE UNIFORME, JAMAIS DE TRONCATURE
// "…" : TOUS les labels du graphique (nom ET montant) partagent la MÊME
// taille fixe, TAILLE_LABEL_UNIFORME — jamais deux tailles différentes dans
// le même graphique, jamais réduite en dessous de cette valeur pour un nom
// trop long. Priorité stricte pour un nom : 1) tient sur UNE ligne à
// TAILLE_LABEL_UNIFORME ; 2) sinon, 2 lignes (word wrap RN natif via
// numberOfLines={2} au site d'appel), toujours à TAILLE_LABEL_UNIFORME —
// jamais de troisième palier qui réduirait la police ; 3) cas extrême (nom
// qui ne tiendrait même pas sur 2 lignes) : on garde 2 lignes quand même et
// on accepte un léger débordement visuel plutôt qu'un "…" illisible — cf.
// ellipsizeMode="clip" au site d'appel (jamais "tail", qui réintroduirait un
// "…" automatique dès que numberOfLines est dépassé).
const LARGEUR_LABEL_LATERAL_MAX = 180;
const MARGE_LABEL = 4;
const TAILLE_LABEL_UNIFORME = 11;
// La largeur moyenne approximative d'un caractère ci-dessous est une
// estimation, pas une mesure exacte : React Native ne mesure pas le texte
// avant rendu ici — mieux vaut passer à la ligne un peu trop tôt que
// déborder du composant.
const LARGEUR_CAR_LABEL = 6.0; // calibrée pour TAILLE_LABEL_UNIFORME (11px)
const LARGEUR_CAR_MONTANT = 5.5;
function tronquerSelonLargeur(texte: string, largeurDisponible: number, largeurCar: number): string {
  const maxCars = Math.max(3, Math.floor(largeurDisponible / largeurCar));
  return texte.length > maxCars ? `${texte.slice(0, maxCars - 1)}…` : texte;
}
// cf. RÈGLE "TAILLE DE POLICE UNIFORME" en tête de fichier : décide
// uniquement 1 ou 2 lignes, jamais une taille — TAILLE_LABEL_UNIFORME est
// fixe partout.
function calculerNbLignesLabel(texte: string, largeurDisponible: number): 1 | 2 {
  return texte.length * LARGEUR_CAR_LABEL <= largeurDisponible ? 1 : 2;
}
// RÈGLE : taille minimum d'un nœud — protège la lisibilité des tout petits
// montants, cf. RÈGLE proportionnalité stricte par colonne.
const HAUTEUR_MIN_NOEUD = 14;
// RÈGLE : épaisseur minimum d'un RUBAN (pas d'un nœud) pour un montant réel
// (>0) — cf. offsetsParNoeud, RÈGLE "aucun ruban invisible".
const RUBAN_HAUTEUR_MIN = 2;

// RÈGLE : ne réordonne PAS les nœuds gardés — seuls ceux regroupés dans
// "Autre" (au-delà de 7) sont retirés de la séquence, sans changer l'ordre
// relatif des autres. C'est ce qui permet à l'appelant de fournir une
// colonne "de destination" groupée par catégorie source (cf. RÈGLE en tête
// de fichier) sans que ce regroupement soit détruit par un tri global.
//
// RÈGLE À NE JAMAIS CASSER — "AUTRE" NE SCINDE JAMAIS UN GROUPE : la
// décision "affiché / replié" porte sur des GROUPES ENTIERS (cf. `groupeId`
// sur NoeudFlux), jamais des nœuds individuels — sinon les sous-catégories
// d'une catégorie par ailleurs affichée pourraient partiellement finir
// dans "Autre" (bug confirmé). Les groupes sont classés par leur TOTAL
// cumulé décroissant ; on garde les premiers groupes ENTIERS tant que leur
// nombre de nœuds cumulé ne dépasse pas MAX_NOEUDS_VISIBLES, puis on
// replie TOUS les groupes suivants (entiers) dans "Autre" — jamais un
// groupe à moitié gardé.
//
// RÈGLE À NE JAMAIS CASSER : `detailAutres` conserve la liste (déjà triée
// décroissant) des nœuds repliés dans "Autre", pour le panel de détail
// affiché au tap sur ce nœud (cf. noeudSelectionne plus bas) — jamais
// perdue, sinon impossible de dire à l'utilisateur ce que "Autre" contient
// vraiment.
function regrouperEtTrier(
  noeuds: NoeudFlux[],
  couleurAutres: string,
): { noeuds: NoeudFlux[]; detailAutres: NoeudFlux[] } {
  const valides = noeuds.filter((n) => n.montant > 0);
  if (valides.length === 0) return { noeuds: [], detailAutres: [] };

  const groupes = new Map<string, NoeudFlux[]>();
  valides.forEach((n) => {
    const cle = n.groupeId ?? n.id;
    const groupe = groupes.get(cle) ?? [];
    groupe.push(n);
    groupes.set(cle, groupe);
  });
  const groupesTries = [...groupes.values()]
    .map((membres) => ({
      membres,
      total: membres.reduce((acc, m) => acc + m.montant, 0),
    }))
    .sort((a, b) => b.total - a.total);

  const groupesReplies: NoeudFlux[][] = [];
  let nbNoeudsGardes = 0;
  let pliageCommence = false;
  const groupesGardes: NoeudFlux[][] = [];
  groupesTries.forEach(({ membres }) => {
    if (!pliageCommence && nbNoeudsGardes + membres.length <= MAX_NOEUDS_VISIBLES) {
      groupesGardes.push(membres);
      nbNoeudsGardes += membres.length;
    } else {
      pliageCommence = true;
      groupesReplies.push(membres);
    }
  });

  if (groupesReplies.length === 0) {
    return { noeuds: valides, detailAutres: [] };
  }

  // Reconstruit dans l'ordre d'origine (`valides`), pas l'ordre de tri par
  // total de groupe, cf. RÈGLE "ordre fourni par l'appelant respecté" en
  // tête de fichier — seuls les groupes repliés sont retirés de la
  // séquence.
  const idsGardes = new Set(groupesGardes.flat().map((n) => n.id));
  const visibles = valides.filter((n) => idsGardes.has(n.id));
  const detailAutres = groupesReplies.flat().sort((a, b) => b.montant - a.montant);

  return {
    noeuds: [
      ...visibles,
      {
        id: NOEUD_AUTRES_ID,
        label: "Autre",
        couleur: couleurAutres,
        montant: detailAutres.reduce((acc, n) => acc + n.montant, 0),
      },
    ],
    detailAutres,
  };
}

// RÈGLE À NE JAMAIS CASSER — UN SEUL "AUTRE" DANS TOUT LE GRAPHIQUE, EN
// DERNIÈRE COLONNE UNIQUEMENT : la colonne "Catégories" ne crée JAMAIS son
// propre nœud "Autre" — retire simplement (sans remplaçant) les nœuds dont
// l'id figure dans `idsAReplier` (décidé par la DERNIÈRE colonne via
// regrouperEtTrier, cf. site d'appel — jamais une décision indépendante
// ici). Une catégorie dont le groupe est replié disparaît de cette colonne ;
// son flux ne passe plus par une barre intermédiaire, il rejoint le pont
// direct colonne 0 → dernière colonne vers LE nœud "Autre" (cf.
// `noeudsDirects` au site d'appel, qui inclut NOEUD_AUTRES_ID) — jamais un
// second bloc "Autre" en colonne 2.
function retirerGroupesReplies(
  noeuds: NoeudFlux[],
  idsAReplier: Set<string>,
): { noeuds: NoeudFlux[]; detailAutres: NoeudFlux[] } {
  const visibles = noeuds.filter((n) => n.montant > 0 && !idsAReplier.has(n.id));
  return { noeuds: visibles, detailAutres: [] };
}

// Positionne les nœuds d'une colonne : hauteur strictement proportionnelle
// au total de RÉFÉRENCE PARTAGÉ par les 3 colonnes (`totalReference` = total
// de la colonne "Entrées d'argent", cf. site d'appel — jamais le total de
// sa propre colonne) — hauteurNoeud = (montantNoeud / totalReference) *
// disponibleNet, identique pour TOUS les nœuds de TOUTES les colonnes, pour
// que deux nœuds de colonnes différentes restent comparables en absolu (ex:
// Salaire en colonne "Entrées" et Courses en colonne "Catégories" ne sont
// PAS comparables si chaque colonne a son propre total — bug confirmé par
// les logs device : Courses à 80€, seul nœud de sa colonne, prenait 307px,
// plus que Salaire à 900€/288px).
//
// RÈGLE À NE JAMAIS CASSER — PLANCHER PAR NŒUD, SEULE EXCEPTION : le
// plancher de lisibilité (HAUTEUR_MIN_NOEUD) emprunte STRICTEMENT le déficit
// (HAUTEUR_MIN_NOEUD - hauteur) aux nœuds au-dessus du plancher DE CETTE
// MÊME COLONNE, jamais un réétalement de toute la colonne sur 100% de
// hauteurDisponible (piège : diviser un nœud par la somme des nœuds
// au-dessus du plancher puis multiplier par tout l'espace restant normalise
// TOUJOURS la colonne à 100%, même quand aucun nœud n'est sous le plancher
// — bug confirmé, ex: une seule catégorie à 25% du total de référence
// occupait 100% de la colonne). Calcul purement fonctionnel (pas de
// mutation d'une variable externe pendant les .map/.reduce).
function positionnerColonne(
  noeuds: NoeudFlux[],
  hauteurDisponible: number,
  totalReference: number,
): NoeudPositionne[] {
  const n = noeuds.length;
  if (n === 0) return [];
  const disponibleNet = hauteurDisponible - PADDING_V * 2 - (n - 1) * ESPACEMENT_MIN;
  const brutes = noeuds.map((v) =>
    totalReference > 0 ? (v.montant / totalReference) * disponibleNet : 0,
  );

  const enDessousPlancher = brutes.map((h) => h < HAUTEUR_MIN_NOEUD);
  const deficitTotal = brutes.reduce(
    (acc, h, i) => acc + (enDessousPlancher[i] ? HAUTEUR_MIN_NOEUD - h : 0),
    0,
  );
  const totalAuDessus = brutes.reduce(
    (acc, h, i) => acc + (enDessousPlancher[i] ? 0 : h),
    0,
  );
  const facteurReduction =
    totalAuDessus > deficitTotal ? (totalAuDessus - deficitTotal) / totalAuDessus : 0;
  // RÈGLE : garde-fou — un nœud ne dépasse jamais 80% de la hauteur totale
  // du graphique (hauteurDisponible), même dans un cas extrême (une seule
  // catégorie dominante dans une colonne à très peu de nœuds).
  const hauteurs = brutes
    .map((h, i) => (enDessousPlancher[i] ? HAUTEUR_MIN_NOEUD : h * facteurReduction))
    .map((h) => Math.min(h, hauteurDisponible * 0.8));

  const offsets = hauteurs.reduce<number[]>((acc, h, i) => {
    acc.push(i === 0 ? PADDING_V : acc[i - 1] + hauteurs[i - 1] + ESPACEMENT_MIN);
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
    const brutes = tries.map((l) => (total > 0 ? (l.montant / total) * noeud.h : 0));
    // RÈGLE À NE JAMAIS CASSER — AUCUN RUBAN INVISIBLE : même principe de
    // plancher que positionnerColonne (emprunt STRICT aux rubans
    // au-dessus du plancher, jamais un dépassement de noeud.h), mais côté
    // ÉPAISSEUR DE RUBAN plutôt que côté hauteur de barre — un lien dont
    // le montant est réel (>0) ne doit jamais rendre une épaisseur ~0px
    // indiscernable du fond ("bloc isolé" en pratique, même si son nœud
    // de destination existe bien).
    const enDessousPlancher = brutes.map(
      (h, i) => tries[i].montant > 0 && h < RUBAN_HAUTEUR_MIN,
    );
    const deficitTotal = brutes.reduce(
      (acc, h, i) => acc + (enDessousPlancher[i] ? RUBAN_HAUTEUR_MIN - h : 0),
      0,
    );
    const totalAuDessus = brutes.reduce(
      (acc, h, i) => acc + (enDessousPlancher[i] ? 0 : h),
      0,
    );
    const facteurReduction =
      totalAuDessus > deficitTotal ? (totalAuDessus - deficitTotal) / totalAuDessus : 0;
    const hauteurs = brutes.map((h, i) =>
      enDessousPlancher[i] ? RUBAN_HAUTEUR_MIN : h * facteurReduction,
    );
    hauteurs.reduce((offset, h, i) => {
      resultat.set(tries[i], { y0: offset, y1: offset + h });
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
        // RÈGLE : point de contrôle horizontal à 60% (pas 50%, le milieu)
        // de la largeur entre les deux colonnes — courbe plus marquée pour
        // que des flux voisins restent visuellement distincts, surtout au
        // centre du graphique où ils se croisent.
        d: (xGauche: number, xDroite: number) => {
          const largeurEntreCols = xDroite - xGauche;
          const cx = xGauche + largeurEntreCols * 0.6;
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

// RÈGLE À NE JAMAIS CASSER — ASSIGNATION ANTI-CROISEMENTS, SOURCE UNIQUE EN
// PRIORITÉ : répartit une liste de destinations (déjà triées décroissant par
// l'appelant, cf. RÈGLE "ordre fourni par l'appelant respecté") sur une
// liste de sources CONSOMMABLES (déjà triées décroissant elles aussi) —
// jamais une matrice complète où chaque destination reçoit un peu de CHAQUE
// source, qui multiplie les croisements visuels sans raison (aucune vraie
// correspondance source→destination n'existe dans les données, l'argent est
// fongible : c'est un choix de PRÉSENTATION, pas un fait comptable). Pour
// CHAQUE destination, dans cet ordre strict :
// 1. PROXIMITÉ VERTICALE — la source du MÊME RANG (même index dans la
//    liste, donc à la même hauteur visuelle que la destination dans sa
//    propre colonne) est essayée en premier ; si elle peut couvrir le
//    montant ENTIÈREMENT à elle seule, un seul lien est créé.
// 2. MEILLEUR AJUSTEMENT — sinon, la PLUS PETITE source restante qui peut
//    quand même couvrir le montant entier à elle seule (jamais la plus
//    grosse, pour ne pas gâcher une grosse source sur une petite
//    destination et forcer un futur découpage ailleurs).
// 3. MULTI-SOURCES EN DERNIER RECOURS — uniquement si AUCUNE source seule
//    ne suffit (montant destination > plus grosse source restante) :
//    répartition sur plusieurs sources, les plus grosses restantes en
//    premier, pour minimiser le nombre de segments.
// Résultat : jamais un flux éclaté sur plusieurs sources quand une seule
// suffisait, et une préférence naturelle pour "la destination alimente la
// source la plus proche verticalement" — les rubans restent visuellement
// parallèles la plupart du temps. Mute `sourcesRestantes` (tableau local à
// chaque appel, jamais partagé) : mutation de propriété acceptée, seule la
// réassignation de variable serait à éviter.
function assignerGloutonnement(
  sourcesRestantes: { id: string; restant: number }[],
  destinations: { id: string; montant: number }[],
): LienFlux[] {
  const liens: LienFlux[] = [];
  const SEUIL_NEGLIGEABLE = 1e-9;

  destinations.forEach((dest, indexDest) => {
    let aAssigner = dest.montant;
    if (aAssigner <= SEUIL_NEGLIGEABLE) return;

    // 1. Proximité verticale : source du même rang, si elle suffit seule.
    const indexProche = Math.min(indexDest, sourcesRestantes.length - 1);
    const sourceProche = indexProche >= 0 ? sourcesRestantes[indexProche] : undefined;
    if (sourceProche && sourceProche.restant >= aAssigner - SEUIL_NEGLIGEABLE) {
      liens.push({ sourceId: sourceProche.id, destId: dest.id, montant: aAssigner });
      sourceProche.restant -= aAssigner;
      return;
    }

    // 2. Meilleur ajustement : plus petite source restante qui suffit seule.
    const meilleureSourceUnique = sourcesRestantes.reduce<
      { id: string; restant: number } | null
    >((meilleure, s) => {
      if (s.restant < aAssigner - SEUIL_NEGLIGEABLE) return meilleure;
      return !meilleure || s.restant < meilleure.restant ? s : meilleure;
    }, null);
    if (meilleureSourceUnique) {
      liens.push({ sourceId: meilleureSourceUnique.id, destId: dest.id, montant: aAssigner });
      meilleureSourceUnique.restant -= aAssigner;
      return;
    }

    // 3. Multi-sources : mathématiquement nécessaire, plus grosses restantes
    // en premier pour minimiser le nombre de segments.
    const parCapaciteDesc = [...sourcesRestantes].sort((a, b) => b.restant - a.restant);
    for (const source of parCapaciteDesc) {
      if (aAssigner <= SEUIL_NEGLIGEABLE) break;
      if (source.restant <= SEUIL_NEGLIGEABLE) continue;
      const montant = Math.min(aAssigner, source.restant);
      liens.push({ sourceId: source.id, destId: dest.id, montant });
      source.restant -= montant;
      aAssigner -= montant;
    }
  });

  return liens;
}

// Repli par défaut pour un pont sans liens explicites (Entrées →
// Catégories) : assignation gloutonne (cf. ci-dessus) plutôt qu'une
// matrice complète.
//
// RÈGLE : le "poids" total demandé = total de la colonne SOURCE
// (colGauche), pas de la colonne destination — si colDroite pèse PLUS que
// colGauche (mois en déficit), `facteurDisponibilite` réduit
// proportionnellement CHAQUE destination pour ne jamais consommer plus que
// ce que colGauche peut réellement fournir ; si colDroite pèse MOINS,
// chaque source ne distribue que sa part effectivement demandée, laissant
// le reste disponible pour d'éventuels rubans directs vers
// "Liquidités"/"Épargne" (cf. idsNoeudsDirects) sans jamais double-compter
// la même part de la source.
function liensParDefaut(colGauche: NoeudFlux[], colDroite: NoeudFlux[]): LienFlux[] {
  const totalGauche = colGauche.reduce((acc, n) => acc + n.montant, 0);
  const totalDroite = colDroite.reduce((acc, n) => acc + n.montant, 0);
  if (totalGauche <= 0 || totalDroite <= 0) return [];
  const facteurDisponibilite = Math.min(1, totalGauche / totalDroite);
  return assignerGloutonnement(
    colGauche.map((n) => ({ id: n.id, restant: n.montant })),
    colDroite.map((n) => ({ id: n.id, montant: n.montant * facteurDisponibilite })),
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

  const nbColonnes = colonnes.length;
  // RÈGLE À NE JAMAIS CASSER — COHÉRENCE COLONNE 2 / COLONNE 3 : la
  // DERNIÈRE colonne (Destination) décide en premier quels GROUPES restent
  // visibles (regrouperEtTrier, jamais un nœud arraché à son groupe, cf.
  // RÈGLE "Autre" là-bas) — sa contrainte est toujours la plus stricte des
  // deux (une catégorie à plusieurs sous-catégories y consomme plusieurs
  // "places" sur son budget de 7, alors qu'elle n'en consomme qu'UNE en
  // colonne "Catégories"). La colonne "Catégories" s'aligne ENSUITE sur
  // cette même décision (retirerGroupesReplies, JAMAIS son propre "Autre",
  // cf. RÈGLE "UN SEUL AUTRE" là-bas) au lieu d'appliquer sa propre limite
  // indépendamment — sinon une catégorie pourrait rester une barre visible
  // en colonne 2 alors que TOUTES ses sous-catégories sont reléguées dans
  // "Autre" en colonne 3 (ou l'inverse), une incohérence que l'utilisateur
  // ne peut pas comprendre.
  const groupeDerniereColonne = regrouperEtTrier(
    colonnes[nbColonnes - 1]?.noeuds ?? [],
    C.texteMuted,
  );
  const idsGroupesReplies = new Set(
    groupeDerniereColonne.detailAutres.map((n) => n.groupeId ?? n.id),
  );
  const groupesParColonne = colonnes.map((c, i) => {
    if (i === nbColonnes - 1) return groupeDerniereColonne;
    if (i === 1 && nbColonnes >= 3) {
      return retirerGroupesReplies(c.noeuds, idsGroupesReplies);
    }
    return regrouperEtTrier(c.noeuds, C.texteMuted);
  });
  const visiblesParColonne = groupesParColonne.map((g) => g.noeuds);
  const detailAutresParColonne = groupesParColonne.map((g) => g.detailAutres);
  if (visiblesParColonne.every((v) => v.length === 0)) return null;

  // RÈGLE À NE JAMAIS CASSER — HAUTEUR DYNAMIQUE, JAMAIS COMPRESSÉE : cf.
  // RÈGLE HAUTEUR MINIMALE en tête de fichier — la hauteur "naturelle" se
  // déduit du plus grand nombre de nœuds parmi les colonnes (nMax) à
  // HAUTEUR_MIN_NOEUD/ESPACEMENT_MIN pleins ; le graphique prend le PLUS
  // GRAND des deux entre cette hauteur naturelle et hauteurMinDisponible
  // (45% de l'écran) — jamais un plafond qui l'écraserait en dessous.
  const nMax = Math.max(...visiblesParColonne.map((v) => v.length), 1);
  const hauteurNaturelle = PADDING_V * 2 + nMax * (HAUTEUR_MIN_NOEUD + ESPACEMENT_MIN);
  const hauteurMinDisponible = Dimensions.get("window").height * HAUTEUR_GRAPHIQUE_RATIO_MIN;
  const hauteurSvg = Math.max(hauteurNaturelle, hauteurMinDisponible);

  // RÈGLE proportionnalité stricte, TOTAL PARTAGÉ : cf. RÈGLE en tête de
  // fichier — un seul total de référence pour les 3 colonnes (le total de
  // la colonne "Entrées d'argent", jamais le total propre de chaque
  // colonne), pour que hauteurNoeud = montant/totalReference reste
  // comparable en absolu partout dans le graphique.
  const totalReference = Math.max(
    visiblesParColonne[0]?.reduce((acc, n) => acc + n.montant, 0) ?? 0,
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
  // à totalReference, PARTAGÉ entre les 3 colonnes), mais sa position Y est
  // recentrée sur l'étendue verticale exacte du groupe de nœuds qu'elle
  // alimente en dernière colonne. Comme la hauteur d'une catégorie = somme
  // des hauteurs de ses nœuds de destination (même totalReference des deux
  // côtés), elle est TOUJOURS ≤ l'étendue de son groupe (qui inclut en plus
  // les espacements entre ses membres) : aucun chevauchement possible avec
  // la barre centrée d'une autre catégorie, ces groupes ne se chevauchant
  // jamais entre eux en dernière colonne.
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
  const idsNoeudsDirectsSet = new Set(idsNoeudsDirects ?? []);
  // RÈGLE : ordre = celui de la DERNIÈRE colonne déjà positionnée (donc
  // déjà triée par bloc décroissant, cf. RÈGLE dans app/(tabs)/analytics.tsx)
  // — jamais l'ordre du prop `idsNoeudsDirects` lui-même, qui n'a pas de
  // sens vertical. Indispensable pour que l'assignation gloutonne
  // ci-dessous consomme les sources dans le bon ordre visuel (la plus
  // grosse destination avec la plus grosse source restante, en descendant).
  //
  // RÈGLE À NE JAMAIS CASSER — "AUTRE" REJOINT LES NŒUDS DIRECTS : cf. RÈGLE
  // "UN SEUL AUTRE, JAMAIS SANS FLUX" en tête de fichier — une fois replié
  // (regrouperEtTrier), le nœud "Autre" de la dernière colonne n'a plus de
  // barre intermédiaire en colonne "Catégories" (retirerGroupesReplies) ni
  // de nœud individuel à sa place (Cas 2/3/4 repliés) : il rejoint donc le
  // MÊME pont direct colonne 0 → dernière colonne que idsNoeudsDirects, avec
  // le même mécanisme anti-croisements/anti-bloc-isolé ci-dessous — sinon ce
  // nœud n'aurait jamais aucun flux entrant, en violation de la RÈGLE
  // "aucun nœud sans flux".
  const noeudsDirects = (derniereColonne ?? []).filter(
    (p) => idsNoeudsDirectsSet.has(p.noeud.id) || p.noeud.id === NOEUD_AUTRES_ID,
  );
  // RÈGLE : "Liquidités"/"Épargne"/catégories du Cas 2 sont alimentés par
  // ce que chaque nœud de la colonne 0 N'A PAS DÉJÀ donné aux catégories du
  // Cas 1 (liensCategories) — jamais un recalcul indépendant, sinon une
  // même part de la source serait comptée deux fois. Assignation gloutonne
  // (cf. assignerGloutonnement), pas une répartition proportionnelle sur
  // tous les nœuds directs à la fois.
  const sourcesRestantesDirectes = visiblesParColonne[0].map((source) => {
    const dejaAlloue = liensCategories
      .filter((l) => l.sourceId === source.id)
      .reduce((acc, l) => acc + l.montant, 0);
    return { id: source.id, restant: Math.max(0, source.montant - dejaAlloue) };
  });
  // RÈGLE À NE JAMAIS CASSER — AUCUN BLOC ISOLÉ : si la demande totale des
  // nœuds directs dépasse ce qu'il reste réellement en colonne 0 (mois en
  // déficit : catégories + épargne > entrées), une assignation gloutonne
  // pure épuiserait les sources sur les premiers nœuds traités et
  // laisserait les DERNIERS (souvent "Épargne", trié en fin de bloc si son
  // montant est petit) sans AUCUN ruban entrant. Même correctif que
  // liensParDefaut ci-dessus (facteurDisponibilite) : réduire
  // PROPORTIONNELLEMENT la demande de CHAQUE nœud direct pour ne jamais
  // dépasser la capacité réelle garantit que même le dernier nœud obtient
  // sa part — jamais zéro tant que son propre montant est non nul.
  const totalSourcesRestantesDirectes = sourcesRestantesDirectes.reduce(
    (acc, s) => acc + s.restant,
    0,
  );
  const totalDemandeDirecte = noeudsDirects.reduce((acc, p) => acc + p.noeud.montant, 0);
  const facteurDisponibiliteDirecte =
    totalDemandeDirecte > 0
      ? Math.min(1, totalSourcesRestantesDirectes / totalDemandeDirecte)
      : 1;
  const liensDirects: LienFlux[] =
    noeudsDirects.length > 0
      ? assignerGloutonnement(
          sourcesRestantesDirectes,
          noeudsDirects.map((p) => ({
            id: p.noeud.id,
            montant: p.noeud.montant * facteurDisponibiliteDirecte,
          })),
        )
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

  // RÈGLE À NE JAMAIS CASSER — AUCUN FLUX ORPHELIN : un nœud sans AUCUN
  // ruban entrant NI sortant ne doit JAMAIS s'afficher isolé — jamais
  // affiché du tout plutôt que comme une barre sans lien visible. "Touché"
  // = apparaît comme source ou destination d'au moins un lien réel
  // (montant > 0) dans le(s) pont(s) qui concernent sa colonne (colonne 0 :
  // sortant vers liensCategories/liensDirects ; dernière colonne : entrant
  // depuis liensDirects/liensVersDestination ; colonne intermédiaire :
  // entrant OU sortant, l'un des deux suffit). Filtré uniquement au
  // RENDU (positionsAffichablesParColonne) — les rubans eux-mêmes restent
  // calculés sur positionsParColonne au complet, un nœud orphelin n'ayant
  // par définition aucun ruban à masquer.
  const idsToucheesCol0 = new Set<string>();
  liensCategories.forEach((l) => {
    if (l.montant > 0) idsToucheesCol0.add(l.sourceId);
  });
  liensDirects.forEach((l) => {
    if (l.montant > 0) idsToucheesCol0.add(l.sourceId);
  });
  const idsToucheesColMilieu = new Set<string>();
  liensCategories.forEach((l) => {
    if (l.montant > 0) idsToucheesColMilieu.add(l.destId);
  });
  (liensVersDestination ?? []).forEach((l) => {
    if (l.montant > 0) idsToucheesColMilieu.add(l.sourceId);
  });
  const idsToucheesDerniereColonne = new Set<string>();
  liensDirects.forEach((l) => {
    if (l.montant > 0) idsToucheesDerniereColonne.add(l.destId);
  });
  (liensVersDestination ?? []).forEach((l) => {
    if (l.montant > 0) idsToucheesDerniereColonne.add(l.destId);
  });
  const estToucheParUnFlux = (colIndex: number, id: string): boolean => {
    // RÈGLE : "Autre" est un nœud AGRÉGÉ synthétisé par regrouperEtTrier,
    // jamais référencé par un vrai lien fourni par l'appelant (qui ne
    // connaît pas cet id) — `liensDirects` le touche désormais réellement
    // (cf. RÈGLE "AUTRE REJOINT LES NŒUDS DIRECTS" sur noeudsDirects
    // ci-dessus, toujours avec un montant > 0 dès qu'il existe), ce garde-fou
    // reste un filet de sécurité pur (jamais retiré même dans un cas limite
    // imprévu) plutôt qu'une nécessité structurelle comme avant.
    if (id === NOEUD_AUTRES_ID) return true;
    if (colIndex === 0) return idsToucheesCol0.has(id);
    if (colIndex === nbColonnes - 1) return idsToucheesDerniereColonne.has(id);
    return idsToucheesColMilieu.has(id);
  };
  const positionsAffichablesParColonne = positionsParColonne.map((positions, colIndex) =>
    positions.filter((p) => estToucheParUnFlux(colIndex, p.noeud.id)),
  );

  // RÈGLE À NE JAMAIS CASSER : "Autre" est cliquable comme n'importe quel
  // nœud — le tap ouvre un panel dédié listant les catégories qu'il
  // regroupe (cf. detailAutresSelection plus bas), jamais ignoré.
  const tapperNoeud = (colonneIndex: number, id: string) => {
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
  // RÈGLE : liste (déjà triée décroissant) des catégories repliées dans
  // "Autre" pour la colonne sélectionnée — null tant que le nœud
  // sélectionné n'est pas "Autre" lui-même.
  const detailAutresSelection =
    selection !== null && selection.id === NOEUD_AUTRES_ID
      ? (detailAutresParColonne[selection.colonne] ?? [])
      : null;

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
          {positionsAffichablesParColonne.map((positions, colIndex) =>
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
        {positionsAffichablesParColonne.map((positions, colIndex) =>
          positions.map(({ noeud, y, h }) => {
            const totalColonne = visiblesParColonne[colIndex].reduce(
              (acc, n) => acc + n.montant,
              0,
            );
            const pct = totalColonne > 0 ? Math.round((noeud.montant / totalColonne) * 100) : 0;
            const estColonneCategories = colIndex === 1 && nbColonnes > 2;
            const estColonneGauche = colIndex === 0;
            // RÈGLE À NE JAMAIS CASSER — LABEL BORNÉ AU COMPOSANT : la
            // largeur RÉELLEMENT disponible dépend du bord du composant
            // (0 à gauche, `largeur` à droite), jamais une largeur fixe —
            // sinon le label déborde du graphique sur un écran étroit ou
            // une colonne proche du bord (bug confirmé).
            const largeurDisponible = estColonneGauche
              ? Math.max(0, xColonnes[colIndex] - MARGE_LABEL)
              : Math.max(0, largeur - xColonnes[colIndex] - NODE_W - MARGE_LABEL);
            const largeurBox = Math.min(largeurDisponible, LARGEUR_LABEL_LATERAL_MAX);
            const nbLignesLabel = calculerNbLignesLabel(noeud.label, largeurBox);
            const texteMontant =
              estColonneCategories && modeAffichage === "pct"
                ? `${pct}%`
                : `${formaterMontant(noeud.montant)} €`;
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
                          ? xColonnes[colIndex] - MARGE_LABEL - largeurBox
                          : xColonnes[colIndex] + NODE_W + MARGE_LABEL,
                        width: largeurBox,
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
                      numberOfLines={nbLignesLabel}
                      ellipsizeMode="clip"
                    >
                      {noeud.label}
                    </Text>
                    <Text
                      style={[
                        styles.noeudMontant,
                        { color: C.texteMuted, textAlign: estColonneGauche ? "right" : "left" },
                      ]}
                      numberOfLines={1}
                    >
                      {tronquerSelonLargeur(texteMontant, largeurBox, LARGEUR_CAR_MONTANT)}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }),
        )}
      </View>

      {/* RÈGLE À NE JAMAIS CASSER : "Autre" a son PROPRE panel (liste des
          catégories repliées, nom + montant + %), jamais le panel
          générique à un seul nœud — sinon l'utilisateur ne voit qu'un
          total "Autre" sans savoir ce qu'il contient. */}
      {noeudSelectionne && detailAutresSelection !== null ? (
        <View
          style={[styles.detailPanel, styles.detailPanelListe, { backgroundColor: fondCarte, borderColor: C.carteBorder }]}
        >
          <Text style={[styles.detailAutresTitre, { color: C.texte }]}>
            {noeudSelectionne.noeud.label} — détail
          </Text>
          {detailAutresSelection.length === 0 ? (
            <Text style={[styles.detailValeur, { color: C.texteMuted }]}>
              Aucun détail disponible.
            </Text>
          ) : (
            detailAutresSelection.map((n) => (
              <View key={n.id} style={styles.detailAutresLigne}>
                <View style={[styles.detailDot, { backgroundColor: n.couleur }]} />
                <Text style={[styles.detailAutresNom, { color: C.texte }]} numberOfLines={1}>
                  {n.label}
                </Text>
                <Text style={[styles.detailAutresValeur, { color: C.texteMuted }]}>
                  {formaterMontant(n.montant)} €{" · "}
                  {totalColonneSelection > 0
                    ? Math.round((n.montant / totalColonneSelection) * 100)
                    : 0}
                  %
                </Text>
              </View>
            ))
          )}
        </View>
      ) : (
        noeudSelectionne && (
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
        )
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
  noeudLabel: { fontSize: TAILLE_LABEL_UNIFORME, fontWeight: "700" },
  noeudMontant: { fontSize: TAILLE_LABEL_UNIFORME, fontWeight: "500", marginTop: 2 },
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
  detailPanelListe: { flexDirection: "column", alignItems: "stretch", gap: 8 },
  detailAutresTitre: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  detailAutresLigne: { flexDirection: "row", alignItems: "center", gap: 8 },
  detailAutresNom: { flex: 1, fontSize: 12, fontWeight: "600" },
  detailAutresValeur: { fontSize: 12, fontWeight: "500" },
});
