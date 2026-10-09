// Marge d'un mois archivé (utils/budget.ts::margeMoisArchive, P067 corrigé
// le 2026-10-09) : `totalDepense` contient déjà l'épargne du mois — elle ne
// doit jamais être retirée une seconde fois.
import { margeMoisArchive } from "../utils/budget";

describe("margeMoisArchive", () => {
  it("disponible − totalDepense (épargne déjà incluse dans totalDepense)", () => {
    // Mois M-3 du seed invité (20260830100000_guest_fixe_depense_egale_budget) :
    // dépenses 750 + 42 + 378 + 132 + 95 + 20 = 1417, épargne 90,
    // total_depense = 1417 + 90 = 1507, disponible 1800.
    expect(margeMoisArchive({ disponible: 1800, totalDepense: 1507 })).toBe(293);
  });

  it("ne pénalise plus l'épargne : 1000 € épargnés, aucune dépense", () => {
    // Avant P067 : 1000 − 1000 − 1000 = −1000 (mois "négatif" à tort).
    expect(margeMoisArchive({ disponible: 1000, totalDepense: 1000 })).toBe(0);
  });
});
