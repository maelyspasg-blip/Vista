import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { dureeAnimation, useAccessibilite } from "./AccessibiliteContext";

// Barre de progression (jauge) dont le remplissage glisse doucement vers sa
// nouvelle valeur au lieu de sauter instantanément. `pourcentage` doit être
// entre 0 et 100 (déjà clampé par l'appelant si besoin).
export function BarreProgression({
  pourcentage,
  couleur,
  couleurFond,
  hauteur = 6,
  style,
}: {
  pourcentage: number;
  couleur: string;
  couleurFond: string;
  hauteur?: number;
  style?: object;
}) {
  const { reduireAnimations } = useAccessibilite();
  const anim = useRef(new Animated.Value(pourcentage)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: pourcentage,
      duration: dureeAnimation(reduireAnimations, 350),
      useNativeDriver: false,
    }).start();
  }, [pourcentage, reduireAnimations, anim]);

  const largeur = anim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });

  return (
    <View
      style={[
        styles.fond,
        { height: hauteur, borderRadius: hauteur / 2, backgroundColor: couleurFond },
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.remplissage,
          { height: hauteur, borderRadius: hauteur / 2, backgroundColor: couleur, width: largeur },
        ]}
      />
    </View>
  );
}

// Pour les cas où le fond de la barre est déjà géré par l'appelant (ex. une
// barre composée de plusieurs segments superposés) : ne retourne que la
// largeur animée, à appliquer à une simple Animated.View.
export function useLargeurAnimee(pourcentage: number) {
  const { reduireAnimations } = useAccessibilite();
  const anim = useRef(new Animated.Value(pourcentage)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: pourcentage,
      duration: dureeAnimation(reduireAnimations, 350),
      useNativeDriver: false,
    }).start();
  }, [pourcentage, reduireAnimations, anim]);

  return anim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });
}

const styles = StyleSheet.create({
  fond: { overflow: "hidden" },
  remplissage: {},
});
