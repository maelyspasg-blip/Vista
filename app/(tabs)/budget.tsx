import { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const PURPLE = "#8B6FE8";
const PURPLE_LIGHT = "#F0EEFF";
const MINT = "#5DC8A0";
const MINT_LIGHT = "#E8F8F2";
const PEACH = "#F4956A";
const PEACH_LIGHT = "#FFF0EA";

const CATEGORIES = [
  { nom: "Courses", couleur: MINT, bg: MINT_LIGHT },
  { nom: "Restaurants", couleur: PEACH, bg: PEACH_LIGHT },
  { nom: "Transport", couleur: PURPLE, bg: PURPLE_LIGHT },
  { nom: "Loisirs", couleur: PEACH, bg: PEACH_LIGHT },
  { nom: "Abonnements", couleur: MINT, bg: MINT_LIGHT },
  { nom: "Logement", couleur: PURPLE, bg: PURPLE_LIGHT },
  { nom: "Autre", couleur: "#999", bg: "#F5F5F5" },
];

const TYPES = ["Courante", "Fixe", "Non courante"];

const DEPENSES_PREVUES = [
  {
    nom: "Loyer",
    montant: 850,
    type: "Fixe",
    statut: "Prévu",
    couleur: PURPLE,
    bg: PURPLE_LIGHT,
  },
  {
    nom: "Salle de sport",
    montant: 30,
    type: "Fixe",
    statut: "Payé",
    couleur: MINT,
    bg: MINT_LIGHT,
  },
  {
    nom: "Spotify",
    montant: 10,
    type: "Fixe",
    statut: "À venir",
    couleur: PEACH,
    bg: PEACH_LIGHT,
  },
  {
    nom: "Vacances Italie",
    montant: 600,
    type: "Non courante",
    statut: "Planifié",
    couleur: PEACH,
    bg: PEACH_LIGHT,
  },
];

type Transaction = {
  id: number;
  nom: string;
  montant: number;
  categorie: string;
  type: string;
  couleur: string;
  bg: string;
};

const TRANSACTIONS_INIT: Transaction[] = [
  {
    id: 1,
    nom: "Carrefour",
    montant: 64,
    categorie: "Courses",
    type: "Courante",
    couleur: MINT,
    bg: MINT_LIGHT,
  },
  {
    id: 2,
    nom: "Le Petit Bistrot",
    montant: 38,
    categorie: "Restaurants",
    type: "Courante",
    couleur: PEACH,
    bg: PEACH_LIGHT,
  },
  {
    id: 3,
    nom: "Métro 10x",
    montant: 16,
    categorie: "Transport",
    type: "Courante",
    couleur: PURPLE,
    bg: PURPLE_LIGHT,
  },
  {
    id: 4,
    nom: "Cinéma",
    montant: 14,
    categorie: "Loisirs",
    type: "Courante",
    couleur: PEACH,
    bg: PEACH_LIGHT,
  },
  {
    id: 5,
    nom: "Picard",
    montant: 42,
    categorie: "Courses",
    type: "Courante",
    couleur: MINT,
    bg: MINT_LIGHT,
  },
];

export default function Budget() {
  const [onglet, setOnglet] = useState<"depenses" | "previsionnel">("depenses");
  const [transactions, setTransactions] =
    useState<Transaction[]>(TRANSACTIONS_INIT);
  const [modalVisible, setModalVisible] = useState(false);
  const [nomDepense, setNomDepense] = useState("");
  const [montant, setMontant] = useState("");
  const [categorieSelectionnee, setCategorieSelectionnee] = useState(
    CATEGORIES[0],
  );
  const [typeSelectionne, setTypeSelectionne] = useState(TYPES[0]);

  const budgetTotal = 1800;
  const totalReel = transactions.reduce((acc, t) => acc + t.montant, 0);
  const totalPrevu = DEPENSES_PREVUES.reduce((acc, d) => acc + d.montant, 0);
  const resteEstime = budgetTotal - totalReel - totalPrevu;

  const ajouterDepense = () => {
    if (!nomDepense || !montant) return;
    const nouvelle: Transaction = {
      id: Date.now(),
      nom: nomDepense,
      montant: parseFloat(montant),
      categorie: categorieSelectionnee.nom,
      type: typeSelectionne,
      couleur: categorieSelectionnee.couleur,
      bg: categorieSelectionnee.bg,
    };
    setTransactions([nouvelle, ...transactions]);
    setNomDepense("");
    setMontant("");
    setModalVisible(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.titre}>Budget</Text>
          <Text style={styles.sousTitre}>Juin 2026</Text>
        </View>
        {onglet === "depenses" && (
          <TouchableOpacity
            style={styles.btnPlus}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.btnPlusTexte}>+</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.onglets}>
        <TouchableOpacity
          style={[styles.onglet, onglet === "depenses" && styles.ongletActif]}
          onPress={() => setOnglet("depenses")}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.ongletTexte,
              onglet === "depenses" && styles.ongletTexteActif,
            ]}
          >
            Dépenses
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.onglet,
            onglet === "previsionnel" && styles.ongletActif,
          ]}
          onPress={() => setOnglet("previsionnel")}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.ongletTexte,
              onglet === "previsionnel" && styles.ongletTexteActif,
            ]}
          >
            Prévisionnel
          </Text>
        </TouchableOpacity>
      </View>

      {onglet === "depenses" ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>TOTAL DÉPENSÉ</Text>
            <Text style={styles.heroAmount}>{totalReel} €</Text>
            <Text style={styles.heroSub}>/ {budgetTotal} € budget mensuel</Text>
            <View style={styles.progressBg}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min((totalReel / budgetTotal) * 100, 100)}%`,
                  },
                ]}
              />
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: MINT_LIGHT }]}>
              <Text style={[styles.statLabel, { color: MINT }]}>DÉPENSÉ</Text>
              <Text style={[styles.statValue, { color: "#0F6E56" }]}>
                {totalReel} €
              </Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: PURPLE_LIGHT }]}>
              <Text style={[styles.statLabel, { color: PURPLE }]}>RESTANT</Text>
              <Text style={[styles.statValue, { color: "#5A3DC4" }]}>
                {budgetTotal - totalReel} €
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>TRANSACTIONS DU MOIS</Text>
          {transactions.map((t) => (
            <View key={t.id} style={[styles.txCard, { backgroundColor: t.bg }]}>
              <View style={[styles.txBarre, { backgroundColor: t.couleur }]} />
              <View style={styles.txContent}>
                <View style={styles.txRow}>
                  <Text style={[styles.txNom, { color: t.couleur }]}>
                    {t.nom}
                  </Text>
                  <Text style={[styles.txMontant, { color: t.couleur }]}>
                    - {t.montant} €
                  </Text>
                </View>
                <Text style={styles.txMeta}>
                  {t.categorie} · {t.type}
                </Text>
              </View>
            </View>
          ))}
          <View style={{ height: 30 }} />
        </ScrollView>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>RESTE ESTIMÉ CE MOIS</Text>
            <Text
              style={[
                styles.heroAmount,
                { color: resteEstime < 0 ? PEACH : "#5A3DC4" },
              ]}
            >
              {resteEstime} €
            </Text>
            <Text style={styles.heroSub}>
              Budget {budgetTotal}€ · Réel {totalReel}€ · Prévu {totalPrevu}€
            </Text>
            <View style={styles.progressBg}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min((totalReel / budgetTotal) * 100, 100)}%`,
                    backgroundColor: MINT,
                  },
                ]}
              />
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min((totalPrevu / budgetTotal) * 100, 100)}%`,
                    backgroundColor: PEACH,
                  },
                ]}
              />
            </View>
            <View style={styles.legendeRow}>
              <View style={styles.legendeItem}>
                <View style={[styles.legendeDot, { backgroundColor: MINT }]} />
                <Text style={styles.legendeTexte}>Réel {totalReel}€</Text>
              </View>
              <View style={styles.legendeItem}>
                <View style={[styles.legendeDot, { backgroundColor: PEACH }]} />
                <Text style={styles.legendeTexte}>Prévu {totalPrevu}€</Text>
              </View>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: MINT_LIGHT }]}>
              <Text style={[styles.statLabel, { color: MINT }]}>RÉEL</Text>
              <Text style={[styles.statValue, { color: "#0F6E56" }]}>
                {totalReel} €
              </Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: PEACH_LIGHT }]}>
              <Text style={[styles.statLabel, { color: PEACH }]}>PRÉVU</Text>
              <Text style={[styles.statValue, { color: "#993C1D" }]}>
                {totalPrevu} €
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>DÉPENSES PRÉVUES</Text>
          {DEPENSES_PREVUES.map((dep, i) => (
            <View key={i} style={[styles.txCard, { backgroundColor: dep.bg }]}>
              <View
                style={[styles.txBarre, { backgroundColor: dep.couleur }]}
              />
              <View style={styles.txContent}>
                <View style={styles.txRow}>
                  <Text style={[styles.txNom, { color: dep.couleur }]}>
                    {dep.nom}
                  </Text>
                  <Text style={[styles.txMontant, { color: dep.couleur }]}>
                    {dep.montant} €
                  </Text>
                </View>
                <View style={styles.txRowBottom}>
                  <Text style={styles.txMeta}>{dep.type}</Text>
                  <View
                    style={[
                      styles.statutBadge,
                      {
                        backgroundColor:
                          dep.statut === "Payé"
                            ? MINT_LIGHT
                            : dep.statut === "Prévu"
                              ? PURPLE_LIGHT
                              : PEACH_LIGHT,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statutTexte,
                        {
                          color:
                            dep.statut === "Payé"
                              ? MINT
                              : dep.statut === "Prévu"
                                ? PURPLE
                                : PEACH,
                        },
                      ]}
                    >
                      {dep.statut}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
          <View style={{ height: 30 }} />
        </ScrollView>
      )}

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <TouchableOpacity style={styles.modalCard} activeOpacity={1}>
            <Text style={styles.modalTitre}>Nouvelle dépense</Text>
            <TextInput
              style={styles.input}
              placeholder="Nom de la dépense"
              placeholderTextColor="#CCC"
              value={nomDepense}
              onChangeText={setNomDepense}
            />
            <TextInput
              style={styles.input}
              placeholder="Montant (€)"
              placeholderTextColor="#CCC"
              keyboardType="numeric"
              value={montant}
              onChangeText={setMontant}
            />
            <Text style={styles.modalLabel}>Catégorie</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
            >
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.nom}
                  style={[
                    styles.chip,
                    {
                      backgroundColor:
                        categorieSelectionnee.nom === cat.nom
                          ? cat.couleur
                          : cat.bg,
                    },
                  ]}
                  onPress={() => setCategorieSelectionnee(cat)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipTexte,
                      {
                        color:
                          categorieSelectionnee.nom === cat.nom
                            ? "#FFFFFF"
                            : cat.couleur,
                      },
                    ]}
                  >
                    {cat.nom}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.modalLabel}>Type</Text>
            <View style={styles.typesRow}>
              {TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeBtn,
                    typeSelectionne === type && styles.typeBtnActif,
                  ]}
                  onPress={() => setTypeSelectionne(type)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.typeTexte,
                      typeSelectionne === type && styles.typeTexteActif,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.btnAjouter}
              onPress={ajouterDepense}
              activeOpacity={0.7}
            >
              <Text style={styles.btnAjouterTexte}>Ajouter la dépense</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
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
    marginBottom: 16,
  },
  titre: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1A1A1A",
    letterSpacing: 1,
  },
  sousTitre: { fontSize: 13, color: "#999", marginTop: 2 },
  btnPlus: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PURPLE,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPlusTexte: {
    fontSize: 24,
    color: "#FFFFFF",
    fontWeight: "300",
    lineHeight: 28,
  },
  onglets: {
    flexDirection: "row",
    backgroundColor: "#F7F7F7",
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  onglet: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
  },
  ongletActif: { backgroundColor: "#FFFFFF" },
  ongletTexte: { fontSize: 13, color: "#999", fontWeight: "500" },
  ongletTexteActif: { color: PURPLE, fontWeight: "600" },
  heroCard: {
    backgroundColor: PURPLE_LIGHT,
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
  },
  heroLabel: { fontSize: 10, color: PURPLE, letterSpacing: 1, marginBottom: 8 },
  heroAmount: {
    fontSize: 42,
    fontWeight: "700",
    color: "#5A3DC4",
    marginBottom: 4,
  },
  heroSub: { fontSize: 13, color: "#999", marginBottom: 16 },
  progressBg: {
    height: 4,
    backgroundColor: "rgba(139,111,232,0.2)",
    borderRadius: 2,
    flexDirection: "row",
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: PURPLE, borderRadius: 2 },
  legendeRow: { flexDirection: "row", gap: 16, marginTop: 8 },
  legendeItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendeDot: { width: 8, height: 8, borderRadius: 4 },
  legendeTexte: { fontSize: 11, color: "#999" },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  statCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: "center" },
  statLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statValue: { fontSize: 18, fontWeight: "600" },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "600",
    color: "#999",
    letterSpacing: 1,
    marginBottom: 12,
  },
  txCard: {
    flexDirection: "row",
    borderRadius: 14,
    marginBottom: 8,
    overflow: "hidden",
  },
  txBarre: { width: 4 },
  txContent: { flex: 1, padding: 14 },
  txRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  txRowBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  txNom: { fontSize: 14, fontWeight: "500" },
  txMontant: { fontSize: 14, fontWeight: "600" },
  txMeta: { fontSize: 11, color: "#999" },
  statutBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statutTexte: { fontSize: 10, fontWeight: "500" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitre: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 20,
  },
  input: {
    backgroundColor: "#F7F7F7",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#1A1A1A",
    marginBottom: 12,
  },
  modalLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#999",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  chipsScroll: { marginBottom: 16 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  chipTexte: { fontSize: 13, fontWeight: "500" },
  typesRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F7F7F7",
    alignItems: "center",
  },
  typeBtnActif: { backgroundColor: PURPLE },
  typeTexte: { fontSize: 12, color: "#999", fontWeight: "500" },
  typeTexteActif: { color: "#FFFFFF" },
  btnAjouter: {
    backgroundColor: PURPLE,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  btnAjouterTexte: { fontSize: 15, color: "#FFFFFF", fontWeight: "600" },
});
