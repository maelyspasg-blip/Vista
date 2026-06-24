import { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
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
const ROUGE_LIGHT = "#FCEBEB";
const VERT = "#1D9E75";
const VERT_LIGHT = "#E1F5EE";

export default function Budget() {
  const objStore = useObjectifs();

  const [onglet, setOnglet] = useState<"depenses" | "previsionnel">("depenses");
  const [modalTxVisible, setModalTxVisible] = useState(false);
  const [modalPrevuVisible, setModalPrevuVisible] = useState(false);
  const [transactionDetail, setTransactionDetail] = useState<
    (typeof objStore.transactions)[0] | null
  >(null);
  const [prevuDetail, setPrevuDetail] = useState<
    (typeof objStore.depensesPrevues)[0] | null
  >(null);

  const totalReel = objStore.enveloppes.reduce((acc, e) => acc + e.depense, 0);
  const totalPrevu = objStore.depensesPrevues.reduce(
    (acc, d) => acc + d.montant,
    0,
  );
  const budgetTotal = objStore.argentDisponible;
  const resteEstime = budgetTotal - totalReel - totalPrevu;
  const estSousBudget = resteEstime >= 0;

  const pctReel =
    budgetTotal > 0 ? Math.min((totalReel / budgetTotal) * 100, 100) : 0;
  const pctPrevu =
    budgetTotal > 0
      ? Math.min((totalPrevu / budgetTotal) * 100, 100 - pctReel)
      : 0;

  // Projection fin de mois (estimation simple à partir du réel + 30 jours)
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

  const ouvrirTransaction = (tx: (typeof objStore.transactions)[0]) => {
    setTransactionDetail(tx);
    setModalTxVisible(true);
  };

  const ouvrirPrevu = (dep: (typeof objStore.depensesPrevues)[0]) => {
    setPrevuDetail(dep);
    setModalPrevuVisible(true);
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

          <View style={styles.statsRow}>
            <TouchableOpacity
              style={[styles.statCard, { backgroundColor: MINT_LIGHT }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.statLabel, { color: MINT }]}>DÉPENSÉ</Text>
              <Text style={[styles.statValue, { color: "#0F6E56" }]}>
                {totalReel} €
              </Text>
              <Text style={styles.statMicro}>vs budget {budgetTotal}€</Text>
            </TouchableOpacity>
            <View style={[styles.statCard, { backgroundColor: PURPLE_LIGHT }]}>
              <Text style={[styles.statLabel, { color: PURPLE }]}>RESTANT</Text>
              <Text style={[styles.statValue, { color: "#5A3DC4" }]}>
                {budgetTotal - totalReel} €
              </Text>
              <Text style={styles.statMicro}>
                {Math.round(pctReel)}% utilisé
              </Text>
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

          <Text style={styles.sectionTitle}>TRANSACTIONS DU MOIS</Text>
          {objStore.transactions.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[styles.txCard, { backgroundColor: t.couleur + "22" }]}
              activeOpacity={0.7}
              onPress={() => ouvrirTransaction(t)}
            >
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
                  {t.categorie} · {t.date}
                </Text>
              </View>
            </TouchableOpacity>
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
                { color: estSousBudget ? "#5A3DC4" : ROUGE },
              ]}
            >
              {resteEstime} €
            </Text>
            <Text style={styles.heroSub}>
              Budget {budgetTotal}€ · Dépensé {totalReel}€ · Prévisionnel{" "}
              {totalPrevu}€
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
                style={[styles.txCard, { backgroundColor: dep.couleur + "22" }]}
                activeOpacity={0.7}
                onPress={() => ouvrirPrevu(dep)}
              >
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

      {/* Modal détail transaction */}
      <Modal
        visible={modalTxVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalTxVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalTxVisible(false)}
        >
          <View style={styles.modalCard}>
            {transactionDetail && (
              <>
                <Text style={styles.modalTitre}>{transactionDetail.nom}</Text>
                <View style={styles.modalStatsRow}>
                  <View style={styles.modalStat}>
                    <Text style={styles.modalStatLabel}>MONTANT</Text>
                    <Text
                      style={[
                        styles.modalStatVal,
                        { color: transactionDetail.couleur },
                      ]}
                    >
                      {transactionDetail.montant} €
                    </Text>
                  </View>
                  <View style={styles.modalStat}>
                    <Text style={styles.modalStatLabel}>CATÉGORIE</Text>
                    <Text style={styles.modalStatVal}>
                      {transactionDetail.categorie}
                    </Text>
                  </View>
                  <View style={styles.modalStat}>
                    <Text style={styles.modalStatLabel}>DATE</Text>
                    <Text style={styles.modalStatVal}>
                      {transactionDetail.date}
                    </Text>
                  </View>
                </View>
                <Text style={styles.modalAide}>
                  Pour modifier cette transaction, rends-toi sur l'accueil.
                </Text>
              </>
            )}
            <TouchableOpacity
              style={styles.btnFermer}
              onPress={() => setModalTxVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.btnFermerTexte}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
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
                <Text style={styles.modalAide}>
                  Cette dépense représente{" "}
                  {budgetTotal > 0
                    ? Math.round((prevuDetail.montant / budgetTotal) * 100)
                    : 0}
                  % de ton budget total. Pour la modifier, rends-toi sur
                  l'accueil.
                </Text>
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
    alignItems: "center",
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
  statMicro: { fontSize: 10, color: "#999" },
  insightBanner: {
    backgroundColor: "#FAFAFA",
    borderRadius: 13,
    padding: 14,
    marginBottom: 16,
    borderWidth: 0.5,
    borderColor: "#EEE",
  },
  insightTexte: { fontSize: 13, color: "#666", lineHeight: 19 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#999",
    letterSpacing: 1,
    marginBottom: 12,
  },
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
  txNom: { fontSize: 15, fontWeight: "700" },
  txMontant: { fontSize: 15, fontWeight: "700" },
  txMeta: { fontSize: 12, color: "#999" },
  statutBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20 },
  statutTexte: { fontSize: 11, fontWeight: "600" },
  alertePoids: { fontSize: 11, color: PEACH, marginTop: 6, fontWeight: "600" },
  modalOverlay: {
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
  },
  modalTitre: {
    fontSize: 21,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 20,
  },
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
  modalAide: { fontSize: 12, color: "#AAA", lineHeight: 18, marginBottom: 10 },
  btnFermer: {
    backgroundColor: "#F7F7F7",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    marginTop: 12,
  },
  btnFermerTexte: { fontSize: 15, color: "#666", fontWeight: "700" },
});
