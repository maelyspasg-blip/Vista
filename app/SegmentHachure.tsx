import { useId } from "react";
import { StyleProp, View, ViewStyle } from "react-native";
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
  style?: StyleProp<ViewStyle>;
  couleur: string;
}) {
  // useId() renvoie des ids contenant des ":" (ex. ":r0:") — inoffensif pour
  // un id DOM classique, mais react-native-svg (rendu natif iOS/Android) ne
  // résout pas fiablement un fill="url(#...)" dont l'id contient ces
  // caractères : le pattern ne s'applique pas et le rect retombe en remplissage
  // plein. On ne garde que les caractères alphanumériques.
  const patternId = `hachure${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <View style={[{ overflow: "hidden" }, style]}>
      <Svg width="100%" height="100%">
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
        <Rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </Svg>
    </View>
  );
}
