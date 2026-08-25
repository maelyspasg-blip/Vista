// RÈGLE À NE JAMAIS CASSER — AUCUNE ÉCRITURE SUPABASE DANS CE FICHIER : ce
// module ne doit JAMAIS contenir d'appel .delete()/.update()/.insert()/
// .upsert() vers Supabase — moteur de lecture pur, toute écriture vit dans
// app/store.ts (cf. RÈGLE DE SÉCURITÉ en tête de ce fichier).
//
// RÈGLE À NE JAMAIS CASSER — CARTOGRAPHIE DES 3 ZONES DE COACHING :
// Nos conseils (utils/conseils.ts) = MOIS EN COURS / Ce qu'il faut retenir
// (utils/tendancesPeriode.ts) = PÉRIODE SÉLECTIONNÉE par l'utilisateur sur
// Stats / Vista Bilan (ce fichier) = TOUT L'HISTORIQUE disponible. Cette
// zone couvre TOUT L'HISTORIQUE — ne jamais y mettre un insight sur le mois
// en cours (ça, c'est le terrain d'Aperçu) ni un insight qui ne aurait de
// sens que sur la période choisie par l'utilisateur sur Stats (ça, c'est le
// terrain de Ce qu'il faut retenir). Concrètement : genererMessageBilanVista
// ne reçoit JAMAIS objStore.enveloppes (les montants courants du mois en
// cours) pour ses calculs de tendance — uniquement `historiquesMois` (les
// mois déjà archivés). `enveloppes` n'est passé qu'à validerConseil pour
// vérifier qu'une catégorie citée existe encore et reste active
// aujourd'hui, jamais pour recalculer un montant du mois en cours.
//
// RÈGLE À NE JAMAIS CASSER : ne jamais suggérer de réduire une catégorie de
// type "Fixe" (loyer, assurance...) — une catégorie Fixe peut apparaître
// dans un constat historique ("tu dépenses en moyenne X€/mois en loyer
// depuis le début"), jamais dans la recommandation de décision ("réduis
// ton loyer"). Voir la garde de type dans construireDecision ci-dessous.
//
// RÈGLE À NE JAMAIS CASSER : anti-répétition — `situationsExclues` (rempli
// par l'appelant via utils/situationsSession.ts à partir de ce que "Nos
// conseils" a déjà affiché ce mois-ci) retire tout message dont la
// catégorie correspond à une situation déjà citée par Zone 1, exactement
// comme utils/tendancesPeriode.ts. Cette zone ne marque jamais rien
// elle-même. La différence de temporalité (tout l'historique vs mois en
// cours vs période choisie) rend un chevauchement avec "Ce qu'il faut
// retenir" structurellement improbable — R1/R2/R4/R5 parlent explicitement
// "depuis le début"/"ton meilleur mois", jamais d'une période choisie.
//
// RÈGLE À NE JAMAIS CASSER : validerConseil (utils/conseils.ts) est
// appliqué à chaque message/décision qui porte une catégorie ou un
// objectif précis — jamais de référence à une catégorie supprimée/inactive
// ou un objectif clôturé, jamais un pourcentage aberrant. Silencieux +
// console.warn en cas d'échec, jamais de crash.
import { Enveloppe, SnapshotEnveloppe, SnapshotMois, Transaction } from "../app/store";
import { validerConseil } from "./conseils";
import { moyenne } from "./tendancesPeriode";

export type MessageBilanVista = {
  texte: string;
  cle: string;
  categorieId?: string;
  objectifId?: string;
};

const SEUIL_MOIS_MIN_HISTORIQUE = 2; // en dessous, repli R6
const SEUIL_TENDANCE_EPARGNE_PP_MIN = 5; // € de différence moyenne minimum pour parler de tendance de fond
const SEUIL_PART_DOMINANTE_ACTION = 0.3; // part du total historique au-delà de laquelle une catégorie Variable mérite une suggestion

function margeSnapshot(s: SnapshotMois): number {
  return s.disponible - s.totalDepense - s.epargne;
}

export function genererMessageBilanVista(params: {
  historiquesMois: SnapshotMois[];
  objectifsAvecRythme: {
    objectif: { id: string; nom: string; ferme?: boolean };
  }[];
  enveloppes: Enveloppe[];
  moisActuel: number;
  anneeActuelle: number;
  situationsExclues?: Set<string>;
  maxMessages?: number;
}): { messages: MessageBilanVista[]; decision: MessageBilanVista | null } {
  const {
    historiquesMois,
    objectifsAvecRythme,
    // RÈGLE À NE JAMAIS CASSER : `enveloppes` (mois en cours) n'est utilisé
    // PLUS BAS QUE POUR validerConseil — jamais pour un calcul de tendance,
    // une moyenne ou un montant affiché dans un message. Tous les chiffres
    // de ce fichier viennent de `historiquesMois` (mois déjà archivés)
    // uniquement, cf. RÈGLE en tête de fichier.
    enveloppes,
    moisActuel,
    anneeActuelle,
    situationsExclues,
    maxMessages = 2,
  } = params;

  const candidats: MessageBilanVista[] = [];

  // === R6 : repli si pas assez d'historique =====================================
  if (historiquesMois.length < SEUIL_MOIS_MIN_HISTORIQUE) {
    return {
      messages: [
        {
          texte: "Vista construit ton profil financier au fil du temps — reviens dans quelques mois pour voir tes tendances de fond se dessiner.",
          cle: "bilan_vista_repli",
        },
      ],
      decision: null,
    };
  }

  // === R1 : régularité du suivi ==================================================
  candidats.push({
    texte: `Depuis ${historiquesMois.length} mois avec Vista, tu construis un historique complet de tes finances — c'est ce qui permet de voir des tendances de fond, pas seulement des instantanés.`,
    cle: "bilan_vista_regularite",
  });

  // === R2 : tendance de fond de l'épargne sur tout l'historique =================
  const epargnes = historiquesMois.map((s) => s.epargne);
  const milieuEpargne = Math.floor(epargnes.length / 2);
  const epargneAvant = moyenne(epargnes.slice(0, milieuEpargne));
  const epargneApres = moyenne(epargnes.slice(milieuEpargne));
  if (Math.abs(epargneApres - epargneAvant) >= SEUIL_TENDANCE_EPARGNE_PP_MIN) {
    candidats.push({
      texte:
        epargneApres > epargneAvant
          ? `Ton épargne progresse depuis le début : environ ${Math.round(epargneAvant)}€/mois sur tes premiers mois, contre ${Math.round(epargneApres)}€/mois plus récemment.`
          : `Ton épargne a reculé depuis le début : environ ${Math.round(epargneAvant)}€/mois sur tes premiers mois, contre ${Math.round(epargneApres)}€/mois plus récemment.`,
      cle: "bilan_vista_tendance_epargne",
    });
  }

  // === R3 : profil de dépenses dominant depuis le début ==========================
  const totalParNom = new Map<string, { id: string; montant: number }>();
  historiquesMois.forEach((s) => {
    s.enveloppes
      .filter((e) => e.type !== "Entrée")
      .forEach((e) => {
        const existant = totalParNom.get(e.nom);
        totalParNom.set(e.nom, { id: e.id, montant: (existant?.montant ?? 0) + e.depense });
      });
  });
  const dominanteHistorique = [...totalParNom.entries()]
    .map(([nom, v]) => ({ nom, id: v.id, montant: v.montant }))
    .sort((a, b) => b.montant - a.montant)[0];
  const totalDepenseHistorique = [...totalParNom.values()].reduce(
    (acc, v) => acc + v.montant,
    0,
  );
  if (dominanteHistorique && totalDepenseHistorique > 0) {
    const part = Math.round((dominanteHistorique.montant / totalDepenseHistorique) * 100);
    candidats.push({
      texte: `${dominanteHistorique.nom} est ton poste de dépense dominant depuis le début — environ ${part}% de tout ce que tu as dépensé sur ${historiquesMois.length} mois.`,
      cle: "bilan_vista_profil_dominant",
      categorieId: dominanteHistorique.id,
    });
  }

  // === R4 : meilleur mois vs rythme habituel (jamais le mois en cours) ==========
  const marges = historiquesMois.map((s) => ({ s, marge: margeSnapshot(s) }));
  const meilleurMois = [...marges].sort((a, b) => b.marge - a.marge)[0];
  const margeMoyenneHisto = moyenne(marges.map((m) => m.marge));
  if (meilleurMois && meilleurMois.marge > margeMoyenneHisto) {
    candidats.push({
      texte: `Ton meilleur mois a dégagé ${Math.round(meilleurMois.marge)}€ de marge, contre ${Math.round(margeMoyenneHisto)}€ en moyenne sur toute la période — la preuve que ce rythme est atteignable.`,
      cle: "bilan_vista_meilleur_mois",
    });
  }

  // === R5 : progression depuis le début (marge du premier mois vs dernier) ======
  const margePremier = margeSnapshot(historiquesMois[0]);
  const margeDernier = margeSnapshot(historiquesMois[historiquesMois.length - 1]);
  if (Math.round(margePremier) !== Math.round(margeDernier)) {
    candidats.push({
      texte: `Ta marge de fin de mois a évolué de ${Math.round(margePremier)}€ à ${Math.round(margeDernier)}€ depuis ton premier mois avec Vista.`,
      cle: "bilan_vista_progression",
    });
  }

  // Anti-répétition inter-zones (Zone 1) + validerConseil, comme
  // utils/tendancesPeriode.ts.
  const messagesValides = candidats
    .filter((c) => {
      if (!c.categorieId || !situationsExclues) return true;
      return ![...situationsExclues].some((cle) => cle.includes(c.categorieId!));
    })
    .filter((c) =>
      validerConseil(
        { categorieId: c.categorieId, objectifId: c.objectifId },
        {
          resteEstime: 0,
          enveloppes,
          objectifsAvecRythme: objectifsAvecRythme.map((o) => ({ objectif: { id: o.objectif.id } })),
          moisActuel,
          anneeActuelle,
        },
      ),
    );

  // === "Prochaine meilleure décision" — toujours historique, jamais le mois
  // en cours. D1 : la catégorie dominante (R3), si elle est de type
  // Variable et représente une grosse part du total, mérite une
  // suggestion de simulation. D2 : sinon, si aucun objectif actif et que
  // l'épargne moyenne historique est positive, suggérer d'en créer un.
  let decision: MessageBilanVista | null = null;
  const dominanteEnveloppe = dominanteHistorique
    ? enveloppes.find((e) => e.nom === dominanteHistorique.nom)
    : undefined;
  if (
    dominanteHistorique &&
    totalDepenseHistorique > 0 &&
    dominanteEnveloppe?.type === "Variable" &&
    dominanteHistorique.montant / totalDepenseHistorique >= SEUIL_PART_DOMINANTE_ACTION
  ) {
    decision = {
      texte: `${dominanteHistorique.nom} représente une grosse part de tes dépenses depuis le début — simuler un budget réduit sur cette catégorie pourrait avoir un vrai impact sur ta marge.`,
      cle: "bilan_vista_decision_dominante",
      categorieId: dominanteEnveloppe.id,
    };
  } else {
    const objectifsActifs = objectifsAvecRythme.filter((o) => !o.objectif.ferme);
    const margeMoyennePositive = margeMoyenneHisto > 0;
    if (objectifsActifs.length === 0 && margeMoyennePositive) {
      decision = {
        texte: `Tu dégages en moyenne ${Math.round(margeMoyenneHisto)}€ de marge par mois depuis le début, sans objectif actif pour l'instant — envisage d'en créer un pour donner une direction à cette capacité d'épargne.`,
        cle: "bilan_vista_decision_objectif",
      };
    }
  }
  if (decision) {
    const decisionValide =
      (!decision.categorieId || !situationsExclues || ![...situationsExclues].some((cle) => cle.includes(decision!.categorieId!))) &&
      validerConseil(
        { categorieId: decision.categorieId, objectifId: decision.objectifId },
        {
          resteEstime: 0,
          enveloppes,
          objectifsAvecRythme: objectifsAvecRythme.map((o) => ({ objectif: { id: o.objectif.id } })),
          moisActuel,
          anneeActuelle,
        },
      );
    if (!decisionValide) {
      console.warn("[bilanVista] Décision retirée : validation échouée.", decision.cle);
      decision = null;
    }
  }

  return { messages: messagesValides.slice(0, maxMessages), decision };
}

// === "Flux de votre argent" — analyse automatique de la période sélectionnée ===
// RÈGLE À NE JAMAIS CASSER — EXCEPTION DE ZONE ASSUMÉE : contrairement au
// reste de ce fichier (cf. RÈGLE CARTOGRAPHIE en tête), analyserFluxFinancier
// analyse volontairement la PÉRIODE SÉLECTIONNÉE sur le graphique de flux
// (Partie 3 de "Ton bilan", onglet Vista) et non tout l'historique — elle
// remplace le contenu "tout historique" qu'affichait auparavant cette carte
// spécifique. genererMessageBilanVista ci-dessus reste, lui, sur tout
// l'historique pour "Prochaine meilleure décision", qui n'est pas concernée.

// RÈGLE À NE JAMAIS CASSER — `categorieId` EST UN VRAI ID D'ENVELOPPE, JAMAIS
// UN NOM : contrairement à `cle` (clé de regroupement par nom, peut fusionner
// plusieurs catégories recréées sous le même nom au fil des mois, cf.
// construireRepartitionSurPeriode dans analytics.tsx), `categorieId` doit
// être l'id de l'enveloppe ACTIVE correspondante aujourd'hui — sinon
// validerConseil (qui compare par `enveloppe.id`) ne trouve jamais de
// correspondance et rejette silencieusement CHAQUE insight qui cite une
// catégorie, avec un warning en boucle à chaque rendu. `undefined` si aucune
// enveloppe active ne porte plus ce nom (catégorie supprimée sans
// recréation) — jamais l'ancien id ni le nom en guise de substitut.
export type CategorieFluxRepartition = {
  cle: string;
  label: string;
  montant: number;
  categorieId?: string;
  type?: "Fixe" | "Variable" | "Entrée";
};

// RÈGLE À NE JAMAIS CASSER : une catégorie Fixe ne doit JAMAIS atteindre
// validerConseil comme categorieId (cf. RÈGLE identique sur construireDecision
// plus haut) — le nom peut rester cité dans le texte (simple constat, jamais
// une action), mais categorieId reste `undefined` pour toute catégorie qui
// n'est pas Variable, pour ne jamais déclencher le validateur dessus.
function categorieIdCiteable(c: {
  type?: CategorieFluxRepartition["type"];
  categorieId?: string;
}): string | undefined {
  return c.type === "Variable" ? c.categorieId : undefined;
}

const SEUIL_VARIATION_FORTE_PCT = 15; // % minimum pour parler d'accélération/ralentissement
const SEUIL_ANOMALIE_CATEGORIE_PCT = 40; // % de hausse minimum pour un "pic inhabituel"
const SEUIL_CONTRIBUTION_DOMINANTE = 0.4; // part min. d'une catégorie dans la variation totale des dépenses
const SEUIL_MONTANT_SIGNIFICATIF = 20; // € minimum pour écarter le bruit sur de très petits montants
const SEUIL_CONCENTRATION_PART = 0.4; // part du total dépensé portée par une seule journée

function sommeEnveloppesSnapshots(
  snapshots: SnapshotMois[],
  predicat: (e: SnapshotEnveloppe) => boolean,
): number {
  return snapshots.reduce(
    (acc, s) => acc + s.enveloppes.filter(predicat).reduce((a, e) => a + e.depense, 0),
    0,
  );
}

function categoriesParNomSnapshots(snapshots: SnapshotMois[]): Map<string, number> {
  const parNom = new Map<string, number>();
  snapshots.forEach((s) => {
    s.enveloppes
      .filter((e) => e.type !== "Entrée" && e.depense > 0)
      .forEach((e) => {
        const cle = e.nom.trim();
        parNom.set(cle, (parNom.get(cle) ?? 0) + e.depense);
      });
  });
  return parNom;
}

export function analyserFluxFinancier(params: {
  entreesTotal: number;
  depensesTotal: number;
  liquidites: number;
  epargne: number;
  categoriesParMontant: CategorieFluxRepartition[];
  historiquesMois: SnapshotMois[];
  nbMoisSelectionne: number;
  transactions: Transaction[];
  enveloppes: Enveloppe[];
  moisActuel: number;
  anneeActuelle: number;
}): { insight1: string; insight2: string } | null {
  const {
    entreesTotal,
    depensesTotal,
    liquidites,
    epargne,
    categoriesParMontant,
    historiquesMois,
    nbMoisSelectionne,
    transactions,
    enveloppes,
    moisActuel,
    anneeActuelle,
  } = params;

  if (depensesTotal <= 0 && entreesTotal <= 0) return null;

  // Période précédente de même durée : les nbMoisSelectionne mois archivés
  // les plus récents précèdent structurellement la période sélectionnée, qui
  // se termine toujours au mois en cours côté appelant (cf.
  // construireMoisPeriode/moisFluxAffiches dans analytics.tsx) — jamais
  // recalculée différemment ici.
  const periodePrecedente = historiquesMois.slice(-nbMoisSelectionne);
  const assezHistorique = periodePrecedente.length === nbMoisSelectionne;
  const depensesTotalPrecedent = assezHistorique
    ? sommeEnveloppesSnapshots(periodePrecedente, (e) => e.type !== "Entrée" && e.depense > 0)
    : null;
  const entreesTotalPrecedent = assezHistorique
    ? sommeEnveloppesSnapshots(
        periodePrecedente,
        (e) => e.type === "Entrée" && e.depense > 0 && e.nom.trim() !== "Budget",
      )
    : null;
  const epargnePrecedente = assezHistorique
    ? periodePrecedente.reduce((acc, s) => acc + s.epargne, 0)
    : null;
  const liquiditesPrecedentes =
    depensesTotalPrecedent !== null && entreesTotalPrecedent !== null && epargnePrecedente !== null
      ? Math.max(0, entreesTotalPrecedent - depensesTotalPrecedent - epargnePrecedente)
      : null;
  const categoriesPrecedentesParNom = assezHistorique ? categoriesParNomSnapshots(periodePrecedente) : null;

  const valider = (categorieId?: string): boolean =>
    validerConseil(
      { categorieId },
      { resteEstime: 0, enveloppes, objectifsAvecRythme: [], moisActuel, anneeActuelle },
    );

  const unite = nbMoisSelectionne <= 1 ? "ce mois" : `ces ${nbMoisSelectionne} mois`;
  const uniteAvant = nbMoisSelectionne <= 1 ? "le mois précédent" : `les ${nbMoisSelectionne} mois précédents`;

  type Candidat = { texte: string; categorieId?: string; poids: number };

  // === Insight 1 — Évolution (tendance la plus intéressante) ===================
  const candidatsEvolution: Candidat[] = [];

  if (depensesTotalPrecedent !== null && depensesTotalPrecedent > 0) {
    const variation = ((depensesTotal - depensesTotalPrecedent) / depensesTotalPrecedent) * 100;
    if (Math.abs(variation) >= SEUIL_VARIATION_FORTE_PCT) {
      candidatsEvolution.push({
        texte:
          variation > 0
            ? `Tes dépenses accélèrent : environ ${Math.round(variation)}% de plus sur ${unite} que sur ${uniteAvant}.`
            : `Tes dépenses ralentissent : environ ${Math.round(Math.abs(variation))}% de moins sur ${unite} que sur ${uniteAvant}.`,
        poids: 3,
      });
    }
  }

  if (entreesTotalPrecedent !== null && entreesTotalPrecedent > 0) {
    const variation = ((entreesTotal - entreesTotalPrecedent) / entreesTotalPrecedent) * 100;
    if (Math.abs(variation) >= SEUIL_VARIATION_FORTE_PCT) {
      candidatsEvolution.push({
        texte:
          variation > 0
            ? `Tes revenus progressent : environ ${Math.round(variation)}% de plus sur ${unite} que sur ${uniteAvant}.`
            : `Tes revenus reculent : environ ${Math.round(Math.abs(variation))}% de moins sur ${unite} que sur ${uniteAvant}.`,
        poids: 3,
      });
    }
  }

  if (categoriesPrecedentesParNom) {
    const pic = categoriesParMontant.reduce<
      | {
          label: string;
          variation: number;
          categorieId?: string;
          type?: CategorieFluxRepartition["type"];
        }
      | null
    >((meilleur, c) => {
      if (c.montant < SEUIL_MONTANT_SIGNIFICATIF) return meilleur;
      const avant = categoriesPrecedentesParNom.get(c.label);
      if (avant === undefined || avant <= 0) return meilleur;
      const variation = ((c.montant - avant) / avant) * 100;
      if (variation < SEUIL_ANOMALIE_CATEGORIE_PCT) return meilleur;
      return !meilleur || variation > meilleur.variation
        ? { label: c.label, variation, categorieId: c.categorieId, type: c.type }
        : meilleur;
    }, null);
    if (pic) {
      candidatsEvolution.push({
        texte: `${pic.label} sort du lot sur ${unite} : une hausse d'environ ${Math.round(pic.variation)}% par rapport à ${uniteAvant}.`,
        categorieId: categorieIdCiteable(pic),
        poids: 4,
      });
    }
  }

  // Retournement de tendance : 2 derniers mois archivés, indépendant de nbMoisSelectionne.
  if (historiquesMois.length >= 2) {
    const marge = (s: SnapshotMois) => s.disponible - s.totalDepense - s.epargne;
    const avantDernier = marge(historiquesMois[historiquesMois.length - 2]);
    const dernier = marge(historiquesMois[historiquesMois.length - 1]);
    if (avantDernier < 0 && dernier > 0) {
      candidatsEvolution.push({
        texte: "Après un mois difficile, la tendance s'est retournée : le mois suivant est repassé dans le positif.",
        poids: 2,
      });
    } else if (avantDernier > 0 && dernier < 0) {
      candidatsEvolution.push({
        texte: "Après un bon mois, la tendance s'est inversée : le mois suivant est repassé dans le négatif.",
        poids: 2,
      });
    }
  }

  // Concentration : part disproportionnée des dépenses de la période sur une seule journée.
  if (transactions.length >= 3 && depensesTotal > 0) {
    const parJour = new Map<string, number>();
    transactions.forEach((t) => {
      parJour.set(t.date, (parJour.get(t.date) ?? 0) + t.montant);
    });
    const plusGrosJour = Math.max(...parJour.values());
    if (plusGrosJour / depensesTotal >= SEUIL_CONCENTRATION_PART) {
      candidatsEvolution.push({
        texte: `Une bonne partie de tes dépenses sur ${unite} s'est concentrée en une seule journée, plutôt qu'étalée sur la période.`,
        poids: 1,
      });
    }
  }

  // Repli garanti (jamais vide) : relation entre les 2 plus grosses catégories,
  // ou à défaut entre l'unique catégorie et les entrées.
  if (categoriesParMontant.length >= 2) {
    const [premier, second] = categoriesParMontant;
    if (premier.montant > 0 && second.montant > 0) {
      const ratio = premier.montant / second.montant;
      candidatsEvolution.push({
        texte:
          ratio >= 1.5
            ? `${premier.label} pèse nettement plus que ${second.label} dans tes dépenses sur ${unite}, loin devant le reste.`
            : `${premier.label} et ${second.label} se disputent la première place de tes dépenses sur ${unite}, à des niveaux proches.`,
        categorieId: categorieIdCiteable(premier),
        poids: 0,
      });
    }
  } else if (categoriesParMontant.length === 1 && entreesTotal > 0) {
    const cat = categoriesParMontant[0];
    candidatsEvolution.push({
      texte: `${cat.label} est ta seule catégorie de dépense identifiée sur ${unite}, pour environ ${Math.round((cat.montant / entreesTotal) * 100)}% de tes revenus.`,
      categorieId: categorieIdCiteable(cat),
      poids: 0,
    });
  }

  const insight1Candidat = candidatsEvolution
    .filter((c) => valider(c.categorieId))
    .sort((a, b) => b.poids - a.poids)[0];

  // === Insight 2 — Lecture financière (relation entrées/sorties) ===============
  const candidatsLecture: Candidat[] = [];

  if (entreesTotal > 0) {
    const ratio = depensesTotal / entreesTotal;
    if (ratio >= 0.9) {
      candidatsLecture.push({
        texte: `Tu dépenses la quasi-totalité de ce que tu gagnes sur ${unite} — peu de marge de manœuvre pour l'instant.`,
        poids: 2,
      });
    } else if (ratio <= 0.5) {
      candidatsLecture.push({
        texte: `Moins de la moitié de tes revenus part en dépenses sur ${unite} — une belle capacité à mettre de côté.`,
        poids: 2,
      });
    }
  }

  if (liquiditesPrecedentes !== null) {
    if (liquiditesPrecedentes <= 0 && liquidites > 0) {
      candidatsLecture.push({
        texte: `Tu recommences à dégager de l'argent non affecté sur ${unite}, alors que ${uniteAvant} n'en laissait aucun.`,
        poids: 3,
      });
    } else if (liquiditesPrecedentes > 0 && liquidites <= 0) {
      candidatsLecture.push({
        texte: `L'argent non affecté a disparu sur ${unite}, alors que ${uniteAvant} en laissait de côté.`,
        poids: 3,
      });
    } else if (liquiditesPrecedentes > 0) {
      const variation = ((liquidites - liquiditesPrecedentes) / liquiditesPrecedentes) * 100;
      if (Math.abs(variation) >= SEUIL_VARIATION_FORTE_PCT) {
        candidatsLecture.push({
          texte:
            variation > 0
              ? `Tu conserves de plus en plus d'argent non affecté : environ ${Math.round(variation)}% de plus que sur ${uniteAvant}.`
              : `Tu conserves de moins en moins d'argent non affecté : environ ${Math.round(Math.abs(variation))}% de moins que sur ${uniteAvant}.`,
          poids: 2,
        });
      }
    }
  }

  if (depensesTotalPrecedent !== null && categoriesPrecedentesParNom) {
    const deltaTotal = depensesTotal - depensesTotalPrecedent;
    if (Math.abs(deltaTotal) >= SEUIL_MONTANT_SIGNIFICATIF) {
      const contribution = categoriesParMontant.reduce<
        | {
            label: string;
            delta: number;
            categorieId?: string;
            type?: CategorieFluxRepartition["type"];
          }
        | null
      >((meilleur, c) => {
        const avant = categoriesPrecedentesParNom.get(c.label) ?? 0;
        const delta = c.montant - avant;
        if (delta === 0 || Math.sign(delta) !== Math.sign(deltaTotal)) return meilleur;
        return !meilleur || Math.abs(delta) > Math.abs(meilleur.delta)
          ? { label: c.label, delta, categorieId: c.categorieId, type: c.type }
          : meilleur;
      }, null);
      if (contribution && Math.abs(contribution.delta / deltaTotal) >= SEUIL_CONTRIBUTION_DOMINANTE) {
        candidatsLecture.push({
          texte:
            deltaTotal > 0
              ? `${contribution.label} explique une bonne partie de la hausse de tes dépenses sur ${unite}.`
              : `${contribution.label} explique une bonne partie de la baisse de tes dépenses sur ${unite}.`,
          categorieId: categorieIdCiteable(contribution),
          poids: 4,
        });
      }
    }
  }

  if (categoriesParMontant.length > 0 && depensesTotal > 0) {
    const dominante = categoriesParMontant[0];
    const part = dominante.montant / depensesTotal;
    if (part >= 0.5) {
      candidatsLecture.push({
        texte: `${dominante.label} concentre plus de la moitié de tes dépenses sur ${unite}, largement devant le reste.`,
        categorieId: categorieIdCiteable(dominante),
        poids: 1,
      });
    }
  }

  // Repli garanti (jamais vide) : relation dépenses/entrées, sans catégorie
  // citée — reste toujours dans le pool après le filtre de complémentarité
  // ci-dessous.
  candidatsLecture.push({
    texte:
      entreesTotal > 0 && depensesTotal > 0
        ? `Sur ${unite}, tes dépenses représentent environ ${Math.round((depensesTotal / entreesTotal) * 100)}% de tes entrées.`
        : entreesTotal > 0
          ? `Sur ${unite}, aucune dépense n'est encore venue face à tes entrées.`
          : `Sur ${unite}, tes dépenses ne sont rattachées à aucune entrée identifiée pour l'instant.`,
    poids: -1,
  });

  // Complémentarité : jamais la même catégorie citée comme moteur principal
  // des 2 insights.
  const candidatsLectureRetenus = candidatsLecture.filter(
    (c) => !(insight1Candidat?.categorieId && c.categorieId === insight1Candidat.categorieId),
  );
  const insight2Candidat = candidatsLectureRetenus
    .filter((c) => valider(c.categorieId))
    .sort((a, b) => b.poids - a.poids)[0];

  if (!insight1Candidat || !insight2Candidat) return null;

  return { insight1: insight1Candidat.texte, insight2: insight2Candidat.texte };
}
