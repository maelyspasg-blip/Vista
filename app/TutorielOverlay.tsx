import { Ionicons } from "@expo/vector-icons";
import { useEffect, useId, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Defs, Mask, Rect } from "react-native-svg";
import { useAccessibilite } from "./AccessibiliteContext";
import type { RectCible } from "./CibleTutoriel";
import { Text } from "./Texte";
import { useTheme } from "./ThemeContext";

export type EtapeTutoriel = { id: string; texte: string };

const MARGE_ECRAN = 16;
const LARGEUR_BULLE = 300;
const HAUTEUR_BULLE_ESTIMEE = 160; // heuristique de positionnement, cf. plus bas
const PADDING_TROU = 8;

export function TutorielOverlay({
  visible,
  etapes,
  positions,
  onTerminer,
}: {
  visible: boolean;
  etapes: EtapeTutoriel[];
  positions: Record<string, RectCible>;
  onTerminer: () => void;
}) {
  const { couleurs: C } = useTheme();
  const { reduireAnimations } = useAccessibilite();
  const [etapeIndex, setEtapeIndex] = useState(0);
  // useId() renvoie des ":" — même souci de sanitization que SegmentHachure
  // pour un id d'url(#...) fiable sur le rendu natif react-native-svg.
  const maskId = `tutorielTrou${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    if (visible) setEtapeIndex(0);
  }, [visible]);

  if (!visible || etapes.length === 0) return null;

  const etape = etapes[etapeIndex];
  const rect = positions[etape.id];
  if (!rect) return null;

  const { width: largeurEcran, height: hauteurEcran } = Dimensions.get("window");

  const avancer = () => {
    if (etapeIndex >= etapes.length - 1) {
      onTerminer();
    } else {
      setEtapeIndex((i) => i + 1);
    }
  };

  const trouX = rect.x - PADDING_TROU;
  const trouY = rect.y - PADDING_TROU;
  const trouLargeur = rect.width + PADDING_TROU * 2;
  const trouHauteur = rect.height + PADDING_TROU * 2;

  // Bulle sous la cible si la place le permet, sinon au-dessus — centrée
  // horizontalement sur la cible et clampée aux marges de l'écran.
  const placerSous =
    trouY + trouHauteur + HAUTEUR_BULLE_ESTIMEE < hauteurEcran;
  const bulleTop = placerSous
    ? trouY + trouHauteur + 12
    : Math.max(MARGE_ECRAN, trouY - HAUTEUR_BULLE_ESTIMEE - 12);
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
      onRequestClose={onTerminer}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={avancer}>
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
            styles.bulle,
            {
              top: bulleTop,
              left: bulleLeft,
              backgroundColor: C.carte,
              borderColor: C.carteBorder,
            },
          ]}
        >
          <Text style={[styles.texteBulle, { color: C.texte }]}>
            {etape.texte}
          </Text>
          <Text style={[styles.indice, { color: C.texteMuted }]}>
            Touche n&apos;importe où pour continuer
          </Text>
        </View>

        <Pressable
          onPress={onTerminer}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.btnFermer}
          accessibilityRole="button"
          accessibilityLabel="Fermer le tutoriel"
        >
          <Ionicons name="close" size={22} color="#FFFFFF" />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bulle: {
    position: "absolute",
    width: LARGEUR_BULLE,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
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
