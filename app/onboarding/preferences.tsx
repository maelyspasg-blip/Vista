import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { supabase } from "../../supabaseClient";
import { parseMontant, sanitizeMontantInput } from "../../utils/montant";
import { messageErreurAuth } from "../authErrors";

const PURPLE = "#8B6FE8";
const PURPLE_LIGHT = "#F0EEFF";
const MINT = "#5DC8A0";
const MINT_LIGHT = "#E8F8F2";
const PEACH = "#F4956A";
const PEACH_LIGHT = "#FFF0EA";

const INTERETS = [
  { nom: "Voyages", icone: "airplane-outline" as const },
  { nom: "Resto & Sorties", icone: "restaurant-outline" as const },
  { nom: "Sport", icone: "fitness-outline" as const },
  { nom: "Culture", icone: "color-palette-outline" as const },
  { nom: "Shopping", icone: "bag-outline" as const },
  { nom: "Musique", icone: "musical-notes-outline" as const },
  { nom: "Cinéma", icone: "film-outline" as const },
  { nom: "Nature", icone: "leaf-outline" as const },
  { nom: "Tech", icone: "laptop-outline" as const },
];

const COULEURS = [PURPLE, MINT, PEACH, "#C9B8F5", "#A8E6CF", "#FFD3B6"];
const BG_COULEURS = [
  PURPLE_LIGHT,
  MINT_LIGHT,
  PEACH_LIGHT,
  PURPLE_LIGHT,
  MINT_LIGHT,
  PEACH_LIGHT,
];

export default function Preferences() {
  const router = useRouter();
  const [prenom, setPrenom] = useState("");
  const [budget, setBudget] = useState("");
  const [interetsSelectionnes, setInteretsSelectionnes] = useState<string[]>(
    [],
  );
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState("");

  const enregistrerPreferences = async () => {
    if (!prenom || !budget || chargement) return;
    setErreur("");
    setChargement(true);

    const {
      data: { user },
      error: erreurUtilisateur,
    } = await supabase.auth.getUser();

    if (erreurUtilisateur || !user) {
      setChargement(false);
      setErreur("Session expirée. Reconnecte-toi.");
      return;
    }

    const { error } = await supabase
      .from("profils")
      .update({
        prenom: prenom.trim(),
        argent_disponible: parseMontant(budget) || 0,
      })
      .eq("user_id", user.id);

    setChargement(false);

    if (error) {
      setErreur(messageErreurAuth(error.message));
      return;
    }

    router.replace("/(tabs)");
  };

  const toggleInteret = (nom: string) => {
    if (interetsSelectionnes.includes(nom)) {
      setInteretsSelectionnes(interetsSelectionnes.filter((i) => i !== nom));
    } else if (interetsSelectionnes.length < 3) {
      setInteretsSelectionnes([...interetsSelectionnes, nom]);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.titre}>Personnalise Vista</Text>
          <Text style={styles.sousTitre}>3 infos et c'est parti</Text>
        </View>

        <Text style={styles.label}>Ton prénom</Text>
        <TextInput
          style={styles.input}
          placeholder="Comment tu t'appelles ?"
          placeholderTextColor="#CCC"
          value={prenom}
          onChangeText={setPrenom}
        />

        <Text style={styles.label}>Budget mensuel</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Ex : 1800"
            placeholderTextColor="#CCC"
            keyboardType="decimal-pad"
            value={budget}
            onChangeText={(text) => setBudget(sanitizeMontantInput(text))}
          />
          <View style={styles.euroBox}>
            <Text style={styles.euroTexte}>€</Text>
          </View>
        </View>

        <Text style={styles.label}>
          Centres d'intérêt <Text style={styles.labelSub}>(3 max)</Text>
        </Text>
        <View style={styles.interetsGrid}>
          {INTERETS.map((interet, i) => {
            const estSelectionne = interetsSelectionnes.includes(interet.nom);
            const couleur = COULEURS[i % COULEURS.length];
            const bg = BG_COULEURS[i % BG_COULEURS.length];
            return (
              <TouchableOpacity
                key={interet.nom}
                style={[
                  styles.interetChip,
                  { backgroundColor: estSelectionne ? couleur : bg },
                ]}
                onPress={() => toggleInteret(interet.nom)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={interet.icone}
                  size={16}
                  color={estSelectionne ? "#FFFFFF" : couleur}
                />
                <Text
                  style={[
                    styles.interetNom,
                    { color: estSelectionne ? "#FFFFFF" : couleur },
                  ]}
                >
                  {interet.nom}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {!!erreur && <Text style={styles.erreurTexte}>{erreur}</Text>}

        <TouchableOpacity
          style={[
            styles.btnPrincipal,
            { opacity: prenom && budget && !chargement ? 1 : 0.5 },
          ]}
          onPress={enregistrerPreferences}
          activeOpacity={0.8}
          disabled={!prenom || !budget || chargement}
        >
          {chargement ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.btnTexte}>Lancer Vista</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 28,
    paddingTop: 80,
  },
  header: {
    marginBottom: 32,
  },
  titre: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 8,
  },
  sousTitre: {
    fontSize: 15,
    color: "#888",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  labelSub: {
    fontWeight: "400",
    color: "#BBB",
  },
  input: {
    backgroundColor: "#F7F7F7",
    borderRadius: 14,
    padding: 16,
    fontSize: 15,
    color: "#1A1A1A",
    marginBottom: 20,
  },
  inputRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  euroBox: {
    backgroundColor: "#F7F7F7",
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    justifyContent: "center",
  },
  euroTexte: {
    fontSize: 16,
    color: "#888",
    fontWeight: "600",
  },
  interetsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 28,
  },
  interetChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  interetNom: {
    fontSize: 13,
    fontWeight: "500",
  },
  erreurTexte: {
    fontSize: 13,
    color: "#E24B4A",
    marginBottom: 12,
  },
  btnPrincipal: {
    backgroundColor: PURPLE,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  btnTexte: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
