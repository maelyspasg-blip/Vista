import {
  categoriesDuMois,
  DonneesExport,
  listeMois,
  MOIS_LABELS,
  PeriodeExport,
  totalParType,
} from "./exportExcel";

// `CategorieExport` (exportExcel.ts) ne déclare pas `couleur` — ce champ n'est
// pas utile à un classeur Excel — mais les objets réels qui transitent par ce
// type (les `Enveloppe` du mois en cours comme les `SnapshotEnveloppe` des
// mois archivés) portent bien `couleur` à l'exécution. On l'expose ici pour
// le rendu visuel, qui en a besoin.
type CategorieAvecCouleur = { id: string; nom: string; couleur: string };

export type CategorieResumeVisuel = {
  nom: string;
  couleur: string;
  montant: number;
  pourcentage: number;
};

export type ResumeVisuel = {
  totalDepense: number;
  totalEpargne: number;
  totalRecu: number;
  categories: CategorieResumeVisuel[];
  periodeInclutMoisActuel: boolean;
};

const NB_CATEGORIES_AFFICHEES = 6;
const COULEUR_AUTRES = "#A0A8C0";

export function calculerResumeVisuel(
  donnees: DonneesExport,
  periode: PeriodeExport,
): ResumeVisuel {
  const mois = listeMois(periode);
  const maintenant = new Date();
  const periodeInclutMoisActuel = mois.some(
    (m) =>
      m.mois === maintenant.getMonth() && m.annee === maintenant.getFullYear(),
  );

  let totalDepense = 0;
  let totalRecu = 0;
  let totalEpargne = 0;
  const montantParCategorie = new Map<
    string,
    { nom: string; couleur: string; montant: number }
  >();

  mois.forEach(({ mois: m, annee }) => {
    const envs = categoriesDuMois(donnees, m, annee);
    if (!envs) return;

    totalDepense += totalParType(envs, false);
    totalRecu += totalParType(envs, true);

    envs
      .filter((e) => e.type !== "Entrée")
      .forEach((e) => {
        const { couleur } = e as unknown as CategorieAvecCouleur;
        const existant = montantParCategorie.get(e.id);
        montantParCategorie.set(e.id, {
          nom: e.nom,
          couleur: couleur ?? COULEUR_AUTRES,
          montant: (existant?.montant ?? 0) + e.depense,
        });
      });
  });

  // L'épargne est déjà une valeur mensuelle (pas un total par catégorie) :
  // on additionne directement le champ `epargne` de chaque mois de la période.
  mois.forEach(({ mois: m, annee }) => {
    const estMoisActuel =
      m === maintenant.getMonth() && annee === maintenant.getFullYear();
    const epargne = estMoisActuel
      ? donnees.epargneMois
      : donnees.historiquesMois.find((s) => s.mois === m && s.annee === annee)
          ?.epargne;
    if (epargne !== undefined) totalEpargne += epargne;
  });

  const categoriesTriees = [...montantParCategorie.values()]
    .filter((c) => c.montant > 0)
    .sort((a, b) => b.montant - a.montant);

  const principales = categoriesTriees.slice(0, NB_CATEGORIES_AFFICHEES);
  const reste = categoriesTriees.slice(NB_CATEGORIES_AFFICHEES);
  const montantReste = reste.reduce((acc, c) => acc + c.montant, 0);

  const categories: CategorieResumeVisuel[] = principales.map((c) => ({
    nom: c.nom,
    couleur: c.couleur,
    montant: c.montant,
    pourcentage: totalDepense > 0 ? (c.montant / totalDepense) * 100 : 0,
  }));

  if (montantReste > 0) {
    categories.push({
      nom: "Autres",
      couleur: COULEUR_AUTRES,
      montant: montantReste,
      pourcentage: totalDepense > 0 ? (montantReste / totalDepense) * 100 : 0,
    });
  }

  return { totalDepense, totalEpargne, totalRecu, categories, periodeInclutMoisActuel };
}

export function libellePeriode(periode: PeriodeExport): string {
  const debut = `${MOIS_LABELS[periode.moisDebut]} ${periode.anneeDebut}`;
  if (
    periode.moisDebut === periode.moisFin &&
    periode.anneeDebut === periode.anneeFin
  ) {
    return debut;
  }
  const fin = `${MOIS_LABELS[periode.moisFin]} ${periode.anneeFin}`;
  return `${debut} → ${fin}`;
}
