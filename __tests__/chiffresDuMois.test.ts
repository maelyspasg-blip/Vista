// P076 (2026-10-11) : règles incassables des trois chiffres du mois en cours
// (utils/budget.ts) — vérifiées sur l'exemple chiffré de Maëlys.
import {
  calculerDisponibleMaintenant,
  calculerResteEstimeFinDeMois,
  calculerTotalDepensesEtImmobilise,
} from "../utils/budget";

const EXEMPLE = {
  revenusRecus: 2409,
  depensesActuelles: 656,
  argentImmobilise: 500,
};

describe("Règle 1 — Reste estimé fin de mois", () => {
  it("retire les dépenses prévues et ajoute les entrées à venir", () => {
    expect(
      calculerResteEstimeFinDeMois({
        ...EXEMPLE,
        depensesPrevues: 300,
        entreesAVenir: 100,
      }),
    ).toBe(2409 - 656 - 500 - 300 + 100);
  });

  it("sans prévu ni entrée à venir, vaut le disponible maintenant", () => {
    expect(
      calculerResteEstimeFinDeMois({ ...EXEMPLE, depensesPrevues: 0, entreesAVenir: 0 }),
    ).toBe(1253);
  });
});

describe("Règle 2 — Disponible maintenant", () => {
  it("2409 − 656 − 500 = 1253", () => {
    expect(calculerDisponibleMaintenant(EXEMPLE)).toBe(1253);
  });
});

describe("Règle 3 — Total dépenses + argent immobilisé", () => {
  it("656 + 500 = 1156", () => {
    expect(calculerTotalDepensesEtImmobilise(EXEMPLE)).toBe(1156);
  });
});
