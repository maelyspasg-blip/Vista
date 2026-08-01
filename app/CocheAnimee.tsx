import { useEffect, useRef } from "react";
import { Animated } from "react-native";
import Svg, { Path } from "react-native-svg";
import { dureeAnimation, useAccessibilite } from "./AccessibiliteContext";

const PathAnime = Animated.createAnimatedComponent(Path);

// Longueur totale du tracé "M5 13l4 4L19 7" (segment court + segment long
// d'une coche classique sur un viewBox 24x24) : sqrt(4²+4²) + sqrt(10²+10²)
// ≈ 19,8, arrondi à 20 — une coche qui se trace progressivement du début à
// la fin plutôt que d'apparaître d'un coup, montée à chaque fois que ce
// composant devient visible (ex. un badge "Atteint"/"payée" qui apparaît).
const LONGUEUR_TRAIT = 20;

export function CocheAnimee({
  taille = 14,
  couleur = "#FFFFFF",
  epaisseurTrait = 2.5,
}: {
  taille?: number;
  couleur?: string;
  epaisseurTrait?: number;
}) {
  const { reduireAnimations } = useAccessibilite();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: dureeAnimation(reduireAnimations, 400),
      useNativeDriver: false,
    }).start();
  }, [reduireAnimations, anim]);

  const strokeDashoffset = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [LONGUEUR_TRAIT, 0],
  });

  return (
    <Svg width={taille} height={taille} viewBox="0 0 24 24" fill="none">
      <PathAnime
        d="M5 13l4 4L19 7"
        stroke={couleur}
        strokeWidth={epaisseurTrait * 2}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={LONGUEUR_TRAIT}
        strokeDashoffset={strokeDashoffset}
      />
    </Svg>
  );
}
