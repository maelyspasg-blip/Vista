import { useId, useState } from "react";
import { Animated, type LayoutChangeEvent } from "react-native";
import Svg, { Defs, Line, Pattern, Rect } from "react-native-svg";

// Segment de barre de progression rempli de rayures diagonales légères au
// lieu d'une couleur pleine — utilisé pour distinguer visuellement les
// montants encore prévus/non assignés (incertains) des montants déjà
// réalisés ou déjà engagés (couleur pleine, voir les segments voisins).
// `style` positionne le segment exactement comme un View classique (width,
// left, height...) ; `couleur` définit la teinte des rayures.
export function SegmentHachure({
  style,
  couleur,
}: {
  style?: object | object[];
  couleur: string;
}) {
  // useId() renvoie des ids contenant des ":" (ex. ":r0:") — inoffensif pour
  // un id DOM classique, mais react-native-svg (rendu natif iOS/Android) ne
  // résout pas fiablement un fill="url(#...)" dont l'id contient ces
  // caractères : le pattern ne s'applique pas et le rect retombe en remplissage
  // plein. On ne garde que les caractères alphanumériques.
  const patternId = `hachure${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  // RÈGLE À NE JAMAIS CASSER : le Svg ci-dessous doit TOUJOURS recevoir des
  // dimensions numériques (taille.largeur/taille.hauteur mesurées via
  // onLayout), jamais width="100%"/height="100%". <Svg width="100%"
  // height="100%"> à l'intérieur d'un Animated.View dont la largeur est
  // elle-même un pourcentage animé (le cas ici : la largeur vient d'une
  // interpolation Animated, pas d'un nombre fixe) ne se résout pas toujours
  // de façon fiable sur le rendu natif react-native-svg (iOS notamment) — le
  // pourcentage se perd à travers la limite Animated.View et le Svg peut
  // rester à 0×0, invisible, même quand le conteneur a bien une largeur
  // réelle non nulle. Ce bug est silencieux sur web (la cascade CSS résout
  // les pourcentages sans problème) et n'apparaît que sur device natif — ne
  // pas se fier à un test web/simulateur pour valider un changement ici.
  const [taille, setTaille] = useState({ largeur: 0, hauteur: 0 });
  const gererLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setTaille({ largeur: width, hauteur: height });
  };

  return (
    <Animated.View
      style={[{ overflow: "hidden" }, style]}
      onLayout={gererLayout}
    >
      {taille.largeur > 0 && taille.hauteur > 0 && (
        <Svg width={taille.largeur} height={taille.hauteur}>
          <Defs>
            <Pattern
              id={patternId}
              patternUnits="userSpaceOnUse"
              width={6}
              height={6}
            >
              <Rect width={6} height={6} fill={couleur} opacity={0.15} />
              <Line
                x1={0}
                y1={6}
                x2={6}
                y2={0}
                stroke={couleur}
                strokeWidth={1.5}
                opacity={0.6}
              />
            </Pattern>
          </Defs>
          <Rect
            width={taille.largeur}
            height={taille.hauteur}
            fill={`url(#${patternId})`}
          />
        </Svg>
      )}
    </Animated.View>
  );
}
