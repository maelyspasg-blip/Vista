import * as XLSX from "xlsx";

export const MOIS_LABELS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

export type CategorieExport = {
  id: string;
  nom: string;
  depense: number;
  budget: number;
  type: "Fixe" | "Variable" | "Entrée";
};

export type TransactionExport = {
  id: string;
  nom: string;
  montant: number;
  enveloppeId: string;
  date: string;
};

export type SnapshotExport = {
  mois: number;
  annee: number;
  enveloppes: CategorieExport[];
  epargne: number;
  disponible: number;
};

export type DonneesExport = {
  enveloppes: CategorieExport[];
  transactions: TransactionExport[];
  historiquesMois: SnapshotExport[];
  epargneMois: number;
  argentDisponible: number;
};

export type PeriodeExport = {
  moisDebut: number;
  anneeDebut: number;
  moisFin: number;
  anneeFin: number;
};

function estMoisActuel(mois: number, annee: number): boolean {
  const d = new Date();
  return mois === d.getMonth() && annee === d.getFullYear();
}

export function estDansMois(dateISO: string, mois: number, annee: number): boolean {
  const d = new Date(dateISO);
  return d.getMonth() === mois && d.getFullYear() === annee;
}

export function moisPrecedent(
  mois: number,
  annee: number,
): { mois: number; annee: number } {
  return mois === 0 ? { mois: 11, annee: annee - 1 } : { mois: mois - 1, annee };
}

export function joursDansMois(mois: number, annee: number): number {
  return new Date(annee, mois + 1, 0).getDate();
}

// Dépenses cumulées du 1er au jour `jourMax` d'un mois donné, reconstruites
// à partir des transactions/paiements individuels (jamais purgés, contrairement
// aux snapshots mensuels qui ne conservent qu'un total de fin de mois) — pour
// une comparaison "au même jour" honnête avec un mois en cours encore partiel.
// Filtre par `enveloppeId` si fourni, sinon somme toutes les catégories.
export function depenseCumuleeAuJour(
  transactions: { enveloppeId: string; montant: number; date: string }[],
  historiquePaiements: { enveloppeId: string; montant: number; date: string }[],
  mois: number,
  annee: number,
  jourMax: number,
  enveloppeId?: string,
): number {
  const dansPlage = (dateISO: string) => {
    const d = new Date(dateISO);
    return (
      d.getFullYear() === annee && d.getMonth() === mois && d.getDate() <= jourMax
    );
  };
  const correspond = (x: { enveloppeId: string }) =>
    enveloppeId === undefined || x.enveloppeId === enveloppeId;

  return (
    transactions
      .filter((t) => correspond(t) && dansPlage(t.date))
      .reduce((acc, t) => acc + t.montant, 0) +
    historiquePaiements
      .filter((p) => correspond(p) && dansPlage(p.date))
      .reduce((acc, p) => acc + p.montant, 0)
  );
}

// Montant dépensé par une enveloppe donnée sur un mois archivé (via
// historiquesMois) — utilisé pour les comparaisons entre deux mois entièrement
// clos (VueMoisArchive), où le "mois complet" est déjà une comparaison honnête.
// Retourne `null` si ce mois n'a pas été archivé ou si cette catégorie
// n'existait pas encore à cette date.
export function depenseEnveloppeDansSnapshot(
  historiquesMois: SnapshotExport[],
  enveloppeId: string,
  mois: number,
  annee: number,
): number | null {
  const snap = historiquesMois.find((s) => s.mois === mois && s.annee === annee);
  const env = snap?.enveloppes.find((e) => e.id === enveloppeId);
  return env ? env.depense : null;
}

export function listeMois({ moisDebut, anneeDebut, moisFin, anneeFin }: PeriodeExport) {
  const debut = anneeDebut * 12 + moisDebut;
  const fin = anneeFin * 12 + moisFin;
  const mois: { mois: number; annee: number }[] = [];
  for (let m = debut; m <= fin; m++) {
    mois.push({ mois: ((m % 12) + 12) % 12, annee: Math.floor(m / 12) });
  }
  return mois;
}

export function categoriesDuMois(
  donnees: DonneesExport,
  mois: number,
  annee: number,
): CategorieExport[] | null {
  if (estMoisActuel(mois, annee)) return donnees.enveloppes;
  const snap = donnees.historiquesMois.find(
    (s) => s.mois === mois && s.annee === annee,
  );
  return snap ? snap.enveloppes : null;
}

export function epargneDuMois(
  donnees: DonneesExport,
  mois: number,
  annee: number,
): number | null {
  if (estMoisActuel(mois, annee)) return donnees.epargneMois;
  const snap = donnees.historiquesMois.find(
    (s) => s.mois === mois && s.annee === annee,
  );
  return snap ? snap.epargne : null;
}

export function disponibleDuMois(
  donnees: DonneesExport,
  mois: number,
  annee: number,
): number | null {
  if (estMoisActuel(mois, annee)) return donnees.argentDisponible;
  const snap = donnees.historiquesMois.find(
    (s) => s.mois === mois && s.annee === annee,
  );
  return snap ? snap.disponible : null;
}

export function totalParType(envs: CategorieExport[], estEntree: boolean): number {
  return envs
    .filter((e) => (e.type === "Entrée") === estEntree)
    .reduce((acc, e) => acc + e.depense, 0);
}

function feuilleResume(donnees: DonneesExport, periode: PeriodeExport) {
  const lignes: (string | number)[][] = [
    [
      "Mois",
      "Dépenses totales (€)",
      "Entrées totales (€)",
      "Solde (€)",
      "Épargne (€)",
      "Argent disponible (€)",
    ],
  ];

  listeMois(periode).forEach(({ mois, annee }) => {
    const label = `${MOIS_LABELS[mois]} ${annee}`;
    const envs = categoriesDuMois(donnees, mois, annee);
    if (!envs) {
      lignes.push([label, "", "", "", "", ""]);
      return;
    }
    const depenses = totalParType(envs, false);
    const entrees = totalParType(envs, true);
    const epargne = epargneDuMois(donnees, mois, annee) ?? 0;
    const disponible = disponibleDuMois(donnees, mois, annee) ?? 0;
    lignes.push([
      label,
      depenses,
      entrees,
      entrees - depenses,
      epargne,
      disponible,
    ]);
  });

  return XLSX.utils.aoa_to_sheet(lignes);
}

function feuilleMatriceCategories(
  donnees: DonneesExport,
  periode: PeriodeExport,
  estEntree: boolean,
) {
  const mois = listeMois(periode);
  const envsParMois = mois.map(({ mois: m, annee }) =>
    categoriesDuMois(donnees, m, annee),
  );

  const categories = new Map<string, string>();
  envsParMois.forEach((envs) => {
    if (!envs) return;
    envs
      .filter((e) => (e.type === "Entrée") === estEntree)
      .forEach((e) => categories.set(e.id, e.nom));
  });
  const lignesCategories = [...categories.entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );

  const entetes = [
    "Catégorie",
    ...mois.map(({ mois: m, annee }) => `${MOIS_LABELS[m]} ${annee}`),
    "Total période (€)",
    "Moyenne mensuelle (€)",
  ];
  const lignes: (string | number)[][] = [entetes];

  lignesCategories.forEach(([id, nom]) => {
    const valeurs = envsParMois.map((envs) => {
      if (!envs) return "";
      const cat = envs.find((e) => e.id === id);
      return cat ? cat.depense : 0;
    });
    const valeursNum = valeurs.filter(
      (v): v is number => typeof v === "number",
    );
    const total = valeursNum.reduce((acc, v) => acc + v, 0);
    const moyenne =
      valeursNum.length > 0
        ? Math.round((total / valeursNum.length) * 100) / 100
        : 0;
    lignes.push([nom, ...valeurs, total, moyenne]);
  });

  if (lignesCategories.length === 0) {
    lignes.push(["Aucune catégorie sur cette période"]);
  }

  return XLSX.utils.aoa_to_sheet(lignes);
}

function feuilleTransactions(donnees: DonneesExport, periode: PeriodeExport) {
  const d = new Date();
  const inclutMoisActuel = listeMois(periode).some(
    ({ mois, annee }) => mois === d.getMonth() && annee === d.getFullYear(),
  );

  const lignes: (string | number)[][] = [
    ["Date", "Nom", "Catégorie", "Montant (€)"],
  ];

  if (!inclutMoisActuel) {
    lignes.push([
      "Le détail des transactions n'est disponible que pour le mois en cours : les mois archivés ne conservent que des totaux par catégorie.",
    ]);
    return XLSX.utils.aoa_to_sheet(lignes);
  }

  const nomParEnveloppeId = new Map(
    donnees.enveloppes.map((e) => [e.id, e.nom]),
  );
  const transactionsTriees = [...donnees.transactions].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  transactionsTriees.forEach((t) => {
    lignes.push([t.date, t.nom, nomParEnveloppeId.get(t.enveloppeId) ?? "—", t.montant]);
  });

  if (transactionsTriees.length === 0) {
    lignes.push(["Aucune transaction enregistrée ce mois-ci."]);
  }

  return XLSX.utils.aoa_to_sheet(lignes);
}

export function genererClasseurExport(
  donnees: DonneesExport,
  periode: PeriodeExport,
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    feuilleResume(donnees, periode),
    "Résumé mensuel",
  );
  XLSX.utils.book_append_sheet(
    wb,
    feuilleMatriceCategories(donnees, periode, false),
    "Dépenses par catégorie",
  );
  XLSX.utils.book_append_sheet(
    wb,
    feuilleMatriceCategories(donnees, periode, true),
    "Entrées par catégorie",
  );
  XLSX.utils.book_append_sheet(
    wb,
    feuilleTransactions(donnees, periode),
    "Transactions détaillées",
  );
  return wb;
}

export function nomFichierExport(periode: PeriodeExport): string {
  const debut = `${periode.anneeDebut}-${String(periode.moisDebut + 1).padStart(2, "0")}`;
  const fin = `${periode.anneeFin}-${String(periode.moisFin + 1).padStart(2, "0")}`;
  return `Vista_export_${debut}_a_${fin}.xlsx`;
}
