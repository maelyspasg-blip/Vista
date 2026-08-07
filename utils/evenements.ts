import { Enveloppe, Evenement, Objectif, PaiementHistorique } from "../app/store";

export type FrequenceEvenement = "jour" | "semaine" | "mois" | "an";

export type EvenementUnifie = {
  id: string;
  nom: string;
  heure: string;
  duree: number;
  couleur: string;
  estFinancier: boolean;
  montant?: number;
  touteLaJournee: boolean;
  date: Date;
  modifiable: boolean;
  evenementId?: string;
};

export function heureEnMinutes(heure: string): number {
  const [h, m] = heure.replace("h", ":").split(":");
  return parseInt(h) * 60 + (parseInt(m) || 0);
}

export function memeJour(d1: Date, d2: Date): boolean {
  return (
    d1.getDate() === d2.getDate() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getFullYear() === d2.getFullYear()
  );
}

export function genererOccurrencesEvenement(
  dateDebut: Date,
  frequence: FrequenceEvenement,
  debutFenetre: Date,
  finFenetre: Date,
): Date[] {
  const occurrences: Date[] = [];
  const debut = new Date(dateDebut);
  debut.setHours(0, 0, 0, 0);

  if (frequence === "jour") {
    const cursor = new Date(Math.max(debut.getTime(), debutFenetre.getTime()));
    while (cursor <= finFenetre) {
      occurrences.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return occurrences;
  }

  const cursor = new Date(debut);
  let iterations = 0;
  while (cursor <= finFenetre && iterations < 1000) {
    if (cursor >= debutFenetre) occurrences.push(new Date(cursor));
    if (frequence === "semaine") cursor.setDate(cursor.getDate() + 7);
    else if (frequence === "mois") cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setFullYear(cursor.getFullYear() + 1);
    iterations++;
  }
  return occurrences;
}

/**
 * Construit la liste unifiée de tous les événements (manuels + récurrents,
 * échéances de catégories Fixe, contributions d'objectifs récurrentes,
 * historique de paiements) sur une fenêtre de ±2/3 mois autour de
 * `dateReference` — même logique que Planning, extraite ici pour être
 * réutilisée telle quelle par les widgets iOS (Planning du jour), qui n'ont
 * besoin que d'un seul jour mais doivent rester en phase avec ce que
 * Planning affiche, sans dupliquer cette logique de récurrence.
 */
export function construireTousLesEvenements(params: {
  evenements: Evenement[];
  enveloppes: Enveloppe[];
  historiquePaiements: PaiementHistorique[];
  objectifs: Objectif[];
  dateReference: Date;
}): EvenementUnifie[] {
  const { evenements, enveloppes, historiquePaiements, objectifs, dateReference } = params;
  const tousLesEvenements: EvenementUnifie[] = [];

  const anneeVue = dateReference.getFullYear();
  const moisVue = dateReference.getMonth();
  const debutFenetreRecurrence = new Date(anneeVue, moisVue - 2, 1);
  const finFenetreRecurrence = new Date(anneeVue, moisVue + 3, 0);
  finFenetreRecurrence.setHours(23, 59, 59, 999);

  evenements.forEach((e) => {
    const dateDebut = new Date(e.date);
    dateDebut.setHours(0, 0, 0, 0);
    const dateFinBase = e.dateFin ? new Date(e.dateFin) : null;
    if (dateFinBase) dateFinBase.setHours(0, 0, 0, 0);
    const nbJoursSupplementaires = dateFinBase
      ? Math.round((dateFinBase.getTime() - dateDebut.getTime()) / 86400000)
      : 0;

    const pousserOccurrence = (debutOccurrence: Date) => {
      const jours =
        nbJoursSupplementaires > 0
          ? Array.from({ length: nbJoursSupplementaires + 1 }, (_, k) => {
              const d = new Date(debutOccurrence);
              d.setDate(d.getDate() + k);
              return d;
            })
          : [debutOccurrence];

      jours.forEach((d, k) => {
        tousLesEvenements.push({
          id: `manuel-${e.id}-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
          nom: e.nom,
          heure: e.heure,
          duree: e.duree,
          couleur: e.couleur,
          // Le montant n'est compté qu'une fois, le premier jour de l'événement.
          estFinancier: k === 0 ? e.estFinancier : false,
          montant: k === 0 ? e.montant : undefined,
          touteLaJournee: nbJoursSupplementaires > 0 ? true : e.touteLaJournee ?? false,
          date: d,
          modifiable: true,
          evenementId: e.id,
        });
      });
    };

    if (e.recurrent && e.frequence) {
      const occurrences = genererOccurrencesEvenement(
        dateDebut,
        e.frequence,
        debutFenetreRecurrence,
        finFenetreRecurrence,
      );
      occurrences.forEach((d) => pousserOccurrence(d));
    } else {
      pousserOccurrence(dateDebut);
    }
  });

  enveloppes
    .filter((e) => e.type === "Fixe" && e.afficherDansPlanning && e.dateFixe)
    .forEach((e) => {
      const dateOrigine = new Date(e.dateFixe!);
      if (e.repeteChaqueMois) {
        const jour = dateOrigine.getDate();
        for (let offset = -2; offset <= 2; offset++) {
          const d = new Date(anneeVue, moisVue + offset, jour);
          const dejaPayeeCeMois = historiquePaiements.some(
            (p) =>
              p.enveloppeId === e.id &&
              new Date(p.date).getMonth() === d.getMonth() &&
              new Date(p.date).getFullYear() === d.getFullYear(),
          );
          if (dejaPayeeCeMois) continue;
          tousLesEvenements.push({
            id: `env-${e.id}-${d.getFullYear()}-${d.getMonth()}`,
            nom: e.nom,
            heure: "",
            duree: 0,
            couleur: e.couleur,
            estFinancier: true,
            montant: e.budget,
            touteLaJournee: true,
            date: d,
            modifiable: false,
          });
        }
      } else {
        tousLesEvenements.push({
          id: `env-${e.id}`,
          nom: e.nom,
          heure: "",
          duree: 0,
          couleur: e.couleur,
          estFinancier: true,
          montant: e.budget,
          touteLaJournee: true,
          date: dateOrigine,
          modifiable: false,
        });
      }
    });

  objectifs
    .filter((o) => o.recurrent && o.montantMensuel && o.jourDuMois)
    .forEach((o) => {
      for (let offset = -2; offset <= 2; offset++) {
        const d = new Date(anneeVue, moisVue + offset, o.jourDuMois!);
        tousLesEvenements.push({
          id: `objectif-${o.id}-${d.getFullYear()}-${d.getMonth()}`,
          nom: `Épargne : ${o.nom}`,
          heure: "",
          duree: 0,
          couleur: o.couleur,
          estFinancier: true,
          montant: o.montantMensuel,
          touteLaJournee: true,
          date: d,
          modifiable: false,
        });
      }
    });

  historiquePaiements.forEach((p) => {
    const d = new Date(p.date);
    tousLesEvenements.push({
      id: `histo-${p.id}`,
      nom: p.nom,
      heure: "",
      duree: 0,
      couleur: "#BBBBBB",
      estFinancier: true,
      montant: p.montant,
      touteLaJournee: true,
      date: d,
      modifiable: false,
    });
  });

  return tousLesEvenements;
}
