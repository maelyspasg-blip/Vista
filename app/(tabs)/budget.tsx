import { Ionicons } from "@expo/vector-icons";
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "../ThemeContext";
import { dureeAnimation, useAccessibilite } from "../AccessibiliteContext";
import { Enveloppe, ModeleDepense, useObjectifs } from "../store";
import { parseMontant, sanitizeMontantInput } from "../../utils/montant";
import {
  depenseCumuleeAuJour,
  depenseEnveloppeDansSnapshot,
  estDansMois,
  joursDansMois,
  MOIS_LABELS,
  moisPrecedent,
} from "../../utils/exportExcel";
import { trouverDepenseDominante } from "../../utils/conseils";
import { InfoBulle } from "../InfoBulle";
import { NombreAnime } from "../NombreAnime";
import { Text } from "../Texte";
import { TextInput } from "../TexteInput";
import { VueMoisArchive } from "../VueMoisArchive";
import { BarreProgression } from "../BarreProgression";

const ACCESSORY_ID = "numericDone";

type LigneDepense = {
  id: string;
  nom: string;
  montant: number;
  date: string;
  source: "transaction" | "evenement";
};

type LigneAVenir = {
  id: string;
  nom: string;
  montant: number;
  couleur: string;
  date: string;
  recurrenceLabel?: string;
  source: "envelope" | "evenement";
  categorie?: string;
  estEntree?: boolean;
};

function dateVersISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formaterDateCourte(dateISO: string): string {
  const d = new Date(dateISO);
  if (Number.isNaN(d.getTime())) return dateISO;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function formaterDateLongue(dateISO: string): string {
  const d = new Date(dateISO);
  if (Number.isNaN(d.getTime())) return dateISO;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

export default function Budget() {
  const objStore = useObjectifs();
  const { couleurs: C, theme } = useTheme();
  const { reduireAnimations } = useAccessibilite();
  const params = useLocalSearchParams<{ section?: string }>();
  const router = useRouter();

  const [enveloppeOuverte, setEnveloppeOuverte] = useState<string | null>(null);
  const [modalAjoutVisible, setModalAjoutVisible] = useState(false);
  const [nomTx, setNomTx] = useState("");
  const [montantTx, setMontantTx] = useState("");
  const [enveloppeTx, setEnveloppeTx] = useState<string | null>(null);
  const [ajoutTransactionEnCours, setAjoutTransactionEnCours] =
    useState(false);
  const [carteEnFlash, setCarteEnFlash] = useState<string | null>(null);
  const [historiqueOuvertPour, setHistoriqueOuvertPour] = useState<
    Record<string, boolean>
  >({});
  // Même mécanique de toggle €/% que sur VueMoisArchive et les cartes hero :
  // tap sur le delta d'une catégorie pour basculer l'affichage.
  const [deltaPourcentagePourCategorie, setDeltaPourcentagePourCategorie] =
    useState<Record<string, boolean>>({});
  const [historiqueTotalOuvert, setHistoriqueTotalOuvert] = useState(false);
  const [argentImmobiliseOuvert, setArgentImmobiliseOuvert] = useState(false);
  const [deltaDepensesTotalPourcentage, setDeltaDepensesTotalPourcentage] =
    useState(false);
  const [triCategories, setTriCategories] = useState<
    "alpha" | "montantAsc" | "montantDesc"
  >("alpha");
  const cyclerTriCategories = () =>
    setTriCategories((t) =>
      t === "alpha" ? "montantAsc" : t === "montantAsc" ? "montantDesc" : "alpha",
    );
  const animsFlash = useRef<Map<string, Animated.Value>>(new Map()).current;
  const getAnimFlash = (id: string) => {
    if (!animsFlash.has(id)) animsFlash.set(id, new Animated.Value(0));
    return animsFlash.get(id)!;
  };

  useEffect(() => {
    if (!carteEnFlash) return;
    const anim = getAnimFlash(carteEnFlash);
    anim.setValue(1);
    Animated.timing(anim, {
      toValue: 0,
      duration: dureeAnimation(reduireAnimations, 700),
      useNativeDriver: false,
    }).start(() => setCarteEnFlash(null));
  }, [carteEnFlash, reduireAnimations]);
  const [creationModeleOuvertPour, setCreationModeleOuvertPour] = useState<
    string | null
  >(null);
  const [nomModeleTemp, setNomModeleTemp] = useState("");
  const [montantModeleTemp, setMontantModeleTemp] = useState("");
  const [creationModeleEnCours, setCreationModeleEnCours] = useState(false);
  const [gestionEvenement, setGestionEvenement] = useState<{
    id: string;
    nom: string;
    date: string;
    categorie?: string;
  } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const positionAutresDepenses = useRef(0);

  useFocusEffect(
    useCallback(() => {
      if (params.section === "autres-depenses") {
        scrollRef.current?.scrollTo({
          y: positionAutresDepenses.current,
          animated: !reduireAnimations,
        });
      }
    }, [params.section, reduireAnimations]),
  );

  const MOIS_ACTUEL = new Date().getMonth();
  const ANNEE_ACTUELLE = new Date().getFullYear();

  const moisDisponibles = [
    ...objStore.historiquesMois.map((s) => ({
      mois: s.mois,
      annee: s.annee,
      estActuel: false,
    })),
    { mois: MOIS_ACTUEL, annee: ANNEE_ACTUELLE, estActuel: true },
  ].sort((a, b) => a.annee * 12 + a.mois - (b.annee * 12 + b.mois));
  const [indexMois, setIndexMois] = useState(moisDisponibles.length - 1);
  const [modalMoisVisible, setModalMoisVisible] = useState(false);
  const moisAffiche = moisDisponibles[indexMois] ?? moisDisponibles[moisDisponibles.length - 1];

  const enveloppesParId = new Map(objStore.enveloppes.map((e) => [e.id, e]));

  // Une catégorie supprimée définitivement n'a plus de ligne dans `enveloppes`,
  // mais son historique de paiement reste (c'est un reçu, cf. historique_paiements
  // et snapshots_mois qui ne sont jamais modifiés rétroactivement). On ne doit
  // en revanche plus le reconstruire en carte de catégorie : il disparaît
  // simplement de l'affichage courant. Idem si la catégorie est repassée en
  // "Variable" entre-temps : la carte "payée" (propre au type Fixe) ne doit
  // plus s'afficher, sinon elle coexiste en double avec la carte Variable.
  const paiementsDuMois = objStore.historiquePaiements.filter((p) => {
    const enveloppe = enveloppesParId.get(p.enveloppeId);
    if (!enveloppe || enveloppe.type !== "Fixe") return false;
    const d = new Date(p.date);
    return d.getMonth() === MOIS_ACTUEL && d.getFullYear() === ANNEE_ACTUELLE;
  });

  const enveloppesCourantes = objStore.enveloppes.filter(
    (e) => e.type === "Variable",
  );

  const categoriesAffichees = objStore.enveloppes.filter(
    (e) =>
      e.type === "Variable" ||
      (e.type !== "Entrée" &&
        objStore.evenements.some((ev) => ev.categorieLiee === e.nom)),
  );
  const categoriesAffichesTriees = [...categoriesAffichees].sort((a, b) => {
    if (triCategories === "alpha") return a.nom.localeCompare(b.nom, "fr");
    return triCategories === "montantAsc"
      ? a.depense - b.depense
      : b.depense - a.depense;
  });

  const enveloppesAVenir = objStore.enveloppes.filter((e) => {
    if (e.type !== "Fixe" || e.payee || !e.dateFixe) return false;
    const d = new Date(e.dateFixe);
    return d.getMonth() === MOIS_ACTUEL && d.getFullYear() === ANNEE_ACTUELLE;
  });

  const entreesRecues = objStore.enveloppes.filter((e) => {
    if (e.type !== "Entrée" || !e.payee || !e.dateFixe) return false;
    const d = new Date(e.dateFixe);
    return d.getMonth() === MOIS_ACTUEL && d.getFullYear() === ANNEE_ACTUELLE;
  });

  const entreesAVenir = objStore.enveloppes.filter((e) => {
    if (e.type !== "Entrée" || e.payee || !e.dateFixe) return false;
    const d = new Date(e.dateFixe);
    return d.getMonth() === MOIS_ACTUEL && d.getFullYear() === ANNEE_ACTUELLE;
  });

  const evenementsAVenir = objStore.evenements.filter((e) => {
    if (!e.estFinancier || !e.montant) return false;
    if (!e.categorieLiee || e.categorieLiee === "Aucune") return false;
    if (e.montantApplique) return false;
    return true;
  });

  const autresDepenses = objStore.evenements.filter(
    (e) =>
      e.estFinancier &&
      e.montant &&
      (!e.categorieLiee || e.categorieLiee === "Aucune"),
  );

  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);

  const autresDepensesPayees = autresDepenses
    .filter((e) => {
      const d = new Date(e.date);
      d.setHours(0, 0, 0, 0);
      return (
        d <= aujourdhui &&
        d.getMonth() === MOIS_ACTUEL &&
        d.getFullYear() === ANNEE_ACTUELLE
      );
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const autresDepensesAVenir = autresDepenses.filter((e) => {
    const d = new Date(e.date);
    d.setHours(0, 0, 0, 0);
    return d > aujourdhui;
  });

  const lignesAVenir: LigneAVenir[] = [
    ...enveloppesAVenir.map((env) => ({
      id: env.id,
      nom: env.nom,
      montant: env.budget,
      couleur: env.couleur,
      date: env.dateFixe!,
      recurrenceLabel: env.repeteChaqueMois ? "tous les mois" : undefined,
      source: "envelope" as const,
    })),
    ...entreesAVenir.map((env) => ({
      id: env.id,
      nom: env.nom,
      montant: env.budget,
      couleur: env.couleur,
      date: env.dateFixe!,
      recurrenceLabel: undefined,
      source: "envelope" as const,
      estEntree: true,
    })),
    ...evenementsAVenir.map((e) => ({
      id: e.id,
      nom: e.nom,
      montant: e.montant!,
      couleur: e.couleur,
      date: e.date,
      recurrenceLabel: undefined,
      source: "evenement" as const,
      categorie: e.categorieLiee,
      estEntree:
        objStore.enveloppes.find((env) => env.nom === e.categorieLiee)
          ?.type === "Entrée",
    })),
    ...autresDepensesAVenir.map((e) => ({
      id: e.id,
      nom: e.nom,
      montant: e.montant!,
      couleur: e.couleur,
      date: e.date,
      source: "evenement" as const,
      recurrenceLabel: undefined,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const enveloppesSansEntree = objStore.enveloppes.filter(
    (e) => e.type !== "Entrée",
  );
  const enveloppesEntree = objStore.enveloppes.filter(
    (e) => e.type === "Entrée",
  );
  const totalDepenses = enveloppesSansEntree.reduce(
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
  const totalEpargne = objStore.epargneMois;
  const budgetTotal =
    objStore.argentDisponible + totalEntreeRecue + totalEntreePrevue;
  const pctDepenses =
    budgetTotal > 0 ? Math.min((totalDepenses / budgetTotal) * 100, 100) : 0;
  const pctEpargne =
    budgetTotal > 0
      ? Math.min((totalEpargne / budgetTotal) * 100, 100 - pctDepenses)
      : 0;
  // Comparaison "vs mois dernier" de la carte "Dépenses et argent immobilisé"
  // (venue d'Aperçu) — au même jour le mois dernier, cumul reconstruit depuis
  // les transactions/paiements jamais purgés, pour ne pas comparer un mois en
  // cours forcément partiel à un mois dernier entier.
  const { mois: moisPrecTotal, annee: anneePrecTotal } = moisPrecedent(
    MOIS_ACTUEL,
    ANNEE_ACTUELLE,
  );
  const jourActuelTotal = new Date().getDate();
  const snapshotMoisPrecedentTotal = objStore.historiquesMois.find(
    (s) => s.mois === moisPrecTotal && s.annee === anneePrecTotal,
  );
  const jourMaxPrecedentTotal = Math.min(
    jourActuelTotal,
    joursDansMois(moisPrecTotal, anneePrecTotal),
  );
  const totalDepensesPrecedent = snapshotMoisPrecedentTotal
    ? depenseCumuleeAuJour(
        objStore.transactions,
        objStore.historiquePaiements,
        moisPrecTotal,
        anneePrecTotal,
        jourMaxPrecedentTotal,
      )
    : null;
  const deltaDepensesTotal =
    totalDepensesPrecedent !== null
      ? totalDepenses - totalDepensesPrecedent
      : null;
  // Comparaison en % en plus du delta en €, togglable au clic sur la valeur.
  const pctDeltaDepensesTotal =
    deltaDepensesTotal !== null &&
    totalDepensesPrecedent !== null &&
    totalDepensesPrecedent !== 0
      ? (deltaDepensesTotal / Math.abs(totalDepensesPrecedent)) * 100
      : null;
  const HISTORIQUE_MOIS_MAX_TOTAL = 6;
  const historiqueDepensesTotal = snapshotMoisPrecedentTotal
    ? objStore.historiquesMois
        .slice(-HISTORIQUE_MOIS_MAX_TOTAL)
        .map((s) => ({
          mois: s.mois,
          annee: s.annee,
          montant: depenseCumuleeAuJour(
            objStore.transactions,
            objStore.historiquePaiements,
            s.mois,
            s.annee,
            Math.min(jourActuelTotal, joursDansMois(s.mois, s.annee)),
          ),
        }))
        .reverse()
    : [];

  const objectifsAvecContribution = objStore.objectifs.filter(
    (o) => !o.ferme && o.contributionMois > 0,
  );
  const contributionObjectifsTotal = objectifsAvecContribution.reduce(
    (acc, o) => acc + o.contributionMois,
    0,
  );
  const epargneGenerique = Math.max(0, totalEpargne - contributionObjectifsTotal);
  // Répartit pctEpargne (déjà le total épargne+objectifs) entre les deux
  // sous-segments affichés quand la légende "Argent immobilisé" est
  // dépliée — les deux se recombinent exactement en pctEpargne.
  const pctEpargneGenerique =
    totalEpargne > 0 ? (epargneGenerique / totalEpargne) * pctEpargne : 0;
  const pctObjectifs =
    totalEpargne > 0 ? (contributionObjectifsTotal / totalEpargne) * pctEpargne : 0;

  const depenseDominante = trouverDepenseDominante(enveloppesSansEntree);

  const ouvrirAjout = (enveloppeId?: string) => {
    setNomTx("");
    setMontantTx("");
    setEnveloppeTx(enveloppeId ?? enveloppesCourantes[0]?.id ?? null);
    setModalAjoutVisible(true);
  };

  const validerAjout = async () => {
    if (!nomTx || !montantTx || !enveloppeTx || ajoutTransactionEnCours) return;
    const dateStr = dateVersISO(new Date());
    setAjoutTransactionEnCours(true);
    const nouvelle = await objStore.ajouterTransaction(
      nomTx,
      parseMontant(montantTx),
      enveloppeTx,
      dateStr,
    );
    setAjoutTransactionEnCours(false);
    if (!nouvelle) return;
    setModalAjoutVisible(false);
    setCarteEnFlash(enveloppeTx);
  };

  const confirmerSuppressionTransaction = (nom: string, montant: number, id: string) => {
    Alert.alert(
      `Supprimer "${nom}" ?`,
      `Cette dépense de ${montant} € sera définitivement supprimée.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => objStore.supprimerTransaction(id),
        },
      ],
    );
  };

  const utiliserModele = (modele: ModeleDepense) => {
    setNomTx(modele.nom);
    setMontantTx(modele.montant !== null ? String(modele.montant) : "");
    setEnveloppeTx(modele.enveloppeId);
    setModalAjoutVisible(true);
  };

  const ouvrirCreationModele = (enveloppeId: string) => {
    setNomModeleTemp("");
    setMontantModeleTemp("");
    setCreationModeleOuvertPour(enveloppeId);
  };

  const fermerCreationModele = () => {
    setCreationModeleOuvertPour(null);
    setNomModeleTemp("");
    setMontantModeleTemp("");
  };

  const creerModele = async (enveloppeId: string) => {
    const nom = nomModeleTemp.trim();
    if (!nom || creationModeleEnCours) return;
    setCreationModeleEnCours(true);
    const nouveau = await objStore.ajouterModeleDepense(
      nom,
      montantModeleTemp ? parseMontant(montantModeleTemp) : null,
      enveloppeId,
    );
    setCreationModeleEnCours(false);
    if (!nouveau) return;
    fermerCreationModele();
  };

  const toggleEnveloppe = (id: string) => {
    setEnveloppeOuverte(enveloppeOuverte === id ? null : id);
  };

  const renderCarteCategorie = (env: Enveloppe) => {
    const pct = Math.min((env.depense / env.budget) * 100, 100);
    const estOuverte = enveloppeOuverte === env.id;

    const { mois: moisPrec, annee: anneePrec } = moisPrecedent(
      MOIS_ACTUEL,
      ANNEE_ACTUELLE,
    );
    const jourActuel = new Date().getDate();
    const existeMoisPrecedent =
      depenseEnveloppeDansSnapshot(
        objStore.historiquesMois,
        env.id,
        moisPrec,
        anneePrec,
      ) !== null;
    const jourMaxPrecedent = Math.min(
      jourActuel,
      joursDansMois(moisPrec, anneePrec),
    );
    const montantMoisPrecedent = existeMoisPrecedent
      ? depenseCumuleeAuJour(
          objStore.transactions,
          objStore.historiquePaiements,
          moisPrec,
          anneePrec,
          jourMaxPrecedent,
          env.id,
        )
      : null;
    const deltaMoisPrecedent =
      montantMoisPrecedent !== null ? env.depense - montantMoisPrecedent : null;
    const pctDeltaMoisPrecedent =
      deltaMoisPrecedent !== null &&
      montantMoisPrecedent !== null &&
      montantMoisPrecedent !== 0
        ? (deltaMoisPrecedent / Math.abs(montantMoisPrecedent)) * 100
        : null;

    const HISTORIQUE_MOIS_MAX = 6;
    const historiqueComparaison = existeMoisPrecedent
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
              env.id,
            ),
          }))
          .reverse()
      : [];
    const historiqueOuvert = !!historiqueOuvertPour[env.id];

    const lignesDepense: LigneDepense[] = [
      ...objStore.transactions
        .filter(
          (t) =>
            t.enveloppeId === env.id && estDansMois(t.date, MOIS_ACTUEL, ANNEE_ACTUELLE),
        )
        .map((t) => ({
          id: t.id,
          nom: t.nom,
          montant: t.montant,
          date: t.date,
          source: "transaction" as const,
        })),
      ...objStore.evenements
        .filter(
          (e) =>
            e.estFinancier &&
            e.montantApplique &&
            e.montant &&
            e.categorieLiee === env.nom,
        )
        .map((e) => ({
          id: e.id,
          nom: e.nom,
          montant: e.montant!,
          date: e.date,
          source: "evenement" as const,
        })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const lignesAVenirCategorie = objStore.evenements
      .filter(
        (e) =>
          e.estFinancier &&
          !e.montantApplique &&
          e.montant &&
          e.categorieLiee === env.nom,
      )
      .map((e) => ({
        id: e.id,
        nom: e.nom,
        montant: e.montant!,
        date: e.date,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const animFlash = getAnimFlash(env.id);

    return (
      <Animated.View
        key={env.id}
        style={[
          styles.envCard,
          {
            backgroundColor: env.couleur + "22",
            borderColor: animFlash.interpolate({
              inputRange: [0, 1],
              outputRange: ["transparent", env.couleur],
            }),
          },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => toggleEnveloppe(env.id)}
        >
          <View style={styles.envRow}>
            <View style={styles.envNomRow}>
              <View style={[styles.envDot, { backgroundColor: env.couleur }]} />
              <Text style={[styles.envNom, { color: C.texte }]}>
                {env.nom}
              </Text>
            </View>
            <View style={styles.envRowRight}>
              <Text style={[styles.envMontant, { color: env.couleur }]}>
                {env.depense} € / {env.budget} €
              </Text>
              <Text style={[styles.chevron, { color: env.couleur }]}>
                {estOuverte ? "▾" : "▸"}
              </Text>
            </View>
          </View>
          <BarreProgression
            pourcentage={pct}
            couleur={env.couleur}
            couleurFond={C.separateur}
            hauteur={6}
          />
          {montantMoisPrecedent !== null && deltaMoisPrecedent !== null && (
            <View style={styles.envDeltaRow}>
              <Text style={[styles.envDeltaTexte, { color: C.texteMuted }]}>
                Mois dernier (au {jourMaxPrecedent}) : {montantMoisPrecedent} €{" "}
                <Text
                  onPress={() =>
                    setDeltaPourcentagePourCategorie((prev) => ({
                      ...prev,
                      [env.id]: !prev[env.id],
                    }))
                  }
                  style={{
                    color: deltaMoisPrecedent <= 0 ? C.accentText : C.peachText,
                    fontWeight: "700",
                  }}
                >
                  (
                  {deltaPourcentagePourCategorie[env.id] && pctDeltaMoisPrecedent !== null
                    ? `${pctDeltaMoisPrecedent > 0 ? "+" : ""}${pctDeltaMoisPrecedent.toFixed(0)} %`
                    : `${deltaMoisPrecedent > 0 ? "+" : ""}${deltaMoisPrecedent} €`}
                  )
                </Text>
              </Text>
              <InfoBulle
                titre="Comparaison au même jour"
                texte={`Comparé aux dépenses cumulées au même jour le mois dernier (du 1er au ${jourMaxPrecedent}), pas au mois complet — pour une comparaison à période équivalente.`}
                couleur={C.texteMuted}
              />
            </View>
          )}
          {historiqueComparaison.length > 0 && (
            <TouchableOpacity
              style={styles.envHistoriqueBouton}
              onPress={() =>
                setHistoriqueOuvertPour((prev) => ({
                  ...prev,
                  [env.id]: !prev[env.id],
                }))
              }
              activeOpacity={0.7}
            >
              <Text style={[styles.envHistoriqueTexte, { color: C.texteMuted }]}>
                {historiqueOuvert ? "Masquer l'historique" : "Voir l'historique"}
              </Text>
              <Ionicons
                name={historiqueOuvert ? "chevron-up" : "chevron-down"}
                size={12}
                color={C.texteMuted}
              />
            </TouchableOpacity>
          )}
          {historiqueOuvert && (
            <View style={styles.envHistoriqueListe}>
              {historiqueComparaison.map((h) => (
                <Text
                  key={`${h.annee}-${h.mois}`}
                  style={[styles.envHistoriqueLigne, { color: C.texteMuted }]}
                >
                  {MOIS_LABELS[h.mois]} {h.annee} : {h.montant} €
                </Text>
              ))}
            </View>
          )}
        </TouchableOpacity>

        {estOuverte && (
          <View style={[styles.txListe, { borderTopColor: C.separateur }]}>
            {env.type === "Variable" && (
              <>
                <View style={styles.modelesRow}>
                  {objStore.modelesDepenses
                    .filter((m) => m.enveloppeId === env.id)
                    .map((m) => (
                      <View
                        key={m.id}
                        style={[
                          styles.modeleChip,
                          { backgroundColor: env.couleur + "22" },
                        ]}
                      >
                        <TouchableOpacity
                          onPress={() => utiliserModele(m)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.modeleChipTexte,
                              { color: env.couleur },
                            ]}
                          >
                            {m.nom}
                            {m.montant !== null ? ` ${m.montant}€` : ""}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => objStore.supprimerModeleDepense(m.id)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          accessibilityRole="button"
                          accessibilityLabel={`Supprimer le modèle ${m.nom}`}
                        >
                          <Ionicons name="close" size={12} color={env.couleur} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  {creationModeleOuvertPour !== env.id && (
                    <TouchableOpacity
                      style={[
                        styles.modeleChip,
                        styles.modeleChipAjouter,
                        { borderColor: C.separateur },
                      ]}
                      onPress={() => ouvrirCreationModele(env.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="add" size={12} color={C.texteMuted} />
                      <Text
                        style={[
                          styles.modeleChipTexte,
                          { color: C.texteMuted },
                        ]}
                      >
                        Raccourci
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {creationModeleOuvertPour === env.id && (
                  <View style={styles.modeleFormRow}>
                    <TextInput
                      style={[
                        styles.modeleInput,
                        { backgroundColor: C.fondSecondaire, color: C.texte },
                      ]}
                      placeholder="Nom"
                      placeholderTextColor={C.texteMuted}
                      value={nomModeleTemp}
                      onChangeText={setNomModeleTemp}
                      autoFocus
                      returnKeyType="next"
                      inputAccessoryViewID={ACCESSORY_ID}
                    />
                    <TextInput
                      style={[
                        styles.modeleInputMontant,
                        { backgroundColor: C.fondSecondaire, color: C.texte },
                      ]}
                      placeholder="€"
                      placeholderTextColor={C.texteMuted}
                      keyboardType="decimal-pad"
                      value={montantModeleTemp}
                      onChangeText={(t) =>
                        setMontantModeleTemp(sanitizeMontantInput(t))
                      }
                      returnKeyType="done"
                      onSubmitEditing={() => creerModele(env.id)}
                      inputAccessoryViewID={ACCESSORY_ID}
                    />
                    <TouchableOpacity
                      style={[
                        styles.modeleBtnAction,
                        { backgroundColor: env.couleur },
                      ]}
                      onPress={() => creerModele(env.id)}
                      activeOpacity={0.7}
                      disabled={creationModeleEnCours}
                      accessibilityRole="button"
                      accessibilityLabel="Créer le raccourci de dépense"
                    >
                      {creationModeleEnCours ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.modeleBtnAction,
                        { backgroundColor: C.fondSecondaire },
                      ]}
                      onPress={fermerCreationModele}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Annuler la création du raccourci"
                    >
                      <Ionicons name="close" size={16} color={C.texteMuted} />
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
            {lignesDepense.length === 0 && lignesAVenirCategorie.length === 0 ? (
              <Text style={[styles.txVide, { color: C.texteMuted }]}>
                Aucune dépense enregistrée
              </Text>
            ) : (
              <>
                {lignesDepense.map((ligne) => {
                  const contenu = (
                    <>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.txNom, { color: C.texte }]}>
                          {ligne.nom}
                        </Text>
                        <Text style={[styles.txDate, { color: C.texteMuted }]}>
                          {formaterDateCourte(ligne.date)}
                        </Text>
                      </View>
                      <Text style={[styles.txMontant, { color: env.couleur }]}>
                        - {ligne.montant} €
                      </Text>
                      {ligne.source === "transaction" && (
                        <TouchableOpacity
                          onPress={() =>
                            confirmerSuppressionTransaction(
                              ligne.nom,
                              ligne.montant,
                              ligne.id,
                            )
                          }
                          style={styles.txSupprimer}
                          accessibilityRole="button"
                          accessibilityLabel={`Supprimer ${ligne.nom}`}
                        >
                          <Ionicons name="close" size={14} color={C.texteMuted} />
                        </TouchableOpacity>
                      )}
                    </>
                  );

                  if (ligne.source === "evenement") {
                    return (
                      <TouchableOpacity
                        key={`evenement-${ligne.id}`}
                        style={styles.txLigne}
                        activeOpacity={0.6}
                        onPress={() =>
                          setGestionEvenement({
                            id: ligne.id,
                            nom: ligne.nom,
                            date: ligne.date,
                            categorie: env.nom,
                          })
                        }
                      >
                        {contenu}
                      </TouchableOpacity>
                    );
                  }

                  return (
                    <View key={`transaction-${ligne.id}`} style={styles.txLigne}>
                      {contenu}
                    </View>
                  );
                })}
                {lignesAVenirCategorie.map((ligne) => (
                  <TouchableOpacity
                    key={`avenir-${ligne.id}`}
                    style={[styles.txLigne, { opacity: 0.6 }]}
                    activeOpacity={0.6}
                    onPress={() =>
                      setGestionEvenement({
                        id: ligne.id,
                        nom: ligne.nom,
                        date: ligne.date,
                        categorie: env.nom,
                      })
                    }
                  >
                    <View style={{ flex: 1 }}>
                      <View style={styles.txNomAVenirRow}>
                        <Text style={[styles.txNom, { color: C.texte }]}>
                          {ligne.nom}
                        </Text>
                        <View
                          style={[
                            styles.badgeAVenir,
                            { backgroundColor: C.bleuGrisLight },
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgeAVenirTexte,
                              { color: C.bleuGris },
                            ]}
                          >
                            À venir
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.txDate, { color: C.texteMuted }]}>
                        {formaterDateCourte(ligne.date)}
                      </Text>
                    </View>
                    <Text style={[styles.txMontant, { color: env.couleur }]}>
                      - {ligne.montant} €
                    </Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
            {env.type === "Variable" && (
              <TouchableOpacity
                style={[styles.btnAjouterIci, { backgroundColor: env.couleur }]}
                onPress={() => ouvrirAjout(env.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.btnAjouterIciTexte}>
                  + Ajouter une dépense ici
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </Animated.View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: C.fondPage }]}>
      <View style={[styles.header, { backgroundColor: C.fondPage }]}>
        <View>
          <Text style={[styles.titre, { color: C.texte }]}>Budget</Text>
          <View style={styles.selecteurMoisRow}>
            <TouchableOpacity
              onPress={() => setIndexMois((i) => Math.max(0, i - 1))}
              disabled={indexMois === 0}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Mois précédent"
            >
              <Ionicons
                name="chevron-back"
                size={16}
                color={indexMois === 0 ? C.separateur : C.texteMuted}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setModalMoisVisible(true)}
              activeOpacity={0.7}
            >
              <Text style={[styles.sousTitre, { color: C.texteMuted }]}>
                {MOIS_LABELS[moisAffiche.mois]} {moisAffiche.annee} ▾
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                setIndexMois((i) => Math.min(moisDisponibles.length - 1, i + 1))
              }
              disabled={indexMois === moisDisponibles.length - 1}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Mois suivant"
            >
              <Ionicons
                name="chevron-forward"
                size={16}
                color={
                  indexMois === moisDisponibles.length - 1
                    ? C.separateur
                    : C.texteMuted
                }
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {!moisAffiche.estActuel ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <VueMoisArchive mois={moisAffiche.mois} annee={moisAffiche.annee} />
        </ScrollView>
      ) : (
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.heroCard,
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
          <View style={styles.sectionTitleAvecInfo}>
            <Text
              style={[
                styles.heroLabel,
                {
                  color: theme === "sombre" ? "rgba(255,255,255,0.6)" : C.texteMuted,
                  marginBottom: 0,
                },
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
            valeur={totalDepenses}
            style={[
              styles.heroAmount,
              { color: theme === "sombre" ? "#FFFFFF" : C.texte },
            ]}
          />
          <Text
            style={[
              styles.heroSub,
              { color: theme === "sombre" ? "rgba(255,255,255,0.7)" : C.texteMuted },
            ]}
          >
            / {budgetTotal} € budget mensuel
          </Text>
          {deltaDepensesTotal !== null && (
            <>
              <View style={styles.envDeltaRow}>
                <Ionicons
                  name={deltaDepensesTotal > 0 ? "arrow-up" : "arrow-down"}
                  size={11}
                  color={deltaDepensesTotal <= 0 ? C.accentText : C.peachText}
                />
                <TouchableOpacity
                  activeOpacity={0.6}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() =>
                    setDeltaDepensesTotalPourcentage((v) => !v)
                  }
                >
                  <Text
                    style={[
                      styles.envDeltaTexte,
                      { color: deltaDepensesTotal <= 0 ? C.accentText : C.peachText },
                    ]}
                  >
                    {deltaDepensesTotalPourcentage && pctDeltaDepensesTotal !== null
                      ? `${pctDeltaDepensesTotal > 0 ? "+" : ""}${pctDeltaDepensesTotal.toFixed(0)} %`
                      : `${deltaDepensesTotal > 0 ? "+" : ""}${deltaDepensesTotal} €`}
                    {" vs mois dernier (au "}
                    {jourMaxPrecedentTotal})
                  </Text>
                </TouchableOpacity>
                <InfoBulle
                  titre="Comparaison au même jour"
                  texte={`Comparé aux dépenses cumulées au même jour le mois dernier (du 1er au ${jourMaxPrecedentTotal}), pas au mois complet — pour une comparaison à période équivalente.`}
                  couleur={theme === "sombre" ? "rgba(255,255,255,0.6)" : C.texteMuted}
                />
              </View>
              {historiqueDepensesTotal.length > 0 && (
                <TouchableOpacity
                  style={styles.envHistoriqueBouton}
                  onPress={() => setHistoriqueTotalOuvert((v) => !v)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.envHistoriqueTexte,
                      { color: theme === "sombre" ? "rgba(255,255,255,0.6)" : C.texteMuted },
                    ]}
                  >
                    {historiqueTotalOuvert ? "Masquer l'historique" : "Voir l'historique"}
                  </Text>
                  <Ionicons
                    name={historiqueTotalOuvert ? "chevron-up" : "chevron-down"}
                    size={12}
                    color={theme === "sombre" ? "rgba(255,255,255,0.6)" : C.texteMuted}
                  />
                </TouchableOpacity>
              )}
              {historiqueTotalOuvert && (
                <View style={styles.envHistoriqueListe}>
                  {historiqueDepensesTotal.map((h) => (
                    <Text
                      key={`${h.annee}-${h.mois}`}
                      style={[
                        styles.envHistoriqueLigne,
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
          <View style={[styles.progressBg, { backgroundColor: C.separateur, marginTop: 12 }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${pctDepenses}%`, backgroundColor: C.bleuGris },
              ]}
            />
            {argentImmobiliseOuvert ? (
              <>
                {epargneGenerique > 0 && (
                  <View
                    style={[
                      styles.progressFillEpargne,
                      {
                        width: `${pctEpargneGenerique}%`,
                        left: `${pctDepenses}%`,
                        backgroundColor: C.purple,
                      },
                    ]}
                  />
                )}
                {contributionObjectifsTotal > 0 && (
                  <View
                    style={[
                      styles.progressFillEpargne,
                      {
                        width: `${pctObjectifs}%`,
                        left: `${pctDepenses + pctEpargneGenerique}%`,
                        backgroundColor: C.lavande,
                      },
                    ]}
                  />
                )}
              </>
            ) : (
              totalEpargne > 0 && (
                <View
                  style={[
                    styles.progressFillEpargne,
                    {
                      width: `${pctEpargne}%`,
                      left: `${pctDepenses}%`,
                      backgroundColor: C.purple,
                    },
                  ]}
                />
              )
            )}
          </View>
          {totalEpargne > 0 && (
            <View style={styles.heroLegende}>
              <View style={styles.heroLegendeItem}>
                <View
                  style={[
                    styles.heroLegendeDot,
                    { backgroundColor: C.bleuGris },
                  ]}
                />
                <Text
                  style={[
                    styles.heroLegendeTexte,
                    { color: theme === "sombre" ? "rgba(255,255,255,0.7)" : C.texteMuted },
                  ]}
                >
                  Dépenses {totalDepenses} €
                </Text>
              </View>
              {totalEpargne > 0 && (
                <TouchableOpacity
                  style={styles.heroLegendeItem}
                  activeOpacity={0.7}
                  onPress={() => setArgentImmobiliseOuvert((v) => !v)}
                >
                  <View
                    style={[styles.heroLegendeDot, { backgroundColor: C.purple }]}
                  />
                  <Text
                    style={[
                      styles.heroLegendeTexte,
                      { color: theme === "sombre" ? "rgba(255,255,255,0.7)" : C.texteMuted },
                    ]}
                  >
                    Argent immobilisé {totalEpargne} €
                  </Text>
                  <Ionicons
                    name={argentImmobiliseOuvert ? "chevron-up" : "chevron-down"}
                    size={11}
                    color={theme === "sombre" ? "rgba(255,255,255,0.7)" : C.texteMuted}
                  />
                </TouchableOpacity>
              )}
              {argentImmobiliseOuvert && epargneGenerique > 0 && (
                <View style={styles.heroLegendeItem}>
                  <View
                    style={[styles.heroLegendeDot, { backgroundColor: C.purple }]}
                  />
                  <Text
                    style={[
                      styles.heroLegendeTexte,
                      { color: theme === "sombre" ? "rgba(255,255,255,0.7)" : C.texteMuted },
                    ]}
                  >
                    Épargne {epargneGenerique} €
                  </Text>
                </View>
              )}
              {argentImmobiliseOuvert && contributionObjectifsTotal > 0 && (
                <View style={styles.heroLegendeItem}>
                  <View
                    style={[styles.heroLegendeDot, { backgroundColor: C.lavande }]}
                  />
                  <Text
                    style={[
                      styles.heroLegendeTexte,
                      { color: theme === "sombre" ? "rgba(255,255,255,0.7)" : C.texteMuted },
                    ]}
                  >
                    Objectifs {contributionObjectifsTotal} €
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {depenseDominante && depenseDominante.depense > 0 && (
          <View
            style={[
              styles.insightBanner,
              { backgroundColor: C.carte, borderColor: C.carteBorder },
            ]}
          >
            <Ionicons name="bulb-outline" size={16} color={C.texte} />
            <Text style={[styles.insightTexte, { color: C.texte }]}>
              {depenseDominante.nom} représente ta plus grosse dépense ce
              mois-ci
            </Text>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitreEtTri}>
            <Text
              style={[
                styles.sectionTitle,
                { color: C.texteMuted, marginBottom: 0, marginTop: 0 },
              ]}
            >
              TES CATÉGORIES
            </Text>
            <TouchableOpacity
              style={styles.triBouton}
              onPress={cyclerTriCategories}
              activeOpacity={0.7}
            >
              <Ionicons
                name={triCategories === "montantDesc" ? "arrow-down" : "arrow-up"}
                size={12}
                color={C.texteMuted}
              />
              <Text style={[styles.triTexte, { color: C.texteMuted }]}>
                {triCategories === "alpha"
                  ? "A → Z"
                  : triCategories === "montantAsc"
                    ? "Montant ↑"
                    : "Montant ↓"}
              </Text>
            </TouchableOpacity>
          </View>
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
            style={[
              styles.envCard,
              { backgroundColor: p.couleur + "22", borderColor: "transparent" },
            ]}
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

        {categoriesAffichesTriees.map(renderCarteCategorie)}

        {entreesRecues.length > 0 && (
          <>
            <View style={[styles.sectionTitleAvecInfo, { marginTop: 20 }]}>
              <Text
                style={[
                  styles.sectionTitle,
                  { color: C.texteMuted, marginTop: 0, marginBottom: 0 },
                ]}
              >
                ENTRÉES D&apos;ARGENT REÇUES
              </Text>
              <InfoBulle
                titre="Entrées d'argent"
                texte="Une catégorie de type Entrée d'argent s'additionne à ton Budget au lieu de s'en soustraire, contrairement à une catégorie de dépense classique."
              />
            </View>
            {entreesRecues.map((env) => (
              <View
                key={env.id}
                style={[
                  styles.envCard,
                  { backgroundColor: env.couleur + "22", borderColor: "transparent" },
                ]}
              >
                <View style={styles.envRow}>
                  <Text style={[styles.envNom, { color: C.texte }]}>
                    {env.nom}
                  </Text>
                  <Text style={[styles.envMontant, { color: env.couleur }]}>
                    +{env.budget} € / {env.budget} €
                  </Text>
                </View>
                <View
                  style={[styles.envBarBg, { backgroundColor: C.separateur }]}
                >
                  <View
                    style={[
                      styles.envBarFill,
                      { width: "100%", backgroundColor: env.couleur },
                    ]}
                  />
                </View>
              </View>
            ))}
          </>
        )}

        {autresDepensesPayees.length > 0 && (
          <View
            onLayout={(evt) => {
              positionAutresDepenses.current = evt.nativeEvent.layout.y;
            }}
          >
            <Text
              style={[
                styles.sectionTitle,
                { color: C.texteMuted, marginTop: 8 },
              ]}
            >
              AUTRES DÉPENSES
            </Text>
            <View
              style={[
                styles.envCard,
                { backgroundColor: C.fondSecondaire, borderColor: "transparent" },
              ]}
            >
              {autresDepensesPayees.map((e) => (
                <View key={e.id} style={styles.txLigne}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.txNom, { color: C.texte }]}>
                      {e.nom}
                    </Text>
                    <Text style={[styles.txDate, { color: C.texteMuted }]}>
                      {formaterDateCourte(e.date)}
                    </Text>
                  </View>
                  <Text style={[styles.txMontant, { color: C.texte }]}>
                    - {e.montant} €
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <Text
          style={[styles.sectionTitle, { color: C.texteMuted, marginTop: 8 }]}
        >
          À VENIR CE MOIS-CI
        </Text>

        {lignesAVenir.length === 0 ? (
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
          lignesAVenir.map((ligne) => {
            const pctBudget =
              budgetTotal > 0
                ? Math.round((ligne.montant / budgetTotal) * 100)
                : 0;
            const estLourd = !ligne.estEntree && pctBudget >= 30;
            const dateAffichee = new Date(ligne.date).toLocaleDateString(
              "fr-FR",
              { day: "numeric", month: "long" },
            );
            const contenu = (
              <>
                <View
                  style={[
                    styles.fixeBarre,
                    { backgroundColor: ligne.couleur },
                  ]}
                />
                <View style={styles.fixeContent}>
                  <View style={styles.fixeRow}>
                    <Text style={[styles.fixeNom, { color: ligne.couleur }]}>
                      {ligne.nom}
                    </Text>
                    <Text
                      style={[styles.fixeMontant, { color: ligne.couleur }]}
                    >
                      {ligne.estEntree ? "+" : ""}
                      {ligne.montant} €
                    </Text>
                  </View>
                  <View style={styles.fixeRowBottom}>
                    <Text style={[styles.fixeMeta, { color: C.texteMuted }]}>
                      {dateAffichee}
                      {ligne.recurrenceLabel ? ` · ${ligne.recurrenceLabel}` : ""}
                    </Text>
                    <View
                      style={[
                        styles.statutBadge,
                        {
                          backgroundColor: ligne.estEntree
                            ? C.vertLight
                            : C.bleuGrisLight,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statutTexte,
                          { color: ligne.estEntree ? C.vertText : C.bleuGris },
                        ]}
                      >
                        {ligne.estEntree ? "À recevoir" : "À venir"}
                      </Text>
                    </View>
                  </View>
                  {estLourd && (
                    <View style={styles.alertePoidsRow}>
                      <Ionicons name="warning-outline" size={12} color={C.peach} />
                      <Text style={[styles.alertePoids, { color: C.peach }]}>
                        {pctBudget}% du budget total
                      </Text>
                    </View>
                  )}
                </View>
              </>
            );

            if (ligne.source === "evenement") {
              return (
                <TouchableOpacity
                  key={ligne.id}
                  style={[
                    styles.fixeCard,
                    { backgroundColor: ligne.couleur + "22" },
                  ]}
                  activeOpacity={0.7}
                  onPress={() =>
                    setGestionEvenement({
                      id: ligne.id,
                      nom: ligne.nom,
                      date: ligne.date,
                      categorie: ligne.categorie,
                    })
                  }
                >
                  {contenu}
                </TouchableOpacity>
              );
            }

            return (
              <View
                key={ligne.id}
                style={[
                  styles.fixeCard,
                  { backgroundColor: ligne.couleur + "22" },
                ]}
              >
                {contenu}
              </View>
            );
          })
        )}

        <View style={{ height: 30 }} />
      </ScrollView>
      )}

      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={ACCESSORY_ID}>
          <View
            style={[styles.accessoryBar, { backgroundColor: C.fondSecondaire }]}
          >
            <TouchableOpacity onPress={() => Keyboard.dismiss()}>
              <Text style={[styles.accessoryTexte, { color: C.accent }]}>
                Terminé
              </Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}

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
                    keyboardType="decimal-pad"
                    value={montantTx}
                    onChangeText={(text) => setMontantTx(sanitizeMontantInput(text))}
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

                {enveloppeTx &&
                  objStore.modelesDepenses.some(
                    (m) => m.enveloppeId === enveloppeTx,
                  ) && (
                    <>
                      <Text
                        style={[styles.modalLabel, { color: C.texteMuted }]}
                      >
                        Raccourcis
                      </Text>
                      <View style={styles.envChoixGrid}>
                        {objStore.modelesDepenses
                          .filter((m) => m.enveloppeId === enveloppeTx)
                          .map((m) => (
                            <TouchableOpacity
                              key={m.id}
                              style={[
                                styles.modeleChip,
                                { backgroundColor: C.fondSecondaire },
                              ]}
                              onPress={() => {
                                setNomTx(m.nom);
                                setMontantTx(
                                  m.montant !== null ? String(m.montant) : "",
                                );
                              }}
                              activeOpacity={0.7}
                            >
                              <Text
                                style={[
                                  styles.modeleChipTexte,
                                  { color: C.texte },
                                ]}
                              >
                                {m.nom}
                                {m.montant !== null ? ` ${m.montant}€` : ""}
                              </Text>
                            </TouchableOpacity>
                          ))}
                      </View>
                    </>
                  )}

                <TouchableOpacity
                  style={[
                    styles.btnValider,
                    {
                      backgroundColor: C.hero,
                      opacity: ajoutTransactionEnCours ? 0.6 : 1,
                    },
                  ]}
                  onPress={validerAjout}
                  activeOpacity={0.7}
                  disabled={ajoutTransactionEnCours}
                >
                  {ajoutTransactionEnCours ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.btnValiderTexte}>
                      Ajouter la dépense
                    </Text>
                  )}
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

      <Modal
        visible={gestionEvenement !== null}
        transparent
        animationType={reduireAnimations ? "none" : "fade"}
        onRequestClose={() => setGestionEvenement(null)}
      >
        <View style={styles.modalOverlayTouch}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: C.carte, paddingBottom: 26 },
            ]}
          >
            <Text style={[styles.modalTitre, { color: C.texte }]}>
              {gestionEvenement?.nom}
            </Text>
            <Text
              style={[
                styles.modalLabel,
                { color: C.texteMuted, marginBottom: 20 },
              ]}
            >
              {gestionEvenement &&
                `Créé dans Planning pour le ${formaterDateLongue(gestionEvenement.date)}` +
                  (gestionEvenement.categorie
                    ? `, lié à ${gestionEvenement.categorie}.`
                    : ".")}
            </Text>
            <TouchableOpacity
              style={[styles.btnValider, { backgroundColor: C.hero }]}
              onPress={() => {
                if (gestionEvenement) {
                  router.push({
                    pathname: "/planning",
                    params: { editEventId: gestionEvenement.id },
                  });
                }
                setGestionEvenement(null);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.btnValiderTexte}>Modifier</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnValider, { backgroundColor: "#E24B4A" }]}
              onPress={() => {
                if (gestionEvenement) {
                  objStore.supprimerEvenement(gestionEvenement.id);
                }
                setGestionEvenement(null);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.btnValiderTexte}>Supprimer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnAnnuler}
              onPress={() => setGestionEvenement(null)}
              activeOpacity={0.7}
            >
              <Text style={[styles.btnAnnulerTexte, { color: C.texteMuted }]}>
                Annuler
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={modalMoisVisible}
        transparent
        animationType={reduireAnimations ? "none" : "slide"}
        onRequestClose={() => setModalMoisVisible(false)}
      >
        <View style={styles.modalOverlayTouch}>
          <View style={[styles.modalCard, { backgroundColor: C.carte }]}>
            <Text style={[styles.modalTitre, { color: C.texte }]}>
              Choisir un mois
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {[...moisDisponibles]
                .reverse()
                .map((m) => {
                  const selectionne =
                    m.mois === moisAffiche.mois && m.annee === moisAffiche.annee;
                  return (
                    <TouchableOpacity
                      key={`${m.annee}-${m.mois}`}
                      style={[
                        styles.moisOption,
                        { borderBottomColor: C.separateur },
                      ]}
                      onPress={() => {
                        setIndexMois(
                          moisDisponibles.findIndex(
                            (d) => d.mois === m.mois && d.annee === m.annee,
                          ),
                        );
                        setModalMoisVisible(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.moisOptionTexte, { color: C.texte }]}>
                        {MOIS_LABELS[m.mois]} {m.annee}
                        {m.estActuel ? " (en cours)" : ""}
                      </Text>
                      {selectionne && (
                        <Ionicons name="checkmark" size={18} color={C.purple} />
                      )}
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
            <TouchableOpacity
              style={styles.btnAnnuler}
              onPress={() => setModalMoisVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.btnAnnulerTexte, { color: C.texteMuted }]}>
                Fermer
              </Text>
            </TouchableOpacity>
          </View>
        </View>
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
  selecteurMoisRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  heroCard: { borderRadius: 22, padding: 24, marginBottom: 16 },
  heroLabel: {
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 8,
    fontWeight: "700",
  },
  heroAmount: { fontSize: 42, fontWeight: "700", marginBottom: 4 },
  heroSub: { fontSize: 13, marginBottom: 16 },
  progressBg: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    position: "relative",
  },
  progressFill: { height: "100%", borderRadius: 3, position: "absolute", left: 0 },
  progressFillEpargne: { height: "100%", borderRadius: 3, position: "absolute" },
  heroLegende: {
    flexDirection: "row",
    gap: 16,
    marginTop: 12,
    flexWrap: "wrap",
  },
  heroLegendeItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  heroLegendeDot: { width: 7, height: 7, borderRadius: 4 },
  heroLegendeTexte: { fontSize: 12, fontWeight: "600" },
  insightBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 13,
    padding: 14,
    marginBottom: 16,
    borderWidth: 0.5,
  },
  insightTexte: { flex: 1, fontSize: 13, lineHeight: 19 },
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
  sectionTitreEtTri: { flexDirection: "row", alignItems: "center", gap: 10 },
  triBouton: { flexDirection: "row", alignItems: "center", gap: 3 },
  triTexte: { fontSize: 11, fontWeight: "600" },
  btnAjouter: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  sectionTitleAvecInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  btnAjouterTexte: { fontSize: 12, fontWeight: "700" },
  envCard: { borderRadius: 16, padding: 18, marginBottom: 10, borderWidth: 2 },
  envRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 11,
  },
  envNom: { fontSize: 16, fontWeight: "700" },
  envNomRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  envDot: { width: 10, height: 10, borderRadius: 5 },
  envRowRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  envMontant: { fontSize: 14, fontWeight: "700" },
  chevron: { fontSize: 14, fontWeight: "700" },
  envBarBg: { height: 6, borderRadius: 3, overflow: "hidden" },
  envBarFill: { height: "100%", borderRadius: 3 },
  envDeltaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
  },
  envDeltaTexte: { fontSize: 11, fontWeight: "500", flexShrink: 1 },
  envHistoriqueBouton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
    alignSelf: "flex-start",
  },
  envHistoriqueTexte: { fontSize: 11, fontWeight: "600" },
  envHistoriqueListe: { marginTop: 6, gap: 3 },
  envHistoriqueLigne: { fontSize: 11 },
  txListe: { marginTop: 14, paddingTop: 14, borderTopWidth: 0.5 },
  txVide: { fontSize: 13, textAlign: "center", paddingVertical: 10 },
  modelesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  modeleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  modeleChipAjouter: {
    borderWidth: 1,
    borderStyle: "dashed",
  },
  modeleChipTexte: { fontSize: 12, fontWeight: "600" },
  modeleFormRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  modeleInput: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  },
  modeleInputMontant: {
    width: 70,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 9,
    fontSize: 13,
    textAlign: "center",
  },
  modeleBtnAction: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  txLigne: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 8,
  },
  txNom: { fontSize: 13, fontWeight: "600" },
  txNomAVenirRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  badgeAVenir: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20 },
  badgeAVenirTexte: { fontSize: 10, fontWeight: "600" },
  txDate: { fontSize: 11 },
  txMontant: { fontSize: 13, fontWeight: "700" },
  txSupprimer: { padding: 4 },
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
  alertePoidsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  alertePoids: { fontSize: 11, fontWeight: "600" },
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
  moisOption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  moisOptionTexte: { fontSize: 15, fontWeight: "600" },
  btnAnnulerTexte: { fontSize: 15, fontWeight: "600" },
  accessoryBar: {
    padding: 10,
    alignItems: "flex-end",
    borderTopWidth: 0.5,
    borderTopColor: "#DDD",
  },
  accessoryTexte: { fontSize: 17, fontWeight: "700" },
});
