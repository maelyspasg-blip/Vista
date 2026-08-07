import { Ionicons } from "@expo/vector-icons";
import { ReactNode, useEffect, useId, useRef, useState } from "react";
import {
  Dimensions,
  type LayoutChangeEvent,
  Modal,
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
};

const MARGE_ECRAN = 16;
const LARGEUR_BULLE = 300;
const HAUTEUR_BULLE_ESTIMEE = 160; // heuristique de positionnement, cf. plus bas
const PADDING_TROU = 8;
// Délai avant d'afficher la toute première étape d'une page : quand le
// tutoriel démarre juste après une navigation (ex. Aperçu → Budget en fin
// de tutoriel), la page vient tout juste de recevoir le focus — la
// transition d'onglet et, sur Planning, le défilement initial de la grille
// horaire (contentOffset) peuvent ne pas être totalement stabilisés au
// moment exact où CibleTutoriel mesure sa position. Ce court délai laisse
// ces transitions se terminer ; comme onMesure continue de mettre à jour
// posCibles pendant ce temps, la position utilisée au final est la plus
// fraîche disponible, pas seulement la première mesure (potentiellement
// prématurée). Les étapes suivantes de la même page ne sont PAS concernées
// (pas de délai entre elles) : seul le tout premier affichage l'est.
const DELAI_PREMIERE_ETAPE_MS = 250;

export function TutorielOverlay({
  visible,
  etapes,
  positions,
  onTerminer,
  onFermer,
}: {
  visible: boolean;
  etapes: EtapeTutoriel[];
  positions: Record<string, RectCible>;
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
  const [etapeIndex, setEtapeIndex] = useState(0);
  const [pret, setPret] = useState(false);
  const minuteurRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Dimensions.get("window") comme estimation initiale (évite un flash à
  // 0×0) ; corrigée par la mesure réelle du calque plein écran ci-dessous
  // dès qu'elle est disponible — plus fiable que Dimensions seul, qui s'est
  // déjà avéré incohérent selon les circonstances (cf. la même leçon tirée
  // pour SegmentHachure.tsx). C'est cette mesure, pas Dimensions, qui donne
  // la taille réelle du calque affiché.
  const [tailleEcran, setTailleEcran] = useState<{ width: number; height: number }>(
    () => {
      const { width, height } = Dimensions.get("window");
      return { width, height };
    },
  );
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
        DELAI_PREMIERE_ETAPE_MS,
      );
    } else {
      setPret(false);
    }
    return () => {
      if (minuteurRef.current) clearTimeout(minuteurRef.current);
    };
  }, [visible]);

  const gererLayoutEcran = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setTailleEcran((t) => (t.width === width && t.height === height ? t : { width, height }));
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
    if (etapeIndex >= etapes.length - 1) {
      onTerminer();
    } else {
      setEtapeIndex((i) => i + 1);
    }
  };

  const contenuBulle = (
    <>
      {etape.maquette?.(C)}
      <Text style={[styles.texteBulle, { color: C.texte }]}>
        {etape.texte}
      </Text>
      <Text style={[styles.indice, { color: C.texteMuted }]}>
        Touche n&apos;importe où pour continuer
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
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={avancer}
          onLayout={gererLayoutEcran}
        >
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.6)" }]}
          />
          <View style={styles.centreWrap}>
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
        </Pressable>
      </Modal>
    );
  }

  const trouX = rect.x - PADDING_TROU;
  const trouY = rect.y - PADDING_TROU;
  const trouLargeur = rect.width + PADDING_TROU * 2;
  const trouHauteur = rect.height + PADDING_TROU * 2;

  // Bulle sous la cible si la place le permet, sinon au-dessus — centrée
  // horizontalement sur la cible et clampée aux marges de l'écran. Quand une
  // cible occupe presque tout l'écran (ex. "grille" sur Planning, dont le
  // trou couvre tout le viewport du ScrollView), le placement "au-dessus"
  // est systématiquement choisi et se retrouve compressé dans la fine bande
  // au-dessus de la cible — on clampe alors au minimum à insets.top (zone
  // sûre sous la barre de statut / l'encoche) plutôt qu'à une marge fixe de
  // 16px qui ne tient pas compte de l'appareil.
  const placerSous =
    trouY + trouHauteur + HAUTEUR_BULLE_ESTIMEE < hauteurEcran;
  const bulleTop = placerSous
    ? trouY + trouHauteur + 12
    : Math.max(insets.top + MARGE_ECRAN, trouY - HAUTEUR_BULLE_ESTIMEE - 12);
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
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={avancer}
        onLayout={gererLayoutEcran}
      >
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
        >
          {contenuBulle}
        </View>

        {btnFermer}
      </Pressable>
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
    ...StyleSheet.absoluteFill,
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
