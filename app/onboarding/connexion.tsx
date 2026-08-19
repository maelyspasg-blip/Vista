import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../supabaseClient";
import {
  CONDITIONS_GENERALES_UTILISATION,
  POLITIQUE_CONFIDENTIALITE,
} from "../../utils/documentsLegaux";
import { messageErreurAuth } from "../authErrors";
import { ModaleDocumentLegal } from "../ModaleDocumentLegal";
import { Text } from "../Texte";
import { TextInput } from "../TexteInput";
import { BoutonPrincipal } from "../BoutonPrincipal";

const PURPLE = "#8B6FE8";

export default function Connexion() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState("");
  const [documentLegalOuvert, setDocumentLegalOuvert] = useState<
    "confidentialite" | "cgu" | null
  >(null);

  const ouvrirMentionsLegales = () => {
    Alert.alert("Mentions légales", "Quel document veux-tu consulter ?", [
      {
        text: "Politique de confidentialité",
        onPress: () => setDocumentLegalOuvert("confidentialite"),
      },
      {
        text: "Conditions générales d'utilisation",
        onPress: () => setDocumentLegalOuvert("cgu"),
      },
      { text: "Annuler", style: "cancel" },
    ]);
  };

  const formulaireValide = !!email.trim() && motDePasse.length > 0;

  const seConnecter = async () => {
    if (!formulaireValide || chargement) return;
    setErreur("");
    setChargement(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: motDePasse,
    });

    setChargement(false);

    if (error) {
      setErreur(messageErreurAuth(error.message));
      return;
    }

    if (data.session) {
      router.replace("/(tabs)");
    }
  };

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        { paddingBottom: Math.max(24, insets.bottom + 12) },
      ]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Image
        source={require("../../assets/images/vista-logo-mark.png")}
        style={styles.logo}
        resizeMode="contain"
      />
      <View style={styles.header}>
        <Text style={styles.titre}>Content de te revoir</Text>
        <Text style={styles.sousTitre}>Connecte-toi à ton compte Vista</Text>
      </View>

      <View style={styles.form}>
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
          placeholder="Ton mot de passe"
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

        <BoutonPrincipal
          style={[
            styles.btnPrincipal,
            { opacity: formulaireValide && !chargement ? 1 : 0.5 },
          ]}
          onPress={seConnecter}
          activeOpacity={0.8}
          disabled={!formulaireValide || chargement}
        >
          {chargement ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.btnTexte}>Se connecter</Text>
          )}
        </BoutonPrincipal>
      </View>

      <View style={styles.espaceur} />

      <View style={styles.footer}>
        <Text style={styles.footerTexte}>Pas encore de compte ? </Text>
        <TouchableOpacity
          onPress={() => router.push("/onboarding/inscription")}
          activeOpacity={0.7}
        >
          <Text style={[styles.footerLien, { color: PURPLE }]}>
            Créer un compte
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.essaiLien}
        onPress={() => router.push("/onboarding/invite")}
        activeOpacity={0.7}
      >
        <Text style={styles.essaiTexte}>Essayer sans compte</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.mentionsLegalesLien}
        onPress={ouvrirMentionsLegales}
        activeOpacity={0.7}
      >
        <Text style={styles.mentionsLegalesTexte}>Mentions légales</Text>
      </TouchableOpacity>

      <ModaleDocumentLegal
        visible={documentLegalOuvert === "confidentialite"}
        onClose={() => setDocumentLegalOuvert(null)}
        titre="Politique de confidentialité"
        texte={POLITIQUE_CONFIDENTIALITE}
      />
      <ModaleDocumentLegal
        visible={documentLegalOuvert === "cgu"}
        onClose={() => setDocumentLegalOuvert(null)}
        titre="Conditions générales d'utilisation"
        texte={CONDITIONS_GENERALES_UTILISATION}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 28,
    paddingTop: 64,
  },
  logo: { width: 28, height: 28, marginBottom: 24 },
  header: {
    marginBottom: 28,
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
  form: {},
  espaceur: {
    flex: 1,
    maxHeight: 40,
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
    marginBottom: 16,
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
  essaiLien: {
    alignItems: "center",
    marginTop: 16,
  },
  essaiTexte: {
    fontSize: 14,
    fontWeight: "600",
    color: "#888",
    textDecorationLine: "underline",
  },
  mentionsLegalesLien: {
    alignItems: "center",
    marginTop: 14,
  },
  mentionsLegalesTexte: {
    fontSize: 12,
    color: "#AAAAAA",
    textDecorationLine: "underline",
  },
});
