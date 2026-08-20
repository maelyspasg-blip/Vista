import * as XLSX from "xlsx";
import { entreesBudgetDuMois } from "./budget";
import { formaterMontant } from "./montant";

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
  // Uniquement pour type "Entrée" — cf. Enveloppe.moisComptage/dateFixe/payee
  // dans app/store.ts.
  dateFixe?: string;
  payee?: boolean;
  moisComptage?: string;
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

// "Entrées totales" du mois = ce qui est "disponible" à budgéter ce mois-ci —
// même formule que entreesBudgetDuMois côté app (filtre mois_comptage +
// payee ? depense : budget), réutilisée ici pour ne plus avoir deux calculs
// séparés du même concept. Pour un mois déjà archivé, on relit directement
// `snap.disponible` (pré-calculé à l'archivage, cf. store.ts) plutôt que de
// re-dériver depuis `snap.enveloppes`, qui ne conserve pas le champ `payee`.
export function disponibleDuMois(
  donnees: DonneesExport,
  mois: number,
  annee: number,
): number | null {
  if (estMoisActuel(mois, annee)) {
    return entreesBudgetDuMois(donnees.enveloppes, annee, mois).total;
  }
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

// RÈGLE À NE JAMAIS CASSER : SEULE source du "Reste estimé" reconstruit
// pour un mois DÉJÀ ARCHIVÉ — même principe que
// utils/budget.ts::calculerResteEstimeCourant (mois en cours) : Aperçu et
// le bloc coach de Stats doivent tous les deux appeler cette fonction pour
// la comparaison "vs mois précédent", jamais reconstruire la formule
// indépendamment. Accepte n'importe quel snapshot structurellement
// compatible (SnapshotMois de app/store.ts comme SnapshotExport ci-dessus).
export function calculerResteEstimeArchive(snapshot: {
  enveloppes: CategorieExport[];
  epargne: number;
  disponible: number;
}): number {
  const totalPrevu = snapshot.enveloppes
    .filter((e) => e.type !== "Entrée")
    .reduce((acc, e) => acc + Math.max(0, e.budget - e.depense), 0);
  return (
    snapshot.disponible +
    totalParType(snapshot.enveloppes, true) -
    totalParType(snapshot.enveloppes, false) -
    totalPrevu -
    snapshot.epargne
  );
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
    const epargne = epargneDuMois(donnees, mois, annee) ?? 0;
    // "Entrées totales" et "Argent disponible" sont le même concept dans cette
    // app (le revenu du mois = ce qu'il y a à budgéter) : un seul calcul,
    // partagé via disponibleDuMois, plutôt que deux totaux qui pourraient
    // diverger.
    const disponible = disponibleDuMois(donnees, mois, annee) ?? 0;
    const entrees = disponible;
    lignes.push([
      label,
      formaterMontant(depenses),
      formaterMontant(entrees),
      formaterMontant(entrees - depenses),
      formaterMontant(epargne),
      formaterMontant(disponible),
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

  const entetes = [
    "Catégorie",
    ...mois.map(({ mois: m, annee }) => `${MOIS_LABELS[m]} ${annee}`),
    "Total période (€)",
    "Moyenne mensuelle (€)",
  ];
  const lignes: (string | number)[][] = [entetes];

  // Tri décroissant par total période (et non plus alphabétique) — les
  // catégories qui pèsent le plus dans le budget apparaissent en premier.
  const lignesCategories = [...categories.entries()]
    .map(([id, nom]) => {
      const valeurs = envsParMois.map((envs) => {
        if (!envs) return "";
        const cat = envs.find((e) => e.id === id);
        return formaterMontant(cat ? cat.depense : 0);
      });
      const valeursNum = valeurs.filter(
        (v): v is number => typeof v === "number",
      );
      const total = valeursNum.reduce((acc, v) => acc + v, 0);
      const moyenne =
        valeursNum.length > 0
          ? Math.round((total / valeursNum.length) * 100) / 100
          : 0;
      return { nom, valeurs, total, moyenne };
    })
    .sort((a, b) => b.total - a.total);

  lignesCategories.forEach(({ nom, valeurs, total, moyenne }) => {
    lignes.push([nom, ...valeurs, formaterMontant(total), moyenne]);
  });

  if (lignesCategories.length === 0) {
    lignes.push(["Aucune catégorie sur cette période"]);
  }

  return XLSX.utils.aoa_to_sheet(lignes);
}

// Une ligne "catégorie" (nom, type, budget prévu, montant dépensé cumulés
// sur toute la période) suivie d'une ligne par transaction qui la compose
// (nom, montant, date) — au lieu d'une simple liste plate de transactions.
// donnees.transactions contient tout l'historique de l'utilisateur (plus
// aucun tri par mois côté store depuis la correction de l'archivage), donc
// on peut désormais couvrir TOUTE la période sélectionnée, pas seulement le
// mois en cours.
function feuilleTransactionsDetaillees(
  donnees: DonneesExport,
  periode: PeriodeExport,
) {
  const lignes: (string | number)[][] = [
    [
      "Catégorie",
      "Type",
      "Budget prévu (€)",
      "Montant dépensé (€)",
      "Transaction",
      "Montant (€)",
      "Date",
    ],
  ];

  const mois = listeMois(periode);

  const totauxParCategorie = new Map<
    string,
    { nom: string; type: CategorieExport["type"]; budget: number; depense: number }
  >();
  mois.forEach(({ mois: m, annee }) => {
    const envs = categoriesDuMois(donnees, m, annee);
    if (!envs) return;
    envs.forEach((e) => {
      const existant = totauxParCategorie.get(e.id);
      totauxParCategorie.set(e.id, {
        nom: e.nom,
        type: e.type,
        budget: (existant?.budget ?? 0) + e.budget,
        depense: (existant?.depense ?? 0) + e.depense,
      });
    });
  });

  const transactionsParCategorie = new Map<string, TransactionExport[]>();
  donnees.transactions
    .filter((t) =>
      mois.some(({ mois: m, annee }) => estDansMois(t.date, m, annee)),
    )
    .forEach((t) => {
      const liste = transactionsParCategorie.get(t.enveloppeId) ?? [];
      liste.push(t);
      transactionsParCategorie.set(t.enveloppeId, liste);
    });

  // Tri décroissant par montant dépensé — la catégorie la plus dépensière
  // en premier.
  const categoriesTriees = [...totauxParCategorie.entries()]
    .map(([id, c]) => ({ id, ...c }))
    .filter(
      (c) =>
        c.depense > 0 || (transactionsParCategorie.get(c.id)?.length ?? 0) > 0,
    )
    .sort((a, b) => b.depense - a.depense);

  if (categoriesTriees.length === 0) {
    lignes.push(["Aucune catégorie active sur cette période."]);
    return XLSX.utils.aoa_to_sheet(lignes);
  }

  categoriesTriees.forEach((cat) => {
    lignes.push([
      cat.nom,
      cat.type,
      formaterMontant(cat.budget),
      formaterMontant(cat.depense),
      "",
      "",
      "",
    ]);
    // Date décroissante : la transaction la plus récente en premier.
    const transactions = (transactionsParCategorie.get(cat.id) ?? []).sort(
      (a, b) => b.date.localeCompare(a.date),
    );
    if (transactions.length === 0) {
      lignes.push([
        cat.nom,
        "",
        "",
        "",
        "Aucune transaction enregistrée sur cette période.",
        "",
        "",
      ]);
    } else {
      transactions.forEach((t) => {
        lignes.push([cat.nom, "", "", "", t.nom, formaterMontant(t.montant), t.date]);
      });
    }
  });

  return XLSX.utils.aoa_to_sheet(lignes);
}

// Une ligne par (mois, catégorie) — dépenses uniquement, triées par montant
// décroissant à l'intérieur de chaque mois — pour lire le détail mois par
// mois plutôt que la vue matricielle de feuilleMatriceCategories.
function feuilleResumeParMois(donnees: DonneesExport, periode: PeriodeExport) {
  const lignes: (string | number)[][] = [
    ["Mois", "Catégorie", "Type", "Montant dépensé (€)"],
  ];

  listeMois(periode).forEach(({ mois: m, annee }) => {
    const label = `${MOIS_LABELS[m]} ${annee}`;
    const envs = categoriesDuMois(donnees, m, annee);
    if (!envs) {
      lignes.push([label, "Données non disponibles pour ce mois", "", ""]);
      return;
    }
    const categoriesTriees = envs
      .filter((e) => e.type !== "Entrée" && e.depense > 0)
      .sort((a, b) => b.depense - a.depense);
    if (categoriesTriees.length === 0) {
      lignes.push([label, "Aucune dépense", "", ""]);
      return;
    }
    categoriesTriees.forEach((cat) => {
      lignes.push([label, cat.nom, cat.type, formaterMontant(cat.depense)]);
    });
  });

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
  // Feuille supplémentaire uniquement quand la période couvre plusieurs
  // mois — sur un seul mois, elle ferait doublon avec les colonnes uniques
  // de feuilleMatriceCategories.
  if (listeMois(periode).length > 1) {
    XLSX.utils.book_append_sheet(
      wb,
      feuilleResumeParMois(donnees, periode),
      "Résumé par mois",
    );
  }
  XLSX.utils.book_append_sheet(
    wb,
    feuilleTransactionsDetaillees(donnees, periode),
    "Transactions détaillées",
  );
  return wb;
}

export function nomFichierExport(periode: PeriodeExport): string {
  const debut = `${periode.anneeDebut}-${String(periode.moisDebut + 1).padStart(2, "0")}`;
  const fin = `${periode.anneeFin}-${String(periode.moisFin + 1).padStart(2, "0")}`;
  return `Vista_export_${debut}_a_${fin}.xlsx`;
}
