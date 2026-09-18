import type { ReactNode } from "react";
import { Linking, Modal, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccessibilite } from "./AccessibiliteContext";
import { BoutonPrincipal } from "./BoutonPrincipal";
import { useTheme } from "./ThemeContext";
import { Text } from "./Texte";
import { useEstTablette } from "./useTablette";

// RÈGLE : regex email volontairement simple (pas de validation RFC 5322
// complète) — sert uniquement à repérer la SEULE adresse déjà présente dans
// utils/documentsLegaux.ts (vistabudgetapp@gmail.com, 5 occurrences) pour
// la rendre cliquable dans le texte, jamais à valider une saisie
// utilisateur. `RegExp` déclarée une seule fois au niveau module (jamais
// recréée à chaque rendu) et volontairement PARTAGÉE entre tous les appels
// de `linkifierEmails` ci-dessous — sûr malgré le flag `g` (qui, avec une
// boucle manuelle `.exec()`/`.test()`, muterait `lastIndex` et ferait
// fuiter un état entre deux appels) précisément PARCE QUE
// `String.prototype.matchAll` ne mute jamais `lastIndex` de la regex
// source qu'on lui passe (spec ECMA-262 : matchAll clone la regex en
// interne) — vérifié en revue par simulation directe, plusieurs textes
// différents passés successivement à la même instance sans aucune fuite.
const MOTIF_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// RÈGLE À NE JAMAIS CASSER — SEULE L'ADRESSE EMAIL DEVIENT TAPABLE, JAMAIS
// LE RESTE DU TEXTE : un <Text> RN peut imbriquer des <Text onPress=.../>
// enfants sans perdre le flux normal du texte autour (contrairement à
// remplacer tout le bloc par un seul élément cliquable) — c'est ce pattern
// qui est utilisé ici, jamais un Text unique enveloppé dans un
// TouchableOpacity qui rendrait TOUT le corps du document tapable.
function linkifierEmails(texte: string, couleurLien: string) {
  const segments: ReactNode[] = [];
  let dernierIndex = 0;
  for (const correspondance of texte.matchAll(MOTIF_EMAIL)) {
    const email = correspondance[0];
    const index = correspondance.index ?? 0;
    if (index > dernierIndex) {
      segments.push(texte.slice(dernierIndex, index));
    }
    segments.push(
      <Text
        key={`email-${index}`}
        style={{ color: couleurLien, textDecorationLine: "underline" }}
        onPress={() => Linking.openURL(`mailto:${email}`)}
        suppressHighlighting={false}
      >
        {email}
      </Text>,
    );
    dernierIndex = index + email.length;
  }
  if (dernierIndex < texte.length) {
    segments.push(texte.slice(dernierIndex));
  }
  return segments;
}

// Modale plein écran réutilisée pour la politique de confidentialité et les
// CGU, accessible depuis Profil et depuis l'écran de connexion (avant même
// d'être authentifié) — d'où un composant partagé plutôt que dupliqué dans
// les deux écrans.
export function ModaleDocumentLegal({
  visible,
  onClose,
  titre,
  texte,
}: {
  visible: boolean;
  onClose: () => void;
  titre: string;
  texte: string;
}) {
  const { couleurs: C } = useTheme();
  const { reduireAnimations } = useAccessibilite();
  const insets = useSafeAreaInsets();
  const estTablette = useEstTablette();

  return (
    <Modal
      visible={visible}
      animationType={reduireAnimations ? "none" : "slide"}
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.container,
          { backgroundColor: C.fondPage, paddingTop: insets.top + 20 },
        ]}
      >
        {/* RÈGLE — iPad : colonne de lecture limitée à 700px, centrée —
            contrairement aux modales bottom-sheet (styleModaleTablette),
            ce conteneur reste `flex:1` (fond plein écran, presentationStyle
            "fullScreen") ; seul ce wrapper interne (titre+texte+bouton) est
            capé, pour ne jamais avoir un mur de texte lu bord à bord sur un
            iPad. */}
        <View
          style={[
            styles.colonneLecture,
            estTablette && styles.colonneLectureTablette,
          ]}
        >
          <Text style={[styles.titre, { color: C.texte }]}>{titre}</Text>
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={[styles.corps, { color: C.texte }]}>
              {linkifierEmails(texte, C.purple)}
            </Text>
            <View style={{ height: 20 }} />
          </ScrollView>
          <BoutonPrincipal
            style={[
              styles.btnFermer,
              {
                backgroundColor: C.purple,
                marginBottom: Math.max(20, insets.bottom + 12),
              },
            ]}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Text style={styles.btnFermerTexte}>Fermer</Text>
          </BoutonPrincipal>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  colonneLecture: { flex: 1 },
  colonneLectureTablette: {
    width: "100%",
    maxWidth: 700,
    alignSelf: "center",
  },
  titre: { fontSize: 22, fontWeight: "700", marginBottom: 16 },
  scroll: { flex: 1 },
  corps: { fontSize: 14, lineHeight: 22 },
  btnFermer: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 16,
  },
  btnFermerTexte: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
});
