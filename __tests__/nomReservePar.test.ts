// Garde-fou anti-doublon de nom (utils/budget.ts::nomReservePar, ajouté le
// 2026-10-09) : "Ce nom de catégorie existe déjà" ne doit plus bloquer
// injustement (catégorie supprimée, ligne d'Entrée d'un mois passé), mais
// doit toujours bloquer un vrai doublon (cf. P021/P027/P033).
import type { Enveloppe } from "../app/store";
import { nomReservePar } from "../utils/budget";

// Octobre 2026 (mois 0-indexé).
const ANNEE = 2026;
const MOIS = 9;

function enveloppe(champs: Partial<Enveloppe>): Enveloppe {
  return {
    id: "x",
    nom: "Salaire",
    depense: 0,
    budget: 0,
    couleur: "#000000",
    recurrente: false,
    type: "Variable",
    ...champs,
  };
}

describe("nomReservePar", () => {
  it("une Entrée du mois en cours réserve son nom", () => {
    const e = enveloppe({ type: "Entrée", moisComptage: "2026-10-01" });
    expect(nomReservePar(e, ANNEE, MOIS)).toBe(true);
  });

  it("une Entrée d'un mois passé (reconduction) ne réserve plus son nom", () => {
    const e = enveloppe({
      type: "Entrée",
      recurrente: true,
      moisComptage: "2026-09-01",
    });
    expect(nomReservePar(e, ANNEE, MOIS)).toBe(false);
  });

  it("une catégorie supprimée ne réserve jamais son nom", () => {
    const e = enveloppe({
      type: "Entrée",
      moisComptage: "2026-10-01",
      supprimeeLe: "2026-10-05T10:00:00Z",
    });
    expect(nomReservePar(e, ANNEE, MOIS)).toBe(false);
  });

  it("une Variable récurrente réserve toujours son nom", () => {
    const e = enveloppe({ recurrente: true, moisComptage: "2026-01-01" });
    expect(nomReservePar(e, ANNEE, MOIS)).toBe(true);
  });

  it("une Variable ponctuelle d'un mois passé réserve toujours son nom", () => {
    // Liens par nom (événements financiers, renommage, Planning) : la
    // libérer exposerait la depense d'une ligne archivée.
    const e = enveloppe({ moisComptage: "2026-08-01" });
    expect(nomReservePar(e, ANNEE, MOIS)).toBe(true);
  });

  it("une Fixe ponctuelle d'un mois passé réserve toujours son nom", () => {
    const e = enveloppe({ type: "Fixe", dateFixe: "2026-07-10" });
    expect(nomReservePar(e, ANNEE, MOIS)).toBe(true);
  });

  it("une Entrée d'un mois futur réserve son nom", () => {
    const e = enveloppe({ type: "Entrée", moisComptage: "2026-11-01" });
    expect(nomReservePar(e, ANNEE, MOIS)).toBe(true);
  });

  it("une Entrée sans mois connu réserve son nom par prudence", () => {
    const e = enveloppe({ type: "Entrée" });
    expect(nomReservePar(e, ANNEE, MOIS)).toBe(true);
  });

  it("une Fixe ponctuelle d'un mois FUTUR réserve son nom", () => {
    const e = enveloppe({ type: "Fixe", dateFixe: "2026-11-15" });
    expect(nomReservePar(e, ANNEE, MOIS)).toBe(true);
  });

  it("une Fixe mensuelle réserve toujours son nom", () => {
    const e = enveloppe({
      type: "Fixe",
      repeteChaqueMois: true,
      dateFixe: "2026-03-05",
    });
    expect(nomReservePar(e, ANNEE, MOIS)).toBe(true);
  });
});
