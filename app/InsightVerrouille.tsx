import { ReactNode, useState } from "react";
import { Alert, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Texte";

// Couleur "navy" déjà utilisée ailleurs dans l'app (ex: widgets) — sobre,
// pas de cercle ni de fond coloré autour, même esprit que l'icône ampoule
// (Ionicons + couleur simple) utilisée dans budget.tsx.
const COULEUR_CADENAS = "#2D3A4A";

// RÈGLE À NE JAMAIS CASSER : pas de BlurView/expo-blur ici — testé
// précédemment, l'affichait comme une zone rouge/erreur plutôt qu'un flou
// (le module natif nécessite un rebuild qui n'a pas eu lieu). L'effet de
// flou est simulé par 3 couches semi-opaques superposées (COUCHES_BROUILLARD
// ci-dessous) plutôt qu'un vrai flou de pixels — fiable partout, sans
// dépendance native.

// Chaque couche recouvre le bloc avec une opacité croissante et un
// borderRadius/inset légèrement différent — c'est cette variation entre
// couches (pas juste un aplat uni) qui donne l'impression de "brouillard"
// plutôt qu'un simple cache plat.
const COUCHES_BROUILLARD = [
  { alpha: 0.5, radius: 16, inset: 0 },
  { alpha: 0.7, radius: 12, inset: 3 },
  { alpha: 0.85, radius: 8, inset: 6 },
];

// Convertit une couleur du thème (hex "#RRGGBB" ou déjà rgba(...)) en
// composantes r/g/b, pour pouvoir reconstruire des rgba() à nos propres
// paliers d'opacité — le brouillard doit toujours matcher la couleur de
// fond de LA SECTION appelante (Aperçu vs Stats ont des fonds différents),
// jamais une couleur fixe indépendante du thème.
function versRgb(couleur: string): { r: number; g: number; b: number } {
  const hex = couleur.match(/^#([0-9a-fA-F]{6})$/);
  if (hex) {
    const valeur = hex[1];
    return {
      r: parseInt(valeur.slice(0, 2), 16),
      g: parseInt(valeur.slice(2, 4), 16),
      b: parseInt(valeur.slice(4, 6), 16),
    };
  }
  const rgb = couleur.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgb) {
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  }
  return { r: 245, g: 246, b: 248 }; // repli neutre clair, ne devrait jamais servir
}

// RÈGLE À NE JAMAIS CASSER : ce composant ne décide JAMAIS qui a le droit
// de voir le contenu déverrouillé — c'est à l'appelant ("Nos conseils"
// d'Aperçu, "Ce qu'il faut retenir" de Stats) de calculer `deverrouille`
// (objStore.isAdmin, un futur estPremium, ou le déblocage pub de la
// session) et de le passer en prop. Ce composant se contente de rendre
// `children` masqué + verrouillé quand `deverrouille` est false, en clair
// sinon — aucune logique premium/pub dupliquée ici.
//
// RÈGLE À NE JAMAIS CASSER : un seul bloc verrouillé pour tout `children`
// — l'appelant doit lui passer TOUS les insights à masquer d'un coup (ex:
// conseils.slice(1)), pas un par un. `children` est toujours rendu (juste
// masqué par le brouillard par-dessus), jamais remplacé par un placeholder
// vide — ça garantit que le bloc garde exactement la hauteur du contenu
// réel, sans sauter de mise en page au déverrouillage.
//
// RÈGLE À NE JAMAIS CASSER : `couleurFond` doit toujours être la couleur de
// fond RÉELLE de la section qui utilise ce composant (ex: C.fondSecondaire
// pour "Nos conseils", la couleur du tiroir pour "Ce qu'il faut retenir")
// — un brouillard qui ne matche pas son fond réel se voit comme un
// rectangle plaqué plutôt qu'un flou du contenu.
export function InsightVerrouille({
  deverrouille,
  onDeverrouille,
  couleurFond,
  children,
}: {
  deverrouille: boolean;
  onDeverrouille: () => void;
  couleurFond: string;
  children: ReactNode;
}) {
  const [enCoursDeblocage, setEnCoursDeblocage] = useState(false);

  if (deverrouille) return <>{children}</>;

  const demanderDeblocage = () => {
    Alert.alert(
      "Débloquer les analyses",
      "Regardez une courte publicité pour accéder à toutes vos analyses personnalisées.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Regarder la pub",
          onPress: () => {
            setEnCoursDeblocage(true);
            // Simulation de la pub récompensée — à remplacer par un vrai
            // SDK (AdMob) plus tard, sans changer onDeverrouille qu'elle
            // déclenche ni ce délai.
            setTimeout(() => {
              setEnCoursDeblocage(false);
              onDeverrouille();
              Alert.alert("Analyses débloquées !");
            }, 1500);
          },
        },
      ],
    );
  };

  const { r, g, b } = versRgb(couleurFond);

  return (
    <View style={styles.conteneur}>
      <View pointerEvents="none">{children}</View>
      {COUCHES_BROUILLARD.map((couche, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              top: couche.inset,
              left: couche.inset,
              right: couche.inset,
              bottom: couche.inset,
              borderRadius: couche.radius,
              backgroundColor: `rgba(${r}, ${g}, ${b}, ${couche.alpha})`,
            },
          ]}
        />
      ))}
      <TouchableOpacity
        style={[StyleSheet.absoluteFill, styles.zoneTap]}
        onPress={demanderDeblocage}
        activeOpacity={0.7}
        disabled={enCoursDeblocage}
        accessibilityLabel="Déverrouiller mes analyses"
      >
        <Ionicons name="lock-closed" size={24} color={COULEUR_CADENAS} />
        <Text style={styles.texteDeverrouiller}>Débloquer mes analyses</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  conteneur: { position: "relative", overflow: "hidden", borderRadius: 12 },
  zoneTap: { alignItems: "center", justifyContent: "center", gap: 6 },
  texteDeverrouiller: {
    fontSize: 13,
    fontWeight: "700",
    color: COULEUR_CADENAS,
  },
});
