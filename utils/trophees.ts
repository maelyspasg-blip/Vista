import { Enveloppe, Objectif, PaiementHistorique, SnapshotMois, Transaction } from "../app/store";
import { calculerRythmeObjectif } from "./conseils";

export type Trophee = {
  id: string;
  titre: string;
  description: string;
  debloque: boolean;
  // Uniquement pour "Régularité" (V1 : un seul trophée à paliers).
  niveau?: "bronze" | "argent" | "or";
};

// RÈGLE À NE JAMAIS CASSER : aucun tracking d'ouverture d'app n'existe dans
// ce projet — "régularité de suivi" est approximée par les jours où au
// moins une transaction/un paiement est daté(e) ce jour-là (proxy validé
// avec l'utilisateur, même approximation que utils/score.ts::scoreRegularite).
// Ne jamais confondre `meilleur` (record historique tous temps, utilisé
// pour les trophées définitifs "7 jours"/"1 mois"/"3 mois" — un trophée
// débloqué le reste pour toujours) et `actuel` (streak en cours, utilisé
// uniquement pour le NIVEAU du trophée "Régularité", qui peut redescendre
// si la régularité retombe — comme un rang, pas un trophée définitif).
function dateVersCle(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function calculerStreaksJoursActifs(
  transactions: { date: string }[],
  historiquePaiements: { date: string }[],
): { meilleur: number; actuel: number } {
  const joursActifs = new Set<string>();
  [...transactions, ...historiquePaiements].forEach((e) => {
    const d = new Date(e.date);
    if (!Number.isNaN(d.getTime())) {
      joursActifs.add(dateVersCle(new Date(d.getFullYear(), d.getMonth(), d.getDate())));
    }
  });
  if (joursActifs.size === 0) return { meilleur: 0, actuel: 0 };

  const UN_JOUR_MS = 24 * 60 * 60 * 1000;
  const joursTries = [...joursActifs]
    .map((cle) => {
      const [annee, mois, jour] = cle.split("-").map(Number);
      return new Date(annee, mois, jour).getTime();
    })
    .sort((a, b) => a - b);

  let meilleur = 1;
  let courant = 1;
  for (let i = 1; i < joursTries.length; i++) {
    courant = joursTries[i] - joursTries[i - 1] === UN_JOUR_MS ? courant + 1 : 1;
    meilleur = Math.max(meilleur, courant);
  }

  let actuel = 0;
  const curseur = new Date();
  while (joursActifs.has(dateVersCle(curseur))) {
    actuel += 1;
    curseur.setDate(curseur.getDate() - 1);
  }

  return { meilleur, actuel };
}

const SEUIL_REGULARITE_OR = 90;
const SEUIL_REGULARITE_ARGENT = 30;
const SEUIL_REGULARITE_BRONZE = 7;

function niveauRegularite(streakActuel: number): "bronze" | "argent" | "or" | undefined {
  if (streakActuel >= SEUIL_REGULARITE_OR) return "or";
  if (streakActuel >= SEUIL_REGULARITE_ARGENT) return "argent";
  if (streakActuel >= SEUIL_REGULARITE_BRONZE) return "bronze";
  return undefined;
}

export function calculerTrophees(params: {
  historiquesMois: SnapshotMois[];
  transactions: Transaction[];
  historiquePaiements: PaiementHistorique[];
  objectifs: Objectif[];
  enveloppes: Enveloppe[];
  // Depuis chargerNbAmeliorations (utils/conseils.ts) — nombre cumulé de
  // situations "Nos conseils" passées par RESOLU/STABLE.
  nbAmeliorations: number;
}): Trophee[] {
  const { historiquesMois, transactions, historiquePaiements, objectifs, enveloppes, nbAmeliorations } =
    params;

  const { meilleur: meilleurStreak, actuel: streakActuel } = calculerStreaksJoursActifs(
    transactions,
    historiquePaiements,
  );

  const enveloppesSansEntree = enveloppes.filter((e) => e.type !== "Entrée");
  const moisMaitrise =
    enveloppesSansEntree.length > 0 &&
    enveloppesSansEntree.every((e) => e.depense <= e.budget);

  const margeSnapshot = (s: SnapshotMois) => s.disponible - s.totalDepense - s.epargne;
  const derniersMoisArchives = historiquesMois.slice(-2);
  const retourEquilibre =
    derniersMoisArchives.length === 2 &&
    margeSnapshot(derniersMoisArchives[0]) < 0 &&
    margeSnapshot(derniersMoisArchives[1]) >= 0;

  const objectifsActifs = objectifs.filter((o) => !o.ferme);
  const dernierMoisArchive = historiquesMois[historiquesMois.length - 1];
  const avantDernierMoisArchive = historiquesMois[historiquesMois.length - 2];

  const objectifAccelere = objectifsActifs.some((o) => {
    const rythme = calculerRythmeObjectif(o, historiquesMois, dernierMoisArchive);
    return rythme.delta !== null && rythme.rythmeMensuel > 0 && rythme.delta > rythme.rythmeMensuel;
  });

  const objectifRepris = objectifsActifs.some((o) => {
    const rythme = calculerRythmeObjectif(o, historiquesMois, dernierMoisArchive);
    if (rythme.delta === null || rythme.delta <= 0) return false;
    const snap1 = dernierMoisArchive?.objectifs.find((x) => x.id === o.id);
    const snap2 = avantDernierMoisArchive?.objectifs.find((x) => x.id === o.id);
    return !!snap1 && !!snap2 && snap1.actuel === snap2.actuel;
  });

  return [
    {
      id: "suivi-7j",
      titre: "7 jours de suivi",
      description: "Enregistrer une dépense au moins 7 jours de suite.",
      debloque: meilleurStreak >= 7,
    },
    {
      id: "suivi-1mois",
      titre: "1 mois complet",
      description: "Enregistrer une dépense presque tous les jours pendant 1 mois.",
      debloque: meilleurStreak >= 30,
    },
    {
      id: "suivi-3mois",
      titre: "3 mois consécutifs",
      description: "Un suivi régulier maintenu sur 3 mois.",
      debloque: meilleurStreak >= 90,
    },
    {
      id: "objectif-cree",
      titre: "Premier objectif créé",
      description: "Définir un premier objectif d'épargne.",
      debloque: objectifs.length >= 1,
    },
    {
      id: "objectif-atteint",
      titre: "Premier objectif atteint",
      description: "Atteindre la cible d'un objectif d'épargne.",
      debloque: objectifs.some((o) => o.actuel >= o.cible && o.cible > 0),
    },
    {
      id: "objectif-accelere",
      titre: "Objectif accéléré",
      description: "Verser plus que ton rythme habituel sur un objectif.",
      debloque: objectifAccelere,
    },
    {
      id: "mois-maitrise",
      titre: "Mois maîtrisé",
      description: "Toutes tes catégories sont restées dans leur budget ce mois-ci.",
      debloque: moisMaitrise,
    },
    {
      id: "retour-equilibre",
      titre: "Retour à l'équilibre",
      description: "Revenir à une marge positive après un mois en dépassement.",
      debloque: retourEquilibre,
    },
    {
      id: "reprise",
      titre: "Reprise",
      description: "Reprendre un versement sur un objectif resté à l'arrêt plusieurs mois.",
      debloque: objectifRepris,
    },
    {
      id: "insight-en-action",
      titre: "Insight en action",
      description: "Une recommandation Vista suivie d'une vraie amélioration mesurée.",
      debloque: nbAmeliorations >= 1,
    },
    {
      id: "discipline-douce",
      titre: "Discipline douce",
      description: "Plusieurs petites améliorations successives, l'une après l'autre.",
      debloque: nbAmeliorations >= 3,
    },
    {
      id: "regularite",
      titre: "Régularité",
      description: "Bronze dès 7 jours de suivi d'affilée, Argent à 30, Or à 90.",
      debloque: streakActuel >= SEUIL_REGULARITE_BRONZE,
      niveau: niveauRegularite(streakActuel),
    },
  ];
}
