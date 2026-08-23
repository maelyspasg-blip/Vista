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
import { Enveloppe, SnapshotMois } from "../app/store";
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
