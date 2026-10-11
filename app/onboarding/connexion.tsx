import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
  isAvailableAsync as appleSignInDisponible,
} from "expo-apple-authentication";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    TouchableWithoutFeedback,
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
import { connecterAvecGoogle } from "../googleSignIn";
import { ModaleDocumentLegal } from "../ModaleDocumentLegal";
import { Text } from "../Texte";
import { TextInput } from "../TexteInput";
import { BoutonPrincipal } from "../BoutonPrincipal";
import { useTheme } from "../ThemeContext";
import { styleModaleTablette, useEstTablette } from "../useTablette";
import { remplacerSansHistorique } from "../../utils/navigationRacine";
import { BoutonGoogle } from "../BoutonGoogle";
import { RATIO_LOGO_AVEC_TEXTE, sourceLogoAvecTexte } from "../../utils/logoVista";

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

  const champMotDePasseRef = useRef<React.ElementRef<typeof TextInput>>(null);

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
    remplacerSansHistorique(router, "/(tabs)");
  };

  // RÈGLE À NE JAMAIS CASSER — GOOGLE SIGN-IN (ajouté le 2026-09-18) : iOS
  // uniquement pour l'instant, cf. RÈGLE dans app/googleSignIn.ts (aucun
  // Client ID Android/Web fourni) — pas de vérification de disponibilité
  // asynchrone nécessaire ici contrairement à Apple (pas de contrainte de
  // version iOS pour Google Sign-In), `Platform.OS === "ios"` suffit.
  const [chargementGoogle, setChargementGoogle] = useState(false);

  const seConnecterAvecGoogle = async () => {
    if (chargementGoogle) return;
    setErreur("");
    setChargementGoogle(true);
    const resultat = await connecterAvecGoogle();
    setChargementGoogle(false);

    if (!resultat.succes) {
      // RÈGLE : annulation silencieuse, cf. RÈGLE dans app/googleSignIn.ts.
      if (!resultat.annule) setErreur(resultat.message ?? "");
      return;
    }
    remplacerSansHistorique(router, "/(tabs)");
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
      remplacerSansHistorique(router, "/(tabs)");
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
      {/* RÈGLE (bug corrigé le 2026-10-10 : "le clavier bloque le bas de la
          page") — contenu DÉFILANT : clavier ouvert, le KeyboardAvoidingView
          réduit la hauteur disponible et le bas (bouton "Se connecter",
          liens) sortait de l'écran sans pouvoir défiler. Un tap hors d'un
          champ (keyboardShouldPersistTaps="handled" + TouchableWithoutFeedback)
          ou un glissement (keyboardDismissMode) ferme le clavier. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        showsVerticalScrollIndicator={false}
      >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={[{ flex: 1 }, styleModaleTablette(estTablette, 560)]}>
      <Image
        source={sourceLogoAvecTexte(theme)}
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
          returnKeyType="next"
          onSubmitEditing={() => champMotDePasseRef.current?.focus()}
          blurOnSubmit={false}
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
          ref={champMotDePasseRef}
          placeholder="Ton mot de passe"
          placeholderTextColor={C.texteMuted}
          secureTextEntry
          returnKeyType="go"
          onSubmitEditing={() => {
            Keyboard.dismiss();
            if (formulaireValide && !chargement) seConnecter();
          }}
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

        {/* RÈGLE À NE JAMAIS CASSER — CONNEXION ALTERNATIVE (Apple/Google,
            2026-09-18, révisée le 2026-10-11) : Apple reste le composant
            OFFICIEL (AppleAuthenticationButton, imposé par Apple) ; Google
            est un bouton sur mesure conforme à la charte Google
            (app/BoutonGoogle.tsx, décision de Maëlys), au même gabarit que
            le bouton Apple (hauteur 50, rayon 16, pleine largeur) — jamais
            un autre bouton custom. Séparateur "ou" partagé, affiché dès
            qu'AU MOINS un des deux boutons peut apparaître — jamais
            affiché seul sans bouton en dessous. */}
        {(appleDisponible || Platform.OS === "ios") && (
          <>
            <View style={styles.separateurConteneur}>
              <View style={[styles.separateurLigne, { backgroundColor: C.separateur }]} />
              <Text style={[styles.separateurTexte, { color: C.texteMuted }]}>ou</Text>
              <View style={[styles.separateurLigne, { backgroundColor: C.separateur }]} />
            </View>
            {/* Gated par appleDisponible (toujours false hors iOS, cf.
                useEffect plus haut) : jamais affiché s'il ne peut pas
                fonctionner. */}
            {appleDisponible && (
              <AppleAuthenticationButton
                buttonType={AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={16}
                style={[styles.boutonApple, { opacity: chargementApple ? 0.6 : 1 }]}
                pointerEvents={chargementApple ? "none" : "auto"}
                onPress={seConnecterAvecApple}
              />
            )}
            {/* Gated par Platform.OS === "ios" — cf. RÈGLE dans
                app/googleSignIn.ts (aucun Client ID Android fourni). */}
            {Platform.OS === "ios" && (
              <BoutonGoogle
                libelle="Continuer avec Google"
                onPress={seConnecterAvecGoogle}
                chargement={chargementGoogle}
              />
            )}
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
      </TouchableWithoutFeedback>
      </ScrollView>

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
  logo: { width: 56 * RATIO_LOGO_AVEC_TEXTE, height: 56, marginBottom: 24 },
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
