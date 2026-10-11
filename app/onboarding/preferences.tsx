import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Alert,
  InputAccessoryView,
  Keyboard,
  Platform,
  StyleSheet,
  Switch,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { supabase } from "../../supabaseClient";
import { parseMontant, sanitizeMontantInput, formaterMontant } from "../../utils/montant";
import { messageErreurAuth } from "../authErrors";
import { PALETTE_COULEURS } from "../ColorPicker";
import { couleurLaPlusDistincte } from "../../utils/couleurs";
import { signalerOnboardingTermine } from "../onboardingCompletion";
import { useObjectifs } from "../store";
import { Text } from "../Texte";
import { TextInput } from "../TexteInput";
import { useTheme } from "../ThemeContext";
import { OnboardingEtape } from "../../components/OnboardingEtape";
import { couleursInterrupteur } from "../../utils/couleursInterrupteur";

const ACCESSORY_ID = "onboardingNumericDone";
// Barre iOS du champ "Montant" de la saisie des autres dépenses : son bouton
// "OK" ajoute la dépense (decimal-pad n'a aucune touche de validation iOS).
const ACCESSORY_ID_AUTRE = "onboardingAutreOk";
const TOTAL_ETAPES = 6;

const MOTS_CLES_FIXE = [
  "électricité",
  "electricite",
  "internet",
  "assurance",
  "téléphone",
  "telephone",
  "abonnement",
];

function typeSuggereParNom(nom: string): "Fixe" | "Variable" {
  const n = nom.toLowerCase();
  return MOTS_CLES_FIXE.some((mot) => n.includes(mot)) ? "Fixe" : "Variable";
}

function premierJourMoisISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

// Catégorie déjà persistée en base pour une étape à réponse unique (Salaire/
// Loyer/Courses) : permet, en cas de retour arrière + modification, de
// supprimer proprement l'ancienne ligne avant d'en recréer une plutôt que
// d'empiler des doublons.
type CategorieUniquePersistee = { id: string; couleur: string } | null;

type LigneAutre = {
  id: string;
  nom: string;
  montant: string;
  type: "Fixe" | "Variable";
  typeModifieManuellement: boolean;
  // Active par défaut (on demande des dépenses "régulières") — l'utilisateur
  // peut désactiver pour une dépense ponctuelle. Détermine directement
  // recurrente/repete_chaque_mois à la création (cf. continuerAutres).
  repeteChaqueMois: boolean;
  // Renseigné une fois la ligne effectivement créée en base ; permet de la
  // supprimer/recréer proprement si l'utilisateur revient la modifier.
  enveloppeId: string | null;
  couleur: string | null;
};

type CategorieResume = {
  nom: string;
  montant: number;
  type: "Fixe" | "Variable" | "Entrée";
  couleur: string;
};

const LIBELLE_TYPE: Record<CategorieResume["type"], string> = {
  Entrée: "Revenu mensuel",
  Fixe: "Dépense fixe",
  Variable: "Dépense variable",
};

export default function Preferences() {
  const router = useRouter();
  const objStore = useObjectifs();
  const { couleurs: C } = useTheme();

  const [etapeIndex, setEtapeIndex] = useState(0);
  const [salaire, setSalaire] = useState("");
  const [loyer, setLoyer] = useState("");
  const [courses, setCourses] = useState("");
  const [autres, setAutres] = useState<LigneAutre[]>([]);
  // RÈGLE (refonte du 2026-10-10) : saisie UNIQUE en mode liste pour l'étape
  // "autres dépenses" — nom + montant + OK ajoute la dépense à la liste
  // au-dessus, vide les champs et ferme le clavier. Type (suggéré d'après le
  // nom, cf. typeSuggereParNom) et "Se répète chaque mois" s'appliquent à
  // la dépense en cours de saisie, jamais réécrits après ajout.
  const [saisieNomAutre, setSaisieNomAutre] = useState("");
  const [saisieMontantAutre, setSaisieMontantAutre] = useState("");
  const [saisieTypeAutre, setSaisieTypeAutre] = useState<"Fixe" | "Variable">(
    "Variable",
  );
  const [saisieTypeAutreManuel, setSaisieTypeAutreManuel] = useState(false);
  const [saisieRepeteAutre, setSaisieRepeteAutre] = useState(true);
  const [erreurSaisieAutre, setErreurSaisieAutre] = useState("");
  const champMontantAutreRef = useRef<React.ElementRef<typeof TextInput>>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState("");

  const [salaireCree, setSalaireCree] = useState<CategorieUniquePersistee>(null);
  const [loyerCree, setLoyerCree] = useState<CategorieUniquePersistee>(null);
  const [coursesCree, setCoursesCree] = useState<CategorieUniquePersistee>(null);

  const couleursUtiliseesRef = useRef<string[]>([]);
  const prochainIdLigne = useRef(0);

  const allerEtape = (i: number) => {
    setErreur("");
    setEtapeIndex(i);
  };

  const continuerAccueil = () => allerEtape(1);

  // objStore.enveloppes ne se rafraîchit qu'au rendu suivant : sans cet
  // accumulateur, plusieurs créations à la suite dans un même submit (écran
  // "Autres dépenses") liraient toutes le même instantané et pourraient
  // s'attribuer deux fois la même couleur.
  const choisirCouleurAutomatique = () => {
    const choisie = couleurLaPlusDistincte(PALETTE_COULEURS, [
      ...objStore.enveloppes.map((e) => e.couleur),
      ...couleursUtiliseesRef.current,
    ]);
    couleursUtiliseesRef.current.push(choisie);
    return choisie;
  };

  const continuerSalaire = async () => {
    if (chargement) return;
    setErreur("");
    const montant = parseMontant(salaire);
    if (salaireCree || montant > 0) {
      setChargement(true);
      // Retour arrière + modification : on repart d'une base propre plutôt
      // que d'empiler une deuxième ligne "Salaire".
      if (salaireCree) {
        await objStore.supprimerEnveloppe(salaireCree.id);
        setSalaireCree(null);
      }
      if (montant > 0) {
        const premierJour = premierJourMoisISO(new Date());
        const couleur = choisirCouleurAutomatique();
        const nouvelle = await objStore.ajouterEnveloppe({
          nom: "Salaire",
          depense: montant,
          budget: montant,
          couleur,
          type: "Entrée",
          recurrente: true,
          repeteChaqueMois: true,
          dateFixe: premierJour,
          payee: true,
          moisComptage: premierJour,
        });
        if (!nouvelle) {
          setChargement(false);
          setErreur("Impossible d'enregistrer ton salaire. Réessaie.");
          return;
        }
        setSalaireCree({ id: nouvelle.id, couleur });
      }
      setChargement(false);
    }
    setEtapeIndex(2);
  };

  const continuerLoyer = async () => {
    if (chargement) return;
    setErreur("");
    const montant = parseMontant(loyer);
    if (loyerCree || montant > 0) {
      setChargement(true);
      if (loyerCree) {
        await objStore.supprimerEnveloppe(loyerCree.id);
        setLoyerCree(null);
      }
      if (montant > 0) {
        const couleur = choisirCouleurAutomatique();
        const nouvelle = await objStore.ajouterEnveloppe({
          nom: "Loyer",
          depense: 0,
          budget: montant,
          couleur,
          type: "Fixe",
          recurrente: true,
          repeteChaqueMois: true,
        });
        if (!nouvelle) {
          setChargement(false);
          setErreur("Impossible d'enregistrer ton loyer. Réessaie.");
          return;
        }
        setLoyerCree({ id: nouvelle.id, couleur });
      }
      setChargement(false);
    }
    setEtapeIndex(3);
  };

  const continuerCourses = async () => {
    if (chargement) return;
    setErreur("");
    const montant = parseMontant(courses);
    if (coursesCree || montant > 0) {
      setChargement(true);
      if (coursesCree) {
        await objStore.supprimerEnveloppe(coursesCree.id);
        setCoursesCree(null);
      }
      if (montant > 0) {
        const couleur = choisirCouleurAutomatique();
        const nouvelle = await objStore.ajouterEnveloppe({
          nom: "Courses",
          depense: 0,
          budget: montant,
          couleur,
          type: "Variable",
          recurrente: true,
        });
        if (!nouvelle) {
          setChargement(false);
          setErreur("Impossible d'enregistrer tes courses. Réessaie.");
          return;
        }
        setCoursesCree({ id: nouvelle.id, couleur });
      }
      setChargement(false);
    }
    setEtapeIndex(4);
  };

  const reinitialiserSaisieAutre = () => {
    setSaisieNomAutre("");
    setSaisieMontantAutre("");
    setSaisieTypeAutre("Variable");
    setSaisieTypeAutreManuel(false);
    setSaisieRepeteAutre(true);
    setErreurSaisieAutre("");
  };

  const modifierSaisieNomAutre = (nom: string) => {
    setSaisieNomAutre(nom);
    setErreurSaisieAutre("");
    if (!saisieTypeAutreManuel) setSaisieTypeAutre(typeSuggereParNom(nom));
  };

  // Ajoute la saisie en cours à la liste. Renvoie la liste à jour (ou null
  // si la saisie est incomplète) pour que "Continuer" puisse enregistrer
  // une dépense tapée mais pas encore validée, sans dépendre du setState.
  const validerSaisieAutre = (): LigneAutre[] | null => {
    // Jamais pendant l'enregistrement (revue du 2026-10-10) : une ligne
    // ajoutée à ce moment était écrasée par setAutres(misesAJour) et perdue.
    if (chargement) return null;
    const nom = saisieNomAutre.trim();
    const montant = parseMontant(saisieMontantAutre);
    if (!nom && !saisieMontantAutre) {
      Keyboard.dismiss();
      return autres;
    }
    if (!nom || !(montant > 0)) {
      setErreurSaisieAutre("Indique un nom et un montant.");
      return null;
    }
    const nouvelleLigne: LigneAutre = {
      id: String(prochainIdLigne.current++),
      nom,
      montant: saisieMontantAutre,
      type: saisieTypeAutre,
      typeModifieManuellement: saisieTypeAutreManuel,
      repeteChaqueMois: saisieRepeteAutre,
      enveloppeId: null,
      couleur: null,
    };
    const lignes = [...autres, nouvelleLigne];
    setAutres(lignes);
    reinitialiserSaisieAutre();
    Keyboard.dismiss();
    return lignes;
  };

  const continuerAutresAvecSaisie = () => {
    if (chargement) return;
    const lignes = validerSaisieAutre();
    if (lignes === null) return;
    continuerAutres(lignes);
  };

  // RÈGLE (revue du 2026-10-10) : jamais pendant l'enregistrement (la ligne
  // retirée était recréée par la boucle de continuerAutres — catégorie
  // fantôme). Une ligne pas encore enregistrée se retire directement (simple
  // brouillon) ; une ligne DÉJÀ enregistrée en base (retour arrière) est une
  // vraie catégorie : confirmation explicite avant suppression (CLAUDE.md,
  // opérations destructives — supprimerEnveloppe porte filtre user_id et log).
  const supprimerLigneAutre = (id: string) => {
    if (chargement) return;
    const ligne = autres.find((l) => l.id === id);
    if (!ligne) return;
    if (!ligne.enveloppeId) {
      setAutres((lignes) => lignes.filter((l) => l.id !== id));
      return;
    }
    const enveloppeId = ligne.enveloppeId;
    Alert.alert(
      `Supprimer "${ligne.nom}" ?`,
      "Cette catégorie a déjà été créée. Elle sera supprimée de ton budget.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => {
            setAutres((lignes) => lignes.filter((l) => l.id !== id));
            objStore.supprimerEnveloppe(enveloppeId);
          },
        },
      ],
    );
  };

  const passerAutres = () => {
    allerEtape(5);
  };

  const continuerAutres = async (lignesAEnregistrer: LigneAutre[] = autres) => {
    if (chargement) return;
    setErreur("");
    const aTraiter = lignesAEnregistrer.filter(
      (l) => l.enveloppeId || (l.nom.trim() && parseMontant(l.montant) > 0),
    );
    if (aTraiter.length > 0) {
      setChargement(true);
      let echec = false;
      const misesAJour: LigneAutre[] = [];
      for (const ligne of lignesAEnregistrer) {
        // RÈGLE (refonte du 2026-10-10) : une ligne DÉJÀ enregistrée (retour
        // arrière) est conservée telle quelle — en mode liste elle n'est plus
        // modifiable, la supprimer puis la recréer ne servait plus à rien et
        // laissait un doublon si la suppression échouait (supprimerEnveloppe
        // ne renvoie pas de résultat).
        if (ligne.enveloppeId) {
          misesAJour.push(ligne);
          continue;
        }
        const valide = !!ligne.nom.trim() && parseMontant(ligne.montant) > 0;
        if (!valide) {
          misesAJour.push({ ...ligne, enveloppeId: null, couleur: null });
          continue;
        }
        const montant = parseMontant(ligne.montant);
        const couleur = choisirCouleurAutomatique();
        // Le switch "Se répète chaque mois" pilote la permanence de la
        // catégorie, mais le champ qui la porte réellement diffère selon le
        // type (cf. estCategorieActiveCeMois dans utils/budget.ts) : Fixe se
        // base sur repete_chaque_mois, Variable sur recurrente. On renseigne
        // les deux pour ne pas dépendre du type. Si désactivé (dépense
        // ponctuelle), il faut aussi un mois de comptage pour qu'elle reste
        // visible ce mois-ci au lieu de disparaître aussitôt — dateFixe pour
        // une Fixe, moisComptage pour une Variable (pas de date naturelle
        // sinon), même convention que le reste de l'app.
        const premierJour = premierJourMoisISO(new Date());
        const nouvelle = await objStore.ajouterEnveloppe({
          nom: ligne.nom.trim(),
          depense: 0,
          budget: montant,
          couleur,
          type: ligne.type,
          recurrente: ligne.repeteChaqueMois,
          repeteChaqueMois: ligne.repeteChaqueMois,
          ...(ligne.repeteChaqueMois
            ? {}
            : ligne.type === "Fixe"
              ? { dateFixe: premierJour }
              : { moisComptage: premierJour }),
        });
        if (!nouvelle) {
          echec = true;
          misesAJour.push({ ...ligne, enveloppeId: null, couleur: null });
          continue;
        }
        misesAJour.push({ ...ligne, enveloppeId: nouvelle.id, couleur });
      }
      setAutres(misesAJour);
      setChargement(false);
      if (echec) {
        setErreur("Certaines dépenses n'ont pas pu être enregistrées. Réessaie.");
        return;
      }
    }
    setEtapeIndex(5);
  };

  const terminerOnboarding = async () => {
    if (chargement) return;
    setErreur("");
    setChargement(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setChargement(false);
      setErreur("Session expirée. Reconnecte-toi pour finaliser.");
      return;
    }
    const { error } = await supabase
      .from("profils")
      .update({
        onboarding_complete: true,
        // Ces 4 flags démarrent à true (déjà vu) pour tout le monde par
        // défaut — voir la migration tutoriel_premier_lancement. On les
        // repasse à false ICI, et uniquement ici, car c'est le seul moment
        // où l'on sait avec certitude qu'un utilisateur vient de terminer
        // l'onboarding pour la première fois : chaque page affichera alors
        // son tutoriel une seule fois, à son premier focus.
        tutoriel_apercu_vu: false,
        tutoriel_budget_vu: false,
        tutoriel_planning_vu: false,
        tutoriel_stats_vu: false,
      })
      .eq("user_id", user.id);
    if (error) {
      setChargement(false);
      setErreur(messageErreurAuth(error.message));
      return;
    }
    // _layout.tsx garde sa propre copie locale de onboarding_complete pour
    // décider des redirections : sans ce signal, elle resterait à false
    // malgré l'écriture ci-dessus, et l'effet de redirection renverrait
    // aussitôt vers ce même écran (boucle infinie).
    signalerOnboardingTermine();
    setChargement(false);
    router.replace("/(tabs)");
  };

  const accessoryBar = Platform.OS === "ios" && (
    <InputAccessoryView nativeID={ACCESSORY_ID}>
      <View style={[styles.accessoryBar, { backgroundColor: C.fondSecondaire }]}>
        <TouchableOpacity onPress={() => Keyboard.dismiss()}>
          <Text style={[styles.accessoryTexte, { color: C.accent }]}>Terminé</Text>
        </TouchableOpacity>
      </View>
    </InputAccessoryView>
  );

  if (etapeIndex === 0) {
    return (
      <OnboardingEtape
        etapeActuelle={1}
        totalEtapes={TOTAL_ETAPES}
        titre="Bienvenue sur Vista."
        aide="Quelques questions rapides pour configurer ton espace."
        boutonLabel="C'est parti"
        onContinuer={continuerAccueil}
      />
    );
  }

  if (etapeIndex === 1) {
    return (
      <>
        <OnboardingEtape
          etapeActuelle={2}
          totalEtapes={TOTAL_ETAPES}
          titre="Quel est ton salaire mensuel net ?"
          aide="Le montant qui arrive sur ton compte chaque mois."
          onContinuer={continuerSalaire}
          onRetour={() => allerEtape(0)}
          chargement={chargement}
          erreur={erreur}
        >
          <View style={styles.champMontantRow}>
            <TextInput
              style={[styles.input, { color: C.texte, backgroundColor: C.carte }]}
              placeholder="Ex : 1800"
              placeholderTextColor={C.texteMuted}
              keyboardType="decimal-pad"
              value={salaire}
              onChangeText={(t) => setSalaire(sanitizeMontantInput(t))}
              inputAccessoryViewID={ACCESSORY_ID}
              autoFocus
            />
          </View>
        </OnboardingEtape>
        {accessoryBar}
      </>
    );
  }

  if (etapeIndex === 2) {
    return (
      <>
        <OnboardingEtape
          etapeActuelle={3}
          totalEtapes={TOTAL_ETAPES}
          titre="Quel est ton loyer mensuel ?"
          aide="Le montant que tu payes chaque mois, charges comprises ou non."
          onContinuer={continuerLoyer}
          onRetour={() => allerEtape(1)}
          chargement={chargement}
          erreur={erreur}
        >
          <View style={styles.champMontantRow}>
            <TextInput
              style={[styles.input, { color: C.texte, backgroundColor: C.carte }]}
              placeholder="Ex : 750"
              placeholderTextColor={C.texteMuted}
              keyboardType="decimal-pad"
              value={loyer}
              onChangeText={(t) => setLoyer(sanitizeMontantInput(t))}
              inputAccessoryViewID={ACCESSORY_ID}
              autoFocus
            />
          </View>
        </OnboardingEtape>
        {accessoryBar}
      </>
    );
  }

  if (etapeIndex === 3) {
    return (
      <>
        <OnboardingEtape
          etapeActuelle={4}
          totalEtapes={TOTAL_ETAPES}
          titre="Combien dépenses-tu en courses par mois ?"
          aide="Une estimation suffit, tu pourras ajuster plus tard."
          onContinuer={continuerCourses}
          onRetour={() => allerEtape(2)}
          chargement={chargement}
          erreur={erreur}
        >
          <View style={styles.champMontantRow}>
            <TextInput
              style={[styles.input, { color: C.texte, backgroundColor: C.carte }]}
              placeholder="Ex : 300"
              placeholderTextColor={C.texteMuted}
              keyboardType="decimal-pad"
              value={courses}
              onChangeText={(t) => setCourses(sanitizeMontantInput(t))}
              inputAccessoryViewID={ACCESSORY_ID}
              autoFocus
            />
          </View>
        </OnboardingEtape>
        {accessoryBar}
      </>
    );
  }

  if (etapeIndex === 4) {
    return (
      <>
        <OnboardingEtape
          // Instance dédiée (cf. RÈGLE sur clavierOuvert, OnboardingEtape).
          key="etape-autres-depenses"
          etapeActuelle={5}
          totalEtapes={TOTAL_ETAPES}
          titre="As-tu d'autres dépenses régulières ?"
          aide="Ex : abonnements, électricité, transport..."
          onContinuer={continuerAutresAvecSaisie}
          onRetour={() => allerEtape(3)}
          chargement={chargement}
          erreur={erreur}
          boutonSecondaireLabel={
            autres.length === 0 && !saisieNomAutre && !saisieMontantAutre
              ? "Passer cette étape"
              : undefined
          }
          onBoutonSecondaire={passerAutres}
          // Continuer tout en bas du défilement, masqué tant que le clavier
          // est ouvert (cf. OnboardingEtape).
          piedDansLeDefilement
        >
          {/* Refonte du 2026-10-10 : mode liste — dépenses ajoutées au-dessus,
              une seule saisie nom + montant + OK en dessous. Un tap hors des
              champs ferme le clavier. */}
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View>
              {autres.map((ligne) => (
                <View
                  key={ligne.id}
                  style={[styles.ligneListeAutre, { borderColor: C.carteBorder }]}
                >
                  <Text style={[styles.ligneListeNom, { color: C.texte }]} numberOfLines={1}>
                    {ligne.nom}
                  </Text>
                  <Text style={[styles.ligneListeDetail, { color: C.texteMuted }]}>
                    {formaterMontant(parseMontant(ligne.montant))} € · {ligne.type}
                    {ligne.repeteChaqueMois ? "" : " · ponctuelle"}
                  </Text>
                  <TouchableOpacity
                    onPress={() => supprimerLigneAutre(ligne.id)}
                    disabled={chargement}
                    accessibilityRole="button"
                    accessibilityLabel={`Retirer ${ligne.nom}`}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={22} color={C.texteMuted} />
                  </TouchableOpacity>
                </View>
              ))}

              <View style={[styles.saisieAutre, { borderColor: C.carteBorder }]}>
                <View style={styles.saisieAutreLigne}>
                  <TextInput
                    style={[styles.inputLigne, { color: C.texte, backgroundColor: C.carte }]}
                    placeholder="Nom de la dépense"
                    placeholderTextColor={C.texteMuted}
                    value={saisieNomAutre}
                    onChangeText={modifierSaisieNomAutre}
                    editable={!chargement}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => champMontantAutreRef.current?.focus()}
                  />
                  <TextInput
                    ref={champMontantAutreRef}
                    style={[
                      styles.inputMontantSaisie,
                      { color: C.texte, backgroundColor: C.carte },
                    ]}
                    placeholder="Montant"
                    placeholderTextColor={C.texteMuted}
                    keyboardType="decimal-pad"
                    value={saisieMontantAutre}
                    editable={!chargement}
                    accessibilityLabel="Montant de la dépense"
                    onChangeText={(t) => {
                      setSaisieMontantAutre(sanitizeMontantInput(t));
                      setErreurSaisieAutre("");
                    }}
                    returnKeyType="done"
                    onSubmitEditing={() => validerSaisieAutre()}
                    inputAccessoryViewID={ACCESSORY_ID_AUTRE}
                  />
                  <TouchableOpacity
                    onPress={() => validerSaisieAutre()}
                    disabled={chargement}
                    style={[
                      styles.boutonOkAutre,
                      { backgroundColor: "#1D9E75", opacity: chargement ? 0.5 : 1 },
                    ]}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Ajouter cette dépense"
                  >
                    <Text style={styles.boutonOkAutreTexte}>OK</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.ligneAutreBas}>
                  <View style={styles.selecteurType}>
                    {(["Fixe", "Variable"] as const).map((t) => {
                      const selectionne = saisieTypeAutre === t;
                      return (
                        <TouchableOpacity
                          key={t}
                          onPress={() => {
                            setSaisieTypeAutre(t);
                            setSaisieTypeAutreManuel(true);
                          }}
                          style={[
                            styles.chipType,
                            { backgroundColor: selectionne ? C.purple : C.purpleLight },
                          ]}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.chipTypeTexte,
                              { color: selectionne ? "#FFFFFF" : C.purpleText },
                            ]}
                          >
                            {t}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {/* Bulle d'info (demande du 2026-10-10). */}
                  <TouchableOpacity
                    onPress={() =>
                      Alert.alert(
                        "Fixe ou Variable ?",
                        "Une dépense Fixe a toujours le même montant chaque mois — comme ton loyer (700 €) ou ton abonnement Netflix (13 €).\n\nUne dépense Variable change d'un mois à l'autre — comme tes courses ou tes sorties restaurant.",
                        [{ text: "Compris" }],
                      )
                    }
                    activeOpacity={0.6}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Fixe ou Variable ?"
                  >
                    <Ionicons
                      name="information-circle-outline"
                      size={16}
                      color={C.texteMuted}
                    />
                  </TouchableOpacity>
                </View>
                <View style={styles.ligneRepeteRow}>
                  <Text style={[styles.ligneRepeteTexte, { color: C.texte }]}>
                    Se répète chaque mois
                  </Text>
                  <Switch
                    value={saisieRepeteAutre}
                    onValueChange={setSaisieRepeteAutre}
                    {...couleursInterrupteur(C)}
                  />
                </View>
                {!!erreurSaisieAutre && (
                  <Text style={[styles.erreurSaisieAutre, { color: C.rougeText }]}>
                    {erreurSaisieAutre}
                  </Text>
                )}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </OnboardingEtape>
        {Platform.OS === "ios" && (
          <InputAccessoryView nativeID={ACCESSORY_ID_AUTRE}>
            <View style={[styles.accessoryBar, { backgroundColor: C.fondSecondaire }]}>
              <TouchableOpacity onPress={() => validerSaisieAutre()}>
                <Text style={[styles.accessoryTexte, { color: C.accent }]}>OK</Text>
              </TouchableOpacity>
            </View>
          </InputAccessoryView>
        )}
      </>
    );
  }

  const resume: CategorieResume[] = [];
  if (salaireCree) {
    resume.push({
      nom: "Salaire",
      montant: formaterMontant(parseMontant(salaire)),
      type: "Entrée",
      couleur: salaireCree.couleur,
    });
  }
  if (loyerCree) {
    resume.push({
      nom: "Loyer",
      montant: formaterMontant(parseMontant(loyer)),
      type: "Fixe",
      couleur: loyerCree.couleur,
    });
  }
  if (coursesCree) {
    resume.push({
      nom: "Courses",
      montant: formaterMontant(parseMontant(courses)),
      type: "Variable",
      couleur: coursesCree.couleur,
    });
  }
  autres.forEach((l) => {
    if (l.enveloppeId && l.couleur) {
      resume.push({
        nom: l.nom.trim(),
        montant: formaterMontant(parseMontant(l.montant)),
        type: l.type,
        couleur: l.couleur,
      });
    }
  });

  return (
    <OnboardingEtape
      etapeActuelle={6}
      totalEtapes={TOTAL_ETAPES}
      titre="Tout est prêt !"
      boutonLabel="Découvrir Vista"
      onContinuer={terminerOnboarding}
      onRetour={() => allerEtape(4)}
      chargement={chargement}
      erreur={erreur}
    >
      {resume.length === 0 ? (
        <Text style={[styles.resumeVide, { color: C.texteMuted }]}>
          Aucune catégorie configurée pour l&apos;instant — tu pourras en
          ajouter à tout moment depuis Budget.
        </Text>
      ) : (
        resume.map((cat, i) => (
          <View
            key={`${cat.nom}-${i}`}
            style={[styles.ligneResume, { borderColor: C.carteBorder }]}
          >
            <View style={[styles.pastille, { backgroundColor: cat.couleur }]} />
            <View style={styles.resumeTexteBloc}>
              <Text style={[styles.resumeNom, { color: C.texte }]}>{cat.nom}</Text>
              <Text style={[styles.resumeType, { color: C.texteMuted }]}>
                {LIBELLE_TYPE[cat.type]}
              </Text>
            </View>
            <Text style={[styles.resumeMontant, { color: cat.couleur }]}>
              {cat.montant} €
            </Text>
          </View>
        ))
      )}
    </OnboardingEtape>
  );
}

const styles = StyleSheet.create({
  champMontantRow: { marginTop: 4 },
  input: {
    borderRadius: 14,
    padding: 16,
    fontSize: 17,
    fontWeight: "600",
  },
  inputLigne: { flex: 1, borderRadius: 12, padding: 12, fontSize: 15 },
  // marginTop (demande du 2026-10-10) : respiration entre la ligne
  // Nom/Montant/OK et les boutons Fixe/Variable.
  ligneAutreBas: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  ligneRepeteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  ligneRepeteTexte: { fontSize: 13, fontWeight: "500" },
  selecteurType: { flexDirection: "row", gap: 6, flex: 1 },
  chipType: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  chipTypeTexte: { fontSize: 13, fontWeight: "600" },
  ligneListeAutre: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  ligneListeNom: { flex: 1, fontSize: 15, fontWeight: "600" },
  ligneListeDetail: { fontSize: 13 },
  saisieAutre: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 4 },
  saisieAutreLigne: { flexDirection: "row", alignItems: "center", gap: 8 },
  inputMontantSaisie: {
    width: 96,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  boutonOkAutre: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 },
  boutonOkAutreTexte: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  erreurSaisieAutre: { fontSize: 13, marginTop: 8 },
  resumeVide: { fontSize: 14, lineHeight: 20 },
  ligneResume: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  pastille: { width: 10, height: 10, borderRadius: 5 },
  resumeTexteBloc: { flex: 1 },
  resumeNom: { fontSize: 15, fontWeight: "700" },
  resumeType: { fontSize: 12, marginTop: 2 },
  resumeMontant: { fontSize: 15, fontWeight: "700" },
  accessoryBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  accessoryTexte: { fontSize: 16, fontWeight: "600" },
});
