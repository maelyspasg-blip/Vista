import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { messageErreurAuth } from "../authErrors";
import { supabase } from "../../supabaseClient";

const PURPLE = "#8B6FE8";
const PURPLE_LIGHT = "#F0EEFF";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Inscription() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState("");
  const [confirmationRequise, setConfirmationRequise] = useState(false);

  const emailValide = EMAIL_REGEX.test(email.trim());
  const formulaireValide = emailValide && motDePasse.length >= 8;

  const creerCompte = async () => {
    if (!formulaireValide || chargement) return;
    setErreur("");
    setChargement(true);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: motDePasse,
    });

    setChargement(false);

    if (error) {
      setErreur(messageErreurAuth(error.message));
      return;
    }

    if (data.session) {
      router.push("/onboarding/preferences");
      return;
    }

    setConfirmationRequise(true);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.header}>
        <Text style={styles.titre}>Créer mon compte</Text>
        <Text style={styles.sousTitre}>
          Rejoins Vista et prends le contrôle de tes finances
        </Text>
      </View>

      <View style={styles.form}>
        {confirmationRequise ? (
          <View style={styles.confirmationBox}>
            <Text style={styles.confirmationTitre}>Compte créé !</Text>
            <Text style={styles.confirmationTexte}>
              Vérifie ta boîte mail ({email.trim()}) et confirme ton adresse
              avant de te connecter.
            </Text>
            <TouchableOpacity
              style={styles.btnPrincipal}
              onPress={() => router.push("/onboarding/connexion")}
              activeOpacity={0.8}
            >
              <Text style={styles.btnTexte}>Aller à la connexion</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="ton@email.com"
              placeholderTextColor="#CCC"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                setErreur("");
              }}
              editable={!chargement}
            />

            <Text style={styles.label}>Mot de passe</Text>
            <TextInput
              style={styles.input}
              placeholder="Au moins 8 caractères"
              placeholderTextColor="#CCC"
              secureTextEntry
              value={motDePasse}
              onChangeText={(v) => {
                setMotDePasse(v);
                setErreur("");
              }}
              editable={!chargement}
            />

            {!!erreur && <Text style={styles.erreurTexte}>{erreur}</Text>}

            <TouchableOpacity
              style={[
                styles.btnPrincipal,
                { opacity: formulaireValide && !chargement ? 1 : 0.5 },
              ]}
              onPress={creerCompte}
              activeOpacity={0.8}
              disabled={!formulaireValide || chargement}
            >
              {chargement ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.btnTexte}>Continuer</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      {!confirmationRequise && (
        <View style={styles.footer}>
          <Text style={styles.footerTexte}>Déjà un compte ? </Text>
          <TouchableOpacity
            onPress={() => router.push("/onboarding/connexion")}
            activeOpacity={0.7}
          >
            <Text style={[styles.footerLien, { color: PURPLE }]}>
              Se connecter
            </Text>
          </TouchableOpacity>
        </View>
      )}
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
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  footerTexte: {
    fontSize: 14,
    color: "#888",
  },
  footerLien: {
    fontSize: 14,
    fontWeight: "600",
  },
  confirmationBox: {
    backgroundColor: PURPLE_LIGHT,
    borderRadius: 16,
    padding: 20,
  },
  confirmationTitre: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 8,
  },
  confirmationTexte: {
    fontSize: 14,
    color: "#4A4A4A",
    lineHeight: 20,
    marginBottom: 20,
  },
});
