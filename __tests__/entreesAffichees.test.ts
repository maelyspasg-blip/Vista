// Règle d'affichage des lignes d'entrées d'argent, commune à Aperçu et
// Budget (utils/budget.ts::statutAffichageEntree / entreesAffichablesDuMois,
// demande du 2026-10-09).
import type { Enveloppe } from "../app/store";
import {
  entreesAffichablesDuMois,
  statutAffichageEntree,
} from "../utils/budget";

const AUJOURDHUI = new Date(2026, 9, 9, 15, 30); // 9 octobre 2026, 15h30

function entree(champs: Partial<Enveloppe>): Enveloppe {
  return {
    id: "x",
    nom: "Salaire",
    depense: 0,
    budget: 1800,
    couleur: "#000000",
    recurrente: true,
    type: "Entrée",
    moisComptage: "2026-10-01",
    ...champs,
  };
}

describe("statutAffichageEntree", () => {
  it("depense > 0 → reçue, quelle que soit la date", () => {
    expect(
      statutAffichageEntree(entree({ depense: 1800, dateFixe: "2026-10-25" }), AUJOURDHUI),
    ).toBe("recue");
    expect(statutAffichageEntree(entree({ depense: 50 }), AUJOURDHUI)).toBe("recue");
  });

  it("depense = 0 et date future → à venir", () => {
    expect(
      statutAffichageEntree(entree({ dateFixe: "2026-10-25" }), AUJOURDHUI),
    ).toBe("a_venir");
  });

  it("depense = 0 et pas de date → masquée", () => {
    expect(statutAffichageEntree(entree({}), AUJOURDHUI)).toBe("masquee");
  });

  it("depense = 0 et date passée ou du jour → masquée", () => {
    expect(
      statutAffichageEntree(entree({ dateFixe: "2026-10-01" }), AUJOURDHUI),
    ).toBe("masquee");
    expect(
      statutAffichageEntree(entree({ dateFixe: "2026-10-09" }), AUJOURDHUI),
    ).toBe("masquee");
  });

  it("report négatif (déficit) → reçu, jamais caché", () => {
    expect(
      statutAffichageEntree(
        entree({ nom: "Report du mois précédent", depense: -120, dateFixe: "2026-10-01" }),
        AUJOURDHUI,
      ),
    ).toBe("recue");
  });

  it("catégorie supprimée sans montant reçu → masquée, même datée dans le futur", () => {
    expect(
      statutAffichageEntree(
        entree({ dateFixe: "2026-10-25", supprimeeLe: "2026-10-05T10:00:00Z" }),
        AUJOURDHUI,
      ),
    ).toBe("masquee");
  });
});

describe("entreesAffichablesDuMois", () => {
  it("ne garde que les Entrées du mois, non masquées, avec leur statut", () => {
    const resultat = entreesAffichablesDuMois(
      [
        entree({ id: "recue", depense: 1800, dateFixe: "2026-10-01" }),
        entree({ id: "avenir", nom: "Prime", dateFixe: "2026-10-28" }),
        entree({ id: "sans-date", nom: "CAF" }),
        entree({ id: "mois-passe", nom: "Vieux", depense: 900, moisComptage: "2026-09-01" }),
        entree({ id: "variable", type: "Variable", depense: 30 }),
      ],
      2026,
      9,
      AUJOURDHUI,
    );
    expect(resultat.map((l) => [l.env.id, l.statut])).toEqual([
      ["recue", "recue"],
      ["avenir", "a_venir"],
    ]);
  });
});
