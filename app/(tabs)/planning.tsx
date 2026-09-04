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
import { couleurLaPlusDistincte } from "../../utils/couleurs";
import { usePagerSwipe } from "../PagerSwipeContext";
import {
  annulerNotificationsEvenement,
  demanderPermissionNotifications,
  programmerNotificationsEvenement,
} from "../notifications";
import { Enveloppe, Evenement, useObjectifs } from "../store";
import { styleModaleTablette, useEstTablette } from "../useTablette";
import { useTheme } from "../ThemeContext";
import { useAccessibilite } from "../AccessibiliteContext";
import { useGuest } from "../GuestContext";
import { bloquerSiInvite } from "../guestGate";
import { BoutonPrincipal } from "../BoutonPrincipal";
import { Text } from "../Texte";
import { TextInput } from "../TexteInput";
import { CibleTutoriel, useCiblesTutoriel } from "../CibleTutoriel";
import { EtapeTutoriel, TutorielOverlay } from "../TutorielOverlay";
import { useTutoriel } from "../TutorielContext";
import { FrequenceEvenement, genererOccurrencesEvenement } from "../../utils/evenements";
import { getJoursFeries } from "../../utils/joursFeries";
import { useJoursFeries } from "../JoursFeriesContext";
import { SwitcherEspacePartage } from "../SwitcherEspacePartage";

const JOURS_SEMAINE = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const HEURES = Array.from({ length: 24 }, (_, i) => `${i}h`);
const HEURE_DEBUT = 0;
const HAUTEUR_HEURE = 56;
const ORDRE_VUES = ["jour", "semaine", "mois"] as const;

// Décalage de défilement initial pour ouvrir la grille sur les heures de
// la journée plutôt qu'à minuit — la grille reste entièrement scrollable
// vers 0h-8h et 20h-23h59.
const HEURE_SCROLL_INITIAL = 8;

const ACCESSORY_ID = "numericDone";
const AUJOURDHUI = new Date();
// Vert teal — distingue visuellement les entrées d'argent prévues (cf.
// bloc de génération dans Planning) des dépenses, toutes les autres
// couleurs d'événements synthétiques venant de la catégorie/l'objectif liés.
const COULEUR_ENTREE_PLANNING = "#1D9E75";

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

function formaterDateCourte(date: Date): string {
  const texte = date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
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
 * Remplace TouchableOpacity dans les zones où un tap doit être distingué
 * d'un swipe (grille de Planning, sélecteur Jour/Semaine/Mois) :
 * TouchableOpacity gère le tap via l'ancien système de responder RN,
 * indépendamment des gestes RNGH, et peut déclencher onPress même après un
 * déplacement net. `.maxDistance()`/`.maxDuration()` bornent le tap
 * lui-même (un swipe rapide/brusque — a fortiori celui destiné au pager
 * natif de changement d'onglet — dépasse ces seuils et ne se déclenche
 * jamais comme création d'événement), sans dépendre d'un autre geste.
 * `gesteExterne`, optionnel, ajoute une exigence supplémentaire pour les
 * zones qui partagent effectivement leur emprise tactile avec un Pan dédié
 * (ex: le sélecteur de vue et son geste de swipe interne).
 */
function TapZone({
  onTap,
  gesteExterne,
  style,
  opaciteAuToucher = 1,
  children,
}: {
  onTap: () => void;
  gesteExterne?: ReturnType<typeof Gesture.Pan>;
  style?: StyleProp<ViewStyle>;
  opaciteAuToucher?: number;
  children?: ReactNode;
}) {
  const [presse, setPresse] = useState(false);

  let geste = Gesture.Tap()
    .runOnJS(true)
    .maxDistance(12)
    .maxDuration(200);
  if (gesteExterne) {
    geste = geste.requireExternalGestureToFail(gesteExterne);
  }
  geste = geste
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
  const estTablette = useEstTablette();
  const { theme, couleurs: C } = useTheme();
  const { reduireAnimations } = useAccessibilite();
  const router = useRouter();
  const { isGuest } = useGuest();
  const { afficherJoursFeries } = useJoursFeries();
  const params = useLocalSearchParams<{ editEventId?: string }>();
  const { planning: tutorielPlanningVu, marquerVu: marquerTutorielVu } =
    useTutoriel();
  const {
    positions: posCiblesTutoriel,
    mesurer: mesurerCibleTutoriel,
    cleFocus: cleFocusTutoriel,
  } = useCiblesTutoriel();
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

  // RÈGLE : jours fériés fusionnés AVANT la boucle de construction de
  // tousLesEvenements, traités par le MÊME code que les événements réels —
  // seule leur id (préfixée `ferie_`, cf. utils/joursFeries.ts) les
  // distingue plus bas pour les rendre non modifiables/non supprimables et
  // sans lien vers un vrai Evenement en base (evenementId). Générés pour
  // toutes les années couvertes par la fenêtre affichée (celle-ci peut
  // chevaucher deux années civiles, ex: vue de décembre à mars) — jamais
  // persistés, jamais envoyés à Supabase (cf. RÈGLE dans
  // utils/joursFeries.ts). Masqués entièrement si l'utilisateur a désactivé
  // le réglage "Afficher les jours fériés français" (Profil → Paramètres).
  const anneesFenetreFeries = new Set([
    debutFenetreRecurrence.getFullYear(),
    finFenetreRecurrence.getFullYear(),
  ]);
  const joursFeries = afficherJoursFeries
    ? [...anneesFenetreFeries].flatMap((annee) => getJoursFeries(annee))
    : [];
  const evenementsSource = [...objStore.evenements, ...joursFeries];

  evenementsSource.forEach((e) => {
    const estFerie = e.id.startsWith("ferie_");
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
          // RÈGLE : un jour férié n'est jamais modifiable/supprimable
          // (pas un vrai Evenement en base) — cf. gererClicEvenement plus
          // bas, qui ignore déjà tout ev.modifiable === false.
          modifiable: !estFerie,
          evenementId: estFerie ? undefined : e.id,
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

  // Déduplique par NOM avant de générer les échéances : une catégorie
  // supprimée puis recréée (même nom, id différent) peut laisser deux lignes
  // "Fixe" vivantes en base pour ce qui est conceptuellement une seule
  // catégorie — sans ce filtre, chacune générait sa propre échéance le même
  // jour, affichant "Loyer" en double dans la grille (et gonflant son total
  // dans le Top dépenses de Stats, qui regroupe aussi par nom).
  const enveloppesFixesUniques = new Map<string, Enveloppe>();
  objStore.enveloppes
    .filter((e) => e.type === "Fixe" && e.afficherDansPlanning && e.dateFixe)
    .forEach((e) => {
      if (!enveloppesFixesUniques.has(e.nom)) enveloppesFixesUniques.set(e.nom, e);
    });
  [...enveloppesFixesUniques.values()]
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

  // RÈGLE : entrées d'argent prévues affichées comme événements "toute la
  // journée" dans Planning — copie LITTÉRALE du mécanisme utilisé pour les
  // catégories Fixe juste au-dessus (dédup par nom, boucle sur les mois
  // voisins si repete_chaque_mois, sinon un seul événement à dateFixe, même
  // garde-fou "déjà payée ce mois" via historiquePaiements), appliqué à
  // type === "Entrée" au lieu de "Fixe" — cf. demande explicite "pas de
  // réinvention". Seule différence assumée : couleur fixe
  // (COULEUR_ENTREE_PLANNING) au lieu de e.couleur, pour distinguer
  // visuellement une entrée d'argent d'une dépense, cf. demande initiale.
  // Contrôle par enveloppe (e.afficherDansPlanning), jamais par réglage
  // global — un ancien toggle dans Profil → Paramètres a été retiré à la
  // demande explicite de l'utilisateur.
  const enveloppesEntreesUniques = new Map<string, Enveloppe>();
  objStore.enveloppes
    .filter((e) => e.type === "Entrée" && e.afficherDansPlanning && e.dateFixe)
    .forEach((e) => {
      if (!enveloppesEntreesUniques.has(e.nom)) enveloppesEntreesUniques.set(e.nom, e);
    });
  [...enveloppesEntreesUniques.values()]
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
            id: `entree_${e.id}-${d.getFullYear()}-${d.getMonth()}`,
            nom: e.nom,
            heure: "",
            duree: 0,
            couleur: COULEUR_ENTREE_PLANNING,
            estFinancier: true,
            montant: e.budget,
            touteLaJournee: true,
            date: d,
            modifiable: false,
          });
        }
      } else {
        tousLesEvenements.push({
          id: `entree_${e.id}`,
          nom: e.nom,
          heure: "",
          duree: 0,
          couleur: COULEUR_ENTREE_PLANNING,
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

  // RÈGLE À NE JAMAIS CASSER — DÉDUPLICATION PAR CATÉGORIE + DATE, JAMAIS
  // PAR PRÉSENCE D'UNE TRANSACTION : un historiquePaiements est créé par
  // verifierEcheancesFixesInterne() (app/store.ts) quand l'échéance d'une
  // catégorie Fixe passe — CE MÉCANISME N'INSÈRE JAMAIS DE LIGNE
  // `transactions` correspondante (aucun appel à ajouterTransaction dans
  // cette fonction, vérifié). Exiger une transaction correspondante avant
  // d'afficher un histo- ferait donc disparaître TOUS ces événements sans
  // exception, pas seulement les doublons — les catégories Fixe payées
  // automatiquement ne passent structurellement jamais par `transactions`
  // (cf. RÈGLE "4 CAS DE FLUX" dans GraphiqueFlux.tsx : Fixe = Cas 2,
  // jamais de détail transaction). La vraie protection contre un doublon
  // (ex: verifierEcheancesFixesInterne qui se redéclenche avant que
  // etat.historiquePaiements ait eu le temps de refléter l'ajout
  // précédent, cf. RÈGLE sur les déclenchements multiples dans
  // (tabs)/_layout.tsx) est une déduplication PAR ENVELOPPE + JOUR
  // CALENDAIRE, appliquée ici au rendu.
  // RÈGLE À NE JAMAIS CASSER — SOURCE (enveloppeId) DOIT ENCORE EXISTER,
  // JAMAIS DE VÉRIFICATION SUR LE MONTANT : un historiquePaiements orphelin
  // (enveloppeId ne correspondant plus à aucune enveloppe vivante, ex:
  // catégorie supprimée puis recréée sous un nouvel id) est un vrai
  // fantôme — filtré ici. Le MONTANT, en revanche, n'est JAMAIS comparé à
  // la valeur actuelle de l'enveloppe : `p.montant` est un instantané du
  // budget au moment du paiement (cf. verifierEcheancesFixesInterne,
  // `montant: env.budget` capturé à l'échéance), c'est tout l'intérêt d'un
  // historique — modifier le loyer aujourd'hui ne doit jamais faire
  // disparaître les paiements passés au montant d'avant. Exiger une
  // correspondance de montant ferait disparaître TOUT l'historique dès la
  // moindre modification de budget sur la catégorie, pas seulement les
  // entrées orphelines.
  const idsEnveloppesVivantes = new Set(objStore.enveloppes.map((e) => e.id));
  const clesHistoDejaAffichees = new Set<string>();
  objStore.historiquePaiements
    .filter((p) => idsEnveloppesVivantes.has(p.enveloppeId))
    .forEach((p) => {
    const d = new Date(p.date);
    const cle = `${p.enveloppeId}-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (clesHistoDejaAffichees.has(cle)) return;
    clesHistoDejaAffichees.add(cle);
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

  // RÈGLE À NE JAMAIS CASSER — AUCUN ÉVÉNEMENT FANTÔME, JAMAIS AUX DÉPENS
  // DES SOURCES SYNTHÉTIQUES CONNUES : un événement construit depuis
  // evenementsSource (evenementId défini, cf. boucle plus haut) doit
  // TOUJOURS avoir sa source réelle encore présente dans
  // objStore.evenements au moment du rendu — sinon (transaction/onglet
  // désynchronisé, suppression pas encore répercutée) il est retiré ici en
  // dernier filtre plutôt que laissé affiché sans rien de réel derrière.
  // Ce filtre NE TOUCHE JAMAIS les entrées synthétiques (Fixe, objectif,
  // historique de paiement, entree_, ferie_) : elles ont `evenementId:
  // undefined` PAR CONSTRUCTION (jamais une vraie ligne `evenements` en
  // base, cf. RÈGLE sur les blocs Fixe/entrées/jours fériés plus haut) —
  // leur appliquer ce même test les ferait toutes disparaître à tort.
  const idsEvenementsReels = new Set(objStore.evenements.map((e) => e.id));
  const tousLesEvenementsValides = tousLesEvenements.filter(
    (ev) => ev.evenementId === undefined || idsEvenementsReels.has(ev.evenementId),
  );

  const evsJour = (date: Date) =>
    tousLesEvenementsValides.filter((e) => memeJour(e.date, date));
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

  // Le changement d'onglet par swipe (vers Budget/Statistiques) est
  // entièrement délégué au pager natif de material-top-tabs, exactement
  // comme sur les autres pages (Aperçu/Budget/Statistiques) : la grille n'a
  // plus aucun Gesture.Pan qui intercepte le swipe horizontal avant lui, un
  // seul geste fluide suffit donc pour changer d'onglet, sans le
  // délai/la course entre deux reconnaisseurs de gestes qui obligeait
  // auparavant à swiper deux fois. Distinguer "swipe lent → change de vue"
  // de "swipe rapide → change d'onglet" sur la même zone tactile (ancienne
  // approche, un seul Gesture.Pan pleine grille décidant après coup dans
  // onEnd) s'est révélé peu fiable en usage réel : la vélocité n'est connue
  // qu'après que le Pan a déjà capté le toucher et désactivé le pager natif,
  // ce qui retardait/cassait le swipe d'onglet. Séparer par ZONE plutôt que
  // par vitesse est bien plus robuste : le changement de vue par swipe reste
  // possible, mais uniquement sur le sélecteur dédié (tabsRow, geste
  // ci-dessous), une zone étroite qui ne dispute jamais le swipe d'onglet
  // fait sur le reste de l'écran.
  // RÈGLE À NE JAMAIS CASSER : ce onBegin/onFinalize doit toujours
  // désactiver puis réactiver swipeOngletsActif (via usePagerSwipe, cf.
  // PagerSwipeContext.tsx) autour du geste. Sans le onBegin, le pager natif
  // de material-top-tabs (app/(tabs)/_layout.tsx, swipeEnabled) capte le
  // même geste horizontal en parallèle de ce Gesture.Pan — les deux
  // reconnaisseurs se disputent le toucher. Sans le onFinalize (qui se
  // déclenche aussi bien en cas de succès que d'annulation du geste), le
  // swipe entre onglets resterait bloqué en permanence après le premier
  // swipe de vue.
  const gesteSwipeVue = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-40, 40])
    .failOffsetY([-12, 12])
    .minDistance(40)
    .onBegin(() => {
      scheduleOnRN(setSwipeOngletsActif, false);
    })
    .onFinalize(() => {
      scheduleOnRN(setSwipeOngletsActif, true);
    })
    .onEnd((e) => {
      const vitesseOk = Math.abs(e.velocityX) > 200;
      const indexActuel = ORDRE_VUES.indexOf(vue);
      if (
        vitesseOk &&
        e.translationX < -70 &&
        indexActuel < ORDRE_VUES.length - 1
      ) {
        scheduleOnRN(setVue, ORDRE_VUES[indexActuel + 1]);
      } else if (vitesseOk && e.translationX > 70 && indexActuel > 0) {
        scheduleOnRN(setVue, ORDRE_VUES[indexActuel - 1]);
      }
    });

  const ouvrirJour = (date: Date) => {
    setDateActuelle(date);
    setVue("jour");
  };

  const ouvrirCreationComplete = () => {
    if (bloquerSiInvite(isGuest, router)) return;
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
    // Activé par défaut si les notifications globales le sont — l'utilisateur
    // reste libre de désactiver pour CET événement précis via le switch.
    setNotifierEvent(objStore.notificationsActives);
    setEvenementEnEditionId(null);
    setModalCreationVisible(true);
  };

  const ouvrirCreationRapide = (heureTexte: string, date: Date = dateActuelle) => {
    if (bloquerSiInvite(isGuest, router)) return;
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
    setNotifierEvent(objStore.notificationsActives);
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

  // RÈGLE : rechargement forcé depuis Supabase à CHAQUE focus de l'onglet
  // Planning (pas seulement au montage initial de (tabs)/_layout.tsx) —
  // garantit que les événements affichés reflètent l'état réel en base
  // même si une suppression/modification a eu lieu ailleurs (autre onglet,
  // autre appareil, session précédente) pendant que Planning était en
  // arrière-plan. Effet séparé du useFocusEffect ci-dessus (dépendances et
  // responsabilités différentes) plutôt que fusionné dedans.
  useFocusEffect(
    useCallback(() => {
      objStore.chargerEvenements();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const sauvegarderModificationEvenement = async () => {
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
    // Les notifications déjà programmées pour cet événement (sous son
    // ancien type/date/heure) sont toujours annulées, même si notifierEvent
    // est maintenant false — sinon une notification obsolète (mauvaise
    // heure, mauvais texte "toute la journée" vs horaire précis) partirait
    // quand même. Reprogrammées ensuite seulement si notifierActif est vrai
    // sur le nouvel état — mêmes conditions que finaliserCreationEvenement
    // (pas d'événement récurrent, notifications globales activées).
    await annulerNotificationsEvenement(evenementEnEditionId);
    if (notifierEvent && !recurrentEvent && objStore.notificationsActives) {
      const autorise = await demanderPermissionNotifications();
      if (autorise) {
        await programmerNotificationsEvenement(
          evenementEnEditionId,
          nomEvent,
          dateEvent,
          heureEvent,
          journeeEntiereEvent || multiJoursEvent,
        );
      }
    }
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
    // eslint-disable-next-line no-console
    console.log("[DEBUG gererClicEvenement]", {
      id: ev.id,
      nom: ev.nom,
      modifiable: ev.modifiable,
      evenementId: ev.evenementId,
      sourceTrouvee: ev.evenementId
        ? !!objStore.evenements.find((e) => e.id === ev.evenementId)
        : null,
    });
    // Non modifiable = généré à partir d'une catégorie Fixe, d'un objectif
    // récurrent ou d'un historique de paiement (pas un vrai Evenement en
    // base) — rien à éditer ici. On ne navigue plus ailleurs dans ce cas :
    // ça sortait l'utilisateur de Planning de façon inattendue sans qu'il
    // ait demandé à changer d'onglet.
    if (!ev.modifiable) return;
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
        await programmerNotificationsEvenement(
          nouvel.id,
          nomEvent,
          dateEvent,
          heureEvent,
          journeeEntiereEvent || multiJoursEvent,
        );
      }
    }
    setModalCreationVisible(false);
  };

  const choisirCouleurAutomatique = () =>
    couleurLaPlusDistincte(
      PALETTE_COULEURS,
      objStore.enveloppes.map((env) => env.couleur),
    );

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

  // "vue" et "grille" sont toutes deux TOUJOURS montées (contrairement à
  // l'ancienne étape "evenement", retirée : elle dépendait de la présence
  // d'un événement le jour affiché, un cas absent dès qu'un compte est
  // fraîchement créé) — le tutoriel Planning fonctionne donc sans exception
  // dès la première visite, aucun filtrage nécessaire.
  const ETAPES_PLANNING_ACTIVES: EtapeTutoriel[] = [
    {
      id: "vue",
      texte:
        "Change de vue selon ce que tu veux voir : ta journée, ta semaine ou ton mois.",
    },
    {
      id: "grille",
      texte:
        "Appuie sur un créneau pour créer un événement. Les événements financiers se déduiront automatiquement de ton budget.",
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: C.fondPage }]}>
      <View style={styles.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <SwitcherEspacePartage />
          <Text style={[styles.titre, { color: C.texte }]}>Planning</Text>
        </View>
        <TouchableOpacity
          style={[styles.btnPlus, { backgroundColor: C.purple }]}
          activeOpacity={0.7}
          onPress={ouvrirCreationComplete}
        >
          <Text style={styles.btnPlusTexte}>+</Text>
        </TouchableOpacity>
      </View>

      {/* GestureDetector doit envelopper directement une View native (pas
          CibleTutoriel, qui n'est pas un forwardRef) pour pouvoir attacher
          son gestionnaire de geste — CibleTutoriel reste donc à l'extérieur,
          simple mesure de position, sans rôle dans la reconnaissance du
          geste. Les TouchableOpacity sont remplacées par TapZone : un
          TouchableOpacity ordinaire ignore gesteSwipeVue (ancien système de
          responder RN) et peut déclencher onPress même après un swipe net —
          exactement le conflit qui a bloqué cette fonctionnalité jusqu'ici. */}
      {/* RÈGLE À NE JAMAIS CASSER : id="vue" est une cible du tutoriel
          Planning (étape "Change de vue"). Si ce CibleTutoriel est retiré,
          déplacé, ou son id changé, sa position n'est plus jamais mesurée
          (posCiblesTutoriel["vue"] reste undefined) — TutorielOverlay
          attend cette position pour TOUTES les étapes
          (ETAPES_PLANNING_ACTIVES.every(...) dans le <TutorielOverlay>
          plus bas), donc le tutoriel entier de Planning ne s'affiche plus
          du tout, silencieusement, sans erreur visible. */}
      <CibleTutoriel
        id="vue"
        onMesure={mesurerCibleTutoriel}
        cleFocus={cleFocusTutoriel}
      >
        <GestureDetector gesture={gesteSwipeVue}>
          <View style={[styles.tabsRow, { backgroundColor: C.fondSecondaire }]}>
            {(["jour", "semaine", "mois"] as const).map((v) => (
              <TapZone
                key={v}
                gesteExterne={gesteSwipeVue}
                style={[
                  styles.tabBtn,
                  vue === v && [styles.tabBtnActif, { backgroundColor: C.carte }],
                ]}
                opaciteAuToucher={0.7}
                onTap={() => setVue(v)}
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
              </TapZone>
            ))}
          </View>
        </GestureDetector>
      </CibleTutoriel>

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

      <View style={{ flex: 1 }}>
          {vue === "jour" && (
            <View style={{ flex: 1 }}>
              {evsToutLaJourneeJour(dateActuelle).length > 0 && (
                <View
                  style={[styles.alldayZone, { borderColor: C.separateur }]}
                >
                  {evsToutLaJourneeJour(dateActuelle).map((ev) => (
                    <TouchableOpacity
                      key={ev.id}
                      style={[
                        styles.alldayPill,
                        { backgroundColor: ev.couleur + "22" },
                      ]}
                      activeOpacity={0.7}
                      onPress={() => gererClicEvenement(ev)}
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
                          {/* RÈGLE : "+" uniquement pour une entrée d'argent
                              (id préfixé entree_, cf. bloc de génération
                              plus haut) — jamais pour une dépense, même
                              affichée toute-la-journée (Fixe, objectif,
                              jour férié...). */}
                          {ev.id.startsWith("entree_") ? "+" : ""}
                          {formaterMontant(ev.montant)}€
                        </Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* La cible tutoriel "grille" est le ScrollView lui-même (taille
                  bornée = viewport visible), PAS eventsCol : eventsCol contient
                  les 24h de contenu (~1344px, bien plus haut que l'écran) et
                  vit à l'intérieur du ScrollView qui a un contentOffset initial
                  (scroll sur ~8h). measureInWindow sur eventsCol renverrait
                  alors la position/hauteur du contenu SCROLLABLE complet (avec
                  un y potentiellement négatif, décalé par le scroll initial),
                  pas la zone réellement visible à l'écran — d'où un trou et
                  une bulle complètement mal placés. Mesurer le ScrollView
                  contourne le problème : sa propre boîte ne bouge jamais,
                  quel que soit le défilement de son contenu interne.

                  RÈGLE À NE JAMAIS CASSER : id="grille" est une cible du
                  tutoriel Planning (étape "Appuie sur un créneau..."). La
                  retirer, la déplacer, ou changer son id fait que
                  posCiblesTutoriel["grille"] ne se met plus jamais à jour —
                  comme "vue", c'est une condition requise par
                  ETAPES_PLANNING_ACTIVES.every(...) pour que
                  <TutorielOverlay> devienne visible : le tutoriel entier de
                  Planning disparaît, silencieusement. */}
              <CibleTutoriel
                id="grille"
                onMesure={mesurerCibleTutoriel}
                cleFocus={cleFocusTutoriel}
                style={{ flex: 1 }}
              >
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
                      <TouchableOpacity
                        key={h}
                        style={[styles.ligneFond, { borderTopColor: C.separateur }]}
                        activeOpacity={0.5}
                        onPress={() => ouvrirCreationRapide(`${HEURE_DEBUT + i}h00`)}
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
                            },
                            {
                              backgroundColor: ev.couleur + "22",
                              borderLeftColor: ev.couleur,
                            },
                          ]}
                          activeOpacity={0.7}
                          onPress={() => gererClicEvenement(ev)}
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
                        </TouchableOpacity>
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
              </CibleTutoriel>
            </View>
          )}

          {vue === "semaine" && (
            <>
              <View style={styles.weekHeadRow}>
                <View style={{ width: 32 }} />
                {joursSemaineVue.map(({ jourDate, estAujourdhui }, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.weekHeadCol,
                      estAujourdhui && { backgroundColor: teinteAujourdhui },
                    ]}
                    activeOpacity={0.7}
                    onPress={() => ouvrirJour(jourDate)}
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
                  </TouchableOpacity>
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
                        <TouchableOpacity
                          key={ev.id}
                          style={[
                            styles.weekAlldayPill,
                            { backgroundColor: ev.couleur + "33" },
                          ]}
                          activeOpacity={0.7}
                          onPress={() => gererClicEvenement(ev)}
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
                        </TouchableOpacity>
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
                        <TouchableOpacity
                          key={h}
                          style={[
                            styles.ligneFondSemaine,
                            { borderTopColor: C.separateur },
                          ]}
                          activeOpacity={0.5}
                          onPress={() => {
                            setDateActuelle(jourDate);
                            ouvrirCreationRapide(
                              `${HEURE_DEBUT + hi}h00`,
                              jourDate,
                            );
                          }}
                        />
                      ))}
                      {positions.map(({ ev, top, height, left, width }) => (
                        <TouchableOpacity
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
                          activeOpacity={0.7}
                          onPress={() => gererClicEvenement(ev)}
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
                        </TouchableOpacity>
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
                          <TouchableOpacity
                            key={di}
                            style={[
                              styles.monthCell,
                              { borderColor: C.separateur },
                              estAujourdhui && {
                                backgroundColor: teinteAujourdhui,
                              },
                            ]}
                            activeOpacity={0.7}
                            onPress={() => ouvrirJour(jourDate)}
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
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ),
                )}
              </View>
            </View>
          )}
      </View>

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
            style={[
              styles.modalOverlayTouch,
              estTablette && styles.modalOverlayTouchTablette,
            ]}
            activeOpacity={1}
            onPress={fermerModalCreationAvecSauvegarde}
          >
            <TouchableOpacity
              style={[
                styles.modalCard,
                { backgroundColor: C.carte },
                styleModaleTablette(estTablette),
              ]}
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
                      <>
                        <Text style={[styles.modalLabel, { color: C.texteMuted }]}>
                          Notifications
                        </Text>
                        <View style={styles.switchRow}>
                          <View>
                            <Text style={[styles.switchLabel, { color: C.texte }]}>
                              Activer les notifications pour cet événement
                            </Text>
                            {/* RÈGLE À NE JAMAIS CASSER : ce texte doit rester
                                synchronisé avec les règles réelles de
                                app/notifications.ts (programmerNotificationsEvenement)
                                — c'est une promesse faite à l'utilisateur sur ce
                                qu'il va recevoir, pas juste une décoration. */}
                            <Text
                              style={[styles.switchSub, { color: C.texteMuted }]}
                            >
                              {journeeEntiereEvent || multiJoursEvent
                                ? "Tu seras notifié la veille à 20h et le jour même à 9h"
                                : "Tu seras notifié 15 min avant et au moment du début"}
                            </Text>
                          </View>
                          <Switch
                            value={notifierEvent}
                            onValueChange={setNotifierEvent}
                            trackColor={{ false: C.separateur, true: C.purpleLight }}
                            thumbColor={notifierEvent ? C.purple : "#FFF"}
                          />
                        </View>
                      </>
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

      <TutorielOverlay
        actif={!tutorielPlanningVu}
        etapes={ETAPES_PLANNING_ACTIVES}
        positions={posCiblesTutoriel}
        onTerminer={() => {
          console.log("[TUTORIEL] Planning terminé, navigation vers Stats");
          marquerTutorielVu("planning");
          router.push("/(tabs)/analytics");
        }}
        onFermer={() => marquerTutorielVu("planning")}
      />
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
  // RÈGLE — iPad : cf. même pattern dans app/(tabs)/analytics.tsx.
  modalOverlayTouchTablette: {
    alignItems: "center",
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
