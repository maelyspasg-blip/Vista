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

  const [enveloppeOuverte, setEnveloppeOuverte] = useState<number | null>(null);

  const [modalAjoutVisible, setModalAjoutVisible] = useState(false);
  const [nomTx, setNomTx] = useState("");
  const [montantTx, setMontantTx] = useState("");
  const [enveloppeTx, setEnveloppeTx] = useState<number | null>(null);

  const MOIS_ACTUEL = 5;
  const ANNEE_ACTUELLE = 2026;

  const paiementsDuMois = objStore.historiquePaiements.filter((p) => {
    const d = new Date(p.date);
    return d.getMonth() === MOIS_ACTUEL && d.getFullYear() === ANNEE_ACTUELLE;
  });

  const enveloppesCourantes = objStore.enveloppes.filter(
    (e) => e.type === "Variable",
  );

  const enveloppesAVenir = objStore.enveloppes.filter((e) => {
    if (e.type !== "Fixe" || e.payee || !e.dateFixe) return false;
    const d = new Date(e.dateFixe);
    return d.getMonth() === MOIS_ACTUEL && d.getFullYear() === ANNEE_ACTUELLE;
  });

  const totalReel = objStore.enveloppes.reduce((acc, e) => acc + e.depense, 0);
  const budgetTotal = objStore.argentDisponible;

  const depenseDominante = [...enveloppesCourantes].sort(
    (a, b) => b.depense - a.depense,
  )[0];

  const ouvrirAjout = (enveloppeId?: number) => {
    setNomTx("");
    setMontantTx("");
    setEnveloppeTx(enveloppeId ?? enveloppesCourantes[0]?.id ?? null);
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
                  width: `${budgetTotal > 0 ? Math.min((totalReel / budgetTotal) * 100, 100) : 0}%`,
                },
              ]}
            />
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
          <Text style={styles.sectionTitle}>TES CATÉGORIES</Text>
          <TouchableOpacity
            style={styles.btnAjouter}
            onPress={() => ouvrirAjout()}
            activeOpacity={0.7}
          >
            <Text style={styles.btnAjouterTexte}>+ Ajouter</Text>
          </TouchableOpacity>
        </View>

        {paiementsDuMois.map((p) => (
          <View
            key={`paye-${p.id}`}
            style={[styles.envCard, { backgroundColor: bgClair(p.couleur) }]}
          >
            <View style={styles.envRow}>
              <Text style={styles.envNom}>{p.nom}</Text>
              <Text style={[styles.envMontant, { color: p.couleur }]}>
                {p.montant} € / {p.montant} €
              </Text>
            </View>
            <View style={styles.envBarBg}>
              <View
                style={[
                  styles.envBarFill,
                  { width: "100%", backgroundColor: p.couleur },
                ]}
              />
            </View>
          </View>
        ))}

        {enveloppesCourantes.map((env) => {
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

        <Text style={styles.sectionTitle}>À VENIR CE MOIS-CI</Text>

        {enveloppesAVenir.length === 0 ? (
          <View style={styles.videContainer}>
            <Text style={styles.videTexte}>Rien à venir pour le moment</Text>
          </View>
        ) : (
          enveloppesAVenir.map((env) => {
            const pctBudget =
              budgetTotal > 0
                ? Math.round((env.budget / budgetTotal) * 100)
                : 0;
            const estLourd = pctBudget >= 30;
            const dateAffichee = env.dateFixe
              ? new Date(env.dateFixe).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                })
              : "";
            return (
              <View
                key={env.id}
                style={[
                  styles.fixeCard,
                  { backgroundColor: bgClair(env.couleur) },
                ]}
              >
                <View
                  style={[styles.fixeBarre, { backgroundColor: env.couleur }]}
                />
                <View style={styles.fixeContent}>
                  <View style={styles.fixeRow}>
                    <Text style={[styles.fixeNom, { color: env.couleur }]}>
                      {env.nom}
                    </Text>
                    <Text style={[styles.fixeMontant, { color: env.couleur }]}>
                      {env.budget} €
                    </Text>
                  </View>
                  <View style={styles.fixeRowBottom}>
                    <Text style={styles.fixeMeta}>
                      {dateAffichee}
                      {env.repeteChaqueMois ? " · tous les mois" : ""}
                    </Text>
                    <View
                      style={[
                        styles.statutBadge,
                        { backgroundColor: PURPLE_LIGHT },
                      ]}
                    >
                      <Text style={[styles.statutTexte, { color: PURPLE }]}>
                        À venir
                      </Text>
                    </View>
                  </View>
                  {estLourd && (
                    <Text style={styles.alertePoids}>
                      ⚠️ {pctBudget}% du budget total
                    </Text>
                  )}
                </View>
              </View>
            );
          })
        )}

        <View style={{ height: 30 }} />
      </ScrollView>

      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={ACCESSORY_ID}>
          <View style={styles.accessoryBar}>
            <Text style={styles.accessoryTexte}>Terminé</Text>
          </View>
        </InputAccessoryView>
      )}

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

                <Text style={styles.modalLabel}>Catégorie</Text>
                <View style={styles.envChoixGrid}>
                  {enveloppesCourantes.map((env) => (
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
    marginBottom: 12,
    marginTop: 4,
  },
  btnAjouter: {
    backgroundColor: PURPLE_LIGHT,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  btnAjouterTexte: { fontSize: 12, fontWeight: "700", color: PURPLE },
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
  videContainer: {
    backgroundColor: "#FAFAFA",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginBottom: 10,
  },
  videTexte: { fontSize: 13, color: "#BBB" },
  fixeCard: {
    flexDirection: "row",
    borderRadius: 16,
    marginBottom: 10,
    overflow: "hidden",
  },
  fixeBarre: { width: 4 },
  fixeContent: { flex: 1, padding: 16 },
  fixeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 5,
  },
  fixeNom: { fontSize: 15, fontWeight: "700" },
  fixeMontant: { fontSize: 15, fontWeight: "700" },
  fixeRowBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  fixeMeta: { fontSize: 12, color: "#999" },
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
  accessoryBar: {
    backgroundColor: "#F7F7F7",
    padding: 10,
    alignItems: "flex-end",
    borderTopWidth: 0.5,
    borderTopColor: "#DDD",
  },
  accessoryTexte: { color: PURPLE, fontSize: 17, fontWeight: "700" },
});
