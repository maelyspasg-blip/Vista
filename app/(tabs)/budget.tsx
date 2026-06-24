import { useState } from "react";
import {
  InputAccessoryView,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useObjectifs } from "../store";

const PURPLE = "#8B6FE8";
const PURPLE_LIGHT = "#F0EEFF";
const MINT = "#5DC8A0";
const MINT_LIGHT = "#E8F8F2";
const PEACH = "#F4956A";
const PEACH_LIGHT = "#FFF0EA";
const ROUGE = "#E24B4A";
const VERT = "#1D9E75";

const ACCESSORY_ID = "numericDone";

function bgClair(couleur: string) {
  return couleur + "22";
}

export default function Budget() {
  const objStore = useObjectifs();

  const [onglet, setOnglet] = useState<"depenses" | "previsionnel">("depenses");
  const [enveloppeOuverte, setEnveloppeOuverte] = useState<number | null>(null);

  const [modalAjoutVisible, setModalAjoutVisible] = useState(false);
  const [nomTx, setNomTx] = useState("");
  const [montantTx, setMontantTx] = useState("");
  const [enveloppeTx, setEnveloppeTx] = useState<number | null>(null);

  const [modalPrevuVisible, setModalPrevuVisible] = useState(false);
  const [prevuDetail, setPrevuDetail] = useState<
    (typeof objStore.depensesPrevues)[0] | null
  >(null);

  const totalReel = objStore.enveloppes.reduce((acc, e) => acc + e.depense, 0);
  const totalPrevu = objStore.depensesPrevues.reduce(
    (acc, d) => acc + d.montant,
    0,
  );
  const budgetTotal = objStore.argentDisponible;
  const resteEstime =
    budgetTotal - totalReel - totalPrevu - objStore.epargneMois;
  const estSousBudget = resteEstime >= 0;

  const pctReel =
    budgetTotal > 0 ? Math.min((totalReel / budgetTotal) * 100, 100) : 0;
  const pctPrevu =
    budgetTotal > 0
      ? Math.min((totalPrevu / budgetTotal) * 100, 100 - pctReel)
      : 0;
  const projectionFinMois = Math.round(totalReel * 1.6);

  const depenseDominante = [...objStore.enveloppes].sort(
    (a, b) => b.depense - a.depense,
  )[0];

  const lectureBudget = () => {
    if (resteEstime < 0)
      return { texte: "Risque de dépassement", couleur: ROUGE };
    if (resteEstime < budgetTotal * 0.15)
      return { texte: "Tu es proche de la limite", couleur: PEACH };
    return { texte: "Tu devrais rester dans ton budget", couleur: VERT };
  };
  const lecture = lectureBudget();

  const ouvrirAjout = (enveloppeId?: number) => {
    setNomTx("");
    setMontantTx("");
    setEnveloppeTx(enveloppeId ?? objStore.enveloppes[0]?.id ?? null);
    setModalAjoutVisible(true);
  };

  const validerAjout = () => {
    if (!nomTx || !montantTx || !enveloppeTx) return;
    const dateStr = new Date().toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
    });
    objStore.ajouterTransaction(
      nomTx,
      parseFloat(montantTx),
      enveloppeTx,
      dateStr,
    );
    setModalAjoutVisible(false);
  };

  const ouvrirPrevu = (dep: (typeof objStore.depensesPrevues)[0]) => {
    setPrevuDetail(dep);
    setModalPrevuVisible(true);
  };

  const toggleEnveloppe = (id: number) => {
    setEnveloppeOuverte(enveloppeOuverte === id ? null : id);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.titre}>Budget</Text>
          <Text style={styles.sousTitre}>Juin 2026</Text>
        </View>
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
      <Text style={styles.microCopy}>
        {onglet === "depenses"
          ? "Ce que tu as déjà dépensé"
          : "Ce que tu prévois de dépenser"}
      </Text>

      {onglet === "depenses" ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>TOTAL DÉPENSÉ</Text>
            <Text style={styles.heroAmount}>{totalReel} €</Text>
            <Text style={styles.heroSub}>/ {budgetTotal} € budget mensuel</Text>
            <View style={styles.progressBg}>
              <View style={[styles.progressFill, { width: `${pctReel}%` }]} />
            </View>
          </View>

          {depenseDominante && depenseDominante.depense > 0 && (
            <View style={styles.insightBanner}>
              <Text style={styles.insightTexte}>
                💡 {depenseDominante.nom} représente ta plus grosse dépense ce
                mois-ci
              </Text>
            </View>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>ENVELOPPES</Text>
            <TouchableOpacity
              style={styles.btnAjouter}
              onPress={() => ouvrirAjout()}
              activeOpacity={0.7}
            >
              <Text style={styles.btnAjouterTexte}>+ Ajouter</Text>
            </TouchableOpacity>
          </View>

          {objStore.enveloppes.map((env) => {
            const pct = Math.min((env.depense / env.budget) * 100, 100);
            const estOuverte = enveloppeOuverte === env.id;
            const txEnveloppe = objStore.transactions.filter(
              (t) => t.enveloppeId === env.id,
            );

            return (
              <View
                key={env.id}
                style={[
                  styles.envCard,
                  { backgroundColor: bgClair(env.couleur) },
                ]}
              >
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => toggleEnveloppe(env.id)}
                >
                  <View style={styles.envRow}>
                    <Text style={styles.envNom}>{env.nom}</Text>
                    <View style={styles.envRowRight}>
                      <Text style={[styles.envMontant, { color: env.couleur }]}>
                        {env.depense} € / {env.budget} €
                      </Text>
                      <Text style={[styles.chevron, { color: env.couleur }]}>
                        {estOuverte ? "▾" : "▸"}
                      </Text>
                    </View>
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

                {estOuverte && (
                  <View style={styles.txListe}>
                    {txEnveloppe.length === 0 ? (
                      <Text style={styles.txVide}>
                        Aucune dépense enregistrée
                      </Text>
                    ) : (
                      txEnveloppe.map((tx) => (
                        <View key={tx.id} style={styles.txLigne}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.txNom}>{tx.nom}</Text>
                            <Text style={styles.txDate}>{tx.date}</Text>
                          </View>
                          <Text
                            style={[styles.txMontant, { color: env.couleur }]}
                          >
                            - {tx.montant} €
                          </Text>
                          <TouchableOpacity
                            onPress={() => objStore.supprimerTransaction(tx.id)}
                            style={styles.txSupprimer}
                          >
                            <Text style={styles.txSupprimerTexte}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      ))
                    )}
                    <TouchableOpacity
                      style={[
                        styles.btnAjouterIci,
                        { backgroundColor: env.couleur },
                      ]}
                      onPress={() => ouvrirAjout(env.id)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.btnAjouterIciTexte}>
                        + Ajouter une dépense ici
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
          <View style={{ height: 30 }} />
        </ScrollView>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>RESTE ESTIMÉ CE MOIS</Text>
            <Text
              style={[
                styles.heroAmount,
                { color: estSousBudget ? "#5A3DC4" : ROUGE },
              ]}
            >
              {resteEstime} €
            </Text>
            <Text style={styles.heroSub}>
              Budget {budgetTotal}€ · Dépensé {totalReel}€ · Prévisionnel{" "}
              {totalPrevu}€ · Épargne {objStore.epargneMois}€
            </Text>
            <View style={styles.progressBg}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${pctReel}%`, backgroundColor: MINT },
                ]}
              />
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${pctPrevu}%`,
                    backgroundColor: PEACH,
                    position: "absolute",
                    left: `${pctReel}%`,
                  },
                ]}
              />
            </View>
            <View style={styles.legendeRow}>
              <View style={styles.legendeItem}>
                <View style={[styles.legendeDot, { backgroundColor: MINT }]} />
                <Text style={styles.legendeTexte}>Dépensé {totalReel}€</Text>
              </View>
              <View style={styles.legendeItem}>
                <View style={[styles.legendeDot, { backgroundColor: PEACH }]} />
                <Text style={styles.legendeTexte}>
                  Prévisionnel {totalPrevu}€
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.lectureBanner,
                { backgroundColor: lecture.couleur + "22" },
              ]}
            >
              <Text style={[styles.lectureTexte, { color: lecture.couleur }]}>
                {lecture.texte}
              </Text>
            </View>
            <Text style={styles.projectionTexte}>
              À ce rythme, tu dépenseras environ {projectionFinMois} € ce mois
            </Text>
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: MINT_LIGHT }]}>
              <Text style={[styles.statLabel, { color: MINT }]}>DÉPENSÉ</Text>
              <Text style={[styles.statValue, { color: "#0F6E56" }]}>
                {totalReel} €
              </Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: PEACH_LIGHT }]}>
              <Text style={[styles.statLabel, { color: PEACH }]}>
                PRÉVISIONNEL
              </Text>
              <Text style={[styles.statValue, { color: "#993C1D" }]}>
                {totalPrevu} €
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>DÉPENSES PRÉVUES</Text>
          {objStore.depensesPrevues.map((dep) => {
            const pctBudget =
              budgetTotal > 0
                ? Math.round((dep.montant / budgetTotal) * 100)
                : 0;
            const estLourd = pctBudget >= 30;
            return (
              <TouchableOpacity
                key={dep.id}
                style={[
                  styles.txCard,
                  { backgroundColor: bgClair(dep.couleur) },
                ]}
                activeOpacity={0.7}
                onPress={() => ouvrirPrevu(dep)}
              >
                <View
                  style={[styles.txBarre, { backgroundColor: dep.couleur }]}
                />
                <View style={styles.txContent}>
                  <View style={styles.txRow}>
                    <Text style={[styles.txCardNom, { color: dep.couleur }]}>
                      {dep.nom}
                    </Text>
                    <Text
                      style={[styles.txCardMontant, { color: dep.couleur }]}
                    >
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
                              : dep.statut === "À venir"
                                ? PEACH_LIGHT
                                : PURPLE_LIGHT,
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
                                : dep.statut === "À venir"
                                  ? PEACH
                                  : PURPLE,
                          },
                        ]}
                      >
                        {dep.statut}
                      </Text>
                    </View>
                  </View>
                  {estLourd && (
                    <Text style={styles.alertePoids}>
                      ⚠️ {pctBudget}% du budget total
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 30 }} />
        </ScrollView>
      )}

      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={ACCESSORY_ID}>
          <View style={styles.accessoryBar}>
            <Text style={styles.accessoryTexte}>Terminé</Text>
          </View>
        </InputAccessoryView>
      )}

      {/* Modal ajout transaction */}
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
              <Text style={styles.modalTitre}>Nouvelle dépense</Text>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.modalLabel}>Nom de la dépense</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex : Carrefour, Cinéma..."
                  placeholderTextColor="#CCC"
                  value={nomTx}
                  onChangeText={setNomTx}
                  returnKeyType="done"
                />

                <Text style={styles.modalLabel}>Montant</Text>
                <View style={styles.modalInputRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="0"
                    placeholderTextColor="#CCC"
                    keyboardType="numeric"
                    value={montantTx}
                    onChangeText={setMontantTx}
                    returnKeyType="done"
                    inputAccessoryViewID={ACCESSORY_ID}
                  />
                  <Text style={styles.modalEuro}>€</Text>
                </View>

                <Text style={styles.modalLabel}>Enveloppe</Text>
                <View style={styles.envChoixGrid}>
                  {objStore.enveloppes.map((env) => (
                    <TouchableOpacity
                      key={env.id}
                      style={[
                        styles.envChoixChip,
                        enveloppeTx === env.id && {
                          backgroundColor: env.couleur,
                        },
                      ]}
                      onPress={() => setEnveloppeTx(env.id)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.envChoixTexte,
                          enveloppeTx === env.id && { color: "#FFFFFF" },
                        ]}
                      >
                        {env.nom}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={styles.btnValider}
                  onPress={validerAjout}
                  activeOpacity={0.7}
                >
                  <Text style={styles.btnValiderTexte}>Ajouter la dépense</Text>
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

      {/* Modal détail dépense prévue */}
      <Modal
        visible={modalPrevuVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalPrevuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalPrevuVisible(false)}
        >
          <View style={styles.modalCard}>
            {prevuDetail && (
              <>
                <Text style={styles.modalTitre}>{prevuDetail.nom}</Text>
                <View style={styles.modalStatsRow}>
                  <View style={styles.modalStat}>
                    <Text style={styles.modalStatLabel}>MONTANT</Text>
                    <Text
                      style={[
                        styles.modalStatVal,
                        { color: prevuDetail.couleur },
                      ]}
                    >
                      {prevuDetail.montant} €
                    </Text>
                  </View>
                  <View style={styles.modalStat}>
                    <Text style={styles.modalStatLabel}>TYPE</Text>
                    <Text style={styles.modalStatVal}>{prevuDetail.type}</Text>
                  </View>
                  <View style={styles.modalStat}>
                    <Text style={styles.modalStatLabel}>STATUT</Text>
                    <Text style={styles.modalStatVal}>
                      {prevuDetail.statut}
                    </Text>
                  </View>
                </View>
              </>
            )}
            <TouchableOpacity
              style={styles.btnFermer}
              onPress={() => setModalPrevuVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.btnFermerTexte}>Fermer</Text>
            </TouchableOpacity>
          </View>
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
    alignItems: "flex-start",
    marginTop: 60,
    marginBottom: 16,
  },
  titre: {
    fontSize: 23,
    fontWeight: "700",
    color: "#1A1A1A",
    letterSpacing: 1,
  },
  sousTitre: { fontSize: 14, color: "#999", marginTop: 2 },
  btnAjouter: {
    backgroundColor: PURPLE,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    maxWidth: 150,
  },
  btnAjouterTexte: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
  },
  onglets: {
    flexDirection: "row",
    backgroundColor: "#F7F7F7",
    borderRadius: 14,
    padding: 4,
    marginBottom: 8,
  },
  onglet: {
    flex: 1,
    paddingVertical: 11,
    alignItems: "center",
    borderRadius: 10,
  },
  ongletActif: { backgroundColor: "#FFFFFF" },
  ongletTexte: { fontSize: 14, color: "#999", fontWeight: "600" },
  ongletTexteActif: { color: PURPLE, fontWeight: "700" },
  microCopy: {
    fontSize: 12,
    color: "#BBB",
    marginBottom: 16,
    textAlign: "center",
  },
  heroCard: {
    backgroundColor: PURPLE_LIGHT,
    borderRadius: 22,
    padding: 24,
    marginBottom: 16,
  },
  heroLabel: {
    fontSize: 11,
    color: PURPLE,
    letterSpacing: 1,
    marginBottom: 8,
    fontWeight: "700",
  },
  heroAmount: {
    fontSize: 42,
    fontWeight: "700",
    color: "#5A3DC4",
    marginBottom: 4,
  },
  heroSub: { fontSize: 13, color: "#999", marginBottom: 16 },
  progressBg: {
    height: 6,
    backgroundColor: "rgba(139,111,232,0.2)",
    borderRadius: 3,
    position: "relative",
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: PURPLE, borderRadius: 3 },
  legendeRow: { flexDirection: "row", gap: 16, marginTop: 10 },
  legendeItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendeDot: { width: 8, height: 8, borderRadius: 4 },
  legendeTexte: { fontSize: 12, color: "#999" },
  lectureBanner: { borderRadius: 12, padding: 12, marginTop: 16 },
  lectureTexte: { fontSize: 14, fontWeight: "700", textAlign: "center" },
  projectionTexte: {
    fontSize: 12,
    color: "#999",
    textAlign: "center",
    marginTop: 10,
  },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statCard: { flex: 1, borderRadius: 16, padding: 14, alignItems: "center" },
  statLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 5,
  },
  statValue: { fontSize: 19, fontWeight: "700", marginBottom: 3 },
  insightBanner: {
    backgroundColor: "#FAFAFA",
    borderRadius: 13,
    padding: 14,
    marginBottom: 16,
    borderWidth: 0.5,
    borderColor: "#EEE",
  },
  insightTexte: { fontSize: 13, color: "#666", lineHeight: 19 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#999",
    letterSpacing: 1,
  },
  envCard: { borderRadius: 16, padding: 18, marginBottom: 10 },
  envRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 11,
  },
  envNom: { fontSize: 16, fontWeight: "700", color: "#1A1A1A" },
  envRowRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  envMontant: { fontSize: 14, fontWeight: "700" },
  chevron: { fontSize: 14, fontWeight: "700" },
  envBarBg: {
    height: 6,
    backgroundColor: "rgba(0,0,0,0.08)",
    borderRadius: 3,
    overflow: "hidden",
  },
  envBarFill: { height: "100%", borderRadius: 3 },
  txListe: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 0.5,
    borderTopColor: "rgba(0,0,0,0.08)",
  },
  txVide: {
    fontSize: 13,
    color: "#AAA",
    textAlign: "center",
    paddingVertical: 10,
  },
  txLigne: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 8,
  },
  txNom: { fontSize: 13, fontWeight: "600", color: "#1A1A1A" },
  txDate: { fontSize: 11, color: "#999" },
  txMontant: { fontSize: 13, fontWeight: "700" },
  txSupprimer: { padding: 4 },
  txSupprimerTexte: { fontSize: 13, color: "#CCC" },
  btnAjouterIci: {
    borderRadius: 12,
    padding: 11,
    alignItems: "center",
    marginTop: 8,
  },
  btnAjouterIciTexte: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  txCard: {
    flexDirection: "row",
    borderRadius: 16,
    marginBottom: 10,
    overflow: "hidden",
  },
  txBarre: { width: 4 },
  txContent: { flex: 1, padding: 16 },
  txRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 5,
  },
  txRowBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  txCardNom: { fontSize: 15, fontWeight: "700" },
  txCardMontant: { fontSize: 15, fontWeight: "700" },
  txMeta: { fontSize: 12, color: "#999" },
  statutBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  statutTexte: { fontSize: 11, fontWeight: "600" },
  alertePoids: { fontSize: 11, color: PEACH, marginTop: 6, fontWeight: "600" },
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalOverlayTouch: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 26,
    paddingBottom: 40,
    maxHeight: "90%",
  },
  modalTitre: {
    fontSize: 21,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 20,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#999",
    letterSpacing: 0.5,
    marginBottom: 9,
    marginTop: 6,
  },
  modalInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalEuro: { fontSize: 17, color: "#999", marginBottom: 12 },
  input: {
    backgroundColor: "#F7F7F7",
    borderRadius: 13,
    padding: 16,
    fontSize: 17,
    color: "#1A1A1A",
    marginBottom: 12,
  },
  envChoixGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 6,
  },
  envChoixChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "#F7F7F7",
  },
  envChoixTexte: { fontSize: 13, color: "#999", fontWeight: "600" },
  btnValider: {
    backgroundColor: PURPLE,
    borderRadius: 16,
    padding: 17,
    alignItems: "center",
    marginTop: 10,
  },
  btnValiderTexte: { fontSize: 17, color: "#FFFFFF", fontWeight: "700" },
  btnAnnuler: {
    padding: 15,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 6,
  },
  btnAnnulerTexte: { fontSize: 15, color: "#999", fontWeight: "600" },
  modalStatsRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  modalStat: {
    flex: 1,
    backgroundColor: "#F7F7F7",
    borderRadius: 13,
    padding: 13,
    alignItems: "center",
  },
  modalStatLabel: {
    fontSize: 10,
    color: "#999",
    fontWeight: "700",
    marginBottom: 5,
  },
  modalStatVal: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1A1A1A",
    textAlign: "center",
  },
  btnFermer: {
    backgroundColor: "#F7F7F7",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    marginTop: 12,
  },
  btnFermerTexte: { fontSize: 15, color: "#666", fontWeight: "700" },
});
