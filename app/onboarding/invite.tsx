import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    View,
} from "react-native";
import { supabase } from "../../supabaseClient";
import { messageErreurAuth } from "../authErrors";
import { Text } from "../Texte";
import { BoutonPrincipal } from "../BoutonPrincipal";
import { useTheme } from "../ThemeContext";
import { styleModaleTablette, useEstTablette } from "../useTablette";

// RÈGLE À NE JAMAIS CASSER — PAS DE SAISIE DE PRÉNOM POUR UN INVITÉ :
// décision explicite de l'utilisateur — un compte test/démo n'a pas besoin
// d'être personnalisé, "Invité" suffit. Ne jamais réintroduire un champ
// prénom ici ; si un vrai prénom est un jour souhaité pour un invité, ce
// serait un choix ultérieur distinct de cet écran (ex: dans profil.tsx),
// jamais une étape obligatoire à la création.
const PRENOM_INVITE = "Invité";

export default function Invite() {
  const router = useRouter();
  const estTablette = useEstTablette();
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState("");
  // RÈGLE À NE JAMAIS CASSER — CORRECTIF DU 2026-09-17 (bug P043) : cet
  // écran ignorait totalement le thème sombre et le réglage "contraste
  // renforcé" (couleurs codées en dur) — même geste que
  // components/OnboardingEtape.tsx, seul écran d'onboarding déjà correct.
  const { theme, couleurs: C } = useTheme();
  const fond = theme === "sombre" ? C.fond : C.fondPage;

  const commencerEssai = async () => {
    if (chargement) return;
    setErreur("");
    setChargement(true);

    const { data, error } = await supabase.auth.signInAnonymously();

    if (error) {
      setChargement(false);
      setErreur(messageErreurAuth(error.message));
      return;
    }

    if (data.user) {
      const { error: erreurProfil } = await supabase
        .from("profils")
        .update({ prenom: PRENOM_INVITE })
        .eq("user_id", data.user.id);

      if (erreurProfil) {
        console.error("Supabase update prenom (invité) a échoué :", erreurProfil);
      }
    }

    setChargement(false);
    router.replace("/(tabs)");
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: fond }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* RÈGLE — iPad : colonne de contenu limitée à 560px, centrée — même
          pattern que app/onboarding/connexion.tsx. */}
      <View style={[{ flex: 1 }, styleModaleTablette(estTablette, 560)]}>
      <View style={styles.header}>
        <Text style={[styles.titre, { color: C.texte }]}>Essayer Vista</Text>
        <Text style={[styles.sousTitre, { color: C.texteMuted }]}>
          Découvre l'app avec des données de démonstration, sans créer de
          compte. Ton essai dure 7 jours.
        </Text>
      </View>

      <View style={[styles.infoBox, { backgroundColor: C.purpleLight }]}>
        <Text style={[styles.infoTexte, { color: C.purpleText }]}>
          Tu explores Vista en mode démo. Si tu crées un vrai compte, tu
          pourras personnaliser ton espace dès le départ grâce à notre
          questionnaire de configuration.
        </Text>
      </View>

      <View style={styles.form}>
        {!!erreur && (
          <Text style={[styles.erreurTexte, { color: C.rougeText }]}>
            {erreur}
          </Text>
        )}

        <BoutonPrincipal
          style={[
            styles.btnPrincipal,
            { backgroundColor: C.purple, opacity: chargement ? 0.5 : 1 },
          ]}
          onPress={commencerEssai}
          activeOpacity={0.8}
          disabled={chargement}
        >
          {chargement ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.btnTexte}>Commencer</Text>
          )}
        </BoutonPrincipal>
      </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 80,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  infoBox: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 32,
  },
  infoTexte: {
    fontSize: 13,
    lineHeight: 19,
  },
  titre: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 10,
  },
  sousTitre: {
    fontSize: 15,
    lineHeight: 22,
  },
  form: {
    flex: 1,
  },
  erreurTexte: {
    fontSize: 13,
    marginBottom: 16,
  },
  btnPrincipal: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  btnTexte: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
