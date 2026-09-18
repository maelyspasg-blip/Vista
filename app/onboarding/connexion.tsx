import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
  isAvailableAsync as appleSignInDisponible,
} from "expo-apple-authentication";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { connecterAvecApple } from "../appleSignIn";
import { messageErreurAuth } from "../authErrors";
import { ModaleDocumentLegal } from "../ModaleDocumentLegal";
import { Text } from "../Texte";
import { TextInput } from "../TexteInput";
import { BoutonPrincipal } from "../BoutonPrincipal";
import { useTheme } from "../ThemeContext";
import { styleModaleTablette, useEstTablette } from "../useTablette";

export default function Connexion() {
  const router = useRouter();
  const estTablette = useEstTablette();
  const insets = useSafeAreaInsets();
  // RÈGLE À NE JAMAIS CASSER — CORRECTIF DU 2026-09-17 (bug P043) : cet
  // écran ignorait totalement le thème sombre et le réglage "contraste
  // renforcé" (couleurs codées en dur) — même geste que
  // components/OnboardingEtape.tsx, seul écran d'onboarding déjà correct.
  // Impact concret avant ce correctif : un utilisateur en mode sombre qui
  // se déconnecte (profil.tsx -> router.replace("/onboarding/connexion"))
  // revoyait un écran blanc forcé.
  const { theme, couleurs: C } = useTheme();
  const fond = theme === "sombre" ? C.fond : C.fondPage;
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState("");
  const [documentLegalOuvert, setDocumentLegalOuvert] = useState<
    "confidentialite" | "cgu" | null
  >(null);
  // RÈGLE À NE JAMAIS CASSER — SIGN IN WITH APPLE (ajouté le 2026-09-18) :
  // `false` par défaut (jamais `true` avant confirmation) — le bouton
  // officiel Apple (AppleAuthenticationButton, design/texte imposés par
  // Apple, jamais un bouton custom) ne doit JAMAIS être visible tant que
  // isAvailableAsync() n'a pas répondu `true` (toujours `false` sur
  // Android, et peut l'être sur un vieil iOS/simulateur mal configuré) —
  // afficher un bouton Apple non fonctionnel violerait les Human
  // Interface Guidelines d'Apple autant qu'un bouton absent à tort.
  const [appleDisponible, setAppleDisponible] = useState(false);
  const [chargementApple, setChargementApple] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    appleSignInDisponible()
      .then(setAppleDisponible)
      .catch(() => setAppleDisponible(false));
  }, []);

  const seConnecterAvecApple = async () => {
    if (chargementApple) return;
    setErreur("");
    setChargementApple(true);
    const resultat = await connecterAvecApple();
    setChargementApple(false);

    if (!resultat.succes) {
      // RÈGLE : une annulation (l'utilisateur ferme la feuille Apple) ne
      // doit jamais afficher de message rouge, cf. RÈGLE dans
      // app/appleSignIn.ts — comportement normal, pas une erreur.
      if (!resultat.annule) setErreur(resultat.message ?? "");
      return;
    }
    router.replace("/(tabs)");
  };

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
        { backgroundColor: fond, paddingBottom: Math.max(24, insets.bottom + 12) },
      ]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* RÈGLE — iPad : colonne de contenu limitée à 560px, centrée — le
          conteneur (KeyboardAvoidingView) garde son padding/fond pleine
          largeur, seul ce wrapper interne est capé (même pattern que
          ModaleDocumentLegal.tsx). */}
      <View style={[{ flex: 1 }, styleModaleTablette(estTablette, 560)]}>
      <Image
        source={require("../../assets/images/vista-logo-mark.png")}
        style={styles.logo}
        resizeMode="contain"
      />
      <View style={styles.header}>
        <Text style={[styles.titre, { color: C.texte }]}>Content de te revoir</Text>
        <Text style={[styles.sousTitre, { color: C.texteMuted }]}>
          Connecte-toi à ton compte Vista
        </Text>
      </View>

      <View style={styles.form}>
        <Text style={[styles.label, { color: C.texte }]}>Email</Text>
        <TextInput
          style={[styles.input, { backgroundColor: C.carte, color: C.texte }]}
          placeholder="ton@email.com"
          placeholderTextColor={C.texteMuted}
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

        <Text style={[styles.label, { color: C.texte }]}>Mot de passe</Text>
        <TextInput
          style={[styles.input, { backgroundColor: C.carte, color: C.texte }]}
          placeholder="Ton mot de passe"
          placeholderTextColor={C.texteMuted}
          secureTextEntry
          value={motDePasse}
          onChangeText={(v) => {
            setMotDePasse(v);
            setErreur("");
          }}
          editable={!chargement}
        />

        {!!erreur && (
          <Text style={[styles.erreurTexte, { color: C.rougeText }]}>
            {erreur}
          </Text>
        )}

        <BoutonPrincipal
          style={[
            styles.btnPrincipal,
            {
              backgroundColor: C.purple,
              opacity: formulaireValide && !chargement ? 1 : 0.5,
            },
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

        {/* RÈGLE À NE JAMAIS CASSER — SIGN IN WITH APPLE (2026-09-18) :
            AppleAuthenticationButton est le composant OFFICIEL Apple (design
            et libellé imposés par les Human Interface Guidelines) — ne
            jamais le remplacer par un bouton custom même visuellement
            identique. Gated par appleDisponible (toujours false hors iOS,
            cf. useEffect plus haut) : jamais affiché s'il ne peut pas
            fonctionner. */}
        {appleDisponible && (
          <>
            <View style={styles.separateurConteneur}>
              <View style={[styles.separateurLigne, { backgroundColor: C.separateur }]} />
              <Text style={[styles.separateurTexte, { color: C.texteMuted }]}>ou</Text>
              <View style={[styles.separateurLigne, { backgroundColor: C.separateur }]} />
            </View>
            <AppleAuthenticationButton
              buttonType={AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={16}
              style={[styles.boutonApple, { opacity: chargementApple ? 0.6 : 1 }]}
              pointerEvents={chargementApple ? "none" : "auto"}
              onPress={seConnecterAvecApple}
            />
          </>
        )}
      </View>

      <View style={styles.espaceur} />

      <View style={styles.footer}>
        <Text style={[styles.footerTexte, { color: C.texteMuted }]}>
          Pas encore de compte ?{" "}
        </Text>
        <TouchableOpacity
          onPress={() => router.push("/onboarding/inscription")}
          activeOpacity={0.7}
        >
          <Text style={[styles.footerLien, { color: C.purple }]}>
            Créer un compte
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.essaiLien}
        onPress={() => router.push("/onboarding/invite")}
        activeOpacity={0.7}
      >
        <Text style={[styles.essaiTexte, { color: C.texteMuted }]}>
          Essayer sans compte
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.mentionsLegalesLien}
        onPress={ouvrirMentionsLegales}
        activeOpacity={0.7}
      >
        <Text style={[styles.mentionsLegalesTexte, { color: C.texteMuted }]}>
          Mentions légales
        </Text>
      </TouchableOpacity>
      </View>

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
    marginBottom: 10,
  },
  sousTitre: {
    fontSize: 15,
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
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  input: {
    borderRadius: 14,
    padding: 16,
    fontSize: 15,
    marginBottom: 16,
  },
  erreurTexte: {
    fontSize: 13,
    marginTop: -10,
    marginBottom: 16,
  },
  btnPrincipal: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  separateurConteneur: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 4,
  },
  separateurLigne: {
    flex: 1,
    height: 1,
  },
  separateurTexte: {
    fontSize: 13,
    marginHorizontal: 12,
  },
  boutonApple: {
    height: 50,
    marginTop: 16,
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
    textDecorationLine: "underline",
  },
  mentionsLegalesLien: {
    alignItems: "center",
    marginTop: 14,
  },
  mentionsLegalesTexte: {
    fontSize: 12,
    textDecorationLine: "underline",
  },
});
