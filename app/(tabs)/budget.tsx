import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
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
import { useTheme } from "../ThemeContext";
import { useObjectifs } from "../store";

const ACCESSORY_ID = "numericDone";

export default function Budget() {
  const objStore = useObjectifs();
  const { couleurs: C } = useTheme();

  useFocusEffect(
    useCallback(() => {
      objStore.verifierEcheancesFixes();
    }, []),
  );

  const [enveloppeOuverte, setEnveloppeOuverte] = useState<number | null>(null);
  const [modalAjoutVisible, setModalAjoutVisible] = useState(false);
  const [nomTx, setNomTx] = useState("");
  const [montantTx, setMontantTx] = useState("");
  const [enveloppeTx, setEnveloppeTx] = useState<number | null>(null);

  const MOIS_ACTUEL = new Date().getMonth();
  const ANNEE_ACTUELLE = new Date().getFullYear();

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
    <View style={[styles.container, { backgroundColor: C.fondPage }]}>
      <View style={[styles.header, { backgroundColor: C.fondPage }]}>
        <View>
          <Text style={[styles.titre, { color: C.texte }]}>Budget</Text>
          <Text style={[styles.sousTitre, { color: C.texteMuted }]}>
            {new Date().toLocaleDateString("fr-FR", {
              month: "long",
              year: "numeric",
            })}
          </Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.heroCard, { backgroundColor: C.bleuGrisLight }]}>
          <Text style={[styles.heroLabel, { color: C.bleuGris }]}>
            TOTAL DÉPENSÉ
          </Text>
          <Text style={[styles.heroAmount, { color: C.texte }]}>
            {totalReel} €
          </Text>
          <Text style={[styles.heroSub, { color: C.texteMuted }]}>
            / {budgetTotal} € budget mensuel
          </Text>
          <View style={[styles.progressBg, { backgroundColor: C.separateur }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${budgetTotal > 0 ? Math.min((totalReel / budgetTotal) * 100, 100) : 0}%`,
                  backgroundColor: C.bleuGris,
                },
              ]}
            />
          </View>
        </View>

        {depenseDominante && depenseDominante.depense > 0 && (
          <View
            style={[
              styles.insightBanner,
              { backgroundColor: C.carte, borderColor: C.carteBorder },
            ]}
          >
            <Text style={[styles.insightTexte, { color: C.texte }]}>
              💡 {depenseDominante.nom} représente ta plus grosse dépense ce
              mois-ci
            </Text>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: C.texteMuted }]}>
            TES CATÉGORIES
          </Text>
          <TouchableOpacity
            style={[styles.btnAjouter, { backgroundColor: C.accentLight }]}
            onPress={() => ouvrirAjout()}
            activeOpacity={0.7}
          >
            <Text style={[styles.btnAjouterTexte, { color: C.accentText }]}>
              + Ajouter
            </Text>
          </TouchableOpacity>
        </View>

        {paiementsDuMois.map((p) => (
          <View
            key={`paye-${p.id}`}
            style={[styles.envCard, { backgroundColor: p.couleur + "22" }]}
          >
            <View style={styles.envRow}>
              <Text style={[styles.envNom, { color: C.texte }]}>{p.nom}</Text>
              <Text style={[styles.envMontant, { color: p.couleur }]}>
                {p.montant} € / {p.montant} €
              </Text>
            </View>
            <View style={[styles.envBarBg, { backgroundColor: C.separateur }]}>
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
              style={[styles.envCard, { backgroundColor: env.couleur + "22" }]}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => toggleEnveloppe(env.id)}
              >
                <View style={styles.envRow}>
                  <Text style={[styles.envNom, { color: C.texte }]}>
                    {env.nom}
                  </Text>
                  <View style={styles.envRowRight}>
                    <Text style={[styles.envMontant, { color: env.couleur }]}>
                      {env.depense} € / {env.budget} €
                    </Text>
                    <Text style={[styles.chevron, { color: env.couleur }]}>
                      {estOuverte ? "▾" : "▸"}
                    </Text>
                  </View>
                </View>
                <View
                  style={[styles.envBarBg, { backgroundColor: C.separateur }]}
                >
                  <View
                    style={[
                      styles.envBarFill,
                      { width: `${pct}%`, backgroundColor: env.couleur },
                    ]}
                  />
                </View>
              </TouchableOpacity>

              {estOuverte && (
                <View
                  style={[styles.txListe, { borderTopColor: C.separateur }]}
                >
                  {txEnveloppe.length === 0 ? (
                    <Text style={[styles.txVide, { color: C.texteMuted }]}>
                      Aucune dépense enregistrée
                    </Text>
                  ) : (
                    txEnveloppe.map((tx) => (
                      <View key={tx.id} style={styles.txLigne}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.txNom, { color: C.texte }]}>
                            {tx.nom}
                          </Text>
                          <Text
                            style={[styles.txDate, { color: C.texteMuted }]}
                          >
                            {tx.date}
                          </Text>
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
                          <Text
                            style={[
                              styles.txSupprimerTexte,
                              { color: C.texteMuted },
                            ]}
                          >
                            ✕
                          </Text>
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

        <Text
          style={[styles.sectionTitle, { color: C.texteMuted, marginTop: 8 }]}
        >
          À VENIR CE MOIS-CI
        </Text>

        {enveloppesAVenir.length === 0 ? (
          <View
            style={[
              styles.videContainer,
              { backgroundColor: C.carte, borderColor: C.carteBorder },
            ]}
          >
            <Text style={[styles.videTexte, { color: C.texteMuted }]}>
              Rien à venir pour le moment
            </Text>
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
                  { backgroundColor: env.couleur + "22" },
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
                    <Text style={[styles.fixeMeta, { color: C.texteMuted }]}>
                      {dateAffichee}
                      {env.repeteChaqueMois ? " · tous les mois" : ""}
                    </Text>
                    <View
                      style={[
                        styles.statutBadge,
                        { backgroundColor: C.bleuGrisLight },
                      ]}
                    >
                      <Text style={[styles.statutTexte, { color: C.bleuGris }]}>
                        À venir
                      </Text>
                    </View>
                  </View>
                  {estLourd && (
                    <Text style={[styles.alertePoids, { color: C.peach }]}>
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
          <View
            style={[styles.accessoryBar, { backgroundColor: C.fondSecondaire }]}
          >
            <Text style={[styles.accessoryTexte, { color: C.accent }]}>
              Terminé
            </Text>
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
            <View style={[styles.modalCard, { backgroundColor: C.carte }]}>
              <Text style={[styles.modalTitre, { color: C.texte }]}>
                Nouvelle dépense
              </Text>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={[styles.modalLabel, { color: C.texteMuted }]}>
                  Nom de la dépense
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: C.fondSecondaire, color: C.texte },
                  ]}
                  placeholder="Ex : Carrefour, Cinéma..."
                  placeholderTextColor={C.texteMuted}
                  value={nomTx}
                  onChangeText={setNomTx}
                  returnKeyType="done"
                />

                <Text style={[styles.modalLabel, { color: C.texteMuted }]}>
                  Montant
                </Text>
                <View style={styles.modalInputRow}>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        flex: 1,
                        backgroundColor: C.fondSecondaire,
                        color: C.texte,
                      },
                    ]}
                    placeholder="0"
                    placeholderTextColor={C.texteMuted}
                    keyboardType="numeric"
                    value={montantTx}
                    onChangeText={setMontantTx}
                    returnKeyType="done"
                    inputAccessoryViewID={ACCESSORY_ID}
                  />
                  <Text style={[styles.modalEuro, { color: C.texteMuted }]}>
                    €
                  </Text>
                </View>

                <Text style={[styles.modalLabel, { color: C.texteMuted }]}>
                  Catégorie
                </Text>
                <View style={styles.envChoixGrid}>
                  {enveloppesCourantes.map((env) => (
                    <TouchableOpacity
                      key={env.id}
                      style={[
                        styles.envChoixChip,
                        { backgroundColor: C.fondSecondaire },
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
                          { color: C.texteMuted },
                          enveloppeTx === env.id && { color: "#FFFFFF" },
                        ]}
                      >
                        {env.nom}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.btnValider, { backgroundColor: C.hero }]}
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
                  <Text
                    style={[styles.btnAnnulerTexte, { color: C.texteMuted }]}
                  >
                    Annuler
                  </Text>
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
  container: { flex: 1, paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 60,
    marginBottom: 16,
  },
  titre: { fontSize: 23, fontWeight: "700", letterSpacing: 1 },
  sousTitre: { fontSize: 14, marginTop: 2 },
  heroCard: { borderRadius: 22, padding: 24, marginBottom: 16 },
  heroLabel: {
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 8,
    fontWeight: "700",
  },
  heroAmount: { fontSize: 42, fontWeight: "700", marginBottom: 4 },
  heroSub: { fontSize: 13, marginBottom: 16 },
  progressBg: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  insightBanner: {
    borderRadius: 13,
    padding: 14,
    marginBottom: 16,
    borderWidth: 0.5,
  },
  insightTexte: { fontSize: 13, lineHeight: 19 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 4,
  },
  btnAjouter: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  btnAjouterTexte: { fontSize: 12, fontWeight: "700" },
  envCard: { borderRadius: 16, padding: 18, marginBottom: 10 },
  envRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 11,
  },
  envNom: { fontSize: 16, fontWeight: "700" },
  envRowRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  envMontant: { fontSize: 14, fontWeight: "700" },
  chevron: { fontSize: 14, fontWeight: "700" },
  envBarBg: { height: 6, borderRadius: 3, overflow: "hidden" },
  envBarFill: { height: "100%", borderRadius: 3 },
  txListe: { marginTop: 14, paddingTop: 14, borderTopWidth: 0.5 },
  txVide: { fontSize: 13, textAlign: "center", paddingVertical: 10 },
  txLigne: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 8,
  },
  txNom: { fontSize: 13, fontWeight: "600" },
  txDate: { fontSize: 11 },
  txMontant: { fontSize: 13, fontWeight: "700" },
  txSupprimer: { padding: 4 },
  txSupprimerTexte: { fontSize: 13 },
  btnAjouterIci: {
    borderRadius: 12,
    padding: 11,
    alignItems: "center",
    marginTop: 8,
  },
  btnAjouterIciTexte: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  videContainer: {
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 0.5,
  },
  videTexte: { fontSize: 13 },
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
  fixeMeta: { fontSize: 12 },
  statutBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  statutTexte: { fontSize: 11, fontWeight: "600" },
  alertePoids: { fontSize: 11, marginTop: 6, fontWeight: "600" },
  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalOverlayTouch: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end",
  },
  modalCard: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 26,
    paddingBottom: 40,
    maxHeight: "90%",
  },
  modalTitre: { fontSize: 21, fontWeight: "700", marginBottom: 20 },
  modalLabel: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 9,
    marginTop: 6,
  },
  modalInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalEuro: { fontSize: 17, marginBottom: 12 },
  input: { borderRadius: 13, padding: 16, fontSize: 17, marginBottom: 12 },
  envChoixGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 6,
  },
  envChoixChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20 },
  envChoixTexte: { fontSize: 13, fontWeight: "600" },
  btnValider: {
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
  btnAnnulerTexte: { fontSize: 15, fontWeight: "600" },
  accessoryBar: {
    padding: 10,
    alignItems: "flex-end",
    borderTopWidth: 0.5,
    borderTopColor: "#DDD",
  },
  accessoryTexte: { fontSize: 17, fontWeight: "700" },
});
