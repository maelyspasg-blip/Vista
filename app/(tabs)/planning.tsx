import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const PURPLE = "#8B6FE8";
const PURPLE_LIGHT = "#F0EEFF";
const MINT = "#5DC8A0";
const MINT_LIGHT = "#E8F8F2";
const PEACH = "#F4956A";
const PEACH_LIGHT = "#FFF0EA";

const JOURS_SEMAINE = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const DATES = [16, 17, 18, 19, 20, 21, 22];

const EVENEMENTS = [
  {
    id: 1,
    jour: 16,
    titre: "Standup équipe",
    heure: "9h00",
    duree: 1,
    couleur: PURPLE,
    bg: PURPLE_LIGHT,
  },
  {
    id: 2,
    jour: 16,
    titre: "Déjeuner Sophie",
    heure: "12h30",
    duree: 1.5,
    couleur: MINT,
    bg: MINT_LIGHT,
  },
  {
    id: 3,
    jour: 17,
    titre: "Présentation Q2",
    heure: "14h00",
    duree: 2,
    couleur: PEACH,
    bg: PEACH_LIGHT,
  },
  {
    id: 4,
    jour: 18,
    titre: "Yoga",
    heure: "18h30",
    duree: 1,
    couleur: MINT,
    bg: MINT_LIGHT,
  },
  {
    id: 5,
    jour: 19,
    titre: "Réunion client",
    heure: "10h00",
    duree: 1.5,
    couleur: PURPLE,
    bg: PURPLE_LIGHT,
  },
  {
    id: 6,
    jour: 20,
    titre: "Sport",
    heure: "8h00",
    duree: 1,
    couleur: PEACH,
    bg: PEACH_LIGHT,
  },
  {
    id: 7,
    jour: 20,
    titre: "Dentiste",
    heure: "15h00",
    duree: 1,
    couleur: MINT,
    bg: MINT_LIGHT,
  },
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

export default function Planning() {
  const [jourSelectionne, setJourSelectionne] = useState(16);

  const evsDuJour = EVENEMENTS.filter((e) => e.jour === jourSelectionne);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.titre}>Planning</Text>
          <Text style={styles.sousTitre}>Semaine du 16 juin</Text>
        </View>
        <TouchableOpacity style={styles.btnPlus} activeOpacity={0.7}>
          <Text style={styles.btnPlusTexte}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Sélecteur de jours */}
      <View style={styles.semaineRow}>
        {JOURS_SEMAINE.map((jour, i) => {
          const date = DATES[i];
          const estSelectionne = date === jourSelectionne;
          const estAujourdhui = date === 16;
          const aEv = EVENEMENTS.some((e) => e.jour === date);
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

      {/* Timeline */}
      <ScrollView style={styles.timeline} showsVerticalScrollIndicator={false}>
        <View style={styles.timelineInner}>
          {/* Colonne heures */}
          <View style={styles.heuresCol}>
            {HEURES.map((h) => (
              <View key={h} style={styles.heureRow}>
                <Text style={styles.heureTexte}>{h}</Text>
              </View>
            ))}
          </View>

          {/* Colonne événements */}
          <View style={styles.eventsCol}>
            {/* Lignes de fond */}
            {HEURES.map((h) => (
              <View key={h} style={styles.ligneFond} />
            ))}

            {/* Événements */}
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
                      backgroundColor: ev.bg,
                      borderLeftColor: ev.couleur,
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.eventTitre, { color: ev.couleur }]}
                    numberOfLines={1}
                  >
                    {ev.titre}
                  </Text>
                  <Text style={styles.eventHeure}>{ev.heure}</Text>
                </TouchableOpacity>
              );
            })}

            {evsDuJour.length === 0 && (
              <View style={styles.videContainer}>
                <Text style={styles.videTexte}>Aucun événement</Text>
                <TouchableOpacity style={styles.ajouterBtn} activeOpacity={0.7}>
                  <Text style={styles.ajouterTexte}>+ Ajouter</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
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
  sousTitre: {
    fontSize: 13,
    color: "#999",
    marginTop: 2,
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
  jourPillActif: {
    backgroundColor: PURPLE,
  },
  jourNom: {
    fontSize: 10,
    color: "#999",
    marginBottom: 4,
    fontWeight: "500",
  },
  jourNomActif: {
    color: "#FFFFFF",
  },
  jourDate: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1A1A1A",
  },
  jourDateActif: {
    color: "#FFFFFF",
  },
  jourDateAujourdhui: {
    color: PURPLE,
  },
  jourDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 3,
  },
  timeline: {
    flex: 1,
    paddingHorizontal: 12,
  },
  timelineInner: {
    flexDirection: "row",
  },
  heuresCol: {
    width: 40,
  },
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
  eventTitre: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 2,
  },
  eventHeure: {
    fontSize: 11,
    color: "#999",
  },
  videContainer: {
    position: "absolute",
    top: 80,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  videTexte: {
    fontSize: 13,
    color: "#CCC",
    marginBottom: 12,
  },
  ajouterBtn: {
    backgroundColor: PURPLE_LIGHT,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  ajouterTexte: {
    fontSize: 13,
    color: PURPLE,
    fontWeight: "500",
  },
});
