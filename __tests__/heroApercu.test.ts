// Hero d'Aperçu (demande du 2026-10-09) : Reste actuel / À recevoir ce
// mois-ci / Reste estimé — ventilation part par part, date représentative
// d'une Entrée fusionnée (vue partagée), formule archivée du delta.
import type { Enveloppe } from "../app/store";
import {
  dateRepresentativeEntree,
  entreesAffichablesDuMois,
  revenusDuMoisHero,
} from "../utils/budget";
import {
  calculerResteEstimeArchive,
  calculerResteHeroArchive,
} from "../utils/exportExcel";
import { fusionnerCategoriesParNom } from "../utils/espacePartage";

jest.mock("../supabaseClient", () => ({ supabase: {} }));

const AUJOURDHUI = new Date(2026, 9, 9, 15, 30); // 9 octobre 2026

function entree(champs: Partial<Enveloppe>): Enveloppe {
  return {
    id: "x",
    nom: "Salaire",
    depense: 0,
    budget: 0,
    couleur: "#000000",
    recurrente: true,
    type: "Entrée",
    moisComptage: "2026-10-01",
    ...champs,
  };
}

describe("revenusDuMoisHero", () => {
  it("additionne le reçu, et le à recevoir daté plus tard CE mois-ci", () => {
    const lignes = entreesAffichablesDuMois(
      [
        entree({ id: "a", depense: 1200, budget: 1200, dateFixe: "2026-10-01" }),
        entree({ id: "b", nom: "Prime", budget: 300, dateFixe: "2026-10-20" }),
        entree({ id: "c", nom: "CAF", budget: 200, dateFixe: "2026-10-28" }),
      ],
      2026,
      9,
      AUJOURDHUI,
    );
    expect(revenusDuMoisHero(lignes, AUJOURDHUI)).toMatchObject({
      recu: 1200,
      aRecevoir: 500,
    });
  });

  it("n'inclut jamais une date de réception d'un mois suivant", () => {
    // Comptée pour octobre mais reçue le 2 novembre.
    const lignes = entreesAffichablesDuMois(
      [entree({ budget: 1800, dateFixe: "2026-11-02" })],
      2026,
      9,
      AUJOURDHUI,
    );
    expect(revenusDuMoisHero(lignes, AUJOURDHUI)).toMatchObject({
      recu: 0,
      aRecevoir: 0,
    });
  });

  it("ventile une ligne fusionnée part par part", () => {
    const ligneFusionnee = {
      env: {
        ...entree({ depense: 1800, budget: 3800, dateFixe: "2026-10-25" }),
        partsEntree: [
          { depense: 1800, budget: 1800, dateFixe: "2026-10-01" },
          { depense: 0, budget: 2000, dateFixe: "2026-10-25" },
        ],
      },
    };
    expect(revenusDuMoisHero([ligneFusionnee], AUJOURDHUI)).toMatchObject({
      recu: 1800,
      aRecevoir: 2000,
    });
  });
});

describe("revenusDuMoisHero — détail de la ligne de précision (2026-10-10)", () => {
  it("liste les entrées à recevoir ce mois-ci, triées par date", () => {
    const lignes = entreesAffichablesDuMois(
      [
        entree({ id: "c", nom: "CAF", budget: 200, dateFixe: "2026-10-28" }),
        entree({ id: "b", nom: "Prime", budget: 300, dateFixe: "2026-10-20" }),
        entree({ id: "a", depense: 1200, budget: 1200, dateFixe: "2026-10-01" }),
      ],
      2026,
      9,
      AUJOURDHUI,
    );
    expect(revenusDuMoisHero(lignes, AUJOURDHUI).aRecevoirDetail).toEqual([
      { nom: "Prime", dateFixe: "2026-10-20", montant: 300 },
      { nom: "CAF", dateFixe: "2026-10-28", montant: 200 },
    ]);
  });

  it("vide si rien n'est à recevoir ce mois-ci", () => {
    const lignes = entreesAffichablesDuMois(
      [entree({ budget: 1800, dateFixe: "2026-11-02" })],
      2026,
      9,
      AUJOURDHUI,
    );
    expect(revenusDuMoisHero(lignes, AUJOURDHUI).aRecevoirDetail).toEqual([]);
  });
});

describe("dateRepresentativeEntree", () => {
  it("prend la plus proche date future encore attendue", () => {
    expect(
      dateRepresentativeEntree(
        [
          { depense: 1800, budget: 1800, dateFixe: "2026-10-01" },
          { depense: 0, budget: 2000, dateFixe: "2026-10-28" },
          { depense: 0, budget: 100, dateFixe: "2026-10-15" },
        ],
        AUJOURDHUI,
      ),
    ).toBe("2026-10-15");
  });

  it("sinon la plus ancienne date connue", () => {
    expect(
      dateRepresentativeEntree(
        [
          { depense: 1800, budget: 1800, dateFixe: "2026-10-05" },
          { depense: 900, budget: 900, dateFixe: "2026-10-02" },
        ],
        AUJOURDHUI,
      ),
    ).toBe("2026-10-02");
  });

  it("undefined si aucune part n'est datée", () => {
    expect(
      dateRepresentativeEntree([{ depense: 0, budget: 100 }], AUJOURDHUI),
    ).toBeUndefined();
  });
});

describe("fusionnerCategoriesParNom — Entrées", () => {
  it("garde la date et le détail des parts d'une Entrée fusionnée", () => {
    jest.useFakeTimers().setSystemTime(AUJOURDHUI);
    const [ligne] = fusionnerCategoriesParNom(
      [entree({ id: "moi", depense: 1800, budget: 1800, dateFixe: "2026-10-01" })],
      [
        {
          id: "lui",
          nom: "salaire ",
          depense: 0,
          budget: 2000,
          couleur: "#111111",
          type: "Entrée",
          recurrente: true,
          dateFixe: "2026-10-25",
          moisComptage: "2026-10-01",
        },
      ],
      "Louis",
      "#60a5fa",
      "#c084fc",
      2026,
      9,
    );
    jest.useRealTimers();
    expect(ligne.fusionnee).toBe(true);
    expect(ligne.dateFixe).toBe("2026-10-25");
    expect(ligne.partsEntree).toEqual([
      { depense: 1800, budget: 1800, dateFixe: "2026-10-01" },
      { depense: 0, budget: 2000, dateFixe: "2026-10-25" },
    ]);
    expect(revenusDuMoisHero([{ env: ligne }], AUJOURDHUI)).toMatchObject({
      recu: 1800,
      aRecevoir: 2000,
    });
  });
});

describe("calculerResteHeroArchive", () => {
  it("revenus reçus − dépensé − épargne, sans le prévu ni `disponible`", () => {
    expect(
      calculerResteHeroArchive({
        enveloppes: [
          { id: "s", nom: "Salaire", depense: 2000, budget: 2000, type: "Entrée" },
          // Budget 500, dépensé 300 : les 200 € prévus non dépensés ne sont
          // PAS retirés.
          { id: "c", nom: "Courses", depense: 300, budget: 500, type: "Variable" },
          { id: "l", nom: "Loyer", depense: 800, budget: 800, type: "Fixe" },
        ],
        epargne: 100,
      }),
    ).toBe(800);
  });
});

describe("calculerResteEstimeArchive (double comptage corrigé le 2026-10-09)", () => {
  it("disponible − dépensé − prévu − épargne, sans recompter les entrées", () => {
    expect(
      calculerResteEstimeArchive({
        // disponible = somme des entrées du mois (budgetDuMois, store.ts).
        disponible: 2000,
        enveloppes: [
          { id: "s", nom: "Salaire", depense: 2000, budget: 2000, type: "Entrée" },
          { id: "c", nom: "Courses", depense: 300, budget: 500, type: "Variable" },
          { id: "l", nom: "Loyer", depense: 800, budget: 800, type: "Fixe" },
        ],
        epargne: 100,
      }),
    ).toBe(600); // 2000 − 1100 − 200 − 100 (avant : 2600)
  });
});
