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
import { TextInput } from "../TexteInput";
import { BoutonPrincipal } from "../BoutonPrincipal";

const PURPLE = "#8B6FE8";

export default function Invite() {
  const router = useRouter();
  const [prenom, setPrenom] = useState("");
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState("");

  const formulaireValide = !!prenom.trim();

  const commencerEssai = async () => {
    if (!formulaireValide || chargement) return;
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
        .update({ prenom: prenom.trim() })
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
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.header}>
        <Text style={styles.titre}>Essayer Vista</Text>
        <Text style={styles.sousTitre}>
          Découvre l'app avec des données de démonstration, sans créer de
          compte. Ton essai dure 7 jours.
        </Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Prénom</Text>
        <TextInput
          style={styles.input}
          placeholder="Ton prénom"
          placeholderTextColor="#CCC"
          autoCapitalize="words"
          value={prenom}
          onChangeText={(v) => {
            setPrenom(v);
            setErreur("");
          }}
          editable={!chargement}
        />

        {!!erreur && <Text style={styles.erreurTexte}>{erreur}</Text>}

        <BoutonPrincipal
          style={[
            styles.btnPrincipal,
            { opacity: formulaireValide && !chargement ? 1 : 0.5 },
          ]}
          onPress={commencerEssai}
          activeOpacity={0.8}
          disabled={!formulaireValide || chargement}
        >
          {chargement ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.btnTexte}>Commencer</Text>
          )}
        </BoutonPrincipal>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 28,
    paddingTop: 80,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 40,
  },
  titre: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 10,
  },
  sousTitre: {
    fontSize: 15,
    color: "#888",
    lineHeight: 22,
  },
  form: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  input: {
    backgroundColor: "#F7F7F7",
    borderRadius: 14,
    padding: 16,
    fontSize: 15,
    color: "#1A1A1A",
    marginBottom: 20,
  },
  erreurTexte: {
    fontSize: 13,
    color: "#E24B4A",
    marginTop: -10,
    marginBottom: 16,
  },
  btnPrincipal: {
    backgroundColor: PURPLE,
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
