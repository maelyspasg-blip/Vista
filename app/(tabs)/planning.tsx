import { Ionicons } from "@expo/vector-icons";
import { formaterMontant, parseMontant, sanitizeMontantInput } from "../../utils/montant";
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { ReactNode, useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";
import { Calendar } from "react-native-calendars";
import { ColorPicker, PALETTE_COULEURS } from "../ColorPicker";
import { usePagerSwipe } from "../PagerSwipeContext";
import {
  demanderPermissionNotifications,
  programmerNotificationsEvenement,
} from "../notifications";
import { Evenement, useObjectifs } from "../store";
import { useTheme } from "../ThemeContext";
import { useAccessibilite } from "../AccessibiliteContext";
import { BoutonPrincipal } from "../BoutonPrincipal";
import { Text } from "../Texte";
import { TextInput } from "../TexteInput";

type FrequenceEvenement = "jour" | "semaine" | "mois" | "an";

const JOURS_SEMAINE = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const HEURES = Array.from({ length: 24 }, (_, i) => `${i}h`);
const HEURE_DEBUT = 0;
const HAUTEUR_HEURE = 56;
// Décalage de défilement initial pour ouvrir la grille sur les heures de
// la journée plutôt qu'à minuit — la grille reste entièrement scrollable
// vers 0h-8h et 20h-23h59.
const HEURE_SCROLL_INITIAL = 8;

const ACCESSORY_ID = "numericDone";
const AUJOURDHUI = new Date();

function heureEnMinutes(heure: string): number {
  const [h, m] = heure.replace("h", ":").split(":");
  return parseInt(h) * 60 + (parseInt(m) || 0);
}

function dateVersISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function premierJourMoisISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function genererOccurrencesEvenement(
  dateDebut: Date,
  frequence: FrequenceEvenement,
  debutFenetre: Date,
  finFenetre: Date,
): Date[] {
  const occurrences: Date[] = [];
  const debut = new Date(dateDebut);
  debut.setHours(0, 0, 0, 0);

  if (frequence === "jour") {
    const cursor = new Date(Math.max(debut.getTime(), debutFenetre.getTime()));
    while (cursor <= finFenetre) {
      occurrences.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return occurrences;
  }

  const cursor = new Date(debut);
  let iterations = 0;
  while (cursor <= finFenetre && iterations < 1000) {
    if (cursor >= debutFenetre) occurrences.push(new Date(cursor));
    if (frequence === "semaine") cursor.setDate(cursor.getDate() + 7);
    else if (frequence === "mois") cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setFullYear(cursor.getFullYear() + 1);
    iterations++;
  }
  return occurrences;
}

function formaterDateCourte(date: Date): string {
  const texte = date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return texte.charAt(0).toUpperCase() + texte.slice(1);
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

function decouperEnSemaines(jours: Date[]): Date[][] {
  const semaines: Date[][] = [];
  for (let i = 0; i < jours.length; i += 7) {
    semaines.push(jours.slice(i, i + 7));
  }
  return semaines;
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
  modifiable: boolean;
  evenementId?: string;
};

/**
 * Remplace TouchableOpacity dans les zones couvertes par `gesteSwipe` :
 * TouchableOpacity gère le tap via l'ancien système de responder RN,
 * indépendamment de Gesture.Pan — un swipe qui reste sous le seuil
 * d'activation du Pan (40px) déclenche quand même onPress au relâchement,
 * même après un déplacement horizontal net. Gesture.Tap().requireExternalGestureToFail(gesteSwipe)
 * force le tap à attendre que gesteSwipe ait explicitement échoué à
 * s'activer avant de se déclencher, ce qui distingue correctement les deux.
 */
function TapZone({
  onTap,
  gesteExterne,
  style,
  opaciteAuToucher = 1,
  children,
}: {
  onTap: () => void;
  gesteExterne: ReturnType<typeof Gesture.Pan>;
  style?: StyleProp<ViewStyle>;
  opaciteAuToucher?: number;
  children?: ReactNode;
}) {
  const [presse, setPresse] = useState(false);

  const geste = Gesture.Tap()
    .requireExternalGestureToFail(gesteExterne)
    .onBegin(() => {
      scheduleOnRN(setPresse, true);
    })
    .onFinalize(() => {
      scheduleOnRN(setPresse, false);
    })
    .onEnd((_e, succes) => {
      if (succes) scheduleOnRN(onTap);
    });

  return (
    <GestureDetector gesture={geste}>
      <View style={[style, presse && { opacity: opaciteAuToucher }]}>
        {children}
      </View>
    </GestureDetector>
  );
}

export default function Planning() {
  const objStore = useObjectifs();
  const { theme, couleurs: C } = useTheme();
  const { reduireAnimations } = useAccessibilite();
  const router = useRouter();
  const params = useLocalSearchParams<{ editEventId?: string }>();
  const { setSwipeOngletsActif } = usePagerSwipe();

  const [vue, setVue] = useState<"jour" | "semaine" | "mois">("jour");
  const [dateActuelle, setDateActuelle] = useState(new Date());
  const [maintenant, setMaintenant] = useState(() => new Date());

  useEffect(() => {
    const intervalle = setInterval(() => setMaintenant(new Date()), 60000);
    return () => clearInterval(intervalle);
  }, []);

  const [modalCreationVisible, setModalCreationVisible] = useState(false);
  const [nomEvent, setNomEvent] = useState("");
  const [heureEvent, setHeureEvent] = useState("9h00");
  const [dureeEvent, setDureeEvent] = useState("1");
  const [dateEvent, setDateEvent] = useState(new Date());
  const [multiJoursEvent, setMultiJoursEvent] = useState(false);
  const [dateFinEvent, setDateFinEvent] = useState(new Date());
  const [calendrierOuvert, setCalendrierOuvert] = useState<
    "aucun" | "debut" | "fin"
  >("aucun");
  const [couleurEvent, setCouleurEvent] = useState(PALETTE_COULEURS[0]);
  const [estFinancierEvent, setEstFinancierEvent] = useState(false);
  const [typeFinancierEvent, setTypeFinancierEvent] = useState<
    "depense" | "entree"
  >("depense");
  const [montantEvent, setMontantEvent] = useState("");
  const [categorieEvent, setCategorieEvent] = useState("");
  const [creationCategorieOuverte, setCreationCategorieOuverte] =
    useState(false);
  const [nomNouvelleCategorie, setNomNouvelleCategorie] = useState("");
  const [creationCategorieEnCours, setCreationCategorieEnCours] =
    useState(false);
  const [recurrentEvent, setRecurrentEvent] = useState(false);
  const [frequenceEvent, setFrequenceEvent] =
    useState<FrequenceEvenement>("semaine");
  const [journeeEntiereEvent, setJourneeEntiereEvent] = useState(false);
  const [notifierEvent, setNotifierEvent] = useState(false);
  const [evenementEnEditionId, setEvenementEnEditionId] = useState<
    string | null
  >(null);
  const [creationEvenementEnCours, setCreationEvenementEnCours] =
    useState(false);

  const tousLesEvenements: EvenementUnifie[] = [];

  const anneeVue = dateActuelle.getFullYear();
  const moisVue = dateActuelle.getMonth();
  const debutFenetreRecurrence = new Date(anneeVue, moisVue - 2, 1);
  const finFenetreRecurrence = new Date(anneeVue, moisVue + 3, 0);
  finFenetreRecurrence.setHours(23, 59, 59, 999);

  objStore.evenements.forEach((e) => {
    const dateDebut = new Date(e.date);
    dateDebut.setHours(0, 0, 0, 0);
    const dateFinBase = e.dateFin ? new Date(e.dateFin) : null;
    if (dateFinBase) dateFinBase.setHours(0, 0, 0, 0);
    const nbJoursSupplementaires = dateFinBase
      ? Math.round((dateFinBase.getTime() - dateDebut.getTime()) / 86400000)
      : 0;

    const pousserOccurrence = (debutOccurrence: Date) => {
      const jours =
        nbJoursSupplementaires > 0
          ? Array.from({ length: nbJoursSupplementaires + 1 }, (_, k) => {
              const d = new Date(debutOccurrence);
              d.setDate(d.getDate() + k);
              return d;
            })
          : [debutOccurrence];

      jours.forEach((d, k) => {
        tousLesEvenements.push({
          id: `manuel-${e.id}-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
          nom: e.nom,
          heure: e.heure,
          duree: e.duree,
          couleur: e.couleur,
          // Le montant n'est compté qu'une fois, le premier jour de l'événement.
          estFinancier: k === 0 ? e.estFinancier : false,
          montant: k === 0 ? e.montant : undefined,
          touteLaJournee: nbJoursSupplementaires > 0 ? true : e.touteLaJournee ?? false,
          date: d,
          modifiable: true,
          evenementId: e.id,
        });
      });
    };

    if (e.recurrent && e.frequence) {
      const occurrences = genererOccurrencesEvenement(
        dateDebut,
        e.frequence,
        debutFenetreRecurrence,
        finFenetreRecurrence,
      );
      occurrences.forEach((d) => pousserOccurrence(d));
    } else {
      pousserOccurrence(dateDebut);
    }
  });

  objStore.enveloppes
    .filter((e) => e.type === "Fixe" && e.afficherDansPlanning && e.dateFixe)
    .forEach((e) => {
      const dateOrigine = new Date(e.dateFixe!);
      if (e.repeteChaqueMois) {
        const jour = dateOrigine.getDate();
        for (let offset = -2; offset <= 2; offset++) {
          const d = new Date(anneeVue, moisVue + offset, jour);
          const dejaPayeeCeMois = objStore.historiquePaiements.some(
            (p) =>
              p.enveloppeId === e.id &&
              new Date(p.date).getMonth() === d.getMonth() &&
              new Date(p.date).getFullYear() === d.getFullYear(),
          );
          if (dejaPayeeCeMois) continue;
          tousLesEvenements.push({
            id: `env-${e.id}-${d.getFullYear()}-${d.getMonth()}`,
            nom: e.nom,
            heure: "",
            duree: 0,
            couleur: e.couleur,
            estFinancier: true,
            montant: e.budget,
            touteLaJournee: true,
            date: d,
            modifiable: false,
          });
        }
      } else {
        tousLesEvenements.push({
          id: `env-${e.id}`,
          nom: e.nom,
          heure: "",
          duree: 0,
          couleur: e.couleur,
          estFinancier: true,
          montant: e.budget,
          touteLaJournee: true,
          date: dateOrigine,
          modifiable: false,
        });
      }
    });

  objStore.objectifs
    .filter((o) => o.recurrent && o.montantMensuel && o.jourDuMois)
    .forEach((o) => {
      for (let offset = -2; offset <= 2; offset++) {
        const d = new Date(anneeVue, moisVue + offset, o.jourDuMois!);
        tousLesEvenements.push({
          id: `objectif-${o.id}-${d.getFullYear()}-${d.getMonth()}`,
          nom: `Épargne : ${o.nom}`,
          heure: "",
          duree: 0,
          couleur: o.couleur,
          estFinancier: true,
          montant: o.montantMensuel,
          touteLaJournee: true,
          date: d,
          modifiable: false,
        });
      }
    });

  objStore.historiquePaiements.forEach((p) => {
    const d = new Date(p.date);
    tousLesEvenements.push({
      id: `histo-${p.id}`,
      nom: p.nom,
      heure: "",
      duree: 0,
      couleur: "#BBBBBB",
      estFinancier: true,
      montant: p.montant,
      touteLaJournee: true,
      date: d,
      modifiable: false,
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
    .hitSlop({ left: -24, right: -24 })
    .onBegin(() => {
      // Coupe le swipe natif entre onglets pendant tout le toucher dans
      // cette zone, pour que le PagerView ne capte jamais le même geste
      // que la navigation jour/semaine.
      scheduleOnRN(setSwipeOngletsActif, false);
    })
    .onFinalize(() => {
      scheduleOnRN(setSwipeOngletsActif, true);
    })
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
    setMultiJoursEvent(false);
    setDateFinEvent(dateActuelle);
    setCalendrierOuvert("aucun");
    setCouleurEvent(PALETTE_COULEURS[0]);
    setEstFinancierEvent(false);
    setTypeFinancierEvent("depense");
    setMontantEvent("");
    setCategorieEvent("");
    setCreationCategorieOuverte(false);
    setNomNouvelleCategorie("");
    setRecurrentEvent(false);
    setFrequenceEvent("semaine");
    setJourneeEntiereEvent(false);
    setNotifierEvent(false);
    setEvenementEnEditionId(null);
    setModalCreationVisible(true);
  };

  const ouvrirCreationRapide = (heureTexte: string, date: Date = dateActuelle) => {
    setNomEvent("");
    setHeureEvent(heureTexte);
    setDureeEvent("1");
    setDateEvent(date);
    setMultiJoursEvent(false);
    setDateFinEvent(date);
    setCalendrierOuvert("aucun");
    setCouleurEvent(PALETTE_COULEURS[0]);
    setEstFinancierEvent(false);
    setTypeFinancierEvent("depense");
    setMontantEvent("");
    setCategorieEvent("");
    setCreationCategorieOuverte(false);
    setNomNouvelleCategorie("");
    setRecurrentEvent(false);
    setFrequenceEvent("semaine");
    setJourneeEntiereEvent(false);
    setNotifierEvent(false);
    setEvenementEnEditionId(null);
    setModalCreationVisible(true);
  };

  const ouvrirEditionEvenement = (ev: Evenement) => {
    setEvenementEnEditionId(ev.id);
    setNomEvent(ev.nom);
    setDateEvent(new Date(ev.date));
    setMultiJoursEvent(!!ev.dateFin);
    setDateFinEvent(new Date(ev.dateFin ?? ev.date));
    setCalendrierOuvert("aucun");
    setHeureEvent(ev.heure || "9h00");
    setDureeEvent(String(ev.duree || 1));
    setCouleurEvent(ev.couleur);
    setJourneeEntiereEvent(ev.touteLaJournee ?? false);
    setEstFinancierEvent(ev.estFinancier);
    const enveloppeLiee = objStore.enveloppes.find(
      (env) => env.nom === ev.categorieLiee,
    );
    setTypeFinancierEvent(enveloppeLiee?.type === "Entrée" ? "entree" : "depense");
    setMontantEvent(ev.montant ? String(ev.montant) : "");
    setCategorieEvent(ev.categorieLiee ?? "");
    setCreationCategorieOuverte(false);
    setNomNouvelleCategorie("");
    setRecurrentEvent(ev.recurrent ?? false);
    setFrequenceEvent(ev.frequence ?? "semaine");
    setNotifierEvent(ev.notifierActif ?? false);
    setModalCreationVisible(true);
  };

  useFocusEffect(
    useCallback(() => {
      if (!params.editEventId) return;
      const source = objStore.evenements.find(
        (e) => e.id === params.editEventId,
      );
      if (source) ouvrirEditionEvenement(source);
      router.setParams({ editEventId: undefined });
    }, [params.editEventId]),
  );

  const sauvegarderModificationEvenement = () => {
    if (!nomEvent || evenementEnEditionId === null) return;
    const montant = estFinancierEvent ? parseMontant(montantEvent) || 0 : undefined;
    objStore.modifierEvenement(evenementEnEditionId, {
      nom: nomEvent,
      date: dateVersISO(dateEvent),
      dateFin: multiJoursEvent ? dateVersISO(dateFinEvent) : undefined,
      heure: heureEvent,
      duree: parseFloat(dureeEvent) || 1,
      couleur: couleurEvent,
      touteLaJournee: journeeEntiereEvent || multiJoursEvent,
      estFinancier: estFinancierEvent,
      montant,
      categorieLiee: estFinancierEvent ? categorieEvent : undefined,
      recurrent: recurrentEvent,
      frequence: recurrentEvent ? frequenceEvent : undefined,
      notifierActif: notifierEvent,
    });
    setModalCreationVisible(false);
  };

  const supprimerEvenementEnEdition = () => {
    if (evenementEnEditionId === null) return;
    objStore.supprimerEvenement(evenementEnEditionId);
    setModalCreationVisible(false);
  };

  const dupliquerEvenement = () => {
    setEvenementEnEditionId(null);
    setDateEvent(dateActuelle);
    setMultiJoursEvent(false);
    setDateFinEvent(dateActuelle);
    setCalendrierOuvert("aucun");
  };

  const gererClicEvenement = (ev: EvenementUnifie) => {
    if (!ev.modifiable) {
      router.push("/");
      return;
    }
    const source = objStore.evenements.find((e) => e.id === ev.evenementId);
    if (!source) return;
    ouvrirEditionEvenement(source);
  };

  const finaliserCreationEvenement = async () => {
    if (creationEvenementEnCours) return;
    setCreationEvenementEnCours(true);
    const montant = estFinancierEvent ? parseMontant(montantEvent) || 0 : undefined;
    const nouvel = await objStore.ajouterEvenement({
      nom: nomEvent,
      date: dateVersISO(dateEvent),
      dateFin: multiJoursEvent ? dateVersISO(dateFinEvent) : undefined,
      heure: heureEvent,
      duree: parseFloat(dureeEvent) || 1,
      couleur: couleurEvent,
      estFinancier: estFinancierEvent,
      montant,
      categorieLiee: estFinancierEvent ? categorieEvent : undefined,
      recurrent: recurrentEvent,
      frequence: recurrentEvent ? frequenceEvent : undefined,
      touteLaJournee: journeeEntiereEvent || multiJoursEvent,
      notifierActif: notifierEvent,
    });
    setCreationEvenementEnCours(false);
    if (!nouvel) return;
    if (notifierEvent && !recurrentEvent && objStore.notificationsActives) {
      const autorise = await demanderPermissionNotifications();
      if (autorise) {
        await programmerNotificationsEvenement(nouvel.id, nomEvent, dateEvent);
      }
    }
    setModalCreationVisible(false);
  };

  const choisirCouleurAutomatique = () => {
    const couleursUtilisees = new Set(
      objStore.enveloppes.map((env) => env.couleur),
    );
    const disponible = PALETTE_COULEURS.find(
      (c) => !couleursUtilisees.has(c),
    );
    return (
      disponible ??
      PALETTE_COULEURS[objStore.enveloppes.length % PALETTE_COULEURS.length]
    );
  };

  const creerNouvelleCategorieInline = async () => {
    const nom = nomNouvelleCategorie.trim();
    if (!nom || creationCategorieEnCours) return;
    setCreationCategorieEnCours(true);
    const nouvelle = await objStore.ajouterEnveloppe({
      nom,
      depense: 0,
      budget: parseMontant(montantEvent) || 0,
      couleur: choisirCouleurAutomatique(),
      type: typeFinancierEvent === "entree" ? "Entrée" : "Variable",
      recurrente: false,
      // Une catégorie Variable non récurrente n'a pas de date naturelle —
      // rattachée à son mois de création pour expirer correctement de "Tes
      // catégories" (cf. utils/budget.ts:estCategorieActiveCeMois).
      moisComptage:
        typeFinancierEvent === "entree" ? undefined : premierJourMoisISO(new Date()),
    });
    setCreationCategorieEnCours(false);
    if (!nouvelle) return;
    setCategorieEvent(nouvelle.nom);
    setNomNouvelleCategorie("");
    setCreationCategorieOuverte(false);
  };

  const validerInfos = () => {
    if (!nomEvent) return;
    if (estFinancierEvent && !montantEvent) return;
    if (estFinancierEvent && !categorieEvent) return;
    if (evenementEnEditionId !== null) {
      sauvegarderModificationEvenement();
      return;
    }
    finaliserCreationEvenement();
  };

  const fermerModalCreationAvecSauvegarde = () => {
    validerInfos();
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
      const memeMois =
        debut.getMonth() === fin.getMonth() &&
        debut.getFullYear() === fin.getFullYear();
      if (memeMois) {
        return `${debut.getDate()} – ${fin.getDate()} ${mois[fin.getMonth()]}`;
      }
      return `${debut.getDate()} ${mois[debut.getMonth()]} – ${fin.getDate()} ${mois[fin.getMonth()]}`;
    }
    return dateActuelle.toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
    });
  };

  const debutSemaineVue = debutSemaine(dateActuelle);
  const joursSemaineVue = Array.from({ length: 7 }, (_, i) => {
    const jourDate = new Date(debutSemaineVue);
    jourDate.setDate(debutSemaineVue.getDate() + i);
    return {
      jourDate,
      estAujourdhui: memeJour(jourDate, AUJOURDHUI),
      evsToutLaJournee: evsToutLaJourneeJour(jourDate),
      positions: calculerPositions(evsHorairesJour(jourDate)),
    };
  });
  const semaineADesEvenementsJourEntier = joursSemaineVue.some(
    (j) => j.evsToutLaJournee.length > 0,
  );

  const minutesActuelles = maintenant.getHours() * 60 + maintenant.getMinutes();
  const ligneActuelleVisible =
    minutesActuelles >= HEURE_DEBUT * 60 &&
    minutesActuelles <= (HEURE_DEBUT + HEURES.length) * 60;
  const topLigneActuelle =
    ((minutesActuelles - HEURE_DEBUT * 60) / 60) * HAUTEUR_HEURE;
  const teinteAujourdhui =
    theme === "sombre" ? "rgba(139,111,232,0.3)" : "#E3DDFB";

  return (
    <View style={[styles.container, { backgroundColor: C.fondPage }]}>
      <View style={styles.header}>
        <Text style={[styles.titre, { color: C.texte }]}>Planning</Text>
        <TouchableOpacity
          style={[styles.btnPlus, { backgroundColor: C.purple }]}
          activeOpacity={0.7}
          onPress={ouvrirCreationComplete}
        >
          <Text style={styles.btnPlusTexte}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.tabsRow, { backgroundColor: C.fondSecondaire }]}>
        {(["jour", "semaine", "mois"] as const).map((v) => (
          <TouchableOpacity
            key={v}
            style={[
              styles.tabBtn,
              vue === v && [styles.tabBtnActif, { backgroundColor: C.carte }],
            ]}
            onPress={() => setVue(v)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.tabTexte,
                { color: C.texteMuted },
                vue === v && { color: C.purple },
              ]}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.dayHeader}>
        <Text
          style={[
            styles.dayTitle,
            { color: C.texte },
            vue === "mois" && { textTransform: "capitalize" },
          ]}
        >
          {libelleEnTete()}
        </Text>
        <View style={styles.dayNav}>
          <TouchableOpacity
            style={[styles.navArrow, { backgroundColor: C.fondSecondaire }]}
            onPress={allerPrecedent}
            activeOpacity={0.7}
          >
            <Text style={[styles.navArrowTexte, { color: C.purple }]}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navArrow, { backgroundColor: C.fondSecondaire }]}
            onPress={allerSuivant}
            activeOpacity={0.7}
          >
            <Text style={[styles.navArrowTexte, { color: C.purple }]}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      <GestureDetector gesture={gesteSwipe}>
        <View style={{ flex: 1 }}>
          {vue === "jour" && (
            <View style={{ flex: 1 }}>
              {evsToutLaJourneeJour(dateActuelle).length > 0 && (
                <View
                  style={[styles.alldayZone, { borderColor: C.separateur }]}
                >
                  {evsToutLaJourneeJour(dateActuelle).map((ev) => (
                    <TapZone
                      key={ev.id}
                      gesteExterne={gesteSwipe}
                      style={[
                        styles.alldayPill,
                        { backgroundColor: ev.couleur + "22" },
                      ]}
                      opaciteAuToucher={0.7}
                      onTap={() => gererClicEvenement(ev)}
                    >
                      <Ionicons
                        name="pin-outline"
                        size={12}
                        color={C.texte}
                        style={styles.alldayPin}
                      />
                      <Text style={[styles.alldayNom, { color: ev.couleur }]}>
                        {ev.nom} — toute la journée
                      </Text>
                      {ev.montant && (
                        <Text
                          style={[styles.alldayMontant, { color: ev.couleur }]}
                        >
                          {formaterMontant(ev.montant)}€
                        </Text>
                      )}
                    </TapZone>
                  ))}
                </View>
              )}

              <ScrollView
                style={styles.timeline}
                showsVerticalScrollIndicator={false}
                contentOffset={{ x: 0, y: HEURE_SCROLL_INITIAL * HAUTEUR_HEURE }}
              >
                <View style={styles.timelineInner}>
                  <View style={styles.heuresCol}>
                    {HEURES.map((h) => (
                      <View key={h} style={styles.heureRow}>
                        <Text style={[styles.heureTexte, { color: C.texteMuted }]}>
                          {h}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.eventsCol}>
                    {HEURES.map((h, i) => (
                      <TapZone
                        key={h}
                        gesteExterne={gesteSwipe}
                        style={[styles.ligneFond, { borderTopColor: C.separateur }]}
                        opaciteAuToucher={0.5}
                        onTap={() => ouvrirCreationRapide(`${HEURE_DEBUT + i}h00`)}
                      />
                    ))}
                    {calculerPositions(evsHorairesJour(dateActuelle)).map(
                      ({ ev, top, height, left, width }) => (
                        <TapZone
                          key={ev.id}
                          gesteExterne={gesteSwipe}
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
                          opaciteAuToucher={0.7}
                          onTap={() => gererClicEvenement(ev)}
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
                                  {formaterMontant(ev.montant ?? 0)}€
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text style={[styles.eventHeure, { color: C.texteMuted }]}>
                            {ev.heure}
                          </Text>
                        </TapZone>
                      ),
                    )}
                    {memeJour(dateActuelle, AUJOURDHUI) &&
                      ligneActuelleVisible && (
                        <View
                          style={[
                            styles.ligneActuelle,
                            { top: topLigneActuelle },
                          ]}
                        >
                          <View style={styles.ligneActuellePoint} />
                        </View>
                      )}
                  </View>
                </View>
                <View style={{ height: 40 }} />
              </ScrollView>
            </View>
          )}

          {vue === "semaine" && (
            <>
              <View style={styles.weekHeadRow}>
                <View style={{ width: 32 }} />
                {joursSemaineVue.map(({ jourDate, estAujourdhui }, i) => (
                  <TapZone
                    key={i}
                    gesteExterne={gesteSwipe}
                    style={[
                      styles.weekHeadCol,
                      estAujourdhui && { backgroundColor: teinteAujourdhui },
                    ]}
                    opaciteAuToucher={0.7}
                    onTap={() => ouvrirJour(jourDate)}
                  >
                    <Text style={[styles.weekHeadNom, { color: C.texteMuted }]}>
                      {JOURS_SEMAINE[i]}
                    </Text>
                    <Text
                      style={[
                        styles.weekHeadNum,
                        { color: C.texte },
                        estAujourdhui && [
                          styles.weekHeadNumAujourdhui,
                          { backgroundColor: C.purple, color: "#FFFFFF" },
                        ],
                      ]}
                    >
                      {jourDate.getDate()}
                    </Text>
                  </TapZone>
                ))}
              </View>

              {semaineADesEvenementsJourEntier && (
                <View
                  style={[styles.weekAlldayRow, { borderColor: C.separateur }]}
                >
                  <View style={{ width: 32 }} />
                  {joursSemaineVue.map(({ evsToutLaJournee }, i) => (
                    <View key={i} style={styles.weekAlldayCol}>
                      {evsToutLaJournee.map((ev) => (
                        <TapZone
                          key={ev.id}
                          gesteExterne={gesteSwipe}
                          style={[
                            styles.weekAlldayPill,
                            { backgroundColor: ev.couleur + "33" },
                          ]}
                          opaciteAuToucher={0.7}
                          onTap={() => gererClicEvenement(ev)}
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
                        </TapZone>
                      ))}
                    </View>
                  ))}
                </View>
              )}

              <ScrollView
                style={styles.timeline}
                showsVerticalScrollIndicator={false}
                contentOffset={{ x: 0, y: HEURE_SCROLL_INITIAL * HAUTEUR_HEURE }}
              >
              <View
                style={[
                  styles.timelineInner,
                  styles.weekTimelineInner,
                  { borderColor: C.separateur },
                ]}
              >
                <View style={styles.heuresCol}>
                  {HEURES.map((h) => (
                    <View key={h} style={styles.heureRow}>
                      <Text style={[styles.heureTexte, { color: C.texteMuted }]}>
                        {h}
                      </Text>
                    </View>
                  ))}
                </View>

                {joursSemaineVue.map(
                  ({ jourDate, estAujourdhui, positions }, i) => (
                    <View
                      key={i}
                      style={[
                        styles.weekDayTimelineCol,
                        { borderLeftColor: C.separateur },
                        estAujourdhui && {
                          backgroundColor: teinteAujourdhui,
                        },
                      ]}
                    >
                      {HEURES.map((h, hi) => (
                        <TapZone
                          key={h}
                          gesteExterne={gesteSwipe}
                          style={[
                            styles.ligneFondSemaine,
                            { borderTopColor: C.separateur },
                          ]}
                          opaciteAuToucher={0.5}
                          onTap={() => {
                            setDateActuelle(jourDate);
                            ouvrirCreationRapide(
                              `${HEURE_DEBUT + hi}h00`,
                              jourDate,
                            );
                          }}
                        />
                      ))}
                      {positions.map(({ ev, top, height, left, width }) => (
                        <TapZone
                          key={ev.id}
                          gesteExterne={gesteSwipe}
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
                          opaciteAuToucher={0.7}
                          onTap={() => gererClicEvenement(ev)}
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
                        </TapZone>
                      ))}
                      {estAujourdhui && ligneActuelleVisible && (
                        <View
                          style={[
                            styles.ligneActuelle,
                            { top: topLigneActuelle },
                          ]}
                        >
                          <View style={styles.ligneActuellePoint} />
                        </View>
                      )}
                    </View>
                  ),
                )}
              </View>
              <View style={{ height: 40 }} />
            </ScrollView>
            </>
          )}

          {vue === "mois" && (
            <View style={{ flex: 1 }}>
              <View style={styles.monthDayHeadRow}>
                {JOURS_SEMAINE.map((j) => (
                  <Text
                    key={j}
                    style={[styles.monthDayHead, { color: C.texteMuted }]}
                  >
                    {j.charAt(0)}
                  </Text>
                ))}
              </View>
              <View style={[styles.monthGrid, { borderColor: C.separateur }]}>
                {decouperEnSemaines(obtenirGrilleMoisComplete(dateActuelle)).map(
                  (semaine, si) => (
                    <View key={si} style={styles.monthRow}>
                      {semaine.map((jourDate, di) => {
                        const estAujourdhui = memeJour(jourDate, AUJOURDHUI);
                        const estMoisActuel =
                          jourDate.getMonth() === dateActuelle.getMonth();
                        const evsToutLaJourneeMois =
                          evsToutLaJourneeJour(jourDate);
                        const evsHorairesMois = evsHorairesJour(jourDate);
                        const evs = [...evsToutLaJourneeMois, ...evsHorairesMois];
                        const evsVisibles = evs.slice(0, 3);
                        const nbSupplementaires = evs.length - evsVisibles.length;

                        return (
                          <TapZone
                            key={di}
                            gesteExterne={gesteSwipe}
                            style={[
                              styles.monthCell,
                              { borderColor: C.separateur },
                              estAujourdhui && {
                                backgroundColor: teinteAujourdhui,
                              },
                            ]}
                            opaciteAuToucher={0.7}
                            onTap={() => ouvrirJour(jourDate)}
                          >
                            <Text
                              style={[
                                styles.monthNum,
                                { color: C.texteMuted },
                                !estMoisActuel && styles.monthNumHorsMois,
                              ]}
                            >
                              {jourDate.getDate()}
                            </Text>
                            {evsVisibles.map((ev) => (
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
                                  {ev.nom}
                                </Text>
                              </View>
                            ))}
                            {nbSupplementaires > 0 && (
                              <Text
                                style={[
                                  styles.monthEventPlus,
                                  { color: C.texteMuted },
                                ]}
                              >
                                +{nbSupplementaires}
                              </Text>
                            )}
                          </TapZone>
                        );
                      })}
                    </View>
                  ),
                )}
              </View>
            </View>
          )}
        </View>
      </GestureDetector>

      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={ACCESSORY_ID}>
          <View
            style={[
              styles.accessoryBar,
              { backgroundColor: C.fondSecondaire, borderTopColor: C.separateur },
            ]}
          >
            <TouchableOpacity onPress={() => Keyboard.dismiss()}>
              <Text style={[styles.accessoryTexte, { color: C.purple }]}>
                Terminé
              </Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}

      <Modal
        visible={modalCreationVisible}
        animationType={reduireAnimations ? "none" : "slide"}
        transparent
        onRequestClose={() => setModalCreationVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <TouchableOpacity
            style={styles.modalOverlayTouch}
            activeOpacity={1}
            onPress={fermerModalCreationAvecSauvegarde}
          >
            <TouchableOpacity
              style={[styles.modalCard, { backgroundColor: C.carte }]}
              activeOpacity={1}
              onPress={() => {}}
            >
              <>
                  <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitre, { color: C.texte }]}>
                      {evenementEnEditionId !== null
                        ? "Modifier l'événement"
                        : "Nouvel événement"}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setModalCreationVisible(false)}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel="Fermer"
                    >
                      <Ionicons name="close" size={20} color={C.texteMuted} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    <Text style={[styles.modalLabel, { color: C.texteMuted }]}>
                      Nom de l'événement
                    </Text>
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: C.fondSecondaire, color: C.texte },
                      ]}
                      placeholder="Ex : Anniversaire de Camille"
                      placeholderTextColor={C.texteMuted}
                      value={nomEvent}
                      onChangeText={setNomEvent}
                      returnKeyType="done"
                      autoFocus
                    />

                    {!multiJoursEvent ? (
                      <>
                        <Text
                          style={[styles.modalLabel, { color: C.texteMuted }]}
                        >
                          Date
                        </Text>
                        <TouchableOpacity
                          style={[
                            styles.dateChamp,
                            { backgroundColor: C.fondSecondaire },
                          ]}
                          onPress={() =>
                            setCalendrierOuvert(
                              calendrierOuvert === "debut" ? "aucun" : "debut",
                            )
                          }
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.dateChampTexte, { color: C.texte }]}>
                            {formaterDateCourte(dateEvent)}
                          </Text>
                          <Ionicons
                            name="calendar-outline"
                            size={18}
                            color={C.texteMuted}
                          />
                        </TouchableOpacity>
                        {calendrierOuvert === "debut" && (
                          <View
                            style={[
                              styles.calendarWrap,
                              { borderColor: C.separateur },
                            ]}
                          >
                            <Calendar
                              current={dateVersISO(dateEvent)}
                              onDayPress={(day) => {
                                setDateEvent(new Date(day.dateString));
                                setCalendrierOuvert("aucun");
                              }}
                              markedDates={{
                                [dateVersISO(dateEvent)]: {
                                  selected: true,
                                  selectedColor: C.purple,
                                },
                              }}
                              theme={{
                                calendarBackground: C.carte,
                                dayTextColor: C.texte,
                                monthTextColor: C.texte,
                                textDisabledColor: C.texteMuted,
                                textSectionTitleColor: C.texteMuted,
                                selectedDayTextColor: "#FFFFFF",
                                selectedDayBackgroundColor: C.purple,
                                todayTextColor: C.purple,
                                arrowColor: C.purple,
                              }}
                            />
                          </View>
                        )}
                        <TouchableOpacity
                          onPress={() => {
                            setMultiJoursEvent(true);
                            setDateFinEvent(dateEvent);
                            setJourneeEntiereEvent(true);
                            setCalendrierOuvert("aucun");
                          }}
                          activeOpacity={0.6}
                        >
                          <Text style={[styles.lienDiscret, { color: C.purple }]}>
                            Sur plusieurs jours
                          </Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <>
                        <View style={styles.dateDuAuRow}>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.modalLabel,
                                { color: C.texteMuted },
                              ]}
                            >
                              Du
                            </Text>
                            <TouchableOpacity
                              style={[
                                styles.dateChamp,
                                { backgroundColor: C.fondSecondaire },
                              ]}
                              onPress={() =>
                                setCalendrierOuvert(
                                  calendrierOuvert === "debut"
                                    ? "aucun"
                                    : "debut",
                                )
                              }
                              activeOpacity={0.7}
                            >
                              <Text
                                style={[
                                  styles.dateChampTexte,
                                  { color: C.texte },
                                ]}
                                numberOfLines={1}
                              >
                                {formaterDateCourte(dateEvent)}
                              </Text>
                            </TouchableOpacity>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.modalLabel,
                                { color: C.texteMuted },
                              ]}
                            >
                              Au
                            </Text>
                            <TouchableOpacity
                              style={[
                                styles.dateChamp,
                                { backgroundColor: C.fondSecondaire },
                              ]}
                              onPress={() =>
                                setCalendrierOuvert(
                                  calendrierOuvert === "fin" ? "aucun" : "fin",
                                )
                              }
                              activeOpacity={0.7}
                            >
                              <Text
                                style={[
                                  styles.dateChampTexte,
                                  { color: C.texte },
                                ]}
                                numberOfLines={1}
                              >
                                {formaterDateCourte(dateFinEvent)}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        {calendrierOuvert === "debut" && (
                          <View
                            style={[
                              styles.calendarWrap,
                              { borderColor: C.separateur },
                            ]}
                          >
                            <Calendar
                              current={dateVersISO(dateEvent)}
                              onDayPress={(day) => {
                                const d = new Date(day.dateString);
                                setDateEvent(d);
                                if (dateFinEvent < d) setDateFinEvent(d);
                                setCalendrierOuvert("aucun");
                              }}
                              markedDates={{
                                [dateVersISO(dateEvent)]: {
                                  selected: true,
                                  selectedColor: C.purple,
                                },
                              }}
                              theme={{
                                calendarBackground: C.carte,
                                dayTextColor: C.texte,
                                monthTextColor: C.texte,
                                textDisabledColor: C.texteMuted,
                                textSectionTitleColor: C.texteMuted,
                                selectedDayTextColor: "#FFFFFF",
                                selectedDayBackgroundColor: C.purple,
                                todayTextColor: C.purple,
                                arrowColor: C.purple,
                              }}
                            />
                          </View>
                        )}
                        {calendrierOuvert === "fin" && (
                          <View
                            style={[
                              styles.calendarWrap,
                              { borderColor: C.separateur },
                            ]}
                          >
                            <Calendar
                              current={dateVersISO(dateFinEvent)}
                              minDate={dateVersISO(dateEvent)}
                              onDayPress={(day) => {
                                const d = new Date(day.dateString);
                                if (d < dateEvent) return;
                                setDateFinEvent(d);
                                setCalendrierOuvert("aucun");
                              }}
                              markedDates={{
                                [dateVersISO(dateFinEvent)]: {
                                  selected: true,
                                  selectedColor: C.purple,
                                },
                              }}
                              theme={{
                                calendarBackground: C.carte,
                                dayTextColor: C.texte,
                                monthTextColor: C.texte,
                                textDisabledColor: C.texteMuted,
                                textSectionTitleColor: C.texteMuted,
                                selectedDayTextColor: "#FFFFFF",
                                selectedDayBackgroundColor: C.purple,
                                todayTextColor: C.purple,
                                arrowColor: C.purple,
                              }}
                            />
                          </View>
                        )}
                        <TouchableOpacity
                          onPress={() => {
                            setMultiJoursEvent(false);
                            setCalendrierOuvert("aucun");
                          }}
                          activeOpacity={0.6}
                        >
                          <Text style={[styles.lienDiscret, { color: C.purple }]}>
                            Revenir à un seul jour
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}

                    {!multiJoursEvent && (
                      <>
                        <View style={styles.switchRow}>
                          <View>
                            <Text
                              style={[styles.switchLabel, { color: C.texte }]}
                            >
                              Toute la journée
                            </Text>
                            <Text
                              style={[
                                styles.switchSub,
                                { color: C.texteMuted },
                              ]}
                            >
                              Sans horaire précis
                            </Text>
                          </View>
                          <Switch
                            value={journeeEntiereEvent}
                            onValueChange={setJourneeEntiereEvent}
                            trackColor={{
                              false: C.separateur,
                              true: C.purpleLight,
                            }}
                            thumbColor={journeeEntiereEvent ? C.purple : "#FFF"}
                          />
                        </View>

                        {!journeeEntiereEvent && (
                          <>
                            <Text
                              style={[
                                styles.modalLabel,
                                { color: C.texteMuted },
                              ]}
                            >
                              Heure
                            </Text>
                            <TextInput
                              style={[
                                styles.input,
                                {
                                  backgroundColor: C.fondSecondaire,
                                  color: C.texte,
                                },
                              ]}
                              placeholder="Ex : 14h30"
                              placeholderTextColor={C.texteMuted}
                              value={heureEvent}
                              onChangeText={setHeureEvent}
                              returnKeyType="done"
                            />

                            <Text
                              style={[
                                styles.modalLabel,
                                { color: C.texteMuted },
                              ]}
                            >
                              Durée (en heures)
                            </Text>
                            <TextInput
                              style={[
                                styles.input,
                                {
                                  backgroundColor: C.fondSecondaire,
                                  color: C.texte,
                                },
                              ]}
                              keyboardType="numeric"
                              value={dureeEvent}
                              onChangeText={setDureeEvent}
                              returnKeyType="done"
                              inputAccessoryViewID={ACCESSORY_ID}
                            />
                          </>
                        )}
                      </>
                    )}

                    <View style={styles.switchRow}>
                      <View>
                        <Text style={[styles.switchLabel, { color: C.texte }]}>
                          Ajouter une entrée ou dépense
                        </Text>
                        <Text style={[styles.switchSub, { color: C.texteMuted }]}>
                          Sera ajouté à ton budget
                        </Text>
                      </View>
                      <Switch
                        value={estFinancierEvent}
                        onValueChange={setEstFinancierEvent}
                        trackColor={{ false: C.separateur, true: C.purpleLight }}
                        thumbColor={estFinancierEvent ? C.purple : "#FFF"}
                      />
                    </View>

                    {estFinancierEvent && (
                      <>
                        <View style={styles.segmentRow}>
                          <TouchableOpacity
                            style={[
                              styles.segmentBtn,
                              { backgroundColor: C.fondSecondaire },
                              typeFinancierEvent === "depense" && {
                                backgroundColor: C.purple,
                              },
                            ]}
                            onPress={() => {
                              setTypeFinancierEvent("depense");
                              setCategorieEvent("");
                              setCreationCategorieOuverte(false);
                              setNomNouvelleCategorie("");
                            }}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.segmentBtnTexte,
                                { color: C.texteMuted },
                                typeFinancierEvent === "depense" && {
                                  color: "#FFFFFF",
                                },
                              ]}
                            >
                              En moins
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.segmentBtn,
                              { backgroundColor: C.fondSecondaire },
                              typeFinancierEvent === "entree" && {
                                backgroundColor: C.vert,
                              },
                            ]}
                            onPress={() => {
                              setTypeFinancierEvent("entree");
                              setCategorieEvent("");
                              setCreationCategorieOuverte(false);
                              setNomNouvelleCategorie("");
                            }}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.segmentBtnTexte,
                                { color: C.texteMuted },
                                typeFinancierEvent === "entree" && {
                                  color: "#FFFFFF",
                                },
                              ]}
                            >
                              En plus
                            </Text>
                          </TouchableOpacity>
                        </View>

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
                            placeholder="Ex : 30"
                            placeholderTextColor={C.texteMuted}
                            keyboardType="decimal-pad"
                            value={montantEvent}
                            onChangeText={(text) => setMontantEvent(sanitizeMontantInput(text))}
                            returnKeyType="done"
                            inputAccessoryViewID={ACCESSORY_ID}
                          />
                          <Text style={[styles.modalEuro, { color: C.texteMuted }]}>
                            €
                          </Text>
                        </View>

                        <Text style={[styles.modalLabel, { color: C.texteMuted }]}>
                          {typeFinancierEvent === "entree"
                            ? "Lier à une catégorie d'entrée d'argent"
                            : "Lier à une catégorie"}
                        </Text>
                        <View style={styles.categorieGrid}>
                          {objStore.enveloppes
                            .filter((env) =>
                              typeFinancierEvent === "entree"
                                ? env.type === "Entrée"
                                : env.type !== "Entrée",
                            )
                            .map((env) => (
                            <TouchableOpacity
                              key={env.id}
                              style={[
                                styles.categorieChip,
                                { backgroundColor: C.fondSecondaire },
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
                                  { color: C.texteMuted },
                                  categorieEvent === env.nom && {
                                    color: "#FFFFFF",
                                  },
                                ]}
                              >
                                {env.nom}
                              </Text>
                            </TouchableOpacity>
                          ))}
                          {!creationCategorieOuverte && (
                            <TouchableOpacity
                              style={[
                                styles.categorieChip,
                                styles.categorieChipNouvelle,
                                { borderColor: C.purple },
                              ]}
                              onPress={() => setCreationCategorieOuverte(true)}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="add" size={14} color={C.purple} />
                              <Text
                                style={[
                                  styles.categorieChipTexte,
                                  { color: C.purple },
                                ]}
                              >
                                Créer une nouvelle catégorie
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>

                        {creationCategorieOuverte && (
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
                              placeholder="Nom de la nouvelle catégorie"
                              placeholderTextColor={C.texteMuted}
                              value={nomNouvelleCategorie}
                              onChangeText={setNomNouvelleCategorie}
                              returnKeyType="done"
                              autoFocus
                              onSubmitEditing={creerNouvelleCategorieInline}
                            />
                            <TouchableOpacity
                              style={[
                                styles.btnCategorieAction,
                                {
                                  backgroundColor: C.purple,
                                  opacity:
                                    nomNouvelleCategorie.trim() &&
                                    !creationCategorieEnCours
                                      ? 1
                                      : 0.5,
                                },
                              ]}
                              onPress={creerNouvelleCategorieInline}
                              activeOpacity={0.7}
                              disabled={
                                !nomNouvelleCategorie.trim() ||
                                creationCategorieEnCours
                              }
                              accessibilityRole="button"
                              accessibilityLabel="Valider la nouvelle catégorie"
                            >
                              {creationCategorieEnCours ? (
                                <ActivityIndicator color="#FFFFFF" size="small" />
                              ) : (
                                <Ionicons
                                  name="checkmark"
                                  size={20}
                                  color="#FFFFFF"
                                />
                              )}
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[
                                styles.btnCategorieAction,
                                { backgroundColor: C.fondSecondaire },
                              ]}
                              onPress={() => {
                                setCreationCategorieOuverte(false);
                                setNomNouvelleCategorie("");
                              }}
                              activeOpacity={0.7}
                              accessibilityRole="button"
                              accessibilityLabel="Annuler la nouvelle catégorie"
                            >
                              <Ionicons name="close" size={20} color={C.texteMuted} />
                            </TouchableOpacity>
                          </View>
                        )}

                        {categorieEvent !== "" && (
                          <Text
                            style={[styles.modalAide, { color: C.texteMuted }]}
                          >
                            {typeFinancierEvent === "entree"
                              ? `Le montant sera ajouté à ton entrée d'argent "${categorieEvent}".`
                              : `Le montant sera ajouté à ta dépense "${categorieEvent}".`}
                          </Text>
                        )}
                      </>
                    )}

                    <View style={styles.switchRow}>
                      <View>
                        <Text style={[styles.switchLabel, { color: C.texte }]}>
                          Répéter cet événement
                        </Text>
                        <Text style={[styles.switchSub, { color: C.texteMuted }]}>
                          Se reproduit automatiquement
                        </Text>
                      </View>
                      <Switch
                        value={recurrentEvent}
                        onValueChange={setRecurrentEvent}
                        trackColor={{ false: C.separateur, true: C.purpleLight }}
                        thumbColor={recurrentEvent ? C.purple : "#FFF"}
                      />
                    </View>

                    {recurrentEvent && (
                      <View style={styles.categorieGrid}>
                        {(
                          [
                            { valeur: "jour", label: "Tous les jours" },
                            { valeur: "semaine", label: "Toutes les semaines" },
                            { valeur: "mois", label: "Tous les mois" },
                            { valeur: "an", label: "Tous les ans" },
                          ] as { valeur: FrequenceEvenement; label: string }[]
                        ).map((f) => (
                          <TouchableOpacity
                            key={f.valeur}
                            style={[
                              styles.categorieChip,
                              { backgroundColor: C.fondSecondaire },
                              frequenceEvent === f.valeur && {
                                backgroundColor: C.purple,
                              },
                            ]}
                            onPress={() => setFrequenceEvent(f.valeur)}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.categorieChipTexte,
                                { color: C.texteMuted },
                                frequenceEvent === f.valeur &&
                                  styles.categorieChipTexteActif,
                              ]}
                            >
                              {f.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {!recurrentEvent && (
                      <View style={styles.switchRow}>
                        <View>
                          <Text style={[styles.switchLabel, { color: C.texte }]}>
                            Me le rappeler
                          </Text>
                          <Text style={[styles.switchSub, { color: C.texteMuted }]}>
                            Notification la veille et le jour même à 9h
                          </Text>
                        </View>
                        <Switch
                          value={notifierEvent}
                          onValueChange={setNotifierEvent}
                          trackColor={{ false: C.separateur, true: C.purpleLight }}
                          thumbColor={notifierEvent ? C.purple : "#FFF"}
                        />
                      </View>
                    )}

                    <Text style={[styles.modalLabel, { color: C.texteMuted }]}>
                      Couleur
                    </Text>
                    <ColorPicker
                      value={couleurEvent}
                      onChange={setCouleurEvent}
                      borderColor={C.texte}
                    />

                    <BoutonPrincipal
                      style={[
                        styles.btnSuivant,
                        {
                          backgroundColor: C.purple,
                          opacity: creationEvenementEnCours ? 0.6 : 1,
                        },
                      ]}
                      onPress={validerInfos}
                      activeOpacity={0.7}
                      disabled={creationEvenementEnCours}
                    >
                      {creationEvenementEnCours ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.btnSuivantTexte}>
                          {evenementEnEditionId !== null
                            ? "Enregistrer les modifications"
                            : "Créer l'événement"}
                        </Text>
                      )}
                    </BoutonPrincipal>
                    {evenementEnEditionId !== null && (
                      <TouchableOpacity
                        style={[
                          styles.btnDupliquer,
                          { backgroundColor: C.fondSecondaire },
                        ]}
                        onPress={dupliquerEvenement}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="copy-outline"
                          size={16}
                          color={C.texte}
                        />
                        <Text style={[styles.btnDupliquerTexte, { color: C.texte }]}>
                          Dupliquer
                        </Text>
                      </TouchableOpacity>
                    )}
                    {evenementEnEditionId !== null && (
                      <TouchableOpacity
                        style={styles.btnSupprimerTexte}
                        onPress={supprimerEvenementEnEdition}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.btnSupprimerTexteLabel}>
                          Supprimer l'événement
                        </Text>
                      </TouchableOpacity>
                    )}
                  </ScrollView>
                </>

            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
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
    letterSpacing: 1,
  },
  btnPlus: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
  tabBtnActif: {},
  tabTexte: { fontSize: 13, fontWeight: "600" },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  dayTitle: { fontSize: 16, fontWeight: "600" },
  dayNav: { flexDirection: "row", gap: 8 },
  navArrow: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  navArrowTexte: { fontSize: 18, fontWeight: "700" },
  alldayZone: {
    borderWidth: 0.5,
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
  weekTimelineInner: {
    borderWidth: 0.5,
    borderRadius: 14,
    overflow: "hidden",
  },
  heuresCol: { width: 32 },
  heureRow: {
    height: HAUTEUR_HEURE,
    justifyContent: "flex-start",
    paddingTop: 4,
  },
  heureTexte: {
    fontSize: 10,
    textAlign: "right",
    paddingRight: 4,
  },
  eventsCol: { flex: 1, position: "relative" },
  ligneFond: {
    height: HAUTEUR_HEURE,
    borderTopWidth: 0.5,
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
  eventHeure: { fontSize: 9 },
  ligneActuelle: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: "#E24B4A",
    zIndex: 5,
  },
  ligneActuellePoint: {
    position: "absolute",
    left: -4,
    top: -3.5,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E24B4A",
  },
  weekHeadRow: { flexDirection: "row", marginBottom: 4 },
  weekHeadCol: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
    borderRadius: 10,
  },
  weekHeadNom: { fontSize: 9 },
  weekHeadNum: {
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
  },
  weekHeadNumAujourdhui: {
    width: 22,
    height: 22,
    borderRadius: 11,
    textAlign: "center",
    lineHeight: 22,
    overflow: "hidden",
  },
  weekDayTimelineCol: {
    flex: 1,
    position: "relative",
    borderLeftWidth: 0.5,
  },
  weekAlldayRow: {
    flexDirection: "row",
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    paddingVertical: 4,
    marginBottom: 6,
  },
  weekAlldayCol: { flex: 1, paddingHorizontal: 2, gap: 2 },
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
  },
  weekEventBlock: {
    position: "absolute",
    borderRadius: 6,
    borderLeftWidth: 2,
    padding: 3,
    justifyContent: "center",
  },
  weekEventBlockTexte: { fontSize: 9, fontWeight: "600" },
  monthDayHeadRow: { flexDirection: "row", marginBottom: 6 },
  monthDayHead: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "600" },
  monthGrid: {
    flex: 1,
    borderWidth: 0.5,
    borderRadius: 14,
    overflow: "hidden",
  },
  monthRow: { flex: 1, flexDirection: "row" },
  monthCell: {
    flex: 1,
    borderWidth: 0.25,
    padding: 5,
  },
  monthNum: { fontSize: 13, fontWeight: "600" },
  monthNumHorsMois: { opacity: 0.5 },
  monthEventLine: { borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1, marginTop: 3 },
  monthEventTexte: { fontSize: 10, fontWeight: "600" },
  monthEventPlus: { fontSize: 9, fontWeight: "600", marginTop: 2 },
  accessoryBar: {
    padding: 10,
    alignItems: "flex-end",
    borderTopWidth: 0.5,
  },
  accessoryTexte: { fontSize: 17, fontWeight: "700" },
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
    paddingBottom: 30,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitre: { fontSize: 21, fontWeight: "700", flex: 1 },
  modalLabel: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 9,
    marginTop: 6,
  },
  modalInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalEuro: { fontSize: 17, marginBottom: 12 },
  modalAide: { fontSize: 12, lineHeight: 18, marginBottom: 14 },
  dateChamp: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 13,
    padding: 16,
    marginBottom: 8,
  },
  dateChampTexte: { fontSize: 15, fontWeight: "600" },
  dateDuAuRow: { flexDirection: "row", gap: 10 },
  calendarWrap: {
    borderRadius: 13,
    borderWidth: 0.5,
    overflow: "hidden",
    marginBottom: 12,
  },
  lienDiscret: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 14,
    marginTop: 2,
  },
  input: {
    borderRadius: 13,
    padding: 16,
    fontSize: 17,
    marginBottom: 12,
  },
  btnSuivant: {
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
  btnAnnulerTexte: { fontSize: 15, fontWeight: "600" },
  btnDupliquer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
  },
  btnDupliquerTexte: { fontSize: 15, fontWeight: "600" },
  btnSupprimerTexte: {
    padding: 14,
    alignItems: "center",
    marginTop: 6,
  },
  btnSupprimerTexteLabel: {
    fontSize: 15,
    color: "#E24B4A",
    fontWeight: "600",
  },
  questionFinanciere: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 16,
    textAlign: "center",
  },
  choixCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },
  choixEmoji: { fontSize: 26 },
  choixTitre: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 2,
  },
  choixSousTitre: { fontSize: 12 },
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
  },
  categorieChipTexte: { fontSize: 13, fontWeight: "600" },
  categorieChipTexteActif: { color: "#FFFFFF" },
  categorieChipNouvelle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderStyle: "dashed",
  },
  btnCategorieAction: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
    marginTop: 6,
  },
  switchLabel: { fontSize: 15, fontWeight: "600" },
  switchSub: { fontSize: 12, marginTop: 2 },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: "center",
  },
  segmentBtnTexte: { fontSize: 14, fontWeight: "600" },
});
