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
const VERT = "#1D9E75";

const JOURS_SEMAINE = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const DATES = [16, 17, 18, 19, 20, 21, 22];

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
];

const HEURES = [
  "8h",
  "9h",
  "10h",
  "11h",
  "12h",
  "13h",
  "14h",
  "15h",
  "16h",
  "17h",
  "18h",
  "19h",
  "20h",
];
const HEURE_DEBUT = 8;
const HAUTEUR_HEURE = 64;

function heureEnMinutes(heure: string): number {
  const [h, m] = heure.replace("h", ":").split(":");
  return parseInt(h) * 60 + (parseInt(m) || 0);
}

const ACCESSORY_ID = "numericDone";

export default function Planning() {
  const objStore = useObjectifs();

  const [jourSelectionne, setJourSelectionne] = useState(16);
  const [modalCreationVisible, setModalCreationVisible] = useState(false);
  const [etapeCreation, setEtapeCreation] = useState<
    "infos" | "financier" | "categorie"
  >("infos");

  const [nomEvent, setNomEvent] = useState("");
  const [heureEvent, setHeureEvent] = useState("9h00");
  const [dureeEvent, setDureeEvent] = useState("1");
  const [jourEvent, setJourEvent] = useState(16);
  const [couleurEvent, setCouleurEvent] = useState(PALETTE_COULEURS[0]);
  const [montantEvent, setMontantEvent] = useState("");
  const [categorieEvent, setCategorieEvent] = useState("Aucune");

  const evsDuJour = objStore.evenements.filter(
    (e) => e.jour === jourSelectionne,
  );

  const ouvrirCreation = () => {
    setNomEvent("");
    setHeureEvent("9h00");
    setDureeEvent("1");
    setJourEvent(jourSelectionne);
    setCouleurEvent(PALETTE_COULEURS[0]);
    setMontantEvent("");
    setCategorieEvent("Aucune");
    setEtapeCreation("infos");
    setModalCreationVisible(true);
  };

  const validerInfos = () => {
    if (!nomEvent || !heureEvent) return;
    setEtapeCreation("financier");
  };

  const choisirNonFinancier = () => {
    objStore.ajouterEvenement(
      nomEvent,
      jourEvent,
      heureEvent,
      parseFloat(dureeEvent) || 1,
      couleurEvent,
      false,
    );
    setModalCreationVisible(false);
  };

  const choisirFinancier = () => {
    setEtapeCreation("categorie");
  };

  const validerCreationFinanciere = () => {
    if (!montantEvent) return;
    objStore.ajouterEvenement(
      nomEvent,
      jourEvent,
      heureEvent,
      parseFloat(dureeEvent) || 1,
      couleurEvent,
      true,
      parseFloat(montantEvent),
      categorieEvent,
    );
    setModalCreationVisible(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.titre}>Planning</Text>
          <Text style={styles.sousTitre}>Semaine du 16 juin</Text>
        </View>
        <TouchableOpacity
          style={styles.btnPlus}
          activeOpacity={0.7}
          onPress={ouvrirCreation}
        >
          <Text style={styles.btnPlusTexte}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.semaineRow}>
        {JOURS_SEMAINE.map((jour, i) => {
          const date = DATES[i];
          const estSelectionne = date === jourSelectionne;
          const estAujourdhui = date === 16;
          const aEv = objStore.evenements.some((e) => e.jour === date);
          return (
            <TouchableOpacity
              key={date}
              style={[styles.jourPill, estSelectionne && styles.jourPillActif]}
              onPress={() => setJourSelectionne(date)}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.jourNom, estSelectionne && styles.jourNomActif]}
              >
                {jour}
              </Text>
              <Text
                style={[
                  styles.jourDate,
                  estSelectionne && styles.jourDateActif,
                  estAujourdhui && !estSelectionne && styles.jourDateAujourdhui,
                ]}
              >
                {date}
              </Text>
              {aEv && (
                <View
                  style={[
                    styles.jourDot,
                    { backgroundColor: estSelectionne ? "#fff" : PURPLE },
                  ]}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView style={styles.timeline} showsVerticalScrollIndicator={false}>
        <View style={styles.timelineInner}>
          <View style={styles.heuresCol}>
            {HEURES.map((h) => (
              <View key={h} style={styles.heureRow}>
                <Text style={styles.heureTexte}>{h}</Text>
              </View>
            ))}
          </View>

          <View style={styles.eventsCol}>
            {HEURES.map((h) => (
              <View key={h} style={styles.ligneFond} />
            ))}

            {evsDuJour.map((ev) => {
              const minutes = heureEnMinutes(ev.heure);
              const offsetMinutes = minutes - HEURE_DEBUT * 60;
              const top = (offsetMinutes / 60) * HAUTEUR_HEURE;
              const height = Math.max(ev.duree * HAUTEUR_HEURE - 4, 40);

              return (
                <TouchableOpacity
                  key={ev.id}
                  style={[
                    styles.eventCard,
                    {
                      top,
                      height,
                      backgroundColor: ev.couleur + "22",
                      borderLeftColor: ev.couleur,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <View style={styles.eventTopRow}>
                    <Text
                      style={[styles.eventTitre, { color: ev.couleur }]}
                      numberOfLines={1}
                    >
                      {ev.nom}
                    </Text>
                    {ev.estFinancier && (
                      <View
                        style={[
                          styles.badgeFinancier,
                          { backgroundColor: ev.couleur },
                        ]}
                      >
                        <Text style={styles.badgeFinancierTexte}>
                          {ev.montant}€
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.eventHeure}>{ev.heure}</Text>
                </TouchableOpacity>
              );
            })}

            {evsDuJour.length === 0 && (
              <View style={styles.videContainer}>
                <Text style={styles.videTexte}>Aucun événement</Text>
                <TouchableOpacity
                  style={styles.ajouterBtn}
                  activeOpacity={0.7}
                  onPress={ouvrirCreation}
                >
                  <Text style={styles.ajouterTexte}>+ Ajouter</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>

      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={ACCESSORY_ID}>
          <View style={styles.accessoryBar}>
            <Text style={styles.accessoryTexte}>Terminé</Text>
          </View>
        </InputAccessoryView>
      )}

      {/* Modal création événement — multi-étapes */}
      <Modal
        visible={modalCreationVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalCreationVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalOverlayTouch}>
            <View style={styles.modalCard}>
              {etapeCreation === "infos" && (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitre}>Nouvel événement</Text>
                    <TouchableOpacity
                      onPress={() => setModalCreationVisible(false)}
                      activeOpacity={0.6}
                    >
                      <Text style={styles.btnFermerCroix}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    <Text style={styles.modalLabel}>Nom de l'événement</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Ex : Anniversaire de Camille"
                      placeholderTextColor="#CCC"
                      value={nomEvent}
                      onChangeText={setNomEvent}
                      returnKeyType="done"
                    />

                    <Text style={styles.modalLabel}>Jour</Text>
                    <View style={styles.joursGrid}>
                      {DATES.map((d, i) => (
                        <TouchableOpacity
                          key={d}
                          style={[
                            styles.jourChoix,
                            jourEvent === d && styles.jourChoixActif,
                          ]}
                          onPress={() => setJourEvent(d)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.jourChoixTexte,
                              jourEvent === d && styles.jourChoixTexteActif,
                            ]}
                          >
                            {JOURS_SEMAINE[i]} {d}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={styles.modalLabel}>Heure</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Ex : 14h30"
                      placeholderTextColor="#CCC"
                      value={heureEvent}
                      onChangeText={setHeureEvent}
                      returnKeyType="done"
                    />

                    <Text style={styles.modalLabel}>Durée (en heures)</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={dureeEvent}
                      onChangeText={setDureeEvent}
                      returnKeyType="done"
                      inputAccessoryViewID={ACCESSORY_ID}
                    />

                    <Text style={styles.modalLabel}>Couleur</Text>
                    <View style={styles.paletteGrid}>
                      {PALETTE_COULEURS.map((c) => (
                        <TouchableOpacity
                          key={c}
                          style={[
                            styles.swatch,
                            { backgroundColor: c },
                            couleurEvent === c && styles.swatchSelectionne,
                          ]}
                          onPress={() => setCouleurEvent(c)}
                          activeOpacity={0.7}
                        />
                      ))}
                    </View>

                    <TouchableOpacity
                      style={styles.btnSuivant}
                      onPress={validerInfos}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.btnSuivantTexte}>Continuer</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </>
              )}

              {etapeCreation === "financier" && (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitre}>{nomEvent}</Text>
                    <TouchableOpacity
                      onPress={() => setModalCreationVisible(false)}
                      activeOpacity={0.6}
                    >
                      <Text style={styles.btnFermerCroix}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.questionFinanciere}>
                    Ça va coûter de l'argent ?
                  </Text>

                  <TouchableOpacity
                    style={styles.choixCard}
                    onPress={choisirNonFinancier}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.choixEmoji}>📅</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.choixTitre}>
                        Non, c'est juste un rappel
                      </Text>
                      <Text style={styles.choixSousTitre}>
                        Aucun impact sur le budget
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.choixCard, { backgroundColor: PEACH_LIGHT }]}
                    onPress={choisirFinancier}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.choixEmoji}>💶</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.choixTitre, { color: "#993C1D" }]}>
                        Oui, ça va me coûter de l'argent
                      </Text>
                      <Text style={styles.choixSousTitre}>
                        Sera ajouté à ton budget
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.btnAnnuler}
                    onPress={() => setEtapeCreation("infos")}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.btnAnnulerTexte}>Retour</Text>
                  </TouchableOpacity>
                </>
              )}

              {etapeCreation === "categorie" && (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitre}>Combien ça coûte ?</Text>
                    <TouchableOpacity
                      onPress={() => setModalCreationVisible(false)}
                      activeOpacity={0.6}
                    >
                      <Text style={styles.btnFermerCroix}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    <Text style={styles.modalLabel}>Montant</Text>
                    <View style={styles.modalInputRow}>
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        placeholder="Ex : 30"
                        placeholderTextColor="#CCC"
                        keyboardType="numeric"
                        value={montantEvent}
                        onChangeText={setMontantEvent}
                        returnKeyType="done"
                        autoFocus
                        inputAccessoryViewID={ACCESSORY_ID}
                      />
                      <Text style={styles.modalEuro}>€</Text>
                    </View>

                    <Text style={styles.modalLabel}>
                      Lier à une catégorie (optionnel)
                    </Text>
                    <View style={styles.categorieGrid}>
                      <TouchableOpacity
                        style={[
                          styles.categorieChip,
                          categorieEvent === "Aucune" &&
                            styles.categorieChipActif,
                        ]}
                        onPress={() => setCategorieEvent("Aucune")}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.categorieChipTexte,
                            categorieEvent === "Aucune" &&
                              styles.categorieChipTexteActif,
                          ]}
                        >
                          Aucune
                        </Text>
                      </TouchableOpacity>
                      {objStore.enveloppes.map((env) => (
                        <TouchableOpacity
                          key={env.id}
                          style={[
                            styles.categorieChip,
                            categorieEvent === env.nom && {
                              backgroundColor: env.couleur,
                            },
                          ]}
                          onPress={() => setCategorieEvent(env.nom)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.categorieChipTexte,
                              categorieEvent === env.nom && {
                                color: "#FFFFFF",
                              },
                            ]}
                          >
                            {env.nom}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={styles.modalAide}>
                      {categorieEvent === "Aucune"
                        ? `Une nouvelle ligne "${nomEvent}" apparaîtra dans tes dépenses prévues.`
                        : `Le montant sera ajouté à ta dépense "${categorieEvent}".`}
                    </Text>

                    <TouchableOpacity
                      style={styles.btnSuivant}
                      onPress={validerCreationFinanciere}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.btnSuivantTexte}>
                        Créer l'événement
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.btnAnnuler}
                      onPress={() => setEtapeCreation("financier")}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.btnAnnulerTexte}>Retour</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginTop: 60,
    marginBottom: 20,
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
  semaineRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    marginBottom: 16,
    gap: 4,
  },
  jourPill: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 14,
  },
  jourPillActif: { backgroundColor: PURPLE },
  jourNom: { fontSize: 10, color: "#999", marginBottom: 4, fontWeight: "500" },
  jourNomActif: { color: "#FFFFFF" },
  jourDate: { fontSize: 15, fontWeight: "600", color: "#1A1A1A" },
  jourDateActif: { color: "#FFFFFF" },
  jourDateAujourdhui: { color: PURPLE },
  jourDot: { width: 4, height: 4, borderRadius: 2, marginTop: 3 },
  timeline: { flex: 1, paddingHorizontal: 12 },
  timelineInner: { flexDirection: "row" },
  heuresCol: { width: 40 },
  heureRow: {
    height: HAUTEUR_HEURE,
    justifyContent: "flex-start",
    paddingTop: 4,
  },
  heureTexte: {
    fontSize: 11,
    color: "#BBBBBB",
    textAlign: "right",
    paddingRight: 8,
  },
  eventsCol: {
    flex: 1,
    position: "relative",
    minHeight: HAUTEUR_HEURE * HEURES.length,
  },
  ligneFond: {
    height: HAUTEUR_HEURE,
    borderTopWidth: 0.5,
    borderTopColor: "#F0EEF8",
  },
  eventCard: {
    position: "absolute",
    left: 4,
    right: 4,
    borderRadius: 10,
    borderLeftWidth: 3,
    padding: 8,
    justifyContent: "center",
  },
  eventTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  eventTitre: { fontSize: 13, fontWeight: "600", flex: 1 },
  badgeFinancier: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  badgeFinancierTexte: { fontSize: 10, fontWeight: "700", color: "#FFFFFF" },
  eventHeure: { fontSize: 11, color: "#999" },
  videContainer: {
    position: "absolute",
    top: 80,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  videTexte: { fontSize: 13, color: "#CCC", marginBottom: 12 },
  ajouterBtn: {
    backgroundColor: PURPLE_LIGHT,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  ajouterTexte: { fontSize: 13, color: PURPLE, fontWeight: "500" },
  accessoryBar: {
    backgroundColor: "#F7F7F7",
    padding: 10,
    alignItems: "flex-end",
    borderTopWidth: 0.5,
    borderTopColor: "#DDD",
  },
  accessoryTexte: { color: PURPLE, fontSize: 17, fontWeight: "700" },
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
    paddingBottom: 30,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitre: { fontSize: 21, fontWeight: "700", color: "#1A1A1A", flex: 1 },
  btnFermerCroix: { fontSize: 18, color: "#BBB", padding: 4 },
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
  modalAide: { fontSize: 12, color: "#AAA", lineHeight: 18, marginBottom: 14 },
  input: {
    backgroundColor: "#F7F7F7",
    borderRadius: 13,
    padding: 16,
    fontSize: 17,
    color: "#1A1A1A",
    marginBottom: 12,
  },
  joursGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 6,
  },
  jourChoix: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#F7F7F7",
  },
  jourChoixActif: { backgroundColor: PURPLE },
  jourChoixTexte: { fontSize: 13, color: "#999", fontWeight: "600" },
  jourChoixTexteActif: { color: "#FFFFFF" },
  paletteGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 11,
    marginBottom: 6,
  },
  swatch: { width: 36, height: 36, borderRadius: 18 },
  swatchSelectionne: { borderWidth: 3, borderColor: "#1A1A1A" },
  btnSuivant: {
    backgroundColor: PURPLE,
    borderRadius: 16,
    padding: 17,
    alignItems: "center",
    marginTop: 10,
  },
  btnSuivantTexte: { fontSize: 17, color: "#FFFFFF", fontWeight: "700" },
  btnAnnuler: {
    padding: 15,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 6,
  },
  btnAnnulerTexte: { fontSize: 15, color: "#999", fontWeight: "600" },
  questionFinanciere: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 16,
    textAlign: "center",
  },
  choixCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#F7F7F7",
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },
  choixEmoji: { fontSize: 26 },
  choixTitre: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 2,
  },
  choixSousTitre: { fontSize: 12, color: "#999" },
  categorieGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 6,
  },
  categorieChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "#F7F7F7",
  },
  categorieChipActif: { backgroundColor: PURPLE },
  categorieChipTexte: { fontSize: 13, color: "#999", fontWeight: "600" },
  categorieChipTexteActif: { color: "#FFFFFF" },
});
