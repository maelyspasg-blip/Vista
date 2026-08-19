import { Ionicons } from "@expo/vector-icons";
import { ReactNode, useState } from "react";
import { LayoutAnimation, StyleSheet, TouchableOpacity, View } from "react-native";
import { useAccessibilite } from "./AccessibiliteContext";
import { Text } from "./Texte";
import { useTheme } from "./ThemeContext";

// Section dépliable de Stats : titre + label temporel ("Août 2026" ou "3
// derniers mois") + chevron dans l'en-tête, contenu arbitraire en dessous.
// État ouvert/fermé purement local à chaque instance (pas remonté au
// parent) — rien dans la page n'a besoin de lire ou forcer l'état d'un
// tiroir depuis l'extérieur, et ça garde chaque tiroir indépendant des
// autres sans coordination. Seule exception : forcerOuvert (voir plus bas),
// pour le tutoriel de premier lancement.
//
// Pas de prop CibleTutoriel ici : quand une page a besoin de cibler ce
// tiroir pour son tutoriel, elle enveloppe le <TiroirStats> ENTIER avec
// <CibleTutoriel> depuis l'extérieur (exactement comme n'importe quelle
// autre cible de tutoriel dans l'app — voir budget.tsx). Pas d'indirection
// via une prop passée à travers ce composant.
export function TiroirStats({
  titre,
  labelTemporel,
  indicateurFiltre,
  ouvertParDefaut = false,
  forcerOuvert = false,
  children,
}: {
  titre: string;
  labelTemporel: string;
  // Contenu optionnel affiché sous le titre (ex: le petit indicateur
  // "entonnoir + nom de catégorie" quand un filtre est actif) — rendu tel
  // quel, l'appelant garde le contrôle total de son contenu/style.
  indicateurFiltre?: ReactNode;
  ouvertParDefaut?: boolean;
  // Passe de false à true => ouvre le tiroir une seule fois (ex: l'étape du
  // tutoriel qui cible ce tiroir vient de devenir active). Ce n'est PAS un
  // état contrôlé : l'ouverture reste ensuite un simple useState local,
  // l'utilisateur peut refermer le tiroir normalement juste après, et
  // repasser forcerOuvert à false ne referme rien automatiquement.
  forcerOuvert?: boolean;
  children: ReactNode;
}) {
  const { couleurs: C } = useTheme();
  const { reduireAnimations } = useAccessibilite();
  const [ouvert, setOuvert] = useState(ouvertParDefaut);

  const basculer = () => {
    // RÈGLE À NE JAMAIS CASSER : respecte le switch "Réduire les
    // animations" — durée 0 (transition instantanée) plutôt que de sauter
    // l'appel à configureNext, pour que la mise en page se recalcule quand
    // même proprement sans l'animation elle-même.
    LayoutAnimation.configureNext(
      reduireAnimations
        ? { duration: 0, update: { type: "linear" } }
        : LayoutAnimation.Presets.easeInEaseOut,
    );
    setOuvert((o) => !o);
  };

  // Synchronise `ouvert` à `forcerOuvert` sans passer par un effect — pattern
  // documenté par React pour ajuster un state local en réaction à un prop
  // (https://react.dev/learn/you-might-not-need-an-effect), qui évite à la
  // fois un aller-retour de rendu superflu et la règle de lint
  // react-hooks/set-state-in-effect (setState direct dans le corps d'un
  // effect). `dernierForcerOuvert` ne sert qu'à détecter la TRANSITION
  // false → true, pour ne déclencher l'ouverture (et son animation)
  // qu'une seule fois.
  const [dernierForcerOuvert, setDernierForcerOuvert] = useState(forcerOuvert);
  if (forcerOuvert !== dernierForcerOuvert) {
    setDernierForcerOuvert(forcerOuvert);
    if (forcerOuvert) {
      LayoutAnimation.configureNext(
        reduireAnimations
          ? { duration: 0, update: { type: "linear" } }
          : LayoutAnimation.Presets.easeInEaseOut,
      );
      setOuvert(true);
    }
  }

  return (
    <View
      style={[
        styles.carte,
        { backgroundColor: C.carte, borderColor: C.carteBorder },
      ]}
    >
      <TouchableOpacity
        style={styles.entete}
        onPress={basculer}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: ouvert }}
      >
        <View style={styles.enteteTexteBloc}>
          <View style={styles.enteteTitreRow}>
            <Text style={[styles.titre, { color: C.texte }]}>{titre}</Text>
            <Text style={[styles.labelTemporel, { color: C.texteMuted }]}>
              {labelTemporel}
            </Text>
          </View>
          {indicateurFiltre}
        </View>
        <Ionicons
          name={ouvert ? "chevron-down" : "chevron-forward"}
          size={18}
          color={C.texteMuted}
        />
      </TouchableOpacity>
      {ouvert && <View style={styles.contenu}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  carte: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden",
  },
  entete: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  enteteTexteBloc: { flex: 1 },
  // flexWrap + flexShrink sur le titre : un titre long (ex: "Entrées et
  // dépenses par catégorie") peut dépasser la largeur disponible une fois
  // le labelTemporel ("3 derniers mois") accolé — sans ça, le label
  // déborde du bord de la carte au lieu de passer à la ligne.
  enteteTitreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    flexWrap: "wrap",
  },
  titre: { fontSize: 15, fontWeight: "700", flexShrink: 1 },
  labelTemporel: { fontSize: 12, fontWeight: "500" },
  contenu: { paddingHorizontal: 16, paddingBottom: 16 },
});
