import type { Evenement, Transaction } from "../app/store";

// RÈGLE À NE JAMAIS CASSER — MOITIÉ .web DE LA PAIRE widgetsSync.ts/
// widgetsSync.web.ts : les widgets iOS (WidgetKit/SwiftUI) n'existent pas
// sur web — il n'y a rien à synchroniser. Ce fichier ne doit JAMAIS
// importer ../widgets/PlanningWidget ni ../widgets/AjoutRapideWidget (ni
// aucun module qui, en cascade, importe expo-widgets ou
// @expo/ui/swift-ui) : ces deux widgets appellent
// expo-modules-core.requireNativeViewManager au chargement du module, une
// API absente sur web qui casse le rendu serveur (SSR) d'expo-router pour
// TOUTE la app — pas seulement pour l'écran qui déclenche la synchro,
// puisque app/store.ts (importé par tous les écrans) importe
// synchroniserWidgetPlanning/synchroniserWidgetAjoutRapide. Metro résout ce
// fichier en priorité sur widgetsSync.ts pour toute build web ; widgetsSync.ts
// (la moitié native) garde la vraie implémentation. Mêmes signatures que
// widgetsSync.ts, sinon store.ts échouerait à la compilation selon la
// plateforme ciblée.
export async function synchroniserWidgetPlanning(
  _evenements: Evenement[],
  _transactions: Transaction[],
): Promise<void> {}

export async function synchroniserWidgetAjoutRapide(
  _transactions: Transaction[],
): Promise<void> {}
