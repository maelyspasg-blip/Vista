import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
    Dimensions,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

const PURPLE = "#8B6FE8";
const PURPLE_LIGHT = "#F0EEFF";
const MINT = "#5DC8A0";
const PEACH = "#F4956A";
const { width } = Dimensions.get("window");

const SLIDES = [
  {
    id: 1,
    emoji: "👋",
    titre: "Bienvenue sur Vista",
    description:
      "Ton assistant financier personnel. Suis tes dépenses, anticipe tes besoins et garde le contrôle de ton budget.",
    couleur: PURPLE,
    bg: PURPLE_LIGHT,
  },
  {
    id: 2,
    emoji: "💰",
    titre: "Pilote ton budget",
    description:
      "Crée tes enveloppes, suis tes dépenses en temps réel et visualise ton prévisionnel du mois.",
    couleur: MINT,
    bg: "#E8F8F2",
  },
  {
    id: 3,
    emoji: "📅",
    titre: "Organise ta semaine",
    description:
      "Planifie tes événements et connecte ton agenda à ton budget pour une vision complète de ta vie.",
    couleur: PEACH,
    bg: "#FFF0EA",
  },
];

export default function Onboarding() {
  const router = useRouter();
  const [slideActuel, setSlideActuel] = useState(0);

  const suivant = () => {
    if (slideActuel < SLIDES.length - 1) {
      setSlideActuel(slideActuel + 1);
    } else {
      router.push("/onboarding/inscription");
    }
  };

  const slide = SLIDES[slideActuel];

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.skip}
        onPress={() => router.push("/onboarding/inscription")}
        activeOpacity={0.7}
      >
        <Text style={styles.skipTexte}>Passer</Text>
      </TouchableOpacity>

      <View style={[styles.illustration, { backgroundColor: slide.bg }]}>
        <Text style={styles.emoji}>{slide.emoji}</Text>
      </View>

      <View style={styles.content}>
        <Text style={[styles.titre, { color: slide.couleur }]}>
          {slide.titre}
        </Text>
        <Text style={styles.description}>{slide.description}</Text>
      </View>

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i === slideActuel ? slide.couleur : "#E0E0E0",
                width: i === slideActuel ? 24 : 8,
              },
            ]}
          />
        ))}
      </View>

      <TouchableOpacity
        style={[styles.btnSuivant, { backgroundColor: slide.couleur }]}
        onPress={suivant}
        activeOpacity={0.8}
      >
        <Text style={styles.btnTexte}>
          {slideActuel === SLIDES.length - 1 ? "Commencer" : "Suivant"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 40,
  },
  skip: { alignSelf: "flex-end", marginBottom: 20 },
  skipTexte: { fontSize: 14, color: "#BBBBBB" },
  illustration: {
    width: width - 56,
    height: 280,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 40,
  },
  emoji: { fontSize: 80 },
  content: { alignItems: "center", marginBottom: 32 },
  titre: {
    fontSize: 26,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 14,
  },
  description: {
    fontSize: 15,
    color: "#888",
    textAlign: "center",
    lineHeight: 24,
  },
  dots: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 32,
    alignItems: "center",
  },
  dot: { height: 8, borderRadius: 4 },
  btnSuivant: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  btnTexte: { fontSize: 16, fontWeight: "600", color: "#FFFFFF" },
});
