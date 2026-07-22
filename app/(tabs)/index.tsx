import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { parseMontant, sanitizeMontantInput } from "../../utils/montant";
import { getInitiales } from "../../utils/initiales";
import {
  depenseCumuleeAuJour,
  joursDansMois,
  MOIS_LABELS,
  moisPrecedent,
  totalParType,
} from "../../utils/exportExcel";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from "react-native";
import { Calendar } from "react-native-calendars";
import Svg, { Circle } from "react-native-svg";
import { useLargeurAnimee } from "../BarreProgression";
import { NombreAnime } from "../NombreAnime";
import { ColorPicker, PALETTE_COULEURS } from "../ColorPicker";
import { Enveloppe, Objectif, useObjectifs } from "../store";
import { COULEURS, useTheme } from "../ThemeContext";
import { InfoBulle } from "../InfoBulle";
import { Text } from "../Texte";
import { TextInput } from "../TexteInput";
import { useAccessibilite } from "../AccessibiliteContext";

function bgClair(couleur: string) {
  return couleur + "22";
}

function dateVersISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formaterDateLongue(dateISO: string): string {
  const d = new Date(dateISO);
  if (Number.isNaN(d.getTime())) return dateISO;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

function DonutChart({
  data,
  couleurs: C,
}: {
  data: { couleur: string; valeur: number }[];
  couleurs: typeof COULEURS.clair;
}) {
  const total = data.reduce((acc, d) => acc + d.valeur, 0);
  const taille = 140;
  const rayon = 55;
  const epaisseur = 20;
  const centre = taille / 2;
  const circonference = 2 * Math.PI * rayon;

  if (total === 0) {
    return (
      <View
        style={{
          width: taille,
          height: taille,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Svg width={taille} height={taille}>
          <Circle
            cx={centre}
            cy={centre}
            r={rayon}
            stroke={C.separateur}
            strokeWidth={epaisseur}
            fill="none"
          />
        </Svg>
        <Text
          style={{ position: "absolute", fontSize: 13, color: C.texteMuted }}
        >
          Aucune dépense
        </Text>
      </View>
    );
  }

  let cumul = 0;
  const segments = data
    .filter((d) => d.valeur > 0)
    .map((d, i) => {
      const pct = d.valeur / total;
      const dashArray = pct * circonference;
      const dashOffset = circonference * (1 - cumul);
      cumul += pct;
      return { ...d, dashArray, dashOffset, key: i };
    });

  return (
    <View
      style={{
        width: taille,
        height: taille,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg width={taille} height={taille}>
        {segments.map((seg) => (
          <Circle
            key={seg.key}
            cx={centre}
            cy={centre}
            r={rayon}
            stroke={seg.couleur}
            strokeWidth={epaisseur}
            strokeDasharray={`${seg.dashArray} ${circonference - seg.dashArray}`}
            strokeDashoffset={seg.dashOffset}
            fill="none"
            strokeLinecap="butt"
            transform={`rotate(-90 ${centre} ${centre})`}
          />
        ))}
      </Svg>
      <View style={{ position: "absolute", alignItems: "center" }}>
        <Text style={{ fontSize: 19, fontWeight: "700", color: C.texte }}>
          {total} €
        </Text>
        <Text style={{ fontSize: 11, color: C.texteMuted }}>dépensé</Text>
      </View>
    </View>
  );
}

const ACCESSORY_ID = "numericDone";

export default function Dashboard() {
  const objStore = useObjectifs();
  const { theme, couleurs, toggleTheme } = useTheme();
  const { reduireAnimations } = useAccessibilite();
  const C = couleurs;
  const router = useRouter();

  const enveloppes = objStore.enveloppes;
  const setEnveloppes = (nouvellesEnveloppes: Enveloppe[]) =>
    objStore.modifierEnveloppes(nouvellesEnveloppes);
  const [argentDisponible, setArgentDisponibleLocal] = useState(
    String(objStore.argentDisponible),
  );
  useEffect(() => {
    setArgentDisponibleLocal(String(objStore.argentDisponible));
  }, [objStore.argentDisponible]);
  const setArgentDisponible = (
    val: string,
    recurrent: boolean,
    reportAuto: boolean,
  ) => {
    setArgentDisponibleLocal(val);
    objStore.modifierArgentDisponible(parseMontant(val) || 0, recurrent, reportAuto);
  };
  const [editionDisponible, setEditionDisponible] = useState(false);
  const [historiqueDepenseOuvert, setHistoriqueDepenseOuvert] = useState(false);
  const [disponibleRecurrentTemp, setDisponibleRecurrentTemp] = useState(
    objStore.argentDisponibleRecurrent,
  );
  const [disponibleReportTemp, setDisponibleReportTemp] = useState(
    objStore.argentDisponibleReportAuto,
  );
  const maintenant = new Date();
  const moisActuelLabel = maintenant.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
  const [disponibleTemp, setDisponibleTemp] = useState("1800");

  const [modalEnveloppeVisible, setModalEnveloppeVisible] = useState(false);
  const [enveloppeEnEdition, setEnveloppeEnEdition] =
    useState<Enveloppe | null>(null);
  const [nomTemp, setNomTemp] = useState("");
  const [budgetTemp, setBudgetTemp] = useState("");
  const [couleurTemp, setCouleurTemp] = useState(PALETTE_COULEURS[0]);
  const [paletteOuverteTemp, setPaletteOuverteTemp] = useState(false);
  const [typeTemp, setTypeTemp] = useState<"Variable" | "Fixe" | "Entrée">(
    "Variable",
  );
  const [recurrenteTemp, setRecurrenteTemp] = useState(false);
  const [dateTemp, setDateTemp] = useState(dateVersISO(new Date()));
  const [repeteChaqueMoisTemp, setRepeteChaqueMoisTemp] = useState(false);
  const [afficherPlanningTemp, setAfficherPlanningTemp] = useState(false);

  const [modalAjoutVisible, setModalAjoutVisible] = useState(false);
  const [nouveauNom, setNouveauNom] = useState("");
  const [nouveauBudget, setNouveauBudget] = useState("");
  const [nouvelleCouleur, setNouvelleCouleur] = useState(PALETTE_COULEURS[0]);
  const [paletteOuverteNouvelle, setPaletteOuverteNouvelle] = useState(false);
  const [nouveauType, setNouveauType] = useState<
    "Variable" | "Fixe" | "Entrée"
  >("Variable");
  const [estRecurrente, setEstRecurrente] = useState(false);
  const [nouvelleDate, setNouvelleDate] = useState(dateVersISO(new Date()));
  const [nouveauRepeteChaqueMois, setNouveauRepeteChaqueMois] = useState(false);
  const [nouveauAfficherPlanning, setNouveauAfficherPlanning] = useState(false);
  const [creationEnveloppeEnCours, setCreationEnveloppeEnCours] =
    useState(false);

  const [modalEpargneVisible, setModalEpargneVisible] = useState(false);
  const [vueModal, setVueModal] = useState<"liste" | "form">("liste");
  const [epargneTemp, setEpargneTemp] = useState(String(objStore.epargneMois));
  const [objectifEnEdition, setObjectifEnEdition] = useState<Objectif | null>(
    null,
  );
  const [nomObjectif, setNomObjectif] = useState("");
  const [cibleObjectif, setCibleObjectif] = useState("");
  const [montantInitialObjectif, setMontantInitialObjectif] = useState("");
  const [couleurObjectif, setCouleurObjectif] = useState(PALETTE_COULEURS[0]);
  const [recurrentObjectif, setRecurrentObjectif] = useState(false);
  const [montantMensuelObjectif, setMontantMensuelObjectif] = useState("");
  const [jourDuMoisObjectif, setJourDuMoisObjectif] = useState("1");
  const [calendrierJourOuvert, setCalendrierJourOuvert] = useState(false);
  const [montantAjoutObjectif, setMontantAjoutObjectif] = useState("");
  const [sauvegardeObjectifEnCours, setSauvegardeObjectifEnCours] =
    useState(false);
  const [objectifsCloturesOuvert, setObjectifsCloturesOuvert] =
    useState(false);
  const [entreesDisponibleOuvert, setEntreesDisponibleOuvert] =
    useState(false);

  const enveloppesSansEntree = enveloppes.filter((e) => e.type !== "Entrée");
  const enveloppesEntree = enveloppes.filter((e) => e.type === "Entrée");
  const totalDepenseEnveloppes = enveloppesSansEntree.reduce(
    (acc, e) => acc + e.depense,
    0,
  );
  const totalEntreeRecue = enveloppesEntree.reduce(
    (acc, e) => acc + e.depense,
    0,
  );
  const totalEntreePrevue = enveloppesEntree.reduce(
    (acc, e) => acc + Math.max(0, e.budget - e.depense),
    0,
  );
  const totalDepense = totalDepenseEnveloppes + objStore.epargneMois;

  const entreesRecuesCeMois = enveloppesEntree
    .filter((e) => {
      if (!e.payee || !e.dateFixe) return false;
      const d = new Date(e.dateFixe);
      return (
        d.getMonth() === maintenant.getMonth() &&
        d.getFullYear() === maintenant.getFullYear()
      );
    })
    .sort(
      (a, b) =>
        new Date(b.dateFixe!).getTime() - new Date(a.dateFixe!).getTime(),
    );
  const totalEntreesRecuesCeMois = entreesRecuesCeMois.reduce(
    (acc, e) => acc + e.budget,
    0,
  );

  const depensesNonCategorisees = objStore.evenements
    .filter((e) => e.estFinancier && e.montant)
    .filter((e) => !e.categorieLiee || e.categorieLiee === "Aucune")
    .filter((e) => {
      const d = new Date(e.date);
      d.setHours(0, 0, 0, 0);
      const aujourdhui = new Date();
      aujourdhui.setHours(0, 0, 0, 0);
      return (
        d <= aujourdhui &&
        d.getMonth() === maintenant.getMonth() &&
        d.getFullYear() === maintenant.getFullYear()
      );
    })
    .reduce((acc, e) => acc + (e.montant ?? 0), 0);

  const disponibleNum = parseMontant(argentDisponible) || 0;
  const disponibleEffectif = disponibleNum + totalEntreeRecue + totalEntreePrevue;
  const pctUtilise =
    disponibleEffectif > 0
      ? Math.min((totalDepenseEnveloppes / disponibleEffectif) * 100, 100)
      : 0;
  const largeurBarFillAnimee = useLargeurAnimee(pctUtilise);
  const pctEpargne =
    disponibleEffectif > 0
      ? Math.min((objStore.epargneMois / disponibleEffectif) * 100, 100)
      : 0;
  const pctEntreeRecue =
    disponibleEffectif > 0
      ? Math.min((totalEntreeRecue / disponibleEffectif) * 100, 100)
      : 0;

  // "Reste estimé" doit correspondre exactement à ce qui sera reporté au
  // mois suivant (voir archiverMoisActuelInterne dans store.ts), qui ne
  // compte que les flux réellement réalisés — pas les entrées encore
  // attendues ni les dépenses encore seulement prévues.
  const disponibleReel = disponibleNum + totalEntreeRecue;
  const resteEstime =
    disponibleReel - totalDepenseEnveloppes - objStore.epargneMois;
  const pctDepenseEstime =
    disponibleReel > 0
      ? Math.min((totalDepenseEnveloppes / disponibleReel) * 100, 100)
      : 0;
  const largeurBarSegmentAnimee = useLargeurAnimee(pctDepenseEstime);
  const pctEpargneEstime =
    disponibleReel > 0
      ? Math.min(
          (objStore.epargneMois / disponibleReel) * 100,
          100 - pctDepenseEstime,
        )
      : 0;
  const pctEntreeRecueEstime =
    disponibleReel > 0
      ? Math.min(
          (totalEntreeRecue / disponibleReel) * 100,
          100 - pctDepenseEstime - pctEpargneEstime,
        )
      : 0;

  // Comparaison "vs mois dernier" des deux cartes hero, à partir du dernier
  // mois archivé — même logique que "Reste estimé" ci-dessus, rejouée sur
  // les valeurs figées du snapshot au lieu de l'état courant.
  const { mois: moisPrec, annee: anneePrec } = moisPrecedent(
    maintenant.getMonth(),
    maintenant.getFullYear(),
  );
  const snapshotMoisPrecedent = objStore.historiquesMois.find(
    (s) => s.mois === moisPrec && s.annee === anneePrec,
  );
  // La partie "dépenses" se compare au même jour le mois dernier (cumul
  // reconstruit depuis les transactions/paiements, jamais purgés) — pour ne
  // pas comparer un mois en cours forcément partiel à un mois dernier entier.
  // L'épargne n'a pas cette granularité par jour, elle reste comparée en
  // mois complet ci-dessous.
  const jourActuel = maintenant.getDate();
  const jourMaxPrecedent = Math.min(
    jourActuel,
    joursDansMois(moisPrec, anneePrec),
  );
  const totalDepensePrecedent = snapshotMoisPrecedent
    ? depenseCumuleeAuJour(
        objStore.transactions,
        objStore.historiquePaiements,
        moisPrec,
        anneePrec,
        jourMaxPrecedent,
      )
    : null;
  const deltaDepense =
    totalDepensePrecedent !== null
      ? totalDepenseEnveloppes - totalDepensePrecedent
      : null;
  const HISTORIQUE_MOIS_MAX = 6;
  const historiqueDepenseCumulee = snapshotMoisPrecedent
    ? objStore.historiquesMois
        .slice(-HISTORIQUE_MOIS_MAX)
        .map((s) => ({
          mois: s.mois,
          annee: s.annee,
          montant: depenseCumuleeAuJour(
            objStore.transactions,
            objStore.historiquePaiements,
            s.mois,
            s.annee,
            Math.min(jourActuel, joursDansMois(s.mois, s.annee)),
          ),
        }))
        .reverse()
    : [];
  const resteEstimePrecedent = snapshotMoisPrecedent
    ? snapshotMoisPrecedent.disponible +
      totalParType(snapshotMoisPrecedent.enveloppes, true) -
      totalParType(snapshotMoisPrecedent.enveloppes, false) -
      snapshotMoisPrecedent.epargne
    : null;
  const deltaReste =
    resteEstimePrecedent !== null ? resteEstime - resteEstimePrecedent : null;

  const objectifsActifs = objStore.objectifs.filter((o) => !o.ferme);
  const objectifsClotures = objStore.objectifs.filter((o) => o.ferme);
  const objectifsAvecContribution = objectifsActifs.filter(
    (o) => o.contributionMois > 0,
  );
  const contributionObjectifsTotal = objectifsAvecContribution.reduce(
    (acc, o) => acc + o.contributionMois,
    0,
  );
  const epargneGenerique = Math.max(
    0,
    objStore.epargneMois - contributionObjectifsTotal,
  );
  const segmentsEpargne: {
    cle: string;
    label: string;
    couleur: string;
    montant: number;
  }[] = [
    ...objectifsAvecContribution.map((o) => ({
      cle: o.id,
      label: o.nom,
      couleur: o.couleur,
      montant: o.contributionMois,
    })),
    ...(epargneGenerique > 0
      ? [
          {
            cle: "generique",
            label: "Épargne",
            couleur: C.purple,
            montant: epargneGenerique,
          },
        ]
      : []),
  ];
  const segmentsEpargnePositionnes = segmentsEpargne.reduce<
    { cle: string; label: string; couleur: string; montant: number; pct: number; left: number }[]
  >((acc, s) => {
    const pct =
      objStore.epargneMois > 0
        ? (s.montant / objStore.epargneMois) * pctEpargne
        : 0;
    const left =
      acc.length > 0
        ? acc[acc.length - 1].left + acc[acc.length - 1].pct
        : pctUtilise;
    acc.push({ ...s, pct, left });
    return acc;
  }, []);
  const finSegmentsEpargne =
    segmentsEpargnePositionnes.length > 0
      ? segmentsEpargnePositionnes[segmentsEpargnePositionnes.length - 1]
          .left +
        segmentsEpargnePositionnes[segmentsEpargnePositionnes.length - 1].pct
      : pctUtilise;
  const lecture =
    resteEstime < 0
      ? { texte: "Risque de dépassement", couleurTexte: "#FFD2D2" }
      : resteEstime < disponibleReel * 0.15
        ? { texte: "Tu es proche de la limite", couleurTexte: "#FFE0C2" }
        : {
            texte: "Tu devrais rester dans ton budget",
            couleurTexte: "#D2F5E5",
          };

  const ouvrirEditionEnveloppe = (env: Enveloppe) => {
    setEnveloppeEnEdition(env);
    setNomTemp(env.nom);
    setBudgetTemp(String(env.budget));
    setCouleurTemp(env.couleur);
    setPaletteOuverteTemp(false);
    setTypeTemp(env.type);
    setRecurrenteTemp(env.recurrente);
    setDateTemp(env.dateFixe || dateVersISO(new Date()));
    setRepeteChaqueMoisTemp(env.repeteChaqueMois || false);
    setAfficherPlanningTemp(env.afficherDansPlanning || false);
    setModalEnveloppeVisible(true);
  };

  const sauvegarderEnveloppe = () => {
    if (!enveloppeEnEdition) return;
    setEnveloppes(
      enveloppes.map((e) =>
        e.id === enveloppeEnEdition.id
          ? {
              ...e,
              nom: nomTemp || e.nom,
              budget: parseMontant(budgetTemp) || 0,
              couleur: couleurTemp,
              type: typeTemp,
              recurrente: typeTemp !== "Fixe" ? recurrenteTemp : false,
              frequenceJours:
                typeTemp !== "Fixe" && recurrenteTemp ? 30 : undefined,
              dateFixe:
                typeTemp === "Fixe" || typeTemp === "Entrée"
                  ? dateTemp
                  : undefined,
              payee: typeTemp === "Fixe" ? (e.payee ?? false) : undefined,
              repeteChaqueMois:
                typeTemp === "Fixe" ? repeteChaqueMoisTemp : undefined,
              afficherDansPlanning:
                typeTemp === "Fixe" ? afficherPlanningTemp : undefined,
            }
          : e,
      ),
    );
    setModalEnveloppeVisible(false);
  };

  const supprimerEnveloppe = () => {
    if (!enveloppeEnEdition) return;
    const cible = enveloppeEnEdition;
    Alert.alert(
      `Supprimer "${cible.nom}" ?`,
      "Cette action est définitive et supprimera aussi toutes les transactions liées. Cette catégorie ne sera plus disponible pour tes dépenses passées ou futures.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => {
            objStore.supprimerEnveloppe(cible.id);
            setModalEnveloppeVisible(false);
          },
        },
      ],
    );
  };

  const ajouterEnveloppe = async () => {
    if (!nouveauNom || !nouveauBudget || creationEnveloppeEnCours) return;
    setCreationEnveloppeEnCours(true);
    const nouvelle = await objStore.ajouterEnveloppe({
      nom: nouveauNom,
      depense: 0,
      budget: parseMontant(nouveauBudget),
      couleur: nouvelleCouleur,
      type: nouveauType,
      recurrente: nouveauType !== "Fixe" ? estRecurrente : false,
      frequenceJours:
        nouveauType !== "Fixe" && estRecurrente ? 30 : undefined,
      dateFixe:
        nouveauType === "Fixe" || nouveauType === "Entrée"
          ? nouvelleDate
          : undefined,
      payee: nouveauType === "Fixe" ? false : undefined,
      repeteChaqueMois:
        nouveauType === "Fixe" ? nouveauRepeteChaqueMois : undefined,
      afficherDansPlanning:
        nouveauType === "Fixe" ? nouveauAfficherPlanning : undefined,
    });
    setCreationEnveloppeEnCours(false);
    if (!nouvelle) return;
    setNouveauNom("");
    setNouveauBudget("");
    setNouvelleCouleur(PALETTE_COULEURS[0]);
    setPaletteOuverteNouvelle(false);
    setNouveauType("Variable");
    setEstRecurrente(false);
    setNouvelleDate(dateVersISO(new Date()));
    setNouveauRepeteChaqueMois(false);
    setNouveauAfficherPlanning(false);
    setModalAjoutVisible(false);
  };

  const sauvegarderDisponible = () => {
    setArgentDisponible(disponibleTemp, disponibleRecurrentTemp, disponibleReportTemp);
    setEditionDisponible(false);
  };

  const ouvrirModalEpargne = () => {
    setEpargneTemp(String(objStore.epargneMois));
    setVueModal("liste");
    setModalEpargneVisible(true);
  };

  const sauvegarderEtFermerEpargne = () => {
    objStore.modifierEpargneMois(parseMontant(epargneTemp) || 0);
    setModalEpargneVisible(false);
  };

  const resetFormObjectif = () => {
    setNomObjectif("");
    setCibleObjectif("");
    setMontantInitialObjectif("");
    setCouleurObjectif(PALETTE_COULEURS[0]);
    setRecurrentObjectif(false);
    setMontantMensuelObjectif("");
    setJourDuMoisObjectif("1");
    setCalendrierJourOuvert(false);
    setMontantAjoutObjectif("");
  };

  const ouvrirCreationObjectif = () => {
    setObjectifEnEdition(null);
    resetFormObjectif();
    setVueModal("form");
  };

  const ouvrirEditionObjectif = (obj: Objectif) => {
    setObjectifEnEdition(obj);
    setNomObjectif(obj.nom);
    setCibleObjectif(String(obj.cible));
    setMontantInitialObjectif("");
    setCouleurObjectif(obj.couleur);
    setRecurrentObjectif(obj.recurrent ?? false);
    setMontantMensuelObjectif(
      obj.montantMensuel ? String(obj.montantMensuel) : "",
    );
    setJourDuMoisObjectif(obj.jourDuMois ? String(obj.jourDuMois) : "1");
    setCalendrierJourOuvert(false);
    setMontantAjoutObjectif("");
    setVueModal("form");
  };

  const sauvegarderObjectif = async () => {
    if (!nomObjectif || !cibleObjectif || sauvegardeObjectifEnCours) return;
    const cible = parseMontant(cibleObjectif) || 0;
    const montantMensuel = recurrentObjectif
      ? parseMontant(montantMensuelObjectif) || 0
      : undefined;
    const jourDuMois = recurrentObjectif
      ? Math.min(28, Math.max(1, parseInt(jourDuMoisObjectif, 10) || 1))
      : undefined;

    if (objectifEnEdition) {
      objStore.modifierObjectif(objectifEnEdition.id, {
        nom: nomObjectif,
        cible,
        couleur: couleurObjectif,
        recurrent: recurrentObjectif,
        montantMensuel,
        jourDuMois,
      });
    } else {
      setSauvegardeObjectifEnCours(true);
      const nouvel = await objStore.ajouterObjectif(
        nomObjectif,
        cible,
        parseMontant(montantInitialObjectif) || 0,
        couleurObjectif,
        recurrentObjectif,
        montantMensuel,
        jourDuMois,
      );
      setSauvegardeObjectifEnCours(false);
      if (!nouvel) return;
    }
    resetFormObjectif();
    setObjectifEnEdition(null);
    setVueModal("liste");
  };

  const ajouterFondsObjectif = () => {
    if (!objectifEnEdition || !montantAjoutObjectif) return;
    objStore.ajouterFondsObjectif(
      objectifEnEdition.id,
      parseMontant(montantAjoutObjectif) || 0,
    );
    setMontantAjoutObjectif("");
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.fondPage }}>
      <ScrollView
        style={[styles.container, { backgroundColor: C.fondPage }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.header, { backgroundColor: C.fondPage }]}>
          <View>
            <Text style={[styles.appName, { color: C.texte }]}>VISTA</Text>
            <Text style={[styles.subtitle, { color: C.texteMuted }]}>
              {new Date().toLocaleDateString("fr-FR", {
                month: "long",
                year: "numeric",
              })}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <TouchableOpacity
              style={[
                styles.themeBouton,
                { backgroundColor: C.iconeBoutonFond },
              ]}
              onPress={toggleTheme}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Changer de thème"
            >
              <Ionicons
                name={theme === "clair" ? "moon-outline" : "sunny-outline"}
                size={18}
                color={C.iconeBouton}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.avatar, { backgroundColor: C.hero }]}
              onPress={() => router.push("/profil")}
              activeOpacity={0.7}
            >
              {objStore.avatarUrl ? (
                <Image
                  source={{ uri: objStore.avatarUrl }}
                  style={styles.avatarImage}
                  contentFit="cover"
                />
              ) : (
                <Text style={styles.avatarText}>
                  {getInitiales(objStore.prenom, objStore.nom)}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View
          style={[
            styles.hero,
            theme === "sombre"
              ? {
                  backgroundColor: C.carte,
                  borderWidth: 0.5,
                  borderColor: C.carteBorder,
                  borderLeftWidth: 3,
                  borderLeftColor: C.accent,
                }
              : {
                  backgroundColor: "#FFFFFF",
                  borderWidth: 0.5,
                  borderColor: "#E4E6EA",
                  borderLeftWidth: 3,
                  borderLeftColor: C.accent,
                },
          ]}
        >
          <View style={styles.switchLabelLigne}>
            <Text
              style={[
                styles.heroLabel,
                { color: theme === "sombre" ? "rgba(255,255,255,0.6)" : C.texteMuted },
              ]}
            >
              DÉPENSES ET ARGENT IMMOBILISÉ
            </Text>
            <InfoBulle
              titre="Dépenses et argent immobilisé"
              texte="Inclut tes dépenses réelles ainsi que l'argent mis de côté (épargne et objectifs), qui reste à toi mais n'est plus disponible immédiatement."
              couleur={theme === "sombre" ? "rgba(255,255,255,0.6)" : C.texteMuted}
            />
          </View>
          <NombreAnime
            valeur={totalDepense}
            style={[
              styles.heroAmount,
              { color: theme === "sombre" ? "#FFFFFF" : C.texte },
            ]}
          />
          {deltaDepense !== null && (
            <>
              <View style={styles.heroDeltaRow}>
                <Ionicons
                  name={deltaDepense > 0 ? "arrow-up" : "arrow-down"}
                  size={11}
                  color={deltaDepense <= 0 ? C.accentText : C.peachText}
                />
                <Text
                  style={[
                    styles.heroDeltaTexte,
                    { color: deltaDepense <= 0 ? C.accentText : C.peachText },
                  ]}
                >
                  {deltaDepense > 0 ? "+" : ""}
                  {deltaDepense} € vs mois dernier (au {jourMaxPrecedent})
                </Text>
                <InfoBulle
                  titre="Comparaison au même jour"
                  texte={`Comparé aux dépenses cumulées au même jour le mois dernier (du 1er au ${jourMaxPrecedent}), pas au mois complet — pour une comparaison à période équivalente.`}
                  couleur={theme === "sombre" ? "rgba(255,255,255,0.6)" : C.texteMuted}
                />
              </View>
              {historiqueDepenseCumulee.length > 0 && (
                <TouchableOpacity
                  style={styles.heroHistoriqueBouton}
                  onPress={() => setHistoriqueDepenseOuvert((v) => !v)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.heroHistoriqueTexte,
                      { color: theme === "sombre" ? "rgba(255,255,255,0.6)" : C.texteMuted },
                    ]}
                  >
                    {historiqueDepenseOuvert ? "Masquer l'historique" : "Voir l'historique"}
                  </Text>
                  <Ionicons
                    name={historiqueDepenseOuvert ? "chevron-up" : "chevron-down"}
                    size={11}
                    color={theme === "sombre" ? "rgba(255,255,255,0.6)" : C.texteMuted}
                  />
                </TouchableOpacity>
              )}
              {historiqueDepenseOuvert && (
                <View style={styles.heroHistoriqueListe}>
                  {historiqueDepenseCumulee.map((h) => (
                    <Text
                      key={`${h.annee}-${h.mois}`}
                      style={[
                        styles.heroHistoriqueLigne,
                        { color: theme === "sombre" ? "rgba(255,255,255,0.6)" : C.texteMuted },
                      ]}
                    >
                      {MOIS_LABELS[h.mois]} {h.annee} : {h.montant} €
                    </Text>
                  ))}
                </View>
              )}
            </>
          )}
          <View
            style={[
              styles.barBg,
              {
                backgroundColor:
                  theme === "sombre" ? "rgba(255,255,255,0.2)" : C.separateur,
              },
            ]}
          >
            <Animated.View
              style={[
                styles.barFill,
                { width: largeurBarFillAnimee, backgroundColor: C.accent },
              ]}
            />
            {segmentsEpargnePositionnes.map((s) => (
              <View
                key={s.cle}
                style={[
                  styles.barFillEpargne,
                  {
                    width: `${s.pct}%`,
                    left: `${s.left}%`,
                    backgroundColor: s.couleur,
                  },
                ]}
              />
            ))}
            {totalEntreeRecue > 0 && (
              <View
                style={[
                  styles.barFillEpargne,
                  {
                    width: `${pctEntreeRecue}%`,
                    left: `${finSegmentsEpargne}%`,
                    backgroundColor: C.vert,
                  },
                ]}
              />
            )}
          </View>
          <View style={styles.heroLegende}>
            <View style={styles.heroLegendeItem}>
              <View
                style={[styles.heroLegendeDot, { backgroundColor: C.accent }]}
              />
              <Text
                style={[
                  styles.heroSub,
                  {
                    color:
                      theme === "sombre" ? "rgba(255,255,255,0.7)" : C.texteMuted,
                  },
                ]}
              >
                Dépenses {totalDepenseEnveloppes} €
              </Text>
            </View>
            {segmentsEpargnePositionnes.map((s) => (
              <View key={s.cle} style={styles.heroLegendeItem}>
                <View
                  style={[styles.heroLegendeDot, { backgroundColor: s.couleur }]}
                />
                <Text
                  style={[
                    styles.heroSub,
                    {
                      color:
                        theme === "sombre" ? "rgba(255,255,255,0.7)" : C.texteMuted,
                    },
                  ]}
                >
                  {s.label} {s.montant} €
                </Text>
              </View>
            ))}
            {totalEntreeRecue > 0 && (
              <View style={styles.heroLegendeItem}>
                <View
                  style={[styles.heroLegendeDot, { backgroundColor: C.vert }]}
                />
                <Text
                  style={[
                    styles.heroSub,
                    {
                      color:
                        theme === "sombre" ? "rgba(255,255,255,0.7)" : C.texteMuted,
                    },
                  ]}
                >
                  Revenus {totalEntreeRecue} €
                </Text>
              </View>
            )}
          </View>
        </View>

        <View
          style={[
            styles.hero,
            theme === "sombre"
              ? {
                  backgroundColor: C.carte,
                  borderWidth: 0.5,
                  borderColor: C.carteBorder,
                  borderLeftWidth: 3,
                  borderLeftColor: C.peach,
                }
              : {
                  backgroundColor: "#FFFFFF",
                  borderWidth: 0.5,
                  borderColor: "#E4E6EA",
                  borderLeftWidth: 3,
                  borderLeftColor: C.peach,
                },
          ]}
        >
          <Text
            style={[
              styles.heroLabel,
              { color: theme === "sombre" ? "rgba(255,255,255,0.6)" : C.texteMuted },
            ]}
          >
            RESTE ESTIMÉ CE MOIS
          </Text>
          <NombreAnime
            valeur={resteEstime}
            style={[
              styles.heroAmount,
              theme === "sombre"
                ? { color: resteEstime < 0 ? "#FFD2D2" : "#FFFFFF" }
                : { color: resteEstime < 0 ? C.peachText : C.texte },
            ]}
          />
          {deltaReste !== null && (
            <View style={styles.heroDeltaRow}>
              <Ionicons
                name={deltaReste >= 0 ? "arrow-up" : "arrow-down"}
                size={11}
                color={deltaReste >= 0 ? C.accentText : C.peachText}
              />
              <Text
                style={[
                  styles.heroDeltaTexte,
                  { color: deltaReste >= 0 ? C.accentText : C.peachText },
                ]}
              >
                {deltaReste > 0 ? "+" : ""}
                {deltaReste} € vs mois dernier
              </Text>
            </View>
          )}
          <View
            style={[
              styles.barBg,
              {
                backgroundColor:
                  theme === "sombre" ? "rgba(255,255,255,0.2)" : C.separateur,
              },
            ]}
          >
            <Animated.View
              style={[
                styles.barSegment,
                { width: largeurBarSegmentAnimee, backgroundColor: C.accent },
              ]}
            />
            {segmentsEpargne.map((s) => {
              const pct =
                objStore.epargneMois > 0
                  ? (s.montant / objStore.epargneMois) * pctEpargneEstime
                  : 0;
              return (
                <View
                  key={s.cle}
                  style={[
                    styles.barSegment,
                    {
                      width: `${pct}%`,
                      backgroundColor: s.couleur,
                    },
                  ]}
                />
              );
            })}
            {totalEntreeRecue > 0 && (
              <View
                style={[
                  styles.barSegment,
                  { width: `${pctEntreeRecueEstime}%`, backgroundColor: C.vert },
                ]}
              />
            )}
          </View>
          <View style={styles.heroLegende}>
            <View style={styles.heroLegendeItem}>
              <View
                style={[styles.heroLegendeDot, { backgroundColor: C.accent }]}
              />
              <Text
                style={[
                  styles.heroSub,
                  {
                    color:
                      theme === "sombre" ? "rgba(255,255,255,0.7)" : C.texteMuted,
                  },
                ]}
              >
                Dépensé {totalDepenseEnveloppes}€
              </Text>
            </View>
            {segmentsEpargne.map((s) => (
              <View key={s.cle} style={styles.heroLegendeItem}>
                <View
                  style={[styles.heroLegendeDot, { backgroundColor: s.couleur }]}
                />
                <Text
                  style={[
                    styles.heroSub,
                    {
                      color:
                        theme === "sombre" ? "rgba(255,255,255,0.7)" : C.texteMuted,
                    },
                  ]}
                >
                  {s.label} {s.montant}€
                </Text>
              </View>
            ))}
            {totalEntreeRecue > 0 && (
              <View style={styles.heroLegendeItem}>
                <View
                  style={[styles.heroLegendeDot, { backgroundColor: C.vert }]}
                />
                <Text
                  style={[
                    styles.heroSub,
                    {
                      color:
                        theme === "sombre" ? "rgba(255,255,255,0.7)" : C.texteMuted,
                    },
                  ]}
                >
                  Revenus {totalEntreeRecue}€
                </Text>
              </View>
            )}
          </View>

          <View
            style={[
              styles.lectureBanner,
              theme === "sombre"
                ? { backgroundColor: lecture.couleurTexte + "33" }
                : { backgroundColor: C.fond },
            ]}
          >
            <Text
              style={[
                styles.lectureTexte,
                { color: theme === "sombre" ? lecture.couleurTexte : C.texte },
              ]}
            >
              {lecture.texte}
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View
            style={[
              styles.statCard,
              theme === "sombre"
                ? {
                    backgroundColor: C.carte,
                    borderWidth: 0.5,
                    borderColor: C.carteBorder,
                    borderLeftWidth: 3,
                    borderLeftColor: C.peach,
                  }
                : {
                    backgroundColor: "#FFFFFF",
                    borderWidth: 0.5,
                    borderColor: "#E4E6EA",
                    borderLeftWidth: 3,
                    borderLeftColor: C.peach,
                  },
            ]}
          >
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                setDisponibleTemp(disponibleNum === 0 ? "" : argentDisponible);
                setDisponibleRecurrentTemp(objStore.argentDisponibleRecurrent);
                setDisponibleReportTemp(objStore.argentDisponibleReportAuto);
                setEditionDisponible(true);
              }}
            >
              <View style={styles.statLabelRow}>
                <Text
                  style={[
                    styles.statLabel,
                    { color: theme === "sombre" ? C.peach : C.texteMuted },
                  ]}
                >
                  DISPONIBLE
                </Text>
                <Ionicons
                  name="pencil-outline"
                  size={12}
                  color={theme === "sombre" ? C.peach : C.texteMuted}
                />
              </View>
              <Text
                style={[
                  styles.statValue,
                  { color: theme === "sombre" ? C.peachText : C.texte },
                ]}
              >
                {disponibleEffectif} €
              </Text>
            </TouchableOpacity>

            {entreesRecuesCeMois.length > 0 && (
              <>
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.statImpactRow}
                  onPress={() =>
                    setEntreesDisponibleOuvert(!entreesDisponibleOuvert)
                  }
                >
                  <Text style={[styles.statImpactTexte, { color: C.vertText }]}>
                    dont {entreesRecuesCeMois.length} entrée
                    {entreesRecuesCeMois.length > 1 ? "s" : ""} reçue
                    {entreesRecuesCeMois.length > 1 ? "s" : ""} ce mois-ci
                    (+{totalEntreesRecuesCeMois}€)
                  </Text>
                  <Text style={[styles.statImpactChevron, { color: C.vertText }]}>
                    {entreesDisponibleOuvert ? "▾" : "▸"}
                  </Text>
                </TouchableOpacity>
                {entreesDisponibleOuvert && (
                  <View style={styles.statImpactTiroir}>
                    {entreesRecuesCeMois.map((e) => (
                      <View key={e.id} style={styles.statImpactLigne}>
                        <Text
                          style={[styles.statImpactLigneNom, { color: C.texte }]}
                          numberOfLines={1}
                        >
                          {e.nom}
                        </Text>
                        <Text
                          style={[
                            styles.statImpactLigneDetail,
                            { color: C.vertText },
                          ]}
                        >
                          +{e.budget}€ · {formaterDateLongue(e.dateFixe!)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.epargneCard,
            theme === "sombre"
              ? {
                  backgroundColor: C.carte,
                  borderColor: C.carteBorder,
                  borderLeftWidth: 3,
                  borderLeftColor: C.purple,
                }
              : {
                  backgroundColor: "#FFFFFF",
                  borderColor: "#E4E6EA",
                  borderLeftWidth: 3,
                  borderLeftColor: C.purple,
                },
          ]}
          activeOpacity={0.7}
          onPress={ouvrirModalEpargne}
        >
          <View
            style={[styles.epargneIconBox, { backgroundColor: C.accentLight }]}
          >
            <Ionicons name="wallet-outline" size={22} color={C.accentText} />
          </View>
          <View style={styles.epargneTexte}>
            <Text style={[styles.epargneLabel, { color: C.texte }]}>
              Mis de côté ce mois
            </Text>
            <Text style={[styles.epargneSub, { color: C.texteMuted }]}>
              {objectifsActifs.length > 0
                ? `${objectifsActifs.length} objectif${objectifsActifs.length > 1 ? "s" : ""} en cours`
                : "Créer un objectif d'épargne"}
            </Text>
          </View>
          <Text style={[styles.epargneMontantAffiche, { color: C.accent }]}>
            {objStore.epargneMois} €
          </Text>
        </TouchableOpacity>

        {depensesNonCategorisees > 0 && (
          <TouchableOpacity
            style={styles.indicateurNonCategorise}
            activeOpacity={0.7}
            onPress={() =>
              router.push({
                pathname: "/budget",
                params: { section: "autres-depenses" },
              })
            }
          >
            <Ionicons
              name="information-circle-outline"
              size={14}
              color={C.texteMuted}
            />
            <Text
              style={[
                styles.indicateurNonCategoriseTexte,
                { color: C.texteMuted },
              ]}
            >
              {depensesNonCategorisees}€ de dépenses non catégorisées
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: C.texteMuted }]}>
            CATÉGORIES
          </Text>
          <TouchableOpacity
            style={[
              styles.btnAjoutEnveloppe,
              { backgroundColor: C.purpleLight },
            ]}
            onPress={() => {
              setNouvelleDate(dateVersISO(new Date()));
              setModalAjoutVisible(true);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.btnAjoutTexte, { color: C.purple }]}>
              + Ajouter
            </Text>
          </TouchableOpacity>
        </View>

        {enveloppes.map((env) => {
          const pct = Math.min((env.depense / env.budget) * 100, 100);
          return (
            <TouchableOpacity
              key={env.id}
              style={[
                styles.envCard,
                { backgroundColor: bgClair(env.couleur) },
              ]}
              activeOpacity={0.7}
              onPress={() => ouvrirEditionEnveloppe(env)}
            >
              <View
                style={[
                  styles.typePastille,
                  {
                    backgroundColor:
                      env.type === "Entrée" ? C.accentLight : C.peachLight,
                  },
                ]}
              >
                <Ionicons
                  name={env.type === "Entrée" ? "add" : "remove"}
                  size={13}
                  color={env.type === "Entrée" ? C.accentText : C.peachText}
                />
              </View>
              <View style={styles.envRow}>
                <View style={styles.envNomRow}>
                  <Text style={[styles.envNom, { color: C.texte }]}>
                    {env.nom}
                  </Text>
                  {env.type === "Fixe" ? (
                    <View style={styles.badgesRow}>
                      {env.payee ? (
                        <View
                          style={[
                            styles.recurrenceBadge,
                            { backgroundColor: C.accentLight },
                          ]}
                        >
                          <Ionicons
                            name="checkmark"
                            size={12}
                            color={C.texte}
                          />
                        </View>
                      ) : (
                        <View
                          style={[
                            styles.recurrenceBadge,
                            { backgroundColor: C.iconeBoutonFond },
                          ]}
                        >
                          <Ionicons
                            name="calendar-outline"
                            size={12}
                            color={C.texte}
                          />
                        </View>
                      )}
                      {env.repeteChaqueMois && (
                        <View
                          style={[
                            styles.recurrenceBadge,
                            { backgroundColor: C.iconeBoutonFond },
                          ]}
                        >
                          <Ionicons name="repeat" size={12} color={C.texte} />
                        </View>
                      )}
                    </View>
                  ) : env.type === "Entrée" ? (
                    <View style={styles.badgesRow}>
                      {env.dateFixe && (
                        <View
                          style={[
                            styles.recurrenceBadge,
                            { backgroundColor: C.vertLight },
                          ]}
                        >
                          <Ionicons
                            name="calendar-outline"
                            size={12}
                            color={C.vertText}
                          />
                        </View>
                      )}
                      {env.recurrente && (
                        <View
                          style={[
                            styles.recurrenceBadge,
                            { backgroundColor: C.iconeBoutonFond },
                          ]}
                        >
                          <Ionicons name="repeat" size={12} color={C.texte} />
                        </View>
                      )}
                    </View>
                  ) : (
                    env.recurrente && (
                      <View
                        style={[
                          styles.recurrenceBadge,
                          { backgroundColor: C.iconeBoutonFond },
                        ]}
                      >
                        <Ionicons name="repeat" size={12} color={C.texte} />
                      </View>
                    )
                  )}
                </View>
                <Text style={[styles.envMontant, { color: env.couleur }]}>
                  {env.depense} € / {env.budget} €
                </Text>
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
          );
        })}

        <View
          style={[
            styles.graphCard,
            { backgroundColor: C.carte, borderColor: C.carteBorder },
          ]}
        >
          <Text style={[styles.cardTitre, { color: C.texte }]}>
            Vue d'ensemble des dépenses
          </Text>
          <Text style={[styles.graphSousTitre, { color: C.texteMuted }]}>
            L'épargne n'est pas comptée ici, c'est de l'argent mis de côté
          </Text>
          <View style={styles.graphContent}>
            <DonutChart
              couleurs={C}
              data={enveloppesSansEntree.map((e) => ({
                couleur: e.couleur,
                valeur: e.depense,
              }))}
            />
            <View style={styles.graphLegende}>
              {enveloppesSansEntree
                .filter((e) => e.depense > 0)
                .map((e) => (
                  <View key={e.id} style={styles.legendeItem}>
                    <View
                      style={[
                        styles.legendeDot,
                        { backgroundColor: e.couleur },
                      ]}
                    />
                    <Text
                      style={[styles.legendeNom, { color: C.texte }]}
                      numberOfLines={1}
                    >
                      {e.nom}
                    </Text>
                    <Text style={[styles.legendePct, { color: C.texteMuted }]}>
                      {totalDepenseEnveloppes > 0
                        ? Math.round((e.depense / totalDepenseEnveloppes) * 100)
                        : 0}
                      %
                    </Text>
                  </View>
                ))}
            </View>
          </View>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>

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
        visible={editionDisponible}
        animationType={reduireAnimations ? "none" : "slide"}
        transparent
        onRequestClose={() => setEditionDisponible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalOverlayTouch}>
            <View style={[styles.modalCard, { backgroundColor: C.carte }]}>
              <Text style={[styles.modalTitre, { color: C.texte }]}>
                Montant disponible
              </Text>
              <Text style={[styles.modalLabel, { color: C.texteMuted }]}>
                Montant total pour ce mois
              </Text>
              <View style={styles.modalInputRow}>
                <TextInput
                  style={[
                    styles.input,
                    { flex: 1, backgroundColor: C.fondSecondaire, color: C.texte },
                  ]}
                  keyboardType="decimal-pad"
                  value={disponibleTemp}
                  onChangeText={(text) => setDisponibleTemp(sanitizeMontantInput(text))}
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                  autoFocus
                  inputAccessoryViewID={ACCESSORY_ID}
                />
                <Text style={[styles.modalEuro, { color: C.texteMuted }]}>€</Text>
              </View>
              <View style={styles.switchRow}>
                <View style={styles.switchRowLabel}>
                  <Text style={[styles.switchLabel, { color: C.texte }]}>
                    Répéter ce montant chaque mois
                  </Text>
                  <Text style={[styles.switchSub, { color: C.texteMuted }]}>
                    Repris automatiquement le mois suivant
                  </Text>
                </View>
                <Switch
                  value={disponibleRecurrentTemp}
                  onValueChange={setDisponibleRecurrentTemp}
                  trackColor={{ false: C.separateur, true: C.purpleLight }}
                  thumbColor={disponibleRecurrentTemp ? C.purple : "#FFF"}
                />
              </View>
              <View style={styles.switchRow}>
                <View style={styles.switchRowLabel}>
                  <View style={styles.switchLabelLigne}>
                    <Text
                      style={[
                        styles.switchLabel,
                        { color: C.texte, flexShrink: 1 },
                      ]}
                    >
                      Reporter le reste non dépensé au mois prochain
                    </Text>
                    <InfoBulle
                      titre="Reporter le reste"
                      texte="Le reste est calculé comme Disponible + entrées d'argent - dépenses réelles - épargne. Ce montant est ajouté au Disponible du mois suivant."
                    />
                  </View>
                  <Text style={[styles.switchSub, { color: C.texteMuted }]}>
                    Ce qu&apos;il reste une fois les dépenses et
                    l&apos;épargne déduites s&apos;ajoute au Disponible du
                    mois suivant, en plus du montant récurrent éventuel.
                  </Text>
                </View>
                <Switch
                  value={disponibleReportTemp}
                  onValueChange={setDisponibleReportTemp}
                  trackColor={{ false: C.separateur, true: C.purpleLight }}
                  thumbColor={disponibleReportTemp ? C.purple : "#FFF"}
                />
              </View>
              <TouchableOpacity
                style={[styles.btnAjouter, { backgroundColor: C.hero }]}
                onPress={() => {
                  Keyboard.dismiss();
                  sauvegarderDisponible();
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.btnAjouterTexte}>Enregistrer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnAnnuler}
                onPress={() => setEditionDisponible(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.btnAnnulerTexte, { color: C.texteMuted }]}>
                  Annuler
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={modalEnveloppeVisible}
        animationType={reduireAnimations ? "none" : "slide"}
        transparent
        onRequestClose={() => setModalEnveloppeVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalOverlayTouch}>
            <View style={[styles.modalCard, { backgroundColor: C.carte }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitre, { color: C.texte }]}>Modifier la catégorie</Text>
              </View>
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={[styles.modalLabel, { color: C.texteMuted }]}>Nom</Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: C.fondSecondaire, color: C.texte },
                  ]}
                  value={nomTemp}
                  onChangeText={setNomTemp}
                  returnKeyType="done"
                />

                <Text style={[styles.modalLabel, { color: C.texteMuted }]}>Type</Text>
                <View style={styles.typeRow}>
                  <TouchableOpacity
                    style={[
                      styles.typeChip,
                      { backgroundColor: C.fondSecondaire },
                      typeTemp === "Variable" && { backgroundColor: C.purple },
                    ]}
                    onPress={() => setTypeTemp("Variable")}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.typeChipTexte,
                        { color: C.texteMuted },
                        typeTemp === "Variable" && styles.typeChipTexteActif,
                      ]}
                    >
                      Variable
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.typeChip,
                      { backgroundColor: C.fondSecondaire },
                      typeTemp === "Fixe" && { backgroundColor: C.purple },
                    ]}
                    onPress={() => setTypeTemp("Fixe")}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.typeChipTexte,
                        { color: C.texteMuted },
                        typeTemp === "Fixe" && styles.typeChipTexteActif,
                      ]}
                    >
                      Fixe
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.typeChip,
                      { backgroundColor: C.fondSecondaire },
                      typeTemp === "Entrée" && { backgroundColor: C.vert },
                    ]}
                    onPress={() => setTypeTemp("Entrée")}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.typeChipTexte,
                        { color: C.texteMuted },
                        typeTemp === "Entrée" && styles.typeChipTexteActif,
                      ]}
                    >
                      Entrée d&apos;argent
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.modalLabel, { color: C.texteMuted }]}>Budget de la catégorie</Text>
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
                    keyboardType="decimal-pad"
                    value={budgetTemp}
                    onChangeText={(text) => setBudgetTemp(sanitizeMontantInput(text))}
                    returnKeyType="done"
                    inputAccessoryViewID={ACCESSORY_ID}
                  />
                  <Text style={[styles.modalEuro, { color: C.texteMuted }]}>€</Text>
                </View>

                <Text style={[styles.modalLabel, { color: C.texteMuted }]}>Couleur</Text>
                <TouchableOpacity
                  style={[styles.couleurTiroirBouton, { backgroundColor: C.fondSecondaire }]}
                  onPress={() => setPaletteOuverteTemp(!paletteOuverteTemp)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.couleurRond,
                      { backgroundColor: couleurTemp },
                    ]}
                  />
                  <Text style={[styles.couleurTiroirTexte, { color: C.texte }]}>
                    Choisir une couleur
                  </Text>
                  <Text style={[styles.couleurChevron, { color: C.texteMuted }]}>
                    {paletteOuverteTemp ? "▾" : "▸"}
                  </Text>
                </TouchableOpacity>
                {paletteOuverteTemp && (
                  <ColorPicker
                    value={couleurTemp}
                    onChange={(c) => {
                      setCouleurTemp(c);
                      setPaletteOuverteTemp(false);
                    }}
                    borderColor={C.texte}
                  />
                )}

                {typeTemp !== "Fixe" && (
                  <View style={styles.switchRow}>
                    <View>
                      <Text style={[styles.switchLabel, { color: C.texte }]}>Récurrente</Text>
                      <Text style={[styles.switchSub, { color: C.texteMuted }]}>
                        Se répète chaque mois
                      </Text>
                    </View>
                    <Switch
                      value={recurrenteTemp}
                      onValueChange={setRecurrenteTemp}
                      trackColor={{ false: C.separateur, true: C.purpleLight }}
                      thumbColor={recurrenteTemp ? C.purple : "#FFF"}
                    />
                  </View>
                )}

                {typeTemp === "Entrée" && (
                  <>
                    <Text style={[styles.modalLabel, { color: C.texteMuted }]}>Date prévue</Text>
                    <View style={[styles.calendarWrap, { borderColor: C.separateur }]}>
                      <Calendar
                        current={dateTemp}
                        onDayPress={(day) => setDateTemp(day.dateString)}
                        markedDates={{
                          [dateTemp]: { selected: true, selectedColor: C.vert },
                        }}
                        theme={{
                          calendarBackground: C.carte,
                          dayTextColor: C.texte,
                          monthTextColor: C.texte,
                          textDisabledColor: C.texteMuted,
                          textSectionTitleColor: C.texteMuted,
                          selectedDayTextColor: "#FFFFFF",
                          selectedDayBackgroundColor: C.vert,
                          todayTextColor: C.vert,
                          arrowColor: C.vert,
                        }}
                      />
                    </View>
                  </>
                )}

                {typeTemp === "Fixe" && (
                  <>
                    <Text style={[styles.modalLabel, { color: C.texteMuted }]}>Date de paiement</Text>
                    <View style={[styles.calendarWrap, { borderColor: C.separateur }]}>
                      <Calendar
                        current={dateTemp}
                        onDayPress={(day) => setDateTemp(day.dateString)}
                        markedDates={{
                          [dateTemp]: { selected: true, selectedColor: C.purple },
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

                    <View style={styles.switchRow}>
                      <View>
                        <Text style={[styles.switchLabel, { color: C.texte }]}>
                          Se répète tous les mois
                        </Text>
                        <Text style={[styles.switchSub, { color: C.texteMuted }]}>
                          Comme un loyer ou un abonnement
                        </Text>
                      </View>
                      <Switch
                        value={repeteChaqueMoisTemp}
                        onValueChange={setRepeteChaqueMoisTemp}
                        trackColor={{ false: C.separateur, true: C.purpleLight }}
                        thumbColor={repeteChaqueMoisTemp ? C.purple : "#FFF"}
                      />
                    </View>

                    <View style={styles.switchRow}>
                      <View>
                        <Text style={[styles.switchLabel, { color: C.texte }]}>
                          Afficher dans Planning
                        </Text>
                        <Text style={[styles.switchSub, { color: C.texteMuted }]}>
                          Visible aussi dans ton agenda
                        </Text>
                      </View>
                      <Switch
                        value={afficherPlanningTemp}
                        onValueChange={setAfficherPlanningTemp}
                        trackColor={{ false: C.separateur, true: C.purpleLight }}
                        thumbColor={afficherPlanningTemp ? C.purple : "#FFF"}
                      />
                    </View>
                  </>
                )}

                <TouchableOpacity
                  style={[styles.btnAjouter, { backgroundColor: C.purple }]}
                  onPress={sauvegarderEnveloppe}
                  activeOpacity={0.7}
                >
                  <Text style={styles.btnAjouterTexte}>Enregistrer</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.btnSupprimerTexte}
                  onPress={supprimerEnveloppe}
                  activeOpacity={0.7}
                >
                  <Text style={styles.btnSupprimerTexteLabel}>
                    Supprimer la catégorie
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.btnAnnuler}
                  onPress={() => setModalEnveloppeVisible(false)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.btnAnnulerTexte, { color: C.texteMuted }]}>Annuler</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={modalAjoutVisible}
        animationType={reduireAnimations ? "none" : "slide"}
        transparent
        onRequestClose={() => setModalAjoutVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalOverlayTouch}>
            <View style={[styles.modalCard, { backgroundColor: C.carte }]}>
              <Text style={[styles.modalTitre, { color: C.texte }]}>Nouvelle catégorie</Text>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={[styles.modalLabel, { color: C.texteMuted }]}>Nom</Text>
                <TextInput
                  style={[
                    styles.input,
                    { backgroundColor: C.fondSecondaire, color: C.texte },
                  ]}
                  placeholder="Ex : Vacances, Sport..."
                  placeholderTextColor={C.texteMuted}
                  value={nouveauNom}
                  onChangeText={setNouveauNom}
                  returnKeyType="done"
                />

                <Text style={[styles.modalLabel, { color: C.texteMuted }]}>Type</Text>
                <View style={styles.typeRow}>
                  <TouchableOpacity
                    style={[
                      styles.typeChip,
                      { backgroundColor: C.fondSecondaire },
                      nouveauType === "Variable" && {
                        backgroundColor: C.purple,
                      },
                    ]}
                    onPress={() => setNouveauType("Variable")}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.typeChipTexte,
                        { color: C.texteMuted },
                        nouveauType === "Variable" && styles.typeChipTexteActif,
                      ]}
                    >
                      Variable
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.typeChip,
                      { backgroundColor: C.fondSecondaire },
                      nouveauType === "Fixe" && { backgroundColor: C.purple },
                    ]}
                    onPress={() => setNouveauType("Fixe")}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.typeChipTexte,
                        { color: C.texteMuted },
                        nouveauType === "Fixe" && styles.typeChipTexteActif,
                      ]}
                    >
                      Fixe
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.typeChip,
                      styles.typeChipAvecInfo,
                      styles.typeChipEntree,
                      { backgroundColor: C.fondSecondaire },
                      nouveauType === "Entrée" && { backgroundColor: C.vert },
                    ]}
                    onPress={() => setNouveauType("Entrée")}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.typeChipTexte,
                        { color: C.texteMuted },
                        nouveauType === "Entrée" && styles.typeChipTexteActif,
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      Entrée d&apos;argent
                    </Text>
                    <InfoBulle
                      titre="Entrée d'argent"
                      texte="Une catégorie de type Entrée d'argent s'additionne à ton Disponible au lieu de s'en soustraire, contrairement à une catégorie de dépense classique."
                      taille={13}
                      couleur={
                        nouveauType === "Entrée" ? "#FFFFFF" : C.texteMuted
                      }
                    />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.modalAide, { color: C.texteMuted }]}>
                  {nouveauType === "Variable"
                    ? "Une dépense courante comme Courses ou Loisirs"
                    : nouveauType === "Fixe"
                      ? "Une dépense payée à une date précise, ponctuelle ou chaque mois"
                      : "Une entrée d'argent qui s'ajoute à ton Disponible, comme un salaire ou un remboursement"}
                </Text>

                <Text style={[styles.modalLabel, { color: C.texteMuted }]}>Budget mensuel</Text>
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
                    keyboardType="decimal-pad"
                    value={nouveauBudget}
                    onChangeText={(text) => setNouveauBudget(sanitizeMontantInput(text))}
                    returnKeyType="done"
                    inputAccessoryViewID={ACCESSORY_ID}
                  />
                  <Text style={[styles.modalEuro, { color: C.texteMuted }]}>€</Text>
                </View>

                <Text style={[styles.modalLabel, { color: C.texteMuted }]}>Couleur</Text>
                <TouchableOpacity
                  style={[styles.couleurTiroirBouton, { backgroundColor: C.fondSecondaire }]}
                  onPress={() =>
                    setPaletteOuverteNouvelle(!paletteOuverteNouvelle)
                  }
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.couleurRond,
                      { backgroundColor: nouvelleCouleur },
                    ]}
                  />
                  <Text style={[styles.couleurTiroirTexte, { color: C.texte }]}>
                    Choisir une couleur
                  </Text>
                  <Text style={[styles.couleurChevron, { color: C.texteMuted }]}>
                    {paletteOuverteNouvelle ? "▾" : "▸"}
                  </Text>
                </TouchableOpacity>
                {paletteOuverteNouvelle && (
                  <ColorPicker
                    value={nouvelleCouleur}
                    onChange={(c) => {
                      setNouvelleCouleur(c);
                      setPaletteOuverteNouvelle(false);
                    }}
                    borderColor={C.texte}
                  />
                )}

                {nouveauType !== "Fixe" && (
                  <View style={styles.switchRow}>
                    <View>
                      <Text style={[styles.switchLabel, { color: C.texte }]}>Récurrente</Text>
                      <Text style={[styles.switchSub, { color: C.texteMuted }]}>
                        Se répète chaque mois
                      </Text>
                    </View>
                    <Switch
                      value={estRecurrente}
                      onValueChange={setEstRecurrente}
                      trackColor={{ false: C.separateur, true: C.purpleLight }}
                      thumbColor={estRecurrente ? C.purple : "#FFF"}
                    />
                  </View>
                )}

                {nouveauType === "Entrée" && (
                  <>
                    <Text style={[styles.modalLabel, { color: C.texteMuted }]}>Date prévue</Text>
                    <View style={[styles.calendarWrap, { borderColor: C.separateur }]}>
                      <Calendar
                        current={nouvelleDate}
                        onDayPress={(day) => setNouvelleDate(day.dateString)}
                        markedDates={{
                          [nouvelleDate]: {
                            selected: true,
                            selectedColor: C.vert,
                          },
                        }}
                        theme={{
                          calendarBackground: C.carte,
                          dayTextColor: C.texte,
                          monthTextColor: C.texte,
                          textDisabledColor: C.texteMuted,
                          textSectionTitleColor: C.texteMuted,
                          selectedDayTextColor: "#FFFFFF",
                          selectedDayBackgroundColor: C.vert,
                          todayTextColor: C.vert,
                          arrowColor: C.vert,
                        }}
                      />
                    </View>
                  </>
                )}

                {nouveauType === "Fixe" && (
                  <>
                    <Text style={[styles.modalLabel, { color: C.texteMuted }]}>Date de paiement</Text>
                    <View style={[styles.calendarWrap, { borderColor: C.separateur }]}>
                      <Calendar
                        current={nouvelleDate}
                        onDayPress={(day) => setNouvelleDate(day.dateString)}
                        markedDates={{
                          [nouvelleDate]: {
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

                    <View style={styles.switchRow}>
                      <View>
                        <Text style={[styles.switchLabel, { color: C.texte }]}>
                          Se répète tous les mois
                        </Text>
                        <Text style={[styles.switchSub, { color: C.texteMuted }]}>
                          Comme un loyer ou un abonnement
                        </Text>
                      </View>
                      <Switch
                        value={nouveauRepeteChaqueMois}
                        onValueChange={setNouveauRepeteChaqueMois}
                        trackColor={{ false: C.separateur, true: C.purpleLight }}
                        thumbColor={nouveauRepeteChaqueMois ? C.purple : "#FFF"}
                      />
                    </View>

                    <View style={styles.switchRow}>
                      <View>
                        <Text style={[styles.switchLabel, { color: C.texte }]}>
                          Afficher dans Planning
                        </Text>
                        <Text style={[styles.switchSub, { color: C.texteMuted }]}>
                          Visible aussi dans ton agenda
                        </Text>
                      </View>
                      <Switch
                        value={nouveauAfficherPlanning}
                        onValueChange={setNouveauAfficherPlanning}
                        trackColor={{ false: C.separateur, true: C.purpleLight }}
                        thumbColor={nouveauAfficherPlanning ? C.purple : "#FFF"}
                      />
                    </View>
                  </>
                )}

                <TouchableOpacity
                  style={[
                    styles.btnAjouter,
                    {
                      backgroundColor: C.purple,
                      opacity: creationEnveloppeEnCours ? 0.6 : 1,
                    },
                  ]}
                  onPress={ajouterEnveloppe}
                  activeOpacity={0.7}
                  disabled={creationEnveloppeEnCours}
                >
                  {creationEnveloppeEnCours ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.btnAjouterTexte}>
                      Créer la catégorie
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.btnAnnuler}
                  onPress={() => setModalAjoutVisible(false)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.btnAnnulerTexte, { color: C.texteMuted }]}>Annuler</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={modalEpargneVisible}
        animationType={reduireAnimations ? "none" : "slide"}
        transparent
        onRequestClose={() => setModalEpargneVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalOverlayTouch}>
            <View style={[styles.modalCard, { backgroundColor: C.carte }]}>
              {vueModal === "liste" ? (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitre, { color: C.texte }]}>
                      Épargne
                    </Text>
                    <TouchableOpacity
                      onPress={() => setModalEpargneVisible(false)}
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
                    <Text style={[styles.sectionTitle, { color: C.texteMuted }]}>
                      CE MOIS-CI
                    </Text>
                    <Text style={[styles.modalLabel, { color: C.texteMuted }]}>
                      Épargne par mois
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
                        keyboardType="decimal-pad"
                        value={epargneTemp}
                        onChangeText={(text) => setEpargneTemp(sanitizeMontantInput(text))}
                        returnKeyType="done"
                        inputAccessoryViewID={ACCESSORY_ID}
                      />
                      <Text style={[styles.modalEuro, { color: C.texteMuted }]}>€</Text>
                    </View>

                    <View style={[styles.separateur, { backgroundColor: C.separateur }]} />

                    <Text
                      style={[
                        styles.sectionTitle,
                        { color: C.texteMuted, marginBottom: 12 },
                      ]}
                    >
                      TES OBJECTIFS
                    </Text>
                    {objectifsActifs.length === 0 && (
                      <Text style={[styles.modalVideTexte, { color: C.texteMuted }]}>
                        Aucun objectif pour le moment
                      </Text>
                    )}
                    {objectifsActifs.map((obj) => {
                      const pct =
                        obj.cible > 0
                          ? Math.min((obj.actuel / obj.cible) * 100, 100)
                          : 0;
                      const atteint = obj.actuel >= obj.cible && obj.cible > 0;
                      return (
                        <TouchableOpacity
                          key={obj.id}
                          style={[styles.objectifModalItem, { backgroundColor: C.fondSecondaire }]}
                          onPress={() => ouvrirEditionObjectif(obj)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.objectifModalHeader}>
                            <View style={styles.envNomRow}>
                              <Text style={[styles.objectifModalNom, { color: C.texte }]}>
                                {obj.nom}
                              </Text>
                              {obj.recurrent && (
                                <Ionicons name="repeat" size={13} color={C.texteMuted} />
                              )}
                              {atteint && (
                                <View
                                  style={[
                                    styles.badgeAtteint,
                                    { backgroundColor: C.vertLight },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.badgeAtteintTexte,
                                      { color: C.vertText },
                                    ]}
                                  >
                                    Atteint
                                  </Text>
                                </View>
                              )}
                            </View>
                            <TouchableOpacity
                              onPress={() => objStore.supprimerObjectif(obj.id)}
                              accessibilityRole="button"
                              accessibilityLabel={`Supprimer l'objectif ${obj.nom}`}
                            >
                              <Ionicons name="close" size={16} color={C.texteMuted} />
                            </TouchableOpacity>
                          </View>
                          <Text
                            style={[
                              styles.objectifModalMontant,
                              { color: obj.couleur },
                            ]}
                          >
                            {obj.actuel} € / {obj.cible} €
                          </Text>
                          <View style={[styles.catBarBg, { backgroundColor: C.separateur }]}>
                            <View
                              style={[
                                styles.catBarFill,
                                {
                                  width: `${pct}%`,
                                  backgroundColor: obj.couleur,
                                },
                              ]}
                            />
                          </View>
                        </TouchableOpacity>
                      );
                    })}

                    {objectifsClotures.length > 0 && (
                      <View style={{ marginBottom: 12 }}>
                        <TouchableOpacity
                          style={[
                            styles.couleurTiroirBouton,
                            { backgroundColor: C.fondSecondaire },
                          ]}
                          onPress={() =>
                            setObjectifsCloturesOuvert(!objectifsCloturesOuvert)
                          }
                          activeOpacity={0.7}
                        >
                          <View style={styles.objectifsClotureesTitreLigne}>
                            <Text
                              style={[
                                styles.couleurTiroirTexte,
                                { color: C.texte, flex: 0 },
                              ]}
                            >
                              Objectifs clôturés ({objectifsClotures.length})
                            </Text>
                            <InfoBulle
                              titre="Objectifs clôturés"
                              texte="Un objectif clôturé n'est plus alimenté automatiquement chaque mois. C'est une action manuelle et définitive : il n'existe aucun moyen de le rouvrir, tu peux seulement le supprimer si besoin."
                            />
                          </View>
                          <Text style={[styles.couleurChevron, { color: C.texteMuted }]}>
                            {objectifsCloturesOuvert ? "▾" : "▸"}
                          </Text>
                        </TouchableOpacity>
                        {objectifsCloturesOuvert &&
                          objectifsClotures.map((obj) => {
                            const pct =
                              obj.cible > 0
                                ? Math.min((obj.actuel / obj.cible) * 100, 100)
                                : 0;
                            return (
                              <View
                                key={obj.id}
                                style={[
                                  styles.objectifModalItem,
                                  { backgroundColor: C.fondSecondaire, opacity: 0.7 },
                                ]}
                              >
                                <View style={styles.objectifModalHeader}>
                                  <Text style={[styles.objectifModalNom, { color: C.texte }]}>
                                    {obj.nom}
                                  </Text>
                                  <TouchableOpacity
                                    onPress={() => objStore.supprimerObjectif(obj.id)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Supprimer l'objectif ${obj.nom}`}
                                  >
                                    <Ionicons name="close" size={16} color={C.texteMuted} />
                                  </TouchableOpacity>
                                </View>
                                <Text
                                  style={[
                                    styles.objectifModalMontant,
                                    { color: obj.couleur },
                                  ]}
                                >
                                  {obj.actuel} € / {obj.cible} €
                                </Text>
                                <View style={[styles.catBarBg, { backgroundColor: C.separateur }]}>
                                  <View
                                    style={[
                                      styles.catBarFill,
                                      { width: `${pct}%`, backgroundColor: obj.couleur },
                                    ]}
                                  />
                                </View>
                              </View>
                            );
                          })}
                      </View>
                    )}

                    <TouchableOpacity
                      style={styles.btnNouvelObjectifBouton}
                      onPress={ouvrirCreationObjectif}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.btnNouvelObjectif, { color: C.purple }]}>
                        + Ajouter
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.btnAjouter, { backgroundColor: C.purple }]}
                      onPress={sauvegarderEtFermerEpargne}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.btnAjouterTexte}>Enregistrer</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </>
              ) : (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitre, { color: C.texte }]}>
                      {objectifEnEdition ? "Modifier l'objectif" : "Nouvel objectif"}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setVueModal("liste")}
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
                    <Text style={[styles.modalLabel, { color: C.texteMuted }]}>Nom de l'objectif</Text>
                    <TextInput
                      style={[
                    styles.input,
                    { backgroundColor: C.fondSecondaire, color: C.texte },
                  ]}
                      placeholder="Ex : MacBook, Vacances..."
                      placeholderTextColor={C.texteMuted}
                      value={nomObjectif}
                      onChangeText={setNomObjectif}
                      returnKeyType="done"
                    />

                    <Text style={[styles.modalLabel, { color: C.texteMuted }]}>Montant cible</Text>
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
                        placeholder="Ex : 1500"
                        placeholderTextColor={C.texteMuted}
                        keyboardType="decimal-pad"
                        value={cibleObjectif}
                        onChangeText={(text) => setCibleObjectif(sanitizeMontantInput(text))}
                        returnKeyType="done"
                        inputAccessoryViewID={ACCESSORY_ID}
                      />
                      <Text style={[styles.modalEuro, { color: C.texteMuted }]}>€</Text>
                    </View>

                    {!objectifEnEdition && (
                      <>
                        <Text style={[styles.modalLabel, { color: C.texteMuted }]}>
                          Déjà mis de côté (optionnel)
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
                            keyboardType="decimal-pad"
                            value={montantInitialObjectif}
                            onChangeText={(text) => setMontantInitialObjectif(sanitizeMontantInput(text))}
                            returnKeyType="done"
                            inputAccessoryViewID={ACCESSORY_ID}
                          />
                          <Text style={[styles.modalEuro, { color: C.texteMuted }]}>€</Text>
                        </View>
                      </>
                    )}

                    <View style={styles.switchRow}>
                      <View>
                        <Text style={[styles.switchLabel, { color: C.texte }]}>
                          Montant fixe chaque mois
                        </Text>
                        <Text style={[styles.switchSub, { color: C.texteMuted }]}>
                          Versement automatique récurrent
                        </Text>
                      </View>
                      <Switch
                        value={recurrentObjectif}
                        onValueChange={setRecurrentObjectif}
                        trackColor={{ false: C.separateur, true: C.purpleLight }}
                        thumbColor={recurrentObjectif ? C.purple : "#FFF"}
                      />
                    </View>

                    {recurrentObjectif && (
                      <>
                        <Text style={[styles.modalLabel, { color: C.texteMuted }]}>
                          Montant mensuel
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
                            placeholder="Ex : 100"
                            placeholderTextColor={C.texteMuted}
                            keyboardType="decimal-pad"
                            value={montantMensuelObjectif}
                            onChangeText={(text) => setMontantMensuelObjectif(sanitizeMontantInput(text))}
                            returnKeyType="done"
                            inputAccessoryViewID={ACCESSORY_ID}
                          />
                          <Text style={[styles.modalEuro, { color: C.texteMuted }]}>€</Text>
                        </View>

                        <Text style={[styles.modalLabel, { color: C.texteMuted }]}>
                          Jour du mois
                        </Text>
                        <TouchableOpacity
                          style={[
                            styles.dateChamp,
                            { backgroundColor: C.fondSecondaire },
                          ]}
                          onPress={() =>
                            setCalendrierJourOuvert(!calendrierJourOuvert)
                          }
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[styles.dateChampTexte, { color: C.texte }]}
                          >
                            Le {jourDuMoisObjectif} de chaque mois
                          </Text>
                          <Ionicons
                            name="calendar-outline"
                            size={18}
                            color={C.texteMuted}
                          />
                        </TouchableOpacity>
                        {calendrierJourOuvert &&
                          (() => {
                            const jourSelectionne = Math.min(
                              28,
                              Math.max(1, parseInt(jourDuMoisObjectif, 10) || 1),
                            );
                            const maintenantObjectif = new Date();
                            const dateAffichee = dateVersISO(
                              new Date(
                                maintenantObjectif.getFullYear(),
                                maintenantObjectif.getMonth(),
                                jourSelectionne,
                              ),
                            );
                            return (
                              <View
                                style={[
                                  styles.calendarWrap,
                                  { borderColor: C.separateur },
                                ]}
                              >
                                <Calendar
                                  current={dateAffichee}
                                  onDayPress={(day) => {
                                    setJourDuMoisObjectif(
                                      String(Math.min(28, day.day)),
                                    );
                                    setCalendrierJourOuvert(false);
                                  }}
                                  markedDates={{
                                    [dateAffichee]: {
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
                            );
                          })()}
                      </>
                    )}

                    {objectifEnEdition && !recurrentObjectif && (
                      <>
                        <Text style={[styles.modalLabel, { color: C.texteMuted }]}>
                          Ajouter un montant
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
                            keyboardType="decimal-pad"
                            value={montantAjoutObjectif}
                            onChangeText={(text) => setMontantAjoutObjectif(sanitizeMontantInput(text))}
                            returnKeyType="done"
                            inputAccessoryViewID={ACCESSORY_ID}
                          />
                          <TouchableOpacity
                            style={[styles.btnAjoutRapide, { backgroundColor: C.purple }]}
                            onPress={ajouterFondsObjectif}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.btnAjoutRapideTexte}>Ajouter</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}

                    <Text style={[styles.modalLabel, { color: C.texteMuted }]}>Couleur</Text>
                    <ColorPicker
                      value={couleurObjectif}
                      onChange={setCouleurObjectif}
                      borderColor={C.texte}
                    />

                    <TouchableOpacity
                      style={[
                        styles.btnAjouter,
                        {
                          backgroundColor: C.purple,
                          opacity: sauvegardeObjectifEnCours ? 0.6 : 1,
                        },
                      ]}
                      onPress={sauvegarderObjectif}
                      activeOpacity={0.7}
                      disabled={sauvegardeObjectifEnCours}
                    >
                      {sauvegardeObjectifEnCours ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Text style={styles.btnAjouterTexte}>
                          Enregistrer
                        </Text>
                      )}
                    </TouchableOpacity>
                    {objectifEnEdition &&
                      !objectifEnEdition.ferme &&
                      objectifEnEdition.actuel >= objectifEnEdition.cible &&
                      objectifEnEdition.cible > 0 && (
                        <TouchableOpacity
                          style={[
                            styles.btnAjouter,
                            { backgroundColor: C.vert },
                          ]}
                          onPress={() => {
                            objStore.cloturerObjectif(objectifEnEdition.id);
                            setVueModal("liste");
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.btnAjouterTexte}>
                            Clôturer cet objectif
                          </Text>
                        </TouchableOpacity>
                      )}
                    {objectifEnEdition && (
                      <TouchableOpacity
                        style={styles.btnSupprimerTexte}
                        onPress={() => {
                          objStore.supprimerObjectif(objectifEnEdition.id);
                          setVueModal("liste");
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.btnSupprimerTexteLabel}>
                          Supprimer l'objectif
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.btnAnnuler}
                      onPress={() => setVueModal("liste")}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.btnAnnulerTexte, { color: C.texteMuted }]}>Retour</Text>
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
  container: { flex: 1, paddingHorizontal: 20 },
  indicateurNonCategorise: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    marginBottom: 4,
    alignSelf: "flex-start",
  },
  indicateurNonCategoriseTexte: { fontSize: 12, fontWeight: "500" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 60,
    marginBottom: 24,
  },
  appName: {
    fontSize: 23,
    fontWeight: "700",
    color: "#1A1A1A",
    letterSpacing: 2,
  },
  subtitle: { fontSize: 14, color: "#999", marginTop: 2 },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
  avatarImage: { width: 38, height: 38 },
  hero: {
    borderRadius: 22,
    padding: 26,
    marginBottom: 18,
  },
  heroLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 1,
    marginBottom: 8,
    fontWeight: "600",
  },
  themeBouton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  heroAmount: {
    fontSize: 50,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 20,
  },
  barBg: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 3,
    marginBottom: 12,
    flexDirection: "row",
    position: "relative",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
    position: "absolute",
    left: 0,
  },
  barFillEpargne: {
    height: "100%",
    borderRadius: 3,
    position: "absolute",
  },
  heroLegende: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  heroLegendeItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  heroLegendeDot: { width: 7, height: 7, borderRadius: 4 },
  heroSub: { fontSize: 14, color: "rgba(255,255,255,0.7)" },
  heroDeltaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: -12,
    marginBottom: 12,
  },
  heroDeltaTexte: { fontSize: 12, fontWeight: "600", flexShrink: 1 },
  heroHistoriqueBouton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
    alignSelf: "flex-start",
  },
  heroHistoriqueTexte: { fontSize: 11, fontWeight: "600" },
  heroHistoriqueListe: { marginTop: 6, gap: 3 },
  heroHistoriqueLigne: { fontSize: 11 },
  barSegment: { height: "100%" },
  lectureBanner: { borderRadius: 12, padding: 12, marginTop: 6 },
  lectureTexte: { fontSize: 14, fontWeight: "700", textAlign: "center" },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 72,
  },
  statLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  statValue: { fontSize: 19, fontWeight: "700" },
  statImpactRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 4,
  },
  statImpactTexte: {
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  statImpactChevron: { fontSize: 11 },
  statImpactTiroir: {
    alignSelf: "stretch",
    marginTop: 8,
    gap: 6,
  },
  statImpactLigne: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  statImpactLigneNom: { flex: 1, fontSize: 12, fontWeight: "600" },
  statImpactLigneDetail: { fontSize: 12, fontWeight: "600" },
  epargneCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    padding: 16,
    marginBottom: 26,
    borderWidth: 0.5,
    gap: 14,
  },
  epargneIconBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  epargneTexte: { flex: 1 },
  epargneLabel: { fontSize: 15, fontWeight: "700" },
  epargneSub: { fontSize: 12, marginTop: 2 },
  epargneMontantAffiche: { fontSize: 18, fontWeight: "700" },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  btnAjoutEnveloppe: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  btnAjoutTexte: { fontSize: 13, fontWeight: "700" },
  envCard: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 10,
    position: "relative",
  },
  envRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 11,
    paddingRight: 26,
  },
  typePastille: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  envNomRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  badgesRow: { flexDirection: "row", gap: 4 },
  envNom: { fontSize: 16, fontWeight: "700" },
  recurrenceBadge: {
    width: 19,
    height: 19,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeAtteint: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  badgeAtteintTexte: { fontSize: 10, fontWeight: "700" },
  envMontant: { fontSize: 14, fontWeight: "700" },
  envBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  envBarFill: { height: "100%", borderRadius: 3 },
  graphCard: {
    borderRadius: 22,
    padding: 20,
    marginTop: 18,
    borderWidth: 0.5,
  },
  cardTitre: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  graphSousTitre: { fontSize: 12, marginBottom: 18 },
  graphContent: { flexDirection: "row", alignItems: "center" },
  graphLegende: { flex: 1, paddingLeft: 16, gap: 11 },
  legendeItem: { flexDirection: "row", alignItems: "center", gap: 7 },
  legendeDot: { width: 10, height: 10, borderRadius: 5 },
  legendeNom: { flex: 1, fontSize: 14 },
  legendePct: { fontSize: 14, fontWeight: "600" },
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
  modalTitre: { fontSize: 21, fontWeight: "700" },
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
  input: {
    borderRadius: 13,
    padding: 16,
    fontSize: 17,
    marginBottom: 12,
  },
  couleurTiroirBouton: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 13,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  couleurRond: { width: 24, height: 24, borderRadius: 12 },
  couleurTiroirTexte: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  couleurChevron: { fontSize: 14 },
  objectifsClotureesTitreLigne: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  typeRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  typeChip: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderRadius: 12,
    alignItems: "center",
  },
  typeChipTexte: { fontSize: 14, fontWeight: "600" },
  typeChipTexteActif: { color: "#FFFFFF" },
  typeChipEntree: { flex: 2 },
  typeChipAvecInfo: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 3,
  },
  calendarWrap: {
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 12,
    borderWidth: 0.5,
  },
  dateChamp: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 13,
    padding: 16,
    marginBottom: 8,
  },
  dateChampTexte: { fontSize: 15, fontWeight: "600" },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
    marginTop: 8,
  },
  switchRowLabel: { flex: 1, marginRight: 12 },
  switchLabel: { fontSize: 16, fontWeight: "600" },
  switchLabelLigne: { flexDirection: "row", alignItems: "center", gap: 6 },
  switchSub: { fontSize: 13, marginTop: 2 },
  btnAjouter: {
    borderRadius: 16,
    padding: 17,
    alignItems: "center",
    marginTop: 10,
  },
  btnAjouterTexte: { fontSize: 17, color: "#FFFFFF", fontWeight: "700" },
  btnAjoutRapide: {
    borderRadius: 13,
    paddingHorizontal: 16,
    justifyContent: "center",
    marginBottom: 12,
  },
  btnAjoutRapideTexte: { fontSize: 14, color: "#FFFFFF", fontWeight: "700" },
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
  btnAnnuler: {
    padding: 15,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 6,
  },
  btnAnnulerTexte: { fontSize: 15, fontWeight: "600" },
  separateur: { height: 1, marginVertical: 20 },
  modalVideTexte: {
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 14,
  },
  objectifModalItem: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  objectifModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  objectifModalNom: { fontSize: 15, fontWeight: "700" },
  objectifModalMontant: { fontSize: 14, fontWeight: "700", marginBottom: 8 },
  catBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  catBarFill: { height: "100%", borderRadius: 3 },
  btnNouvelObjectifBouton: {
    padding: 14,
    alignItems: "center",
    marginTop: 6,
    marginBottom: 10,
  },
  btnNouvelObjectif: { fontSize: 15, fontWeight: "700" },
  accessoryBar: {
    padding: 10,
    alignItems: "flex-end",
    borderTopWidth: 0.5,
  },
  accessoryTexte: { fontSize: 17, fontWeight: "700" },
});
