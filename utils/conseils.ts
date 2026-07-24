import {
  Enveloppe,
  Objectif,
  PaiementHistorique,
  SnapshotMois,
  Transaction,
} from "../app/store";
import { depenseCumuleeAuJour, joursDansMois } from "./exportExcel";

export type NiveauConseil = "bon" | "attention" | "alerte";

export type Conseil = {
  texte: string;
  niveau: NiveauConseil;
};

// --- Signaux réutilisés tels quels par "Ce qu'il faut retenir" (Stats) et par
// le moteur de conseils d'Aperçu, pour ne garder qu'un seul endroit qui sait
// calculer ces trois pourcentages.

// Delta (%) de la dépense moyenne par jour de ce mois-ci vs le mois dernier.
// Le mois dernier est ramené à une moyenne sur 30 jours fixes (pas son
// nombre réel de jours) : approximation historique du moteur "Ce qu'il faut
// retenir", conservée telle quelle pour ne pas changer un chiffre déjà
// affiché aux utilisateurs.
export function calculerDeltaDepenseJournaliere(
  depenseMoisActuel: number,
  depenseMoisPrec: number,
  joursEcoules: number,
): number {
  const depenseMoyJour =
    joursEcoules > 0 ? Math.round(depenseMoisActuel / joursEcoules) : 0;
  const depenseMoyJourPrec =
    depenseMoisPrec > 0 ? Math.round(depenseMoisPrec / 30) : 0;
  return depenseMoyJourPrec > 0
    ? Math.round(
        ((depenseMoyJour - depenseMoyJourPrec) / depenseMoyJourPrec) * 100,
      )
    : 0;
}

export function calculerTauxEpargne(
  epargneMois: number,
  disponible: number,
): number {
  return disponible > 0 ? Math.round((epargneMois / disponible) * 100) : 0;
}

export function calculerDeltaTotal(
  depenseMoisActuel: number,
  depenseMoisPrec: number,
): number {
  return depenseMoisPrec > 0
    ? Math.round(((depenseMoisActuel - depenseMoisPrec) / depenseMoisPrec) * 100)
    : 0;
}

// Phrases de "Ce qu'il faut retenir" (Stats) — logique inchangée, seulement
// déplacée ici pour être la source unique de ces trois signaux.
export function genererInsightsStats(signaux: {
  deltaDepMoy: number;
  tauxEpargne: number;
  deltaTotal: number;
}): string[] {
  const { deltaDepMoy, tauxEpargne, deltaTotal } = signaux;
  const insights: string[] = [];
  if (deltaDepMoy < 0)
    insights.push(
      `Dépense journalière en baisse de ${Math.abs(deltaDepMoy)}% vs le mois dernier`,
    );
  else if (deltaDepMoy > 0)
    insights.push(
      `Dépense journalière en hausse de ${deltaDepMoy}% vs le mois dernier`,
    );
  if (tauxEpargne >= 20)
    insights.push(`Bon taux d'épargne ce mois-ci à ${tauxEpargne}%`);
  if (deltaTotal < 0)
    insights.push(
      `Tu as dépensé ${Math.abs(deltaTotal)}% de moins que le mois dernier`,
    );
  else if (deltaTotal > 0)
    insights.push(`Tu as dépensé ${deltaTotal}% de plus que le mois dernier`);
  if (insights.length === 0)
    insights.push(
      "Commence à enregistrer tes dépenses pour voir tes insights ici !",
    );
  return insights;
}

// Plus grosse dépense du mois (Budget) — comparée sur toutes les catégories
// de dépense (Fixe + Variable, hors Entrée d'argent) passées par l'appelant.
export function trouverDepenseDominante(
  enveloppesSansEntree: Enveloppe[],
): Enveloppe | undefined {
  return [...enveloppesSansEntree].sort((a, b) => b.depense - a.depense)[0];
}

// Rythme d'un objectif d'épargne (Stats) — montant mensuel récurrent si
// l'objectif est récurrent (signal le plus fiable), sinon moyenne des
// versements réels des derniers mois reconstruite depuis les "actuel"
// archivés, avec repli sur le seul versement de ce mois-ci si pas assez
// d'historique.
const NB_MOIS_MOYENNE_RYTHME = 3;

export function calculerRythmeObjectif(
  obj: Objectif,
  historiquesMois: SnapshotMois[],
  snapshotMoisPrecedent: SnapshotMois | undefined,
): {
  pct: number;
  delta: number | null;
  moisRestants: number | null;
  rythmeInsuffisant: boolean;
  rythmeMensuel: number;
  objectifAtteint: boolean;
} {
  const pct = obj.cible > 0 ? Math.min((obj.actuel / obj.cible) * 100, 100) : 0;
  const objPrecedent = snapshotMoisPrecedent?.objectifs.find(
    (o) => o.id === obj.id,
  );
  const delta = objPrecedent ? obj.actuel - objPrecedent.actuel : null;

  let rythmeMensuel: number;
  if (obj.recurrent && obj.montantMensuel && obj.montantMensuel > 0) {
    rythmeMensuel = obj.montantMensuel;
  } else {
    const actuelsRecents = historiquesMois
      .slice(-NB_MOIS_MOYENNE_RYTHME)
      .map((s) => s.objectifs.find((o) => o.id === obj.id)?.actuel)
      .filter((v): v is number => v !== undefined);
    const sequence = [...actuelsRecents, obj.actuel];
    rythmeMensuel =
      sequence.length >= 2
        ? sequence
            .slice(1)
            .map((v, i) => v - sequence[i])
            .reduce((acc, d) => acc + d, 0) /
          (sequence.length - 1)
        : obj.contributionMois;
  }
  const objectifAtteint = obj.actuel >= obj.cible;
  const moisRestants =
    !objectifAtteint && rythmeMensuel > 0
      ? Math.ceil((obj.cible - obj.actuel) / rythmeMensuel)
      : null;
  const rythmeInsuffisant = !objectifAtteint && rythmeMensuel <= 0;

  return { pct, delta, moisRestants, rythmeInsuffisant, rythmeMensuel, objectifAtteint };
}

// --- Nouveaux signaux, spécifiques au bloc "Nos conseils".

const MONTANT_MIN_SIGNIFICATIF = 20;
const SEUIL_ACCELERATION_FORTE = 80;
const SEUIL_ACCELERATION = 40;
const SEUIL_MARGE_FAIBLE = 0.15;
const SEUIL_DEPENSE_DOMINANTE = 0.4;
const SEUIL_TAUX_EPARGNE_BON = 20;
const SEUIL_OBJECTIF_PROCHE = 80;

// Compare le cumul de dépenses d'une catégorie depuis le 1er du mois à celui
// du mois dernier au même jour calendaire — même principe que la
// comparaison "au même jour" déjà utilisée sur Budget pour le total, mais
// appliqué à une seule enveloppe via le paramètre optionnel de
// `depenseCumuleeAuJour`. Retourne `deltaPct: null` si le mois dernier n'a
// pas été archivé (pas de base de comparaison honnête).
export function calculerPaceCategorie(
  enveloppe: Enveloppe,
  transactions: Transaction[],
  historiquePaiements: PaiementHistorique[],
  historiquesMois: SnapshotMois[],
  moisActuel: number,
  anneeActuelle: number,
  jourActuel: number,
): { depenseCeMois: number; deltaPct: number | null } {
  const moisPrec = moisActuel === 0 ? 11 : moisActuel - 1;
  const anneePrec = moisActuel === 0 ? anneeActuelle - 1 : anneeActuelle;
  const snapshotMoisPrecedent = historiquesMois.find(
    (s) => s.mois === moisPrec && s.annee === anneePrec,
  );
  const depenseCeMois = depenseCumuleeAuJour(
    transactions,
    historiquePaiements,
    moisActuel,
    anneeActuelle,
    jourActuel,
    enveloppe.id,
  );
  if (!snapshotMoisPrecedent) return { depenseCeMois, deltaPct: null };
  const jourMaxPrecedent = Math.min(
    jourActuel,
    joursDansMois(moisPrec, anneePrec),
  );
  const depenseMoisPrec = depenseCumuleeAuJour(
    transactions,
    historiquePaiements,
    moisPrec,
    anneePrec,
    jourMaxPrecedent,
    enveloppe.id,
  );
  const deltaPct =
    depenseMoisPrec > 0
      ? ((depenseCeMois - depenseMoisPrec) / depenseMoisPrec) * 100
      : null;
  return { depenseCeMois, deltaPct };
}

// Catégorie avec le moins de marge restante avant la fin du mois, parmi
// celles pas encore en dépassement — pour prévenir avant que ça déborde,
// pas pour constater un dépassement déjà là (couvert par la règle
// "dépense dominante"/"reste estimé négatif").
export function trouverCategoriePeuDeMarge(
  enveloppesSansEntree: Enveloppe[],
  joursRestantsDansMois: number,
): Enveloppe | undefined {
  if (joursRestantsDansMois <= 3) return undefined;
  const candidates = enveloppesSansEntree
    .filter((e) => e.budget > 0 && e.depense > 0 && e.depense < e.budget)
    .map((e) => ({ e, pctRestant: (e.budget - e.depense) / e.budget }))
    .filter((c) => c.pctRestant < SEUIL_MARGE_FAIBLE)
    .sort((a, b) => a.pctRestant - b.pctRestant);
  return candidates[0]?.e;
}

export function genererConseils(params: {
  enveloppes: Enveloppe[];
  objectifs: Objectif[];
  transactions: Transaction[];
  historiquePaiements: PaiementHistorique[];
  historiquesMois: SnapshotMois[];
  epargneMois: number;
  resteEstime: number;
  etatReste: "positif" | "procheLimite" | "negatif";
  disponibleEffectif: number;
  moisActuel: number;
  anneeActuelle: number;
  maxConseils?: number;
}): Conseil[] {
  const {
    enveloppes,
    objectifs,
    transactions,
    historiquePaiements,
    historiquesMois,
    epargneMois,
    resteEstime,
    etatReste,
    disponibleEffectif,
    moisActuel,
    anneeActuelle,
    maxConseils = 3,
  } = params;

  const enveloppesSansEntree = enveloppes.filter((e) => e.type !== "Entrée");
  const totalDepenses = enveloppesSansEntree.reduce(
    (acc, e) => acc + e.depense,
    0,
  );
  const jourActuel = new Date().getDate();
  const joursRestantsDansMois =
    joursDansMois(moisActuel, anneeActuelle) - jourActuel;

  const candidats: (Conseil | undefined)[] = [];

  // 1. Dépassement de budget estimé en fin de mois.
  candidats.push(
    etatReste === "negatif"
      ? {
          texte: `Tu risques de dépasser ton budget d'environ ${Math.round(Math.abs(resteEstime))}€ si rien ne change d'ici la fin du mois.`,
          niveau: "alerte",
        }
      : undefined,
  );

  // 2 & 3. Accélération des dépenses sur une catégorie vs le même jour le
  // mois dernier.
  const paceParCategorie = enveloppesSansEntree
    .map((e) => ({
      enveloppe: e,
      pace: calculerPaceCategorie(
        e,
        transactions,
        historiquePaiements,
        historiquesMois,
        moisActuel,
        anneeActuelle,
        jourActuel,
      ),
    }))
    .filter(
      ({ pace }) =>
        pace.deltaPct !== null && pace.depenseCeMois >= MONTANT_MIN_SIGNIFICATIF,
    )
    .sort((a, b) => (b.pace.deltaPct ?? 0) - (a.pace.deltaPct ?? 0))[0];
  if (paceParCategorie && (paceParCategorie.pace.deltaPct ?? 0) >= SEUIL_ACCELERATION_FORTE) {
    candidats.push({
      texte: `Tu dépenses beaucoup plus vite que d'habitude sur ${paceParCategorie.enveloppe.nom}.`,
      niveau: "alerte",
    });
  } else if (paceParCategorie && (paceParCategorie.pace.deltaPct ?? 0) >= SEUIL_ACCELERATION) {
    candidats.push({
      texte: `Tu dépenses plus vite que d'habitude sur ${paceParCategorie.enveloppe.nom}.`,
      niveau: "attention",
    });
  } else {
    candidats.push(undefined);
  }

  // 4. Budget serré ce mois-ci.
  candidats.push(
    etatReste === "procheLimite"
      ? {
          texte: "Ton budget est serré ce mois-ci, mieux vaut lever le pied sur les prochaines dépenses.",
          niveau: "attention",
        }
      : undefined,
  );

  // 5. Peu de marge restante sur une catégorie.
  const categoriePeuDeMarge = trouverCategoriePeuDeMarge(
    enveloppesSansEntree,
    joursRestantsDansMois,
  );
  candidats.push(
    categoriePeuDeMarge
      ? {
          texte: `Il te reste peu de marge sur ${categoriePeuDeMarge.nom} avant la fin du mois.`,
          niveau: "attention",
        }
      : undefined,
  );

  // 6. Un objectif n'avance plus ce mois-ci.
  const objectifsActifs = objectifs.filter((o) => !o.ferme);
  const moisPrec = moisActuel === 0 ? 11 : moisActuel - 1;
  const anneePrec = moisActuel === 0 ? anneeActuelle - 1 : anneeActuelle;
  const snapshotMoisPrecedent = historiquesMois.find(
    (s) => s.mois === moisPrec && s.annee === anneePrec,
  );
  const objectifsAvecRythme = objectifsActifs.map((o) => ({
    objectif: o,
    rythme: calculerRythmeObjectif(o, historiquesMois, snapshotMoisPrecedent),
  }));
  const objectifRythmeInsuffisant = objectifsAvecRythme.find(
    ({ rythme }) => rythme.rythmeInsuffisant,
  );
  candidats.push(
    objectifRythmeInsuffisant
      ? {
          texte: `${objectifRythmeInsuffisant.objectif.nom} n'avance plus ce mois-ci, pense à y remettre un peu d'argent.`,
          niveau: "attention",
        }
      : undefined,
  );

  // 7. Une catégorie pèse anormalement lourd dans le budget total.
  const depenseDominante = trouverDepenseDominante(enveloppesSansEntree);
  candidats.push(
    depenseDominante &&
      totalDepenses > 0 &&
      depenseDominante.depense / totalDepenses >= SEUIL_DEPENSE_DOMINANTE
      ? {
          texte: `${depenseDominante.nom} représente à elle seule une grosse part de ton budget ce mois-ci.`,
          niveau: "attention",
        }
      : undefined,
  );

  // 8. Bon taux d'épargne.
  const tauxEpargne = calculerTauxEpargne(epargneMois, disponibleEffectif);
  candidats.push(
    tauxEpargne >= SEUIL_TAUX_EPARGNE_BON
      ? {
          texte: `Ton épargne progresse bien ce mois-ci, tu mets de côté ${tauxEpargne}% de ton budget.`,
          niveau: "bon",
        }
      : undefined,
  );

  // 9. Sur la bonne voie pour respecter le budget.
  candidats.push(
    etatReste === "positif"
      ? {
          texte: "Tu es sur la bonne voie pour respecter ton budget ce mois-ci.",
          niveau: "bon",
        }
      : undefined,
  );

  // 10. Un objectif approche de sa cible.
  const objectifProche = objectifsAvecRythme
    .filter(
      ({ rythme }) =>
        !rythme.objectifAtteint && rythme.pct >= SEUIL_OBJECTIF_PROCHE,
    )
    .sort((a, b) => b.rythme.pct - a.rythme.pct)[0];
  candidats.push(
    objectifProche
      ? {
          texte: `${objectifProche.objectif.nom} approche de sa cible, encore un petit effort.`,
          niveau: "bon",
        }
      : undefined,
  );

  // 11. Dépense journalière en baisse vs le mois dernier.
  const depenseMoisPrec = snapshotMoisPrecedent
    ? snapshotMoisPrecedent.enveloppes
        .filter((e) => e.type !== "Entrée")
        .reduce((acc, e) => acc + e.depense, 0)
    : 0;
  const deltaDepMoy = calculerDeltaDepenseJournaliere(
    totalDepenses,
    depenseMoisPrec,
    jourActuel,
  );
  candidats.push(
    deltaDepMoy < 0
      ? {
          texte: `Ta dépense quotidienne moyenne est en baisse de ${Math.abs(deltaDepMoy)}% par rapport au mois dernier.`,
          niveau: "bon",
        }
      : undefined,
  );

  const conseils = candidats.filter((c): c is Conseil => c !== undefined);

  if (conseils.length === 0) {
    return [
      {
        texte: "Commence à enregistrer tes dépenses pour recevoir des conseils personnalisés.",
        niveau: "bon",
      },
    ];
  }
  return conseils.slice(0, maxConseils);
}
