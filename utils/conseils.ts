import { Enveloppe, Objectif, PaiementHistorique, SnapshotMois, Transaction } from "../app/store";
import { depenseCumuleeAuJour, joursDansMois, MOIS_LABELS, moisPrecedent } from "./exportExcel";

export type NiveauConseil = "bon" | "attention" | "alerte";

export type Conseil = {
  texte: string;
  niveau: NiveauConseil;
};

// --- Signaux réutilisés tels quels par le moteur de conseils d'Aperçu et
// par les KPI de Stats, pour ne garder qu'un seul endroit qui sait calculer
// ces pourcentages.

// Delta de la dépense moyenne par jour de ce mois-ci vs le mois dernier, en
// % et en €. Le mois dernier est ramené à une moyenne sur 30 jours fixes
// (pas son nombre réel de jours) : approximation historique conservée telle
// quelle pour ne pas changer un chiffre déjà affiché aux utilisateurs.
export function calculerDeltaDepenseJournaliere(
  depenseMoisActuel: number,
  depenseMoisPrec: number,
  joursEcoules: number,
): { pct: number; deltaEuros: number } {
  const depenseMoyJour =
    joursEcoules > 0 ? Math.round(depenseMoisActuel / joursEcoules) : 0;
  const depenseMoyJourPrec =
    depenseMoisPrec > 0 ? Math.round(depenseMoisPrec / 30) : 0;
  const pct =
    depenseMoyJourPrec > 0
      ? Math.round(
          ((depenseMoyJour - depenseMoyJourPrec) / depenseMoyJourPrec) * 100,
        )
      : 0;
  return { pct, deltaEuros: depenseMoyJour - depenseMoyJourPrec };
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

// --- Signaux spécifiques au bloc "Nos conseils" (Aperçu).
//
// Moteur "coach financier" conscient du jour du mois, comparant
// systématiquement au mois précédent quand c'est disponible et pertinent.
// Distinct par construction de genererInsightsPeriode (Stats,
// utils/tendancesPeriode.ts), qui analyse la PÉRIODE sélectionnée par
// l'utilisateur (tendances sur plusieurs mois, régularité, volatilité,
// pics) — jamais le seul mois en cours au jour près :
//  - R1-R3/R4-R5/R15/R18 (position dans le mois, projection de fin de mois,
//    allocation quotidienne restante) n'ont aucun équivalent dans Stats,
//    qui ne raisonne jamais "jours restants du mois en cours".
//  - R7 (catégorie >130% de SON PROPRE budget ce mois-ci) vs S1 Stats
//    (catégorie dont la MOYENNE augmente le plus vite d'une moitié à
//    l'autre de la période sélectionnée) : l'un compare une catégorie à son
//    propre budget du mois, l'autre compare des moyennes de plusieurs mois
//    entre elles — signaux différents.
//  - R12 (catégorie >200% de sa moyenne sur 3 mois glissants, ancrée sur le
//    mois en cours) vs S1/S4 Stats (tendance/pic sur la période choisie,
//    potentiellement 6/12/24 mois) : ancrage et seuils différents.
//  - R13 (meilleur mois "depuis X mois" au même jour du mois, comparaison
//    jour-à-jour via depenseCumuleeAuJour) vs S5 Stats (baisse confirmée
//    sur ≥3 mois complets, régression 1ère/2e moitié de la période) :
//    l'un compare un mois partiel à d'autres mois au même jour, l'autre
//    une tendance sur des mois entièrement clos.
//  - R9 (objectif à 75-95% de sa cible, état ponctuel) vs S3 Stats (rythme
//    d'épargne mesuré sur un streak de mois consécutifs) : état vs rythme.
//  - R10 (aucun objectif actif + marge positive répétée → en créer un) n'a
//    pas d'équivalent dans Stats, qui ne parle que d'objectifs existants.

const SEUIL_MARGE_FIN_MOIS = 0.15; // ratioReste, R1
const SEUIL_MARGE_MI_MOIS = 0.25; // ratioReste, R2
const SEUIL_MARGE_DEBUT_MOIS = 0.4; // ratioReste, R3
const SEUIL_RATIO_ENTREE_EXCEPTIONNELLE = 0.2; // entrée reçue / budget, R14
const SEUIL_DEPASSEMENT_CATEGORIE = 1.3; // dépense / budget de la catégorie, R7
const SEUIL_CATEGORIE_ATTENTION_MIN = 0.8; // dépense / budget de la catégorie, R6
const SEUIL_MARGE_VERSEMENT = 0.25; // ratioReste, R8
const SEUIL_OBJECTIF_PROCHE_MIN = 75; // %, R9
const SEUIL_OBJECTIF_PROCHE_MAX = 95; // %, R9
const NB_MOIS_MOYENNE_CATEGORIE = 3; // R12
const SEUIL_SPIKE_CATEGORIE = 2; // ×moyenne, R12
const MONTANT_MIN_MOYENNE_CATEGORIE = 20; // € — évite le bruit sur des montants négligeables, R12
const NB_MOIS_MEILLEUR_MOIS = 3; // R13
const SEUIL_JOUR_MIN_MEILLEUR_MOIS = 5; // évite un "meilleur mois" trivial dès le 1er jour, R13
const SEUIL_JOURS_R16 = 10; // "beaucoup de jours restants", R16
const SEUIL_EURJOUR_R16 = 5; // €/jour, R16

export function genererConseils(params: {
  enveloppes: Enveloppe[];
  objectifs: Objectif[];
  historiquesMois: SnapshotMois[];
  transactions: Transaction[];
  historiquePaiements: PaiementHistorique[];
  epargneMois: number;
  resteEstime: number;
  // Même formule que resteEstime, déjà calculée dans app/(tabs)/index.tsx
  // sur le snapshot du mois précédent — recalculée ici donnerait un second
  // moyen d'obtenir le même chiffre, avec un risque de divergence.
  resteEstimePrecedent: number | null;
  disponibleEffectif: number;
  moisActuel: number;
  anneeActuelle: number;
  maxConseils?: number;
}): Conseil[] {
  const {
    enveloppes,
    objectifs,
    historiquesMois,
    transactions,
    historiquePaiements,
    epargneMois,
    resteEstime,
    resteEstimePrecedent,
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
  const ratioReste =
    disponibleEffectif > 0 ? resteEstime / disponibleEffectif : 0;
  const ratioDepense =
    disponibleEffectif > 0 ? totalDepenses / disponibleEffectif : 0;

  const { mois: moisPrec, annee: anneePrec } = moisPrecedent(
    moisActuel,
    anneeActuelle,
  );
  const snapshotMoisPrecedent = historiquesMois.find(
    (s) => s.mois === moisPrec && s.annee === anneePrec,
  );

  const objectifsActifs = objectifs.filter((o) => !o.ferme);
  const objectifsAvecRythme = objectifsActifs.map((o) => ({
    objectif: o,
    rythme: calculerRythmeObjectif(o, historiquesMois, snapshotMoisPrecedent),
  }));

  // Dédoublonnage inter-règles au sein de ce même moteur : une catégorie ou
  // un objectif déjà cité par une règle plus prioritaire n'est pas repris
  // par une règle moins prioritaire portant sur le même sujet.
  const categoriesDejaCitees = new Set<string>();
  const objectifsDejaCites = new Set<string>();

  const candidats: (Conseil | undefined)[] = [];

  // --- GROUPE 1 : gestion de fin de mois (position dans le mois + marge) ---

  const r1Cond =
    joursRestantsDansMois >= 0 &&
    joursRestantsDansMois <= 10 &&
    ratioReste > SEUIL_MARGE_FIN_MOIS;
  candidats.push(
    r1Cond
      ? {
          texte: `Il te reste ${joursRestantsDansMois} jour${joursRestantsDansMois > 1 ? "s" : ""} et environ ${Math.round(resteEstime)}€ de marge. Si tu tiens tes dépenses prévues, tu pourrais mettre ${Math.round(resteEstime * 0.2)}€ de côté ce mois-ci sans te priver.`,
          niveau: "bon",
        }
      : undefined,
  );

  const r2Cond =
    joursRestantsDansMois >= 11 &&
    joursRestantsDansMois <= 20 &&
    ratioReste > SEUIL_MARGE_MI_MOIS;
  candidats.push(
    r2Cond
      ? {
          texte: `À mi-parcours, tu as encore ${Math.round(resteEstime)}€ de marge. En maintenant ce rythme, tu termineras le mois avec ce solde${
            resteEstimePrecedent !== null
              ? ` — ${resteEstime >= resteEstimePrecedent ? "mieux" : "moins bien"} qu'en ${MOIS_LABELS[moisPrec]} où tu avais terminé avec ${Math.round(resteEstimePrecedent)}€`
              : ""
          }.`,
          niveau: "bon",
        }
      : undefined,
  );

  const r3Cond = joursRestantsDansMois > 20 && ratioReste > SEUIL_MARGE_DEBUT_MOIS;
  candidats.push(
    r3Cond
      ? {
          texte: `Excellent départ — tu n'as utilisé que ${Math.round(ratioDepense * 100)}% de ton budget en ${jourActuel} jour${jourActuel > 1 ? "s" : ""}. À ce rythme, tu pourrais épargner ${Math.round(resteEstime * 0.3)}€ supplémentaires ce mois-ci.`,
          niveau: "bon",
        }
      : undefined,
  );

  // --- GROUPE 2 : alertes dépassement ---

  const r4Cond =
    joursRestantsDansMois >= 0 && joursRestantsDansMois <= 10 && resteEstime < 0;
  candidats.push(
    r4Cond
      ? {
          texte: `Attention — avec tes dépenses prévues, tu risques de dépasser de ${Math.round(Math.abs(resteEstime))}€ d'ici ${joursRestantsDansMois} jour${joursRestantsDansMois > 1 ? "s" : ""}. Évite toute dépense non planifiée cette semaine.`,
          niveau: "alerte",
        }
      : undefined,
  );

  // Calculée avant R5 (et retenue dans categoriesDejaCitees) pour que R5 ne
  // cite jamais la même catégorie que R7 juste en dessous — sinon les deux
  // pourraient toutes les deux pointer "Loyer" comme écart principal, en
  // termes légèrement différents, ce qui lirait comme une répétition.
  const categorieDepassement130 = enveloppesSansEntree
    .filter(
      (e) => e.budget > 0 && e.depense > e.budget * SEUIL_DEPASSEMENT_CATEGORIE,
    )
    .sort((a, b) => b.depense - b.budget - (a.depense - a.budget))[0];
  if (categorieDepassement130) categoriesDejaCitees.add(categorieDepassement130.id);

  const categoriePlusDepassee = enveloppesSansEntree
    .filter((e) => e.depense > e.budget && !categoriesDejaCitees.has(e.id))
    .sort((a, b) => b.depense - b.budget - (a.depense - a.budget))[0];
  const r5Cond = joursRestantsDansMois > 10 && resteEstime < 0;
  candidats.push(
    r5Cond
      ? {
          texte: `Tu es parti pour dépasser ton budget de ${Math.round(Math.abs(resteEstime))}€ ce mois-ci. Il te reste ${joursRestantsDansMois} jours pour corriger${
            categoriePlusDepassee
              ? ` — commence par réduire sur ${categoriePlusDepassee.nom}`
              : ""
          }.${
            resteEstimePrecedent !== null
              ? ` Le mois dernier, tu avais ${resteEstimePrecedent >= 0 ? "terminé dans les clous" : `dépassé de ${Math.round(Math.abs(resteEstimePrecedent))}€`}.`
              : ""
          }`,
          niveau: "alerte",
        }
      : undefined,
  );

  const categorieAttention = enveloppesSansEntree
    .filter((e) => e.budget > 0 && !categoriesDejaCitees.has(e.id))
    .map((e) => ({ e, ratio: e.depense / e.budget }))
    .filter(({ ratio }) => ratio >= SEUIL_CATEGORIE_ATTENTION_MIN && ratio < 1)
    .sort((a, b) => b.ratio - a.ratio)[0];
  const r6Cond = categorieAttention !== undefined && joursRestantsDansMois > 0;
  if (r6Cond && categorieAttention) categoriesDejaCitees.add(categorieAttention.e.id);
  candidats.push(
    r6Cond && categorieAttention
      ? {
          texte: `${categorieAttention.e.nom} a consommé ${Math.round(categorieAttention.ratio * 100)}% de son budget et le mois n'est pas fini — surveille tes prochaines dépenses ici.`,
          niveau: "attention",
        }
      : undefined,
  );

  candidats.push(
    categorieDepassement130
      ? {
          texte: `${categorieDepassement130.nom} a dépassé son budget de ${Math.round(categorieDepassement130.depense - categorieDepassement130.budget)}€ — c'est ton principal écart ce mois-ci.${(() => {
            const precedent = snapshotMoisPrecedent?.enveloppes.find(
              (e) => e.id === categorieDepassement130.id,
            );
            return precedent && precedent.depense <= precedent.budget
              ? ` En ${MOIS_LABELS[moisPrec]}, cette catégorie était dans les clous à ${Math.round(precedent.depense)}€.`
              : "";
          })()}`,
          niveau: "alerte",
        }
      : undefined,
  );

  // --- GROUPE 3 : épargne proactive ---

  const objectifPourVersement = objectifsAvecRythme
    .filter(
      ({ rythme, objectif }) =>
        !rythme.objectifAtteint && !objectifsDejaCites.has(objectif.id),
    )
    .sort(
      (a, b) =>
        a.objectif.cible - a.objectif.actuel - (b.objectif.cible - b.objectif.actuel),
    )[0];
  const r8Cond =
    resteEstime > 0 &&
    ratioReste > SEUIL_MARGE_VERSEMENT &&
    objectifPourVersement !== undefined;
  if (r8Cond && objectifPourVersement)
    objectifsDejaCites.add(objectifPourVersement.objectif.id);
  candidats.push(
    r8Cond && objectifPourVersement
      ? (() => {
          const montant = Math.min(
            Math.round(resteEstime * 0.3),
            Math.round(
              objectifPourVersement.objectif.cible -
                objectifPourVersement.objectif.actuel,
            ),
          );
          const nouveauPct = Math.round(
            ((objectifPourVersement.objectif.actuel + montant) /
              objectifPourVersement.objectif.cible) *
              100,
          );
          return {
            texte: `Tu as ${Math.round(resteEstime)}€ de marge ce mois-ci. Un versement de ${montant}€ sur ${objectifPourVersement.objectif.nom} l'amènerait à ${nouveauPct}% — tu serais dans les temps pour l'atteindre.`,
            niveau: "bon" as const,
          };
        })()
      : undefined,
  );

  const objectifProche = objectifsAvecRythme
    .filter(
      ({ rythme, objectif }) =>
        !rythme.objectifAtteint &&
        rythme.pct >= SEUIL_OBJECTIF_PROCHE_MIN &&
        rythme.pct < SEUIL_OBJECTIF_PROCHE_MAX &&
        !objectifsDejaCites.has(objectif.id),
    )
    .sort((a, b) => b.rythme.pct - a.rythme.pct)[0];
  if (objectifProche) objectifsDejaCites.add(objectifProche.objectif.id);
  candidats.push(
    objectifProche
      ? {
          texte: `${objectifProche.objectif.nom} est à ${Math.round(objectifProche.rythme.pct)}% — il ne manque que ${Math.round(objectifProche.objectif.cible - objectifProche.objectif.actuel)}€ pour l'atteindre. Tu as la marge pour le faire ce mois-ci.`,
          niveau: "bon",
        }
      : undefined,
  );

  const margeSnapshot = (s: SnapshotMois) => s.disponible - s.totalDepense - s.epargne;
  const derniersMoisArchives = historiquesMois.slice(-2);
  const r10Cond =
    objectifsActifs.length === 0 &&
    derniersMoisArchives.length === 2 &&
    derniersMoisArchives.every((s) => margeSnapshot(s) > 0);
  candidats.push(
    r10Cond
      ? {
          texte: `Tu termines régulièrement le mois avec de la marge. Envisage de créer un objectif d'épargne — même 50€/mois font une vraie différence sur la durée.`,
          niveau: "bon",
        }
      : undefined,
  );

  const objectifPourReserve = objectifsAvecRythme
    .filter(
      ({ rythme, objectif }) =>
        !rythme.objectifAtteint && !objectifsDejaCites.has(objectif.id),
    )
    .sort(
      (a, b) =>
        a.objectif.cible - a.objectif.actuel - (b.objectif.cible - b.objectif.actuel),
    )[0];
  const r11Cond = epargneMois === 0 && resteEstime > 0;
  if (r11Cond && objectifPourReserve)
    objectifsDejaCites.add(objectifPourReserve.objectif.id);
  candidats.push(
    r11Cond
      ? {
          texte: `Tu as ${Math.round(resteEstime)}€ de disponible mais rien mis de côté ce mois-ci. C'est le bon moment pour ${objectifPourReserve ? `un versement sur ${objectifPourReserve.objectif.nom}` : "un versement"} ou pour constituer une réserve.`,
          niveau: "attention",
        }
      : undefined,
  );

  // --- GROUPE 4 : analyse comportementale ---

  const sommeParCategorie = new Map<string, number>();
  const comptesParCategorie = new Map<string, number>();
  historiquesMois.slice(-NB_MOIS_MOYENNE_CATEGORIE).forEach((snap) => {
    snap.enveloppes.forEach((e) => {
      if (e.type === "Entrée") return;
      sommeParCategorie.set(e.id, (sommeParCategorie.get(e.id) ?? 0) + e.depense);
      comptesParCategorie.set(e.id, (comptesParCategorie.get(e.id) ?? 0) + 1);
    });
  });
  const candidatSpike = enveloppesSansEntree
    .filter(
      (e) =>
        !categoriesDejaCitees.has(e.id) && (comptesParCategorie.get(e.id) ?? 0) >= 2,
    )
    .map((e) => ({
      e,
      moyenne:
        (sommeParCategorie.get(e.id) ?? 0) / (comptesParCategorie.get(e.id) ?? 1),
    }))
    .filter(({ moyenne }) => moyenne >= MONTANT_MIN_MOYENNE_CATEGORIE)
    .filter(({ e, moyenne }) => e.depense > moyenne * SEUIL_SPIKE_CATEGORIE)
    .sort((a, b) => b.e.depense - b.moyenne - (a.e.depense - a.moyenne))[0];
  if (candidatSpike) categoriesDejaCitees.add(candidatSpike.e.id);
  candidats.push(
    candidatSpike
      ? {
          texte: `${candidatSpike.e.nom} a bondi ce mois-ci (${Math.round(candidatSpike.e.depense)}€ vs ${Math.round(candidatSpike.moyenne)}€ en moyenne sur ${NB_MOIS_MOYENNE_CATEGORIE} mois) — une dépense exceptionnelle ? Si non, c'est un poste à surveiller.`,
          niveau: "attention",
        }
      : undefined,
  );

  // "Meilleur mois depuis X mois" : compare la dépense cumulée à date de ce
  // mois-ci à celle des mois précédents ARRIVÉS AU MÊME JOUR (via
  // depenseCumuleeAuJour, reconstruite depuis les transactions/paiements
  // individuels, jamais purgés — contrairement aux snapshots mensuels qui
  // ne conservent qu'un total de fin de mois) — une vraie comparaison "à
  // date égale", pas une extrapolation.
  let meilleurMoisDepuis: number | null = null;
  const moisRecentsMeilleur = historiquesMois.slice(-NB_MOIS_MEILLEUR_MOIS);
  if (moisRecentsMeilleur.length >= 2 && jourActuel >= SEUIL_JOUR_MIN_MEILLEUR_MOIS) {
    let nbBattus = 0;
    for (const snap of [...moisRecentsMeilleur].reverse()) {
      const jourAligne = Math.min(jourActuel, joursDansMois(snap.mois, snap.annee));
      const depenseSnapAuJour = depenseCumuleeAuJour(
        transactions,
        historiquePaiements,
        snap.mois,
        snap.annee,
        jourAligne,
      );
      if (totalDepenses < depenseSnapAuJour) {
        nbBattus += 1;
      } else {
        break;
      }
    }
    if (nbBattus >= 2) meilleurMoisDepuis = nbBattus;
  }
  candidats.push(
    meilleurMoisDepuis !== null
      ? {
          texte: `Tu es en train de réaliser ton meilleur mois depuis ${meilleurMoisDepuis} mois. Continue comme ça.`,
          niveau: "bon",
        }
      : undefined,
  );

  const entreeExceptionnelle = enveloppes
    .filter(
      (e) =>
        e.type === "Entrée" &&
        !e.recurrente &&
        e.payee &&
        disponibleEffectif > 0 &&
        e.depense > disponibleEffectif * SEUIL_RATIO_ENTREE_EXCEPTIONNELLE,
    )
    .sort((a, b) => b.depense - a.depense)[0];
  const objectifPourEntree = objectifsAvecRythme
    .filter(
      ({ rythme, objectif }) =>
        !rythme.objectifAtteint && !objectifsDejaCites.has(objectif.id),
    )
    .sort(
      (a, b) =>
        a.objectif.cible - a.objectif.actuel - (b.objectif.cible - b.objectif.actuel),
    )[0];
  if (entreeExceptionnelle && objectifPourEntree)
    objectifsDejaCites.add(objectifPourEntree.objectif.id);
  candidats.push(
    entreeExceptionnelle
      ? {
          texte: `Tu as reçu ${Math.round(entreeExceptionnelle.depense)}€ en plus ce mois-ci. C'est une bonne occasion d'avancer sur ${objectifPourEntree ? objectifPourEntree.objectif.nom : "tes économies"} ou de constituer une réserve d'urgence.`,
          niveau: "bon",
        }
      : undefined,
  );

  const r15Cond = resteEstime >= 0 && joursRestantsDansMois > 0;
  candidats.push(
    r15Cond
      ? (() => {
          const allocationJour = resteEstime / joursRestantsDansMois;
          let comparaison = "";
          if (resteEstimePrecedent !== null) {
            const allocationJourPrec =
              resteEstimePrecedent / joursDansMois(moisPrec, anneePrec);
            comparaison = ` En moyenne sur ${MOIS_LABELS[moisPrec]}, tu avais eu ${allocationJourPrec >= allocationJour ? "plus" : "moins"} de marge par jour.`;
          }
          return {
            texte: `Tu peux dépenser environ ${Math.round(allocationJour)}€/jour en moyenne jusqu'à la fin du mois pour rester dans ton budget.${comparaison}`,
            niveau: "bon" as const,
          };
        })()
      : undefined,
  );

  const candidatR16 = enveloppesSansEntree
    .filter(
      (e) =>
        e.budget > 0 && e.depense < e.budget && !categoriesDejaCitees.has(e.id),
    )
    .map((e) => ({ e, budgetRestant: e.budget - e.depense }))
    .filter(
      ({ budgetRestant }) =>
        joursRestantsDansMois > SEUIL_JOURS_R16 &&
        budgetRestant / joursRestantsDansMois < SEUIL_EURJOUR_R16,
    )
    .sort(
      (a, b) =>
        a.budgetRestant / joursRestantsDansMois - b.budgetRestant / joursRestantsDansMois,
    )[0];
  if (candidatR16) categoriesDejaCitees.add(candidatR16.e.id);
  candidats.push(
    candidatR16
      ? {
          texte: `Il reste ${joursRestantsDansMois} jours et seulement ${Math.round(candidatR16.budgetRestant)}€ sur ${candidatR16.e.nom} — soit ${(candidatR16.budgetRestant / joursRestantsDansMois).toFixed(1)}€/jour maximum pour tenir.`,
          niveau: "attention",
        }
      : undefined,
  );

  // --- GROUPE 5 : replis intelligents ---

  const r17Cond = totalDepenses === 0 && disponibleEffectif > 0;
  candidats.push(
    r17Cond
      ? {
          texte: `Tu as prévu ${Math.round(disponibleEffectif)}€ ce mois-ci. Enregistre tes dépenses au fil de l'eau pour que tes projections soient précises et tes conseils personnalisés.`,
          niveau: "bon",
        }
      : undefined,
  );

  // Exclut explicitement le cas déjà couvert par R3 (même position dans le
  // mois, même message de fond "bon départ") pour ne jamais afficher deux
  // variantes de la même observation en même temps.
  const r18Cond =
    joursRestantsDansMois > 20 && totalDepenses > 0 && ratioDepense < 0.5 && !r3Cond;
  candidats.push(
    r18Cond
      ? (() => {
          let comparaison = "";
          if (snapshotMoisPrecedent && snapshotMoisPrecedent.disponible > 0) {
            const jourAligne = Math.min(jourActuel, joursDansMois(moisPrec, anneePrec));
            const depensePrecAuJour = depenseCumuleeAuJour(
              transactions,
              historiquePaiements,
              moisPrec,
              anneePrec,
              jourAligne,
            );
            const pctPrec = Math.round(
              (depensePrecAuJour / snapshotMoisPrecedent.disponible) * 100,
            );
            comparaison = ` À la même date le mois dernier, tu en étais à ${pctPrec}%.`;
          }
          return {
            texte: `Le mois commence bien — ${Math.round(ratioDepense * 100)}% de ton budget utilisé en ${jourActuel} jour${jourActuel > 1 ? "s" : ""}.${comparaison}`,
            niveau: "bon" as const,
          };
        })()
      : undefined,
  );

  const conseils = candidats.filter((c): c is Conseil => c !== undefined);

  // Garde-fou "minimum 2 conseils" : les 18 règles ci-dessus couvrent la
  // quasi-totalité des situations, mais laissent un angle mort réel — une
  // marge ni assez confortable pour R1/R2/R3, ni négative pour R4/R5 (ex.
  // ratioReste proche de 0 en tout début de mois). Complète avec un conseil
  // prescriptif générique plutôt que de risquer de tomber à 1 seul conseil.
  if (conseils.length < 2 && disponibleEffectif > 0) {
    conseils.push({
      texte: `Ton budget est serré ce mois-ci (environ ${Math.round(ratioReste * 100)}% de marge) — priorise tes dépenses essentielles pour rester dans les clous d'ici la fin du mois.`,
      niveau: ratioReste < 0 ? "alerte" : "attention",
    });
  }

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
