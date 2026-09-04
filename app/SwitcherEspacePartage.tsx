import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { Alert, StyleSheet, TouchableOpacity } from "react-native";
import { useEspacePartage } from "./EspacePartageContext";
import { useObjectifs } from "./store";
import { useTheme } from "./ThemeContext";

// RÈGLE À NE JAMAIS CASSER — POINT D'ENTRÉE UNIQUE POUR CHANGER vueActive,
// UTILISÉ SUR LES 4 PAGES PRINCIPALES : décision du 2026-09-04, qui REVIENT
// sur une règle précédente ("un seul switcher, sur Aperçu uniquement", suite
// à un doublon d'état bugué retiré de app/(tabs)/budget.tsx par le passé,
// commit cd19b79). Cette fois, ce composant est la SEULE implémentation du
// switcher (jamais une variante locale par écran) et n'appelle jamais que
// `setVueActive` d'EspacePartageContext — l'état lui-même reste unique et
// persisté (AsyncStorage, cf. EspacePartageContext.tsx), donc plusieurs
// boutons qui l'affichent/le modifient depuis 4 écrans différents ne créent
// aucun état dupliqué, contrairement à l'ancien doublon de Budget. Rendu
// icône seule (jamais de texte) : person-outline en vue personnelle, couleur
// identique aux autres icônes du header ; people-outline sur fond teal
// #1D9E75 en vue partagée.
export function SwitcherEspacePartage() {
  const { estDansUnEspace, vueActive, setVueActive } = useEspacePartage();
  const { couleurs: C } = useTheme();
  const objStore = useObjectifs();

  if (!estDansUnEspace) return null;

  const enPartage = vueActive === "partage";

  // Point d'info affiché UNE SEULE FOIS, à la première bascule vers la vue
  // "Partagé" (jamais à chaque switch, quel que soit l'écran d'où on
  // bascule) — explique la fusion par nom avant que l'utilisateur ne soit
  // surpris de voir deux jauges séparées pour des catégories qu'il pensait
  // "les mêmes". Persisté par utilisateur, même convention que
  // cleVueActive (EspacePartageContext.tsx) — repris ici depuis l'ancien
  // passerEnVuePartagee d'index.tsx pour rester valable sur les 4 écrans.
  const basculer = async () => {
    if (enPartage) {
      setVueActive("personnel");
      return;
    }
    setVueActive("partage");
    const userId = objStore.userId;
    if (!userId) return;
    const cle = `vista_info_fusion_categories_vue_${userId}`;
    try {
      const dejaVu = await AsyncStorage.getItem(cle);
      if (!dejaVu) {
        Alert.alert(
          "Fusion des catégories",
          'Pour que vos catégories se fusionnent automatiquement, assurez-vous qu\'elles portent le même nom. Ex : si tu as "Courses" et ton/ta partenaire "Alimentation", elles apparaîtront séparément.',
        );
        await AsyncStorage.setItem(cle, "1");
      }
    } catch {
      // Best-effort : une erreur de lecture/écriture locale ne doit jamais
      // empêcher le switch de vue lui-même, juste faire réafficher le
      // message une fois de plus la prochaine fois.
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.bouton,
        { backgroundColor: enPartage ? "#1D9E75" : C.iconeBoutonFond },
      ]}
      onPress={basculer}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={
        enPartage ? "Revenir à la vue personnelle" : "Passer en vue partagée"
      }
    >
      <Ionicons
        name={enPartage ? "people-outline" : "person-outline"}
        size={18}
        color={enPartage ? "#FFFFFF" : C.iconeBouton}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bouton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
