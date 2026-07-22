import { useEffect, useRef, useState } from "react";
import { Animated } from "react-native";
import { dureeAnimation, useAccessibilite } from "./AccessibiliteContext";
import { Text } from "./Texte";

// Un gros montant qui défile de son ancienne à sa nouvelle valeur au lieu de
// changer d'un coup. `style` est passé tel quel au Text (mêmes styles que
// n'importe quel autre montant affiché dans l'app).
export function NombreAnime({
  valeur,
  suffixe = " €",
  style,
}: {
  valeur: number;
  suffixe?: string;
  style?: object | object[];
}) {
  const { reduireAnimations } = useAccessibilite();
  const anim = useRef(new Animated.Value(valeur)).current;
  const [affiche, setAffiche] = useState(valeur);

  useEffect(() => {
    const id = anim.addListener(({ value }) => setAffiche(Math.round(value)));

    Animated.timing(anim, {
      toValue: valeur,
      duration: dureeAnimation(reduireAnimations, 500),
      useNativeDriver: false,
    }).start();

    return () => anim.removeListener(id);
  }, [valeur, reduireAnimations, anim]);

  return (
    <Text style={style}>
      {affiche}
      {suffixe}
    </Text>
  );
}
