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
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useObjectifs } from "../store";

const PURPLE = "#8B6FE8";
const PURPLE_LIGHT = "#F0EEFF";
const PEACH_LIGHT = "#FFF0EA";

const JOURS_SEMAINE = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
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
const HAUTEUR_HEURE = 56;

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

const ACCESSORY_ID = "numericDone";
const AUJOURDHUI = new Date(2026, 5, 27);

function heureEnMinutes(heure: string): number {
  const [h, m] = heure.replace("h", ":").split(":");
  return parseInt(h) * 60 + (parseInt(m) || 0);
}

function dateVersJourMois(date: Date) {
  return { jour: date.getDate() };
}

function formaterDateAffichage(date: Date) {
  const jours = [
    "dimanche",
    "lundi",
    "mardi",
    "mercredi",
    "jeudi",
    "vendredi",
    "samedi",
  ];
  const mois = [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
  ];
  const nomJour = jours[date.getDay()];
  return `${nomJour.charAt(0).toUpperCase() + nomJour.slice(1)} ${date.getDate()} ${mois[date.getMonth()]}`;
}

function memeJour(d1: Date, d2: Date) {
  return (
    d1.getDate() === d2.getDate() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getFullYear() === d2.getFullYear()
  );
}

function debutSemaine(date: Date) {
  const d = new Date(date);
  const jourSemaine = d.getDay();
  const decalage = jourSemaine === 0 ? -6 : 1 - jourSemaine;
  d.setDate(d.getDate() + decalage);
  return d;
}

function obtenirGrilleMoisComplete(date: Date) {
  const annee = date.getFullYear();
  const mois = date.getMonth();
  const premierJour = new Date(annee, mois, 1);
  const dernierJour = new Date(annee, mois + 1, 0);
  const decalageDebut =
    premierJour.getDay() === 0 ? 6 : premierJour.getDay() - 1;

  const jours: Date[] = [];
  for (let i = decalageDebut; i > 0; i--) {
    const d = new Date(annee, mois, 1 - i);
    jours.push(d);
  }
  for (let i = 1; i <= dernierJour.getDate(); i++) {
    jours.push(new Date(annee, mois, i));
  }
  while (jours.length % 7 !== 0 || jours.length < 35) {
    const dernier = jours[jours.length - 1];
    const suivant = new Date(dernier);
    suivant.setDate(dernier.getDate() + 1);
    jours.push(suivant);
  }
  return jours;
}

type EvenementUnifie = {
  id: string;
  nom: string;
  heure: string;
  duree: number;
  couleur: string;
  estFinancier: boolean;
  montant?: number;
  touteLaJournee: boolean;
  date: Date;
};

export default function Planning() {
  const objStore = useObjectifs();

  const [vue, setVue] = useState<"jour" | "semaine" | "mois">("jour");
  const [dateActuelle, setDateActuelle] = useState(new Date(2026, 5, 27));

  const [modalCreationVisible, setModalCreationVisible] = useState(false);
  const [etapeCreation, setEtapeCreation] = useState<
    "infos" | "financier" | "categorie"
  >("infos");
  const [nomEvent, setNomEvent] = useState("");
  const [heureEvent, setHeureEvent] = useState("9h00");
  const [dureeEvent, setDureeEvent] = useState("1");
  const [dateEvent, setDateEvent] = useState(new Date());
  const [couleurEvent, setCouleurEvent] = useState(PALETTE_COULEURS[0]);
  const [montantEvent, setMontantEvent] = useState("");
  const [categorieEvent, setCategorieEvent] = useState("Aucune");
  const [creationRapide, setCreationRapide] = useState(false);

  const tousLesEvenements: EvenementUnifie[] = [];

  objStore.evenements.forEach((e) => {
    const d = new Date(2026, 5, e.jour);
    tousLesEvenements.push({
      id: `manuel-${e.id}`,
      nom: e.nom,
      heure: e.heure,
      duree: e.duree,
      couleur: e.couleur,
      estFinancier: e.estFinancier,
      montant: e.montant,
      touteLaJournee: false,
      date: d,
    });
  });

  objStore.enveloppes
    .filter((e) => e.type === "Fixe" && e.afficherDansPlanning && e.dateFixe)
    .forEach((e) => {
      const d = new Date(e.dateFixe!);
      tousLesEvenements.push({
        id: `env-${e.id}`,
        nom: e.nom,
        heure: "",
        duree: 0,
        couleur: e.couleur,
        estFinancier: true,
        montant: e.budget,
        touteLaJournee: true,
        date: d,
      });
    });

  objStore.historiquePaiements.forEach((p) => {
    const d = new Date(p.date);
    tousLesEvenements.push({
      id: `histo-${p.id}`,
      nom: `${p.nom} ✓`,
      heure: "",
      duree: 0,
      couleur: "#BBBBBB",
      estFinancier: true,
      montant: p.montant,
      touteLaJournee: true,
      date: d,
    });
  });

  const evsJour = (date: Date) =>
    tousLesEvenements.filter((e) => memeJour(e.date, date));
  const evsToutLaJourneeJour = (date: Date) =>
    evsJour(date).filter((e) => e.touteLaJournee);
  const evsHorairesJour = (date: Date) =>
    evsJour(date).filter((e) => !e.touteLaJournee);

  const allerPrecedent = () => {
    const d = new Date(dateActuelle);
    if (vue === "jour") d.setDate(d.getDate() - 1);
    else if (vue === "semaine") d.setDate(d.getDate() - 7);
    else d.setMonth(d.getMonth() - 1);
    setDateActuelle(d);
  };
  const allerSuivant = () => {
    const d = new Date(dateActuelle);
    if (vue === "jour") d.setDate(d.getDate() + 1);
    else if (vue === "semaine") d.setDate(d.getDate() + 7);
    else d.setMonth(d.getMonth() + 1);
    setDateActuelle(d);
  };

  const gesteSwipe = Gesture.Pan()
    .activeOffsetX([-40, 40])
    .failOffsetY([-12, 12])
    .minDistance(40)
    .onEnd((e) => {
      const vitesseOk = Math.abs(e.velocityX) > 200;
      if (vitesseOk && e.translationX < -70) allerSuivant();
      else if (vitesseOk && e.translationX > 70) allerPrecedent();
    });

  const ouvrirJour = (date: Date) => {
    setDateActuelle(date);
    setVue("jour");
  };

  const ouvrirCreationComplete = () => {
    setNomEvent("");
    setHeureEvent("9h00");
    setDureeEvent("1");
    setDateEvent(dateActuelle);
    setCouleurEvent(PALETTE_COULEURS[0]);
    setMontantEvent("");
    setCategorieEvent("Aucune");
    setCreationRapide(false);
    setEtapeCreation("infos");
    setModalCreationVisible(true);
  };

  const ouvrirCreationRapide = (heureTexte: string) => {
    setNomEvent("");
    setHeureEvent(heureTexte);
    setDureeEvent("1");
    setDateEvent(dateActuelle);
    setCouleurEvent(PALETTE_COULEURS[0]);
    setCreationRapide(true);
    setEtapeCreation("infos");
    setModalCreationVisible(true);
  };

  const validerInfos = () => {
    if (!nomEvent) return;
    if (creationRapide) {
      const { jour } = dateVersJourMois(dateEvent);
      objStore.ajouterEvenement(
        nomEvent,
        jour,
        heureEvent,
        parseFloat(dureeEvent) || 1,
        couleurEvent,
        false,
      );
      setModalCreationVisible(false);
      return;
    }
    setEtapeCreation("financier");
  };

  const choisirNonFinancier = () => {
    const { jour } = dateVersJourMois(dateEvent);
    objStore.ajouterEvenement(
      nomEvent,
      jour,
      heureEvent,
      parseFloat(dureeEvent) || 1,
      couleurEvent,
      false,
    );
    setModalCreationVisible(false);
  };

  const choisirFinancier = () => setEtapeCreation("categorie");

  const validerCreationFinanciere = () => {
    if (!montantEvent) return;
    const { jour } = dateVersJourMois(dateEvent);
    objStore.ajouterEvenement(
      nomEvent,
      jour,
      heureEvent,
      parseFloat(dureeEvent) || 1,
      couleurEvent,
      true,
      parseFloat(montantEvent),
      categorieEvent,
    );
    setModalCreationVisible(false);
  };

  function calculerPositions(evs: EvenementUnifie[]) {
    const groupes: EvenementUnifie[][] = [];
    const tries = [...evs].sort(
      (a, b) => heureEnMinutes(a.heure) - heureEnMinutes(b.heure),
    );

    tries.forEach((ev) => {
      const debut = heureEnMinutes(ev.heure);
      const fin = debut + ev.duree * 60;
      let placeDansGroupe = false;
      for (const groupe of groupes) {
        const chevauche = groupe.some((autre) => {
          const aDebut = heureEnMinutes(autre.heure);
          const aFin = aDebut + autre.duree * 60;
          return debut < aFin && fin > aDebut;
        });
        if (chevauche) {
          groupe.push(ev);
          placeDansGroupe = true;
          break;
        }
      }
      if (!placeDansGroupe) groupes.push([ev]);
    });

    const positions: {
      ev: EvenementUnifie;
      top: number;
      height: number;
      left: string;
      width: string;
    }[] = [];
    groupes.forEach((groupe) => {
      const nb = groupe.length;
      groupe.forEach((ev, i) => {
        const debut = heureEnMinutes(ev.heure);
        const offsetMinutes = debut - HEURE_DEBUT * 60;
        const top = (offsetMinutes / 60) * HAUTEUR_HEURE;
        const height = Math.max(ev.duree * HAUTEUR_HEURE - 4, 36);
        const largeurPct = 100 / nb;
        positions.push({
          ev,
          top,
          height,
          left: `${i * largeurPct}%`,
          width: `${largeurPct - 2}%`,
        });
      });
    });
    return positions;
  }

  const libelleEnTete = () => {
    if (vue === "jour") return formaterDateAffichage(dateActuelle);
    if (vue === "semaine") {
      const debut = debutSemaine(dateActuelle);
      const fin = new Date(debut);
      fin.setDate(debut.getDate() + 6);
      const mois = [
        "jan",
        "fév",
        "mar",
        "avr",
        "mai",
        "jun",
        "jul",
        "aoû",
        "sep",
        "oct",
        "nov",
        "déc",
      ];
      return `${debut.getDate()} ${mois[debut.getMonth()]} – ${fin.getDate()} ${mois[fin.getMonth()]}`;
    }
    return dateActuelle.toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.titre}>Planning</Text>
        <TouchableOpacity
          style={styles.btnPlus}
          activeOpacity={0.7}
          onPress={ouvrirCreationComplete}
        >
          <Text style={styles.btnPlusTexte}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabsRow}>
        {(["jour", "semaine", "mois"] as const).map((v) => (
          <TouchableOpacity
            key={v}
            style={[styles.tabBtn, vue === v && styles.tabBtnActif]}
            onPress={() => setVue(v)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabTexte, vue === v && styles.tabTexteActif]}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.dayHeader}>
        <Text
          style={[
            styles.dayTitle,
            vue === "mois" && { textTransform: "capitalize" },
          ]}
        >
          {libelleEnTete()}
        </Text>
        <View style={styles.dayNav}>
          <TouchableOpacity
            style={styles.navArrow}
            onPress={allerPrecedent}
            activeOpacity={0.7}
          >
            <Text style={styles.navArrowTexte}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navArrow}
            onPress={allerSuivant}
            activeOpacity={0.7}
          >
            <Text style={styles.navArrowTexte}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      <GestureDetector gesture={gesteSwipe}>
        <View style={{ flex: 1 }}>
          {vue === "jour" && (
            <View style={{ flex: 1 }}>
              {evsToutLaJourneeJour(dateActuelle).length > 0 && (
                <View style={styles.alldayZone}>
                  {evsToutLaJourneeJour(dateActuelle).map((ev) => (
                    <View
                      key={ev.id}
                      style={[
                        styles.alldayPill,
                        { backgroundColor: ev.couleur + "22" },
                      ]}
                    >
                      <Text style={styles.alldayPin}>📌</Text>
                      <Text style={[styles.alldayNom, { color: ev.couleur }]}>
                        {ev.nom} — toute la journée
                      </Text>
                      {ev.montant && (
                        <Text
                          style={[styles.alldayMontant, { color: ev.couleur }]}
                        >
                          {ev.montant}€
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              )}

              <ScrollView
                style={styles.timeline}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.timelineInner}>
                  <View style={styles.heuresCol}>
                    {HEURES.map((h) => (
                      <View key={h} style={styles.heureRow}>
                        <Text style={styles.heureTexte}>{h}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.eventsCol}>
                    {HEURES.map((h, i) => (
                      <TouchableOpacity
                        key={h}
                        style={styles.ligneFond}
                        activeOpacity={0.5}
                        onPress={() =>
                          ouvrirCreationRapide(`${HEURE_DEBUT + i}h00`)
                        }
                      />
                    ))}
                    {calculerPositions(evsHorairesJour(dateActuelle)).map(
                      ({ ev, top, height, left, width }) => (
                        <TouchableOpacity
                          key={ev.id}
                          style={[
                            styles.eventCard,
                            {
                              top,
                              height,
                              left: left as any,
                              width: width as any,
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
                      ),
                    )}
                  </View>
                </View>
                <View style={{ height: 40 }} />
              </ScrollView>
            </View>
          )}

          {vue === "semaine" && (
            <ScrollView
              style={styles.timeline}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.weekHeadRow}>
                <View style={{ width: 32 }} />
                {Array.from({ length: 7 }, (_, i) => {
                  const debut = debutSemaine(dateActuelle);
                  const jourDate = new Date(debut);
                  jourDate.setDate(debut.getDate() + i);
                  const estAujourdhui = memeJour(jourDate, AUJOURDHUI);
                  return (
                    <TouchableOpacity
                      key={i}
                      style={styles.weekHeadCol}
                      activeOpacity={0.7}
                      onPress={() => ouvrirJour(jourDate)}
                    >
                      <Text style={styles.weekHeadNom}>{JOURS_SEMAINE[i]}</Text>
                      <Text
                        style={[
                          styles.weekHeadNum,
                          estAujourdhui && styles.weekHeadNumToday,
                        ]}
                      >
                        {jourDate.getDate()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.timelineInner}>
                <View style={styles.heuresCol}>
                  {HEURES.map((h) => (
                    <View key={h} style={styles.heureRow}>
                      <Text style={styles.heureTexte}>{h}</Text>
                    </View>
                  ))}
                </View>

                {Array.from({ length: 7 }, (_, i) => {
                  const debut = debutSemaine(dateActuelle);
                  const jourDate = new Date(debut);
                  jourDate.setDate(debut.getDate() + i);
                  const evsToutLaJourneeCol = evsToutLaJourneeJour(jourDate);
                  const evsJourCol = evsHorairesJour(jourDate);
                  const positions = calculerPositions(evsJourCol);

                  return (
                    <View key={i} style={styles.weekDayTimelineCol}>
                      {evsToutLaJourneeCol.length > 0 && (
                        <View style={styles.weekAlldayZone}>
                          {evsToutLaJourneeCol.map((ev) => (
                            <View
                              key={ev.id}
                              style={[
                                styles.weekAlldayPill,
                                { backgroundColor: ev.couleur + "33" },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.weekAlldayTexte,
                                  { color: ev.couleur },
                                ]}
                                numberOfLines={1}
                              >
                                {ev.nom}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}
                      {HEURES.map((h, hi) => (
                        <TouchableOpacity
                          key={h}
                          style={styles.ligneFondSemaine}
                          activeOpacity={0.5}
                          onPress={() => {
                            setDateActuelle(jourDate);
                            ouvrirCreationRapide(`${HEURE_DEBUT + hi}h00`);
                          }}
                        />
                      ))}
                      {positions.map(({ ev, top, height, left, width }) => (
                        <View
                          key={ev.id}
                          style={[
                            styles.weekEventBlock,
                            {
                              top,
                              height,
                              left: left as any,
                              width: width as any,
                              backgroundColor: ev.couleur + "33",
                              borderLeftColor: ev.couleur,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.weekEventBlockTexte,
                              { color: ev.couleur },
                            ]}
                            numberOfLines={2}
                          >
                            {ev.nom}
                          </Text>
                        </View>
                      ))}
                    </View>
                  );
                })}
              </View>
              <View style={{ height: 40 }} />
            </ScrollView>
          )}

          {vue === "mois" && (
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.monthDayHeadRow}>
                {JOURS_SEMAINE.map((j) => (
                  <Text key={j} style={styles.monthDayHead}>
                    {j.charAt(0)}
                  </Text>
                ))}
              </View>
              <View style={styles.monthGrid}>
                {obtenirGrilleMoisComplete(dateActuelle).map((jourDate, i) => {
                  const estAujourdhui = memeJour(jourDate, AUJOURDHUI);
                  const estMoisActuel =
                    jourDate.getMonth() === dateActuelle.getMonth();
                  const evsToutLaJourneeMois = evsToutLaJourneeJour(jourDate);
                  const evsHorairesMois = evsHorairesJour(jourDate);
                  const evs = [...evsToutLaJourneeMois, ...evsHorairesMois];

                  return (
                    <TouchableOpacity
                      key={i}
                      style={styles.monthCell}
                      activeOpacity={0.7}
                      onPress={() => ouvrirJour(jourDate)}
                    >
                      <Text
                        style={[
                          styles.monthNum,
                          estAujourdhui && styles.monthNumToday,
                          !estMoisActuel && styles.monthNumHorsMois,
                        ]}
                      >
                        {jourDate.getDate()}
                      </Text>
                      {evs.slice(0, 2).map((ev) => (
                        <View
                          key={ev.id}
                          style={[
                            styles.monthEventLine,
                            { backgroundColor: ev.couleur + "22" },
                          ]}
                        >
                          <Text
                            style={[
                              styles.monthEventTexte,
                              { color: ev.couleur },
                            ]}
                            numberOfLines={1}
                          >
                            {ev.nom.slice(0, 8)}
                            {ev.nom.length > 8 ? "…" : ""}
                          </Text>
                        </View>
                      ))}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </View>
      </GestureDetector>

      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={ACCESSORY_ID}>
          <View style={styles.accessoryBar}>
            <Text style={styles.accessoryTexte}>Terminé</Text>
          </View>
        </InputAccessoryView>
      )}

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
                      autoFocus
                    />

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

                    {!creationRapide && (
                      <>
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
                      </>
                    )}

                    <TouchableOpacity
                      style={styles.btnSuivant}
                      onPress={validerInfos}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.btnSuivantTexte}>
                        {creationRapide ? "Créer l'événement" : "Continuer"}
                      </Text>
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
                      {objStore.enveloppes
                        .filter((e) => e.type === "Variable")
                        .map((env) => (
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
  container: { flex: 1, backgroundColor: "#FFFFFF", paddingHorizontal: 16 },
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
  tabsRow: {
    flexDirection: "row",
    backgroundColor: "#F7F7F7",
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: "center",
  },
  tabBtnActif: { backgroundColor: "#FFFFFF" },
  tabTexte: { fontSize: 13, color: "#999", fontWeight: "600" },
  tabTexteActif: { color: PURPLE },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  dayTitle: { fontSize: 16, fontWeight: "600", color: "#1A1A1A" },
  dayNav: { flexDirection: "row", gap: 8 },
  navArrow: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#F7F7F7",
    alignItems: "center",
    justifyContent: "center",
  },
  navArrowTexte: { fontSize: 18, color: PURPLE, fontWeight: "700" },
  alldayZone: {
    borderWidth: 0.5,
    borderColor: "#F0EEF8",
    borderBottomWidth: 0,
    borderRadius: 14,
    padding: 8,
    paddingBottom: 4,
  },
  alldayPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    padding: 8,
    marginBottom: 4,
  },
  alldayPin: { fontSize: 11 },
  alldayNom: { flex: 1, fontSize: 12, fontWeight: "600" },
  alldayMontant: { fontSize: 12, fontWeight: "700" },
  timeline: { flex: 1 },
  timelineInner: { flexDirection: "row" },
  heuresCol: { width: 32 },
  heureRow: {
    height: HAUTEUR_HEURE,
    justifyContent: "flex-start",
    paddingTop: 4,
  },
  heureTexte: {
    fontSize: 10,
    color: "#BBBBBB",
    textAlign: "right",
    paddingRight: 4,
  },
  eventsCol: { flex: 1, position: "relative" },
  ligneFond: {
    height: HAUTEUR_HEURE,
    borderTopWidth: 0.5,
    borderTopColor: "#F0EEF8",
  },
  eventCard: {
    position: "absolute",
    borderRadius: 8,
    borderLeftWidth: 3,
    padding: 6,
    justifyContent: "center",
  },
  eventTopRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  eventTitre: { fontSize: 11, fontWeight: "600", flex: 1 },
  badgeFinancier: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 },
  badgeFinancierTexte: { fontSize: 9, fontWeight: "700", color: "#FFFFFF" },
  eventHeure: { fontSize: 9, color: "#999" },
  weekHeadRow: { flexDirection: "row", marginBottom: 4 },
  weekHeadCol: { flex: 1, alignItems: "center", paddingVertical: 6 },
  weekHeadNom: { fontSize: 9, color: "#999" },
  weekHeadNum: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1A1A1A",
    marginTop: 2,
  },
  weekHeadNumToday: { color: PURPLE },
  weekDayTimelineCol: {
    flex: 1,
    position: "relative",
    borderLeftWidth: 0.5,
    borderLeftColor: "#F5F5F5",
  },
  weekAlldayZone: { paddingVertical: 2, paddingHorizontal: 2 },
  weekAlldayPill: {
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 2,
    marginBottom: 2,
  },
  weekAlldayTexte: { fontSize: 8, fontWeight: "700" },
  ligneFondSemaine: {
    height: HAUTEUR_HEURE,
    borderTopWidth: 0.5,
    borderTopColor: "#F0EEF8",
  },
  weekEventBlock: {
    position: "absolute",
    borderRadius: 6,
    borderLeftWidth: 2,
    padding: 3,
    justifyContent: "center",
  },
  weekEventBlockTexte: { fontSize: 9, fontWeight: "600" },
  monthDayHeadRow: { flexDirection: "row", marginBottom: 4 },
  monthDayHead: { flex: 1, textAlign: "center", fontSize: 10, color: "#999" },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 0.5,
    borderColor: "#F0EEF8",
    borderRadius: 14,
    overflow: "hidden",
  },
  monthCell: {
    width: "14.28%",
    minHeight: 62,
    borderWidth: 0.25,
    borderColor: "#F0EEF8",
    padding: 3,
  },
  monthNum: { fontSize: 10, color: "#999" },
  monthNumToday: { color: PURPLE, fontWeight: "700" },
  monthNumHorsMois: { color: "#DDD" },
  monthEventLine: { borderRadius: 3, paddingHorizontal: 2, marginTop: 2 },
  monthEventTexte: { fontSize: 7, fontWeight: "600" },
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
