import { useRef } from "react";
import {
  Animated,
  GestureResponderEvent,
  StyleProp,
  TouchableOpacity,
  ViewStyle,
} from "react-native";
import { dureeAnimation, useAccessibilite } from "./AccessibiliteContext";

// Enveloppe légère autour de TouchableOpacity : ajoute un léger effet
// d'enfoncement (scale ~97%) au moment de l'appui sur les boutons
// principaux de l'app, pour une sensation plus tactile — en plus, pas à la
// place, de l'effet d'opacité déjà géré par TouchableOpacity lui-même.
// `style` est appliqué à la View interne animée (pas au TouchableOpacity),
// donc se comporte visuellement comme sur un TouchableOpacity classique.
export function BoutonPrincipal({
  style,
  children,
  onPressIn,
  onPressOut,
  disabled,
  activeOpacity = 0.7,
  ...props
}: React.ComponentProps<typeof TouchableOpacity> & {
  style?: StyleProp<ViewStyle>;
}) {
  const { reduireAnimations } = useAccessibilite();
  const echelle = useRef(new Animated.Value(1)).current;

  const gererAppui = (e: GestureResponderEvent) => {
    Animated.timing(echelle, {
      toValue: 0.97,
      duration: dureeAnimation(reduireAnimations, 100),
      useNativeDriver: true,
    }).start();
    onPressIn?.(e);
  };

  const gererRelache = (e: GestureResponderEvent) => {
    Animated.timing(echelle, {
      toValue: 1,
      duration: dureeAnimation(reduireAnimations, 150),
      useNativeDriver: true,
    }).start();
    onPressOut?.(e);
  };

  return (
    <TouchableOpacity
      {...props}
      disabled={disabled}
      activeOpacity={activeOpacity}
      onPressIn={gererAppui}
      onPressOut={gererRelache}
    >
      <Animated.View style={[style, { transform: [{ scale: echelle }] }]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
}
