import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "expo-router";
import { ReactNode, useEffect, useId, useRef, useState } from "react";
import {
  Dimensions,
  type LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Defs, Mask, Rect } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccessibilite } from "./AccessibiliteContext";
import type { RectCible } from "./CibleTutoriel";
import { Text } from "./Texte";
import { COULEURS, useTheme } from "./ThemeContext";

export type CouleursTheme = typeof COULEURS.clair;

export type EtapeTutoriel = {
  // Absent => étape "sans cible" : pas de trou dans l'overlay, carte
  // centrée à l'écran. Utilisé pour les étapes purement illustratives
  // (maquette + explication) qui ne correspondent à aucun élément réel
  // visible sur la page au moment du tutoriel.
  id?: string;
  texte: string;
  // Mini composant illustratif optionnel dessiné dans la bulle (jamais une
  // capture d'écran) — reçoit les couleurs du thème actif pour rester
  // cohérent clair/sombre quel que soit le thème de l'utilisateur.
  maquette?: (C: CouleursTheme) => ReactNode;
  // Effet de bord déclenché dès que cette étape devient l'étape courante
  // (voir le useEffect dédié plus bas) — typiquement pour forcer
  // l'ouverture d'un tiroir dont le header est la cible, ou déclencher un
  // scroll automatique vers une cible hors champ, avant que l'utilisateur
  // ne voie la bulle qui en parle.
  onAfficher?: () => void;
};

const MARGE_ECRAN = 16;
const LARGEUR_BULLE = 300;
const HAUTEUR_BULLE_ESTIMEE = 160; // heuristique de positionnement, cf. plus bas
const PADDING_TROU = 8;
// Marge de sécurité SUPPLÉMENTAIRE (en plus de insets.bottom + MARGE_ECRAN)
// réservée uniquement pour le clamp bas de la bulle — HAUTEUR_BULLE_ESTIMEE
// est une heuristique, pas une mesure réelle (pas de onLayout sur la bulle),
// et certains textes plus longs (ex: étapes du tutoriel Stats) rendent une
// bulle plus haute que l'estimation, ce qui la faisait déborder du bas de
// l'écran malgré le clamp existant.
const MARGE_SECURITE_BAS = 16;

// RÈGLE À NE JAMAIS CASSER : délai minimum avant d'afficher la toute
// première étape d'une page — laisse le temps à la transition d'écran
// (changement d'onglet, et surtout la navigation automatique déclenchée à
// la fin du tutoriel d'une page précédente) de se stabiliser, et aux
// CibleTutoriel d'avoir mesuré leur position DÉFINITIVE, avant qu'on ne
// s'y fie. Sans ce délai — ou s'il est raccourci — l'overlay peut se
// déclencher sur des mesures prises pendant la transition elle-même : trou
// mal placé, ou pire, la page qui vient de recevoir le focus affiche
// brièvement le contenu destiné à la page précédente. 250ms puis 500ms se
// sont tous les deux révélés insuffisants en usage réel sur device ; 600ms
// est un minimum explicitement demandé, à ne pas rabaisser sans nouvelle
// validation sur device réel (le simulateur ne reproduit pas fidèlement ces
// délais de transition).
const DELAI_ARRIVEE_MS = 600;

export function TutorielOverlay({
  actif,
  etapes,
  positions,
  scrollOffset = 0,
  onTerminer,
  onFermer,
}: {
  // Vrai si CETTE page doit potentiellement montrer son tutoriel (typiquement
  // `!tutorielXVu`, le flag de la page appelante). Ne PAS pré-calculer ici
  // le "toutes les cibles actives sont mesurées" côté appelant : c'est
  // justement cette logique dupliquée sur 4 pages qui a été source de
  // régressions (une page filtrant mal une étape sans cible valable, une
  // autre oubliant de le faire). Elle est centralisée ci-dessous, une seule
  // fois, à partir de `etapes` (déjà filtré par l'appelant pour ne
  // contenir que les étapes réellement affichables maintenant) et
  // `positions`.
  actif: boolean;
  etapes: EtapeTutoriel[];
  positions: Record<string, RectCible>;
  // RÈGLE À NE JAMAIS CASSER : offset de scroll (contentOffset.y) de la
  // page appelante AU MOMENT où `positions` a été mesuré pour la cible
  // courante — nécessaire seulement
  // pour les pages qui scrollent SANS jamais redemander de mesure ensuite
  // (Stats : voir analytics.tsx, allerVersCibleTutoriel). Dans ce cas,
  // rect.y (measureInWindow, donc relatif à l'écran) reflète la position
  // d'AVANT le scroll, pas la position réelle à l'écran maintenant — le
  // trou et la bulle doivent se recaler de scrollOffset pour rester
  // alignés sur l'élément réellement affiché. Les pages qui re-mesurent
  // après leur scroll (Budget, Aperçu, via forcerRemesure) n'ont pas ce
  // problème : rect.y y est toujours à jour, donc scrollOffset reste à sa
  // valeur par défaut (0, aucune correction) pour elles.
  scrollOffset?: number;
  // Dernière étape validée par un tap (avancer jusqu'au bout) — c'est ce
  // callback qui doit déclencher la navigation vers la page suivante.
  onTerminer: () => void;
  // Fermeture explicite (croix, bouton retour Android, Escape web) : par
  // défaut identique à onTerminer (marque simplement l'étape vue), mais un
  // appelant peut le distinguer pour NE PAS naviguer dans ce cas — seule la
  // validation naturelle de la dernière étape doit enchaîner sur la page
  // suivante, pas une fermeture anticipée.
  onFermer?: () => void;
}) {
  const { couleurs: C } = useTheme();
  const { reduireAnimations } = useAccessibilite();
  const insets = useSafeAreaInsets();

  // RÈGLE À NE JAMAIS CASSER : useIsFocused (pas seulement `actif`) est ce
  // qui garantit qu'un overlay ne reste JAMAIS visible après avoir navigué
  // vers une autre page. <Modal> de React Native se rend dans une couche
  // native au-dessus de TOUTE l'application, indépendamment de l'onglet
  // visuellement actif — sans cette garde, si l'état local d'une page
  // (tutorielXVu, posCiblesTutoriel) ne se met pas à jour au même instant
  // que la navigation (notamment la navigation automatique déclenchée à la
  // fin d'un tutoriel via router.push), son overlay peut continuer à
  // s'afficher par-dessus la page suivante, mélangeant le texte des deux
  // pages. estFocus passe à false dès que l'écran perd le focus, quelle
  // qu'en soit la cause, et ferme immédiatement l'overlay — indépendamment
  // de tout le reste de cette logique.
  //
  // RÈGLE À NE JAMAIS CASSER (import) : useIsFocused DOIT venir de
  // "expo-router", jamais directement de "@react-navigation/native" même si
  // ce dernier reste une dépendance installée du projet. expo-router
  // (SDK 56) gère l'arbre de navigation avec sa PROPRE copie vendorisée de
  // react-navigation (voir node_modules/expo-router/build/react-navigation/) ;
  // useIsFocused importé du package top-level résout contre une INSTANCE DE
  // MODULE DIFFÉRENTE de celle qui fournit réellement le Context de focus,
  // et retourne alors silencieusement `false` en permanence — aucune erreur,
  // juste un overlay qui ne se déclenche jamais (visible et pret restent
  // bloqués à false). C'est exactement le même principe que le remap déjà
  // fait pour @react-navigation/material-top-tabs / bottom-tabs / elements
  // vers expo-router/js-top-tabs, js-tabs, react-navigation.
  const estFocus = useIsFocused();

  // Centralisé ici plutôt que côté appelant — voir le commentaire sur
  // `actif` ci-dessus.
  const toutesCiblesActivesMesurees = etapes.every(
    (e) => !e.id || positions[e.id] !== undefined,
  );
  const visible =
    estFocus && actif && etapes.length > 0 && toutesCiblesActivesMesurees;

  // TEMPORAIRE — diagnostic du bug "l'overlay ne se déclenche pas" : à
  // retirer une fois confirmé que `visible` passe bien à true et que les
  // cibles listées sont toutes mesurées.
  if (actif) {
    console.log(
      "[TutorielOverlay] visible=",
      visible,
      "estFocus=",
      estFocus,
      "cibles manquantes=",
      etapes.filter((e) => e.id && positions[e.id] === undefined).map((e) => e.id),
    );
  }

  const [etapeIndex, setEtapeIndex] = useState(0);
  const [pret, setPret] = useState(false);
  const minuteurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Dimensions.get("window") comme estimation initiale (évite un flash à
  // 0×0) ; corrigée par la mesure réelle du calque plein écran ci-dessous
  // dès qu'elle est disponible — plus fiable que Dimensions seul, qui s'est
  // déjà avéré incohérent selon les circonstances (cf. la même leçon tirée
  // pour SegmentHachure.tsx). C'est cette mesure, pas Dimensions, qui donne
  // la taille réelle du calque affiché.
  const [tailleEcran, setTailleEcran] = useState<{
    width: number;
    height: number;
  }>(() => {
    const { width, height } = Dimensions.get("window");
    return { width, height };
  });
  // useId() renvoie des ":" — même souci de sanitization que SegmentHachure
  // pour un id d'url(#...) fiable sur le rendu natif react-native-svg.
  const maskId = `tutorielTrou${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    if (minuteurRef.current) clearTimeout(minuteurRef.current);
    if (visible) {
      setEtapeIndex(0);
      setPret(false);
      minuteurRef.current = setTimeout(
        () => setPret(true),
        DELAI_ARRIVEE_MS,
      );
    } else {
      setPret(false);
    }
    return () => {
      if (minuteurRef.current) clearTimeout(minuteurRef.current);
    };
  }, [visible]);

  // Sur natif, <Modal> se rend dans une fenêtre native séparée, au-dessus
  // de tout : les gestes ne peuvent physiquement pas atteindre l'écran en
  // dessous, rien à faire de plus. Sur web, react-native-web rend <Modal>
  // comme un simple calque `position: fixed` par-dessus le DOM existant —
  // ça bloque bien les clics (au-dessus dans l'empilement), mais PAS le
  // scroll de la page en dessous, qui reste actionnable à la molette ou au
  // clavier tant que <body> lui-même reste scrollable. On verrouille donc
  // explicitement le scroll du document tant que l'overlay est affiché.
  useEffect(() => {
    if (Platform.OS !== "web" || !visible) return;
    const precedent = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = precedent;
    };
  }, [visible]);

  // Déclenche l'effet de bord de l'étape courante (ex: forcer l'ouverture
  // d'un tiroir, ou scroller vers une cible hors champ) dès qu'elle devient
  // active — au tout premier affichage comme à chaque navigation
  // précédent/suivant. Volontairement synchrone avec l'affichage de la
  // bulle plutôt que retardé : reculer le rendu de la bulle jusqu'à la fin
  // de l'animation/scroll obligerait à démonter temporairement le Modal
  // (return null, cf. plus bas), ce qui romprait le blocage des
  // taps/scroll pendant ce court instant — pire que montrer le texte
  // pendant que le tiroir/scroll finit de s'ajuster dessous.
  //
  // RÈGLE À NE JAMAIS CASSER : verrou anti-boucle. Un onAfficher qui scrolle
  // peut, selon la page, déclencher une re-mesure des cibles (cleFocus) —
  // si cette re-mesure changeait elle-même l'étape ou redéclenchait un
  // scroll, on obtiendrait une boucle scroll → mesure → scroll qui fait
  // sauter l'écran sans arrêt. scrollEnCoursRef bloque tout changement
  // d'étape (avancer/reculer) pendant les 500ms qui suivent l'apparition
  // d'une étape, le temps qu'un éventuel effet de bord se stabilise —
  // aucune page n'a plus besoin de ça aujourd'hui (le scroll par étape a
  // été retiré de Stats), mais ce filet reste actif par précaution pour
  // toute page qui utiliserait onAfficher à l'avenir.
  const scrollEnCoursRef = useRef(false);
  useEffect(() => {
    if (!visible) return;
    scrollEnCoursRef.current = true;
    etapes[etapeIndex]?.onAfficher?.();
    const minuteur = setTimeout(() => {
      scrollEnCoursRef.current = false;
    }, 500);
    return () => clearTimeout(minuteur);
  }, [visible, etapeIndex, etapes]);

  const gererLayoutEcran = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setTailleEcran((t) =>
      t.width === width && t.height === height ? t : { width, height },
    );
  };

  if (!visible || !pret || etapes.length === 0) return null;

  const etape = etapes[etapeIndex];
  // Étape "sans cible" (pas d'id) : rect reste undefined, pas de trou à
  // découper — cf. branche de rendu plus bas. Étape avec cible : si sa
  // position n'est pas encore mesurée (CibleTutoriel pas encore monté/
  // layouté), on n'affiche rien plutôt qu'un trou mal placé.
  const rect = etape.id ? positions[etape.id] : undefined;
  if (etape.id && !rect) return null;

  const { width: largeurEcran, height: hauteurEcran } = tailleEcran;
  const fermer = onFermer ?? onTerminer;

  const avancer = () => {
    if (scrollEnCoursRef.current) return;
    if (etapeIndex >= etapes.length - 1) {
      onTerminer();
    } else {
      setEtapeIndex((i) => i + 1);
    }
  };
  const reculer = () => {
    if (scrollEnCoursRef.current) return;
    setEtapeIndex((i) => Math.max(0, i - 1));
  };

  const contenuBulle = (
    <>
      {etape.maquette?.(C)}
      <Text style={[styles.texteBulle, { color: C.texte }]}>
        {etape.texte}
      </Text>
      <Text style={[styles.indice, { color: C.texteMuted }]}>
        ← Retour | Continuer →
      </Text>
    </>
  );

  const btnFermer = (
    <Pressable
      onPress={fermer}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={styles.btnFermer}
      accessibilityRole="button"
      accessibilityLabel="Fermer le tutoriel"
    >
      <Ionicons name="close" size={22} color="#FFFFFF" />
    </Pressable>
  );

  // RÈGLE À NE JAMAIS CASSER : ces deux zones doivent être rendues APRÈS le
  // fond (Svg ou View de couleur unie selon la branche) dans l'ordre du
  // JSX — React Native empile les enfants d'un même parent dans leur ordre
  // de rendu, donc une zone tapable rendue avant le fond se retrouverait
  // sous lui et ne recevrait jamais aucun tap. Elles doivent aussi être
  // rendues AVANT la bulle et btnFermer : ceux-ci n'ayant pas besoin de
  // capter les taps qui tombent à côté d'eux, les zones peuvent les
  // couvrir sans risque (RN fait remonter le tap au premier ancêtre/
  // descendant qui implémente réellement un responder — un Pressable
  // superposé, comme btnFermer, capte toujours ses propres taps en
  // priorité sur la zone qu'il recouvre).
  const zonesNavigation = (
    <>
      <Pressable
        onPress={reculer}
        style={styles.zoneGauche}
        accessibilityRole="button"
        accessibilityLabel="Étape précédente"
      />
      <Pressable
        onPress={avancer}
        style={styles.zoneDroite}
        accessibilityRole="button"
        accessibilityLabel="Étape suivante"
      />
    </>
  );

  if (!rect) {
    // Étape sans cible : overlay plein écran uni (pas de trou à découper),
    // bulle centrée — utilisé pour les étapes purement illustratives.
    return (
      <Modal
        visible={visible}
        transparent
        animationType={reduireAnimations ? "none" : "fade"}
        onRequestClose={fermer}
      >
        <View
          style={StyleSheet.absoluteFill}
          onLayout={gererLayoutEcran}
        >
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(0,0,0,0.6)" },
            ]}
          />
          {zonesNavigation}
          <View style={styles.centreWrap} pointerEvents="none">
            <View
              style={[
                styles.bulleBase,
                { backgroundColor: C.carte, borderColor: C.carteBorder },
              ]}
            >
              {contenuBulle}
            </View>
          </View>
          {btnFermer}
        </View>
      </Modal>
    );
  }

  // RÈGLE À NE JAMAIS CASSER : voir le commentaire de scrollOffset
  // ci-dessus — rect.y - scrollOffset recale la position mesurée sur la
  // position réellement affichée à l'écran maintenant, pour les pages qui
  // scrollent sans re-mesurer. Sans cette soustraction, le trou/la bulle
  // restent alignés sur l'ancienne position (celle d'avant le scroll de
  // la page), décalés par rapport à ce que l'utilisateur voit vraiment.
  const rectYEcran = rect.y - scrollOffset;
  const trouX = rect.x - PADDING_TROU;
  const trouY = rectYEcran - PADDING_TROU;
  const trouLargeur = rect.width + PADDING_TROU * 2;
  const trouHauteur = rect.height + PADDING_TROU * 2;

  // Bulle du côté qui a le plus d'espace disponible plutôt que "en dessous
  // si ça tient, sinon au-dessus" — un simple test de fit favorisait
  // systématiquement "au-dessus" dès que ça ne tenait pas EXACTEMENT en
  // dessous, y compris quand l'espace au-dessus était en réalité plus
  // restreint (cible à mi-écran). Comparer les deux espaces réels donne un
  // placement cohérent quelle que soit la position verticale de la cible.
  const espaceAuDessus = trouY - insets.top - MARGE_ECRAN;
  const espaceEnDessous =
    hauteurEcran - insets.bottom - MARGE_ECRAN - (trouY + trouHauteur);
  const placerSous = espaceEnDessous >= espaceAuDessus;
  const bulleTopBrut = placerSous
    ? trouY + trouHauteur + 12
    : trouY - HAUTEUR_BULLE_ESTIMEE - 12;
  // Toujours dans la zone visible, même si `rect` lui-même est hors-écran
  // (ex: carte plus bas dans un ScrollView, mesurée alors qu'elle n'est pas
  // affichée à l'écran au moment du tutoriel) — la bulle de texte doit
  // rester lisible quoi qu'il arrive, quitte à ne plus être visuellement
  // "collée" au trou découpé (qui, lui, peut légitimement être hors-écran).
  const bulleTop = Math.min(
    Math.max(bulleTopBrut, insets.top + MARGE_ECRAN),
    hauteurEcran -
      HAUTEUR_BULLE_ESTIMEE -
      insets.bottom -
      MARGE_ECRAN -
      MARGE_SECURITE_BAS,
  );
  const centreCible = rect.x + rect.width / 2;
  const bulleLeft = Math.min(
    Math.max(centreCible - LARGEUR_BULLE / 2, MARGE_ECRAN),
    largeurEcran - LARGEUR_BULLE - MARGE_ECRAN,
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduireAnimations ? "none" : "fade"}
      onRequestClose={fermer}
    >
      <View style={StyleSheet.absoluteFill} onLayout={gererLayoutEcran}>
        <Svg width={largeurEcran} height={hauteurEcran}>
          <Defs>
            <Mask id={maskId}>
              <Rect width={largeurEcran} height={hauteurEcran} fill="#FFFFFF" />
              <Rect
                x={trouX}
                y={trouY}
                width={trouLargeur}
                height={trouHauteur}
                rx={14}
                fill="#000000"
              />
            </Mask>
          </Defs>
          <Rect
            width={largeurEcran}
            height={hauteurEcran}
            fill="rgba(0,0,0,0.6)"
            mask={`url(#${maskId})`}
          />
        </Svg>

        {zonesNavigation}

        <View
          style={[
            styles.bulleBase,
            styles.bullePositionnee,
            {
              top: bulleTop,
              left: bulleLeft,
              backgroundColor: C.carte,
              borderColor: C.carteBorder,
            },
          ]}
          pointerEvents="none"
        >
          {contenuBulle}
        </View>

        {btnFermer}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bulleBase: {
    width: LARGEUR_BULLE,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  bullePositionnee: {
    position: "absolute",
  },
  centreWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: MARGE_ECRAN,
  },
  texteBulle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600",
  },
  indice: {
    fontSize: 12,
    marginTop: 10,
  },
  // RÈGLE À NE JAMAIS CASSER : zoneGauche + zoneDroite doivent couvrir 100%
  // de la largeur ET de la hauteur de l'écran à elles deux, sans zone
  // morte entre les deux ni en haut/bas — top:0 + bottom:0 (plutôt qu'une
  // height fixe) garantit qu'elles s'étirent toujours sur toute la hauteur
  // réelle du calque parent, quelle que soit sa taille. Un espace non
  // couvert laisserait un tap y atteindre l'écran en dessous, malgré le
  // blocage de scroll/interactions par ailleurs.
  zoneGauche: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: "50%",
  },
  zoneDroite: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: "50%",
  },
  btnFermer: {
    position: "absolute",
    top: 48,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
});
