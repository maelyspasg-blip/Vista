import { useState } from "react";
import {
  InputAccessoryView,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";

const PURPLE = "#8B6FE8";
const PURPLE_LIGHT = "#F0EEFF";
const MINT = "#5DC8A0";
const MINT_LIGHT = "#E8F8F2";
const PEACH = "#F4956A";
const PEACH_LIGHT = "#FFF0EA";
const ROUGE_LIGHT = "#FCEBEB";

type Enveloppe = {
  id: number;
  nom: string;
  depense: number;
  budget: number;
  couleur: string;
  recurrente: boolean;
  frequenceJours?: number;
};

const PALETTE_COULEURS = [
  "#5DC8A0",
  "#F4956A",
  "#8B6FE8",
  "#4A90D9",
  "#D9A04A",
  "#D94A8C",
  "#5BC0BE",
  "#9B5DE5",
  "#E84C1E",
  "#2EC4B6",
  "#FF6B6B",
  "#4ECDC4",
  "#FFD166",
  "#6A4C93",
  "#1982C4",
  "#C73E1D",
];

function bgClair(couleur: string) {
  return couleur + "22";
}

const ENVELOPPES_INIT: Enveloppe[] = [
  {
    id: 1,
    nom: "Courses",
    depense: 157,
    budget: 250,
    couleur: "#5DC8A0",
    recurrente: true,
    frequenceJours: 30,
  },
  {
    id: 2,
    nom: "Restaurants",
    depense: 66,
    budget: 200,
    couleur: "#F4956A",
    recurrente: false,
  },
  {
    id: 3,
    nom: "Transport",
    depense: 34,
    budget: 80,
    couleur: "#4A90D9",
    recurrente: true,
    frequenceJours: 30,
  },
  {
    id: 4,
    nom: "Loisirs",
    depense: 179,
    budget: 200,
    couleur: "#D94A8C",
    recurrente: false,
  },
  {
    id: 5,
    nom: "Abonnements",
    depense: 0,
    budget: 50,
    couleur: "#5BC0BE",
    recurrente: true,
    frequenceJours: 30,
  },
  {
    id: 6,
    nom: "Logement",
    depense: 0,
    budget: 850,
    couleur: "#9B5DE5",
    recurrente: true,
    frequenceJours: 30,
  },
];

function DonutChart({ data }: { data: { couleur: string; valeur: number }[] }) {
  const total = data.reduce((acc, d) => acc + d.valeur, 0);
  const taille = 140;
  const rayon = 55;
  const epaisseur = 20;
  const centre = taille / 2;
  const circonference = 2 * Math.PI * rayon;

  if (total === 0) {
    return (
      <View
        style={{
          width: taille,
          height: taille,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Svg width={taille} height={taille}>
          <Circle
            cx={centre}
            cy={centre}
            r={rayon}
            stroke="#EEEEEE"
            strokeWidth={epaisseur}
            fill="none"
          />
        </Svg>
        <Text style={{ position: "absolute", fontSize: 12, color: "#BBB" }}>
          Aucune dépense
        </Text>
      </View>
    );
  }

  let cumul = 0;
  const segments = data
    .filter((d) => d.valeur > 0)
    .map((d, i) => {
      const pct = d.valeur / total;
      const dashArray = pct * circonference;
      const dashOffset = circonference * (1 - cumul);
      cumul += pct;
      return { ...d, dashArray, dashOffset, key: i };
    });

  return (
    <View
      style={{
        width: taille,
        height: taille,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg width={taille} height={taille}>
        {segments.map((seg) => (
          <Circle
            key={seg.key}
            cx={centre}
            cy={centre}
            r={rayon}
            stroke={seg.couleur}
            strokeWidth={epaisseur}
            strokeDasharray={`${seg.dashArray} ${circonference - seg.dashArray}`}
            strokeDashoffset={seg.dashOffset}
            fill="none"
            strokeLinecap="butt"
            transform={`rotate(-90 ${centre} ${centre})`}
          />
        ))}
      </Svg>
      <View style={{ position: "absolute", alignItems: "center" }}>
        <Text style={{ fontSize: 18, fontWeight: "700", color: "#1A1A1A" }}>
          {total} €
        </Text>
        <Text style={{ fontSize: 10, color: "#999" }}>dépensé</Text>
      </View>
    </View>
  );
}

const ACCESSORY_ID = "numericDone";

export default function Dashboard() {
  const [enveloppes, setEnveloppes] = useState<Enveloppe[]>(ENVELOPPES_INIT);
  const [epargneVoulue, setEpargneVoulue] = useState("200");
  const [argentDisponible, setArgentDisponible] = useState("1800");
  const [editionDisponible, setEditionDisponible] = useState(false);
  const [disponibleTemp, setDisponibleTemp] = useState("1800");

  const [modalEnveloppeVisible, setModalEnveloppeVisible] = useState(false);
  const [enveloppeEnEdition, setEnveloppeEnEdition] =
    useState<Enveloppe | null>(null);
  const [nomTemp, setNomTemp] = useState("");
  const [montantTemp, setMontantTemp] = useState("");
  const [budgetTemp, setBudgetTemp] = useState("");
  const [couleurTemp, setCouleurTemp] = useState(PALETTE_COULEURS[0]);
  const [recurrenteTemp, setRecurrenteTemp] = useState(false);
  const [frequenceTemp, setFrequenceTemp] = useState("30");

  const [modalAjoutVisible, setModalAjoutVisible] = useState(false);
  const [nouveauNom, setNouveauNom] = useState("");
  const [nouveauBudget, setNouveauBudget] = useState("");
  const [nouvelleCouleur, setNouvelleCouleur] = useState(PALETTE_COULEURS[0]);
  const [estRecurrente, setEstRecurrente] = useState(false);
  const [nouvelleFrequence, setNouvelleFrequence] = useState("30");

  const totalDepense = enveloppes.reduce((acc, e) => acc + e.depense, 0);
  const disponibleNum = parseFloat(argentDisponible) || 0;
  const epargneNum = parseFloat(epargneVoulue) || 0;
  const resteAVivre = disponibleNum - totalDepense - epargneNum;
  const pctUtilise =
    disponibleNum > 0 ? Math.min((totalDepense / disponibleNum) * 100, 100) : 0;

  const ouvrirEditionEnveloppe = (env: Enveloppe) => {
    setEnveloppeEnEdition(env);
    setNomTemp(env.nom);
    setMontantTemp(String(env.depense));
    setBudgetTemp(String(env.budget));
    setCouleurTemp(env.couleur);
    setRecurrenteTemp(env.recurrente);
    setFrequenceTemp(String(env.frequenceJours || 30));
    setModalEnveloppeVisible(true);
  };

  const sauvegarderEnveloppe = () => {
    if (!enveloppeEnEdition) return;
    setEnveloppes(
      enveloppes.map((e) =>
        e.id === enveloppeEnEdition.id
          ? {
              ...e,
              nom: nomTemp || e.nom,
              depense: parseFloat(montantTemp) || 0,
              budget: parseFloat(budgetTemp) || 0,
              couleur: couleurTemp,
              recurrente: recurrenteTemp,
              frequenceJours: recurrenteTemp
                ? parseFloat(frequenceTemp) || 30
                : undefined,
            }
          : e,
      ),
    );
    setModalEnveloppeVisible(false);
  };

  const supprimerEnveloppe = () => {
    if (!enveloppeEnEdition) return;
    setEnveloppes(enveloppes.filter((e) => e.id !== enveloppeEnEdition.id));
    setModalEnveloppeVisible(false);
  };

  const ajouterEnveloppe = () => {
    if (!nouveauNom || !nouveauBudget) return;
    const nouvelle: Enveloppe = {
      id: Date.now(),
      nom: nouveauNom,
      depense: 0,
      budget: parseFloat(nouveauBudget),
      couleur: nouvelleCouleur,
      recurrente: estRecurrente,
      frequenceJours: estRecurrente
        ? parseFloat(nouvelleFrequence) || 30
        : undefined,
    };
    setEnveloppes([...enveloppes, nouvelle]);
    setNouveauNom("");
    setNouveauBudget("");
    setNouvelleCouleur(PALETTE_COULEURS[0]);
    setEstRecurrente(false);
    setNouvelleFrequence("30");
    setModalAjoutVisible(false);
  };

  const sauvegarderDisponible = () => {
    setArgentDisponible(disponibleTemp);
    setEditionDisponible(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.appName}>VISTA</Text>
            <Text style={styles.subtitle}>Juin 2026</Text>
          </View>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>M</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroLabel}>DÉPENSÉ CE MOIS</Text>
          <Text style={styles.heroAmount}>{totalDepense} €</Text>
          <View style={styles.barBg}>
            <View style={[styles.barFill, { width: `${pctUtilise}%` }]} />
          </View>
          <View style={styles.heroFooter}>
            <Text style={styles.heroSub}>
              {Math.round(pctUtilise)}% du disponible
            </Text>
            <Text style={styles.heroSub}>{resteAVivre} € libres</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: PURPLE_LIGHT }]}>
            <Text style={[styles.statLabel, { color: PURPLE }]}>
              RESTE À VIVRE
            </Text>
            <Text style={[styles.statValue, { color: "#5A3DC4" }]}>
              {resteAVivre} €
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: PEACH_LIGHT }]}
            activeOpacity={0.7}
            onPress={() => {
              setDisponibleTemp(argentDisponible);
              setEditionDisponible(true);
            }}
          >
            <View style={styles.statLabelRow}>
              <Text style={[styles.statLabel, { color: PEACH }]}>
                DISPONIBLE
              </Text>
              <Text style={styles.miniCrayon}>✎</Text>
            </View>
            {editionDisponible ? (
              <View style={styles.editDisponibleRow}>
                <TextInput
                  style={styles.editDisponibleInput}
                  keyboardType="numeric"
                  value={disponibleTemp}
                  onChangeText={setDisponibleTemp}
                  onSubmitEditing={sauvegarderDisponible}
                  returnKeyType="done"
                  autoFocus
                  inputAccessoryViewID={ACCESSORY_ID}
                />
                <TouchableOpacity onPress={sauvegarderDisponible}>
                  <Text style={styles.validerTexte}>OK</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={[styles.statValue, { color: "#993C1D" }]}>
                {disponibleNum} €
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.epargneCard}>
          <View style={styles.epargneIconBox}>
            <Text style={styles.epargneIcon}>💰</Text>
          </View>
          <View style={styles.epargneTexte}>
            <Text style={styles.epargneLabel}>Mis de côté ce mois</Text>
            <Text style={styles.epargneSub}>Objectif d'épargne mensuelle</Text>
          </View>
          <View style={styles.epargneInputBox}>
            <TextInput
              style={styles.epargneInput}
              keyboardType="numeric"
              value={epargneVoulue}
              onChangeText={setEpargneVoulue}
              returnKeyType="done"
              inputAccessoryViewID={ACCESSORY_ID}
            />
            <Text style={styles.epargneEuro}>€</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ENVELOPPES</Text>
          <TouchableOpacity
            style={styles.btnAjoutEnveloppe}
            onPress={() => setModalAjoutVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.btnAjoutTexte}>+ Ajouter</Text>
          </TouchableOpacity>
        </View>

        {enveloppes.map((env) => {
          const pct = Math.min((env.depense / env.budget) * 100, 100);
          return (
            <TouchableOpacity
              key={env.id}
              style={[
                styles.envCard,
                { backgroundColor: bgClair(env.couleur) },
              ]}
              activeOpacity={0.7}
              onPress={() => ouvrirEditionEnveloppe(env)}
            >
              <View style={styles.envRow}>
                <View style={styles.envNomRow}>
                  <Text style={styles.envNom}>{env.nom}</Text>
                  {env.recurrente && (
                    <View style={styles.recurrenceBadge}>
                      <Text style={styles.recurrenceTexte}>↻</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.envMontant, { color: env.couleur }]}>
                  {env.depense} € / {env.budget} €
                </Text>
              </View>
              <View style={styles.envBarBg}>
                <View
                  style={[
                    styles.envBarFill,
                    { width: `${pct}%`, backgroundColor: env.couleur },
                  ]}
                />
              </View>
            </TouchableOpacity>
          );
        })}

        <View style={styles.graphCard}>
          <Text style={styles.cardTitre}>Vue d'ensemble des dépenses</Text>
          <View style={styles.graphContent}>
            <DonutChart
              data={enveloppes.map((e) => ({
                couleur: e.couleur,
                valeur: e.depense,
              }))}
            />
            <View style={styles.graphLegende}>
              {enveloppes
                .filter((e) => e.depense > 0)
                .map((e) => (
                  <View key={e.id} style={styles.legendeItem}>
                    <View
                      style={[
                        styles.legendeDot,
                        { backgroundColor: e.couleur },
                      ]}
                    />
                    <Text style={styles.legendeNom} numberOfLines={1}>
                      {e.nom}
                    </Text>
                    <Text style={styles.legendePct}>
                      {totalDepense > 0
                        ? Math.round((e.depense / totalDepense) * 100)
                        : 0}
                      %
                    </Text>
                  </View>
                ))}
            </View>
          </View>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>

      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={ACCESSORY_ID}>
          <View style={styles.accessoryBar}>
            <Text style={styles.accessoryTexte}>Terminé</Text>
          </View>
        </InputAccessoryView>
      )}

      {/* Modal édition enveloppe */}
      <Modal
        visible={modalEnveloppeVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalEnveloppeVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalOverlayTouch}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitre}>Modifier l'enveloppe</Text>
                <TouchableOpacity
                  onPress={supprimerEnveloppe}
                  activeOpacity={0.6}
                  style={styles.btnCorbeille}
                >
                  <Text style={styles.corbeilleIcon}>🗑</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.modalLabel}>Nom</Text>
                <TextInput
                  style={styles.input}
                  value={nomTemp}
                  onChangeText={setNomTemp}
                  returnKeyType="done"
                />

                <Text style={styles.modalLabel}>Montant dépensé</Text>
                <View style={styles.modalInputRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    keyboardType="numeric"
                    value={montantTemp}
                    onChangeText={setMontantTemp}
                    returnKeyType="done"
                    inputAccessoryViewID={ACCESSORY_ID}
                  />
                  <Text style={styles.modalEuro}>€</Text>
                </View>

                <Text style={styles.modalLabel}>Budget de l'enveloppe</Text>
                <View style={styles.modalInputRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    keyboardType="numeric"
                    value={budgetTemp}
                    onChangeText={setBudgetTemp}
                    returnKeyType="done"
                    inputAccessoryViewID={ACCESSORY_ID}
                  />
                  <Text style={styles.modalEuro}>€</Text>
                </View>

                <Text style={styles.modalLabel}>Couleur</Text>
                <View style={styles.paletteGrid}>
                  {PALETTE_COULEURS.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.swatch,
                        { backgroundColor: c },
                        couleurTemp === c && styles.swatchSelectionne,
                      ]}
                      onPress={() => setCouleurTemp(c)}
                      activeOpacity={0.7}
                    />
                  ))}
                </View>

                <View style={styles.switchRow}>
                  <View>
                    <Text style={styles.switchLabel}>Récurrente</Text>
                    <Text style={styles.switchSub}>
                      Se répète automatiquement
                    </Text>
                  </View>
                  <Switch
                    value={recurrenteTemp}
                    onValueChange={setRecurrenteTemp}
                    trackColor={{ false: "#EEE", true: PURPLE_LIGHT }}
                    thumbColor={recurrenteTemp ? PURPLE : "#FFF"}
                  />
                </View>

                {recurrenteTemp && (
                  <>
                    <Text style={styles.modalLabel}>Fréquence (en jours)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={frequenceTemp}
                      onChangeText={setFrequenceTemp}
                      returnKeyType="done"
                      inputAccessoryViewID={ACCESSORY_ID}
                    />
                  </>
                )}

                <TouchableOpacity
                  style={styles.btnAjouter}
                  onPress={sauvegarderEnveloppe}
                  activeOpacity={0.7}
                >
                  <Text style={styles.btnAjouterTexte}>Enregistrer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.btnAnnuler}
                  onPress={() => setModalEnveloppeVisible(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.btnAnnulerTexte}>Annuler</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal ajout enveloppe */}
      <Modal
        visible={modalAjoutVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalAjoutVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalOverlayTouch}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitre}>Nouvelle enveloppe</Text>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.modalLabel}>Nom</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex : Vacances, Sport..."
                  placeholderTextColor="#CCC"
                  value={nouveauNom}
                  onChangeText={setNouveauNom}
                  returnKeyType="done"
                />

                <Text style={styles.modalLabel}>Budget mensuel</Text>
                <View style={styles.modalInputRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="0"
                    placeholderTextColor="#CCC"
                    keyboardType="numeric"
                    value={nouveauBudget}
                    onChangeText={setNouveauBudget}
                    returnKeyType="done"
                    inputAccessoryViewID={ACCESSORY_ID}
                  />
                  <Text style={styles.modalEuro}>€</Text>
                </View>

                <Text style={styles.modalLabel}>Couleur</Text>
                <View style={styles.paletteGrid}>
                  {PALETTE_COULEURS.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.swatch,
                        { backgroundColor: c },
                        nouvelleCouleur === c && styles.swatchSelectionne,
                      ]}
                      onPress={() => setNouvelleCouleur(c)}
                      activeOpacity={0.7}
                    />
                  ))}
                </View>

                <View style={styles.switchRow}>
                  <View>
                    <Text style={styles.switchLabel}>Récurrente</Text>
                    <Text style={styles.switchSub}>
                      Se répète automatiquement
                    </Text>
                  </View>
                  <Switch
                    value={estRecurrente}
                    onValueChange={setEstRecurrente}
                    trackColor={{ false: "#EEE", true: PURPLE_LIGHT }}
                    thumbColor={estRecurrente ? PURPLE : "#FFF"}
                  />
                </View>

                {estRecurrente && (
                  <>
                    <Text style={styles.modalLabel}>Fréquence (en jours)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Ex : 30 pour mensuel, 7 pour hebdo"
                      placeholderTextColor="#CCC"
                      keyboardType="numeric"
                      value={nouvelleFrequence}
                      onChangeText={setNouvelleFrequence}
                      returnKeyType="done"
                      inputAccessoryViewID={ACCESSORY_ID}
                    />
                  </>
                )}

                <TouchableOpacity
                  style={styles.btnAjouter}
                  onPress={ajouterEnveloppe}
                  activeOpacity={0.7}
                >
                  <Text style={styles.btnAjouterTexte}>Créer l'enveloppe</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.btnAnnuler}
                  onPress={() => setModalAjoutVisible(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.btnAnnulerTexte}>Annuler</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF", paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 60,
    marginBottom: 24,
  },
  appName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1A1A1A",
    letterSpacing: 2,
  },
  subtitle: { fontSize: 13, color: "#999", marginTop: 2 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#FFFFFF", fontWeight: "700", fontSize: 14 },
  hero: {
    backgroundColor: PURPLE,
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
  },
  heroLabel: {
    fontSize: 10,
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 1,
    marginBottom: 8,
  },
  heroAmount: {
    fontSize: 48,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 20,
  },
  barBg: {
    height: 4,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 2,
    marginBottom: 10,
  },
  barFill: { height: "100%", backgroundColor: "#FFFFFF", borderRadius: 2 },
  heroFooter: { flexDirection: "row", justifyContent: "space-between" },
  heroSub: { fontSize: 12, color: "rgba(255,255,255,0.6)" },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 64,
  },
  statLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  statLabel: { fontSize: 9, fontWeight: "600", letterSpacing: 0.5 },
  miniCrayon: { fontSize: 10, color: PEACH },
  statValue: { fontSize: 16, fontWeight: "600" },
  editDisponibleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  editDisponibleInput: {
    fontSize: 16,
    fontWeight: "600",
    color: "#993C1D",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 60,
    textAlign: "center",
  },
  validerTexte: { fontSize: 13, fontWeight: "700", color: PEACH },
  epargneCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FAFAFA",
    borderRadius: 16,
    padding: 14,
    marginBottom: 24,
    borderWidth: 0.5,
    borderColor: "#F0EEF8",
    gap: 12,
  },
  epargneIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: MINT_LIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  epargneIcon: { fontSize: 18 },
  epargneTexte: { flex: 1 },
  epargneLabel: { fontSize: 13, fontWeight: "600", color: "#1A1A1A" },
  epargneSub: { fontSize: 11, color: "#999", marginTop: 1 },
  epargneInputBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 10,
    borderWidth: 0.5,
    borderColor: "#E0DDD6",
  },
  epargneInput: {
    fontSize: 15,
    fontWeight: "600",
    color: MINT,
    minWidth: 44,
    textAlign: "right",
    paddingVertical: 8,
  },
  epargneEuro: { fontSize: 15, fontWeight: "600", color: MINT, marginLeft: 2 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#999",
    letterSpacing: 1,
  },
  btnAjoutEnveloppe: {
    backgroundColor: PURPLE_LIGHT,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  btnAjoutTexte: { fontSize: 12, fontWeight: "600", color: PURPLE },
  envCard: { borderRadius: 14, padding: 16, marginBottom: 8 },
  envRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  envNomRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  envNom: { fontSize: 15, fontWeight: "600", color: "#1A1A1A" },
  recurrenceBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  recurrenceTexte: { fontSize: 10, color: "#888" },
  envMontant: { fontSize: 13, fontWeight: "600" },
  envBarBg: {
    height: 5,
    backgroundColor: "rgba(0,0,0,0.08)",
    borderRadius: 3,
    overflow: "hidden",
  },
  envBarFill: { height: "100%", borderRadius: 3 },
  graphCard: {
    backgroundColor: "#FAFAFA",
    borderRadius: 20,
    padding: 18,
    marginTop: 16,
    borderWidth: 0.5,
    borderColor: "#F0EEF8",
  },
  cardTitre: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 16,
  },
  graphContent: { flexDirection: "row", alignItems: "center" },
  graphLegende: { flex: 1, paddingLeft: 16, gap: 10 },
  legendeItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendeDot: { width: 9, height: 9, borderRadius: 5 },
  legendeNom: { flex: 1, fontSize: 13, color: "#1A1A1A" },
  legendePct: { fontSize: 13, color: "#999", fontWeight: "500" },
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalOverlayTouch: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 30,
    maxHeight: "88%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitre: { fontSize: 19, fontWeight: "700", color: "#1A1A1A" },
  btnCorbeille: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ROUGE_LIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  corbeilleIcon: { fontSize: 14 },
  modalLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#999",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  modalInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalEuro: { fontSize: 16, color: "#999", marginBottom: 12 },
  input: {
    backgroundColor: "#F7F7F7",
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    color: "#1A1A1A",
    marginBottom: 12,
  },
  paletteGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  swatch: { width: 34, height: 34, borderRadius: 17 },
  swatchSelectionne: { borderWidth: 3, borderColor: "#1A1A1A" },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    marginTop: 8,
  },
  switchLabel: { fontSize: 15, fontWeight: "500", color: "#1A1A1A" },
  switchSub: { fontSize: 12, color: "#999", marginTop: 2 },
  btnAjouter: {
    backgroundColor: PURPLE,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  btnAjouterTexte: { fontSize: 16, color: "#FFFFFF", fontWeight: "600" },
  btnAnnuler: {
    padding: 14,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 6,
  },
  btnAnnulerTexte: { fontSize: 14, color: "#999", fontWeight: "500" },
  accessoryBar: {
    backgroundColor: "#F7F7F7",
    padding: 10,
    alignItems: "flex-end",
    borderTopWidth: 0.5,
    borderTopColor: "#DDD",
  },
  accessoryTexte: {
    color: PURPLE,
    fontSize: 16,
    fontWeight: "600",
    paddingHorizontal: 10,
  },
});
