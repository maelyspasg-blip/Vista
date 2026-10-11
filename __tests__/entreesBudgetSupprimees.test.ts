// P075 (2026-10-11) : une catégorie "Entrée" supprimée ne compte plus du
// tout dans le budget du mois (utils/budget.ts::entreesBudgetDuMois), reçue
// ou non — cas réel : doublons de salaire supprimés, total à ~4000 € au lieu
// de ~2000 €. Les dépenses supprimées ce mois-ci, elles, restent comptées
// (P052, calculerResteEstimeCourant).
import type { Enveloppe } from "../app/store";
import { calculerResteEstimeCourant, entreesBudgetDuMois } from "../utils/budget";

const ANNEE = 2026;
const MOIS = 9; // octobre
const SUPPRIMEE_CE_MOIS = "2026-10-11T10:00:00.000Z";

function enveloppe(champs: Partial<Enveloppe>): Enveloppe {
  return {
    id: "x",
    nom: "Salaire",
    depense: 0,
    budget: 2000,
    couleur: "#000000",
    recurrente: true,
    type: "Entrée",
    moisComptage: "2026-10-01",
    ...champs,
  };
}

describe("entreesBudgetDuMois — entrées supprimées", () => {
  it("un doublon de salaire reçu puis supprimé ne compte plus", () => {
    const enveloppes = [
      enveloppe({ id: "a", payee: true, depense: 2000 }),
      enveloppe({ id: "b", payee: true, depense: 2000, supprimeeLe: SUPPRIMEE_CE_MOIS }),
    ];
    const resultat = entreesBudgetDuMois(enveloppes, ANNEE, MOIS);
    expect(resultat.total).toBe(2000);
    expect(resultat.recu).toBe(2000);
    expect(resultat.entrees.map((e) => e.id)).toEqual(["a"]);
  });

  it("une entrée attendue puis supprimée ne compte plus", () => {
    const enveloppes = [
      enveloppe({ id: "a" }),
      enveloppe({ id: "b", supprimeeLe: SUPPRIMEE_CE_MOIS }),
    ];
    const resultat = entreesBudgetDuMois(enveloppes, ANNEE, MOIS);
    expect(resultat.attendu).toBe(2000);
    expect(resultat.total).toBe(2000);
  });
});

describe("calculerResteEstimeCourant — entrées et dépenses supprimées", () => {
  it("ignore l'entrée supprimée mais garde la dépense supprimée ce mois-ci", () => {
    const enveloppes = [
      enveloppe({ id: "salaire", payee: true, depense: 2000 }),
      enveloppe({ id: "doublon", payee: true, depense: 2000, supprimeeLe: SUPPRIMEE_CE_MOIS }),
      enveloppe({
        id: "courses",
        nom: "Courses",
        type: "Variable",
        budget: 300,
        depense: 100,
        supprimeeLe: SUPPRIMEE_CE_MOIS,
      }),
    ];
    const resultat = calculerResteEstimeCourant(enveloppes, 0, ANNEE, MOIS);
    expect(resultat.disponibleEffectif).toBe(2000);
    expect(resultat.totalDepenseEnveloppes).toBe(100);
    expect(resultat.resteEstime).toBe(1900);
  });
});
