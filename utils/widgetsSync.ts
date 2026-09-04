import type { Evenement, Transaction } from "../app/store";

// RÈGLE À NE JAMAIS CASSER — WIDGETS DÉSACTIVÉS EN ENTIER POUR CETTE BÊTA,
// AUCUN IMPORT expo-widgets/@expo/ui/swift-ui TENTÉ : décision du
// 2026-09-01 suite à un crash natif silencieux au démarrage en production
// TestFlight, persistant après la désactivation d'AdMob — expo-widgets
// (widgets/PlanningWidget.tsx, widgets/AjoutRapideWidget.tsx, tous deux
// auparavant importés ici) est l'autre module à code natif réel du projet,
// et donc la prochaine piste. Priorité à une bêta qui démarre : ce fichier
// ne référence plus du tout expo-widgets, ni directement ni en cascade via
// ces deux fichiers — mêmes signatures que la moitié .web de la paire (cf.
// utils/widgetsSync.web.ts), devenue une copie fonctionnellement identique
// de ce fichier-ci tant que ce chantier n'est pas rouvert. Les appelants
// (app/store.ts, fire-and-forget, jamais awaités) n'ont rien à changer.
//
// Pour réintégrer les widgets proprement plus tard : réinstaller les
// paquets npm expo-widgets/@expo/ui (désinstallés le 2026-09-01, leur
// simple présence en package.json suffisant à l'autolinking natif à les
// compiler dans le binaire même sans plugin app.json ni import JS actif —
// cause probable des crashs persistants malgré les désactivations
// précédentes), restaurer widgets/PlanningWidget.tsx et
// widgets/AjoutRapideWidget.tsx (supprimés le même jour, cf. historique
// git), restaurer le plugin "expo-widgets" dans app.json ET
// l'implémentation qui existait ici avant cette désactivation — jamais un
// seul de ces éléments sans les autres. Le
// palier de debug ETAPE_DEBUG_AJOUT_RAPIDE qui existait dans cette
// implémentation (isolation par élimination d'un crash "Exception in
// HostFunction" sur AjoutRapideWidget.updateSnapshot, cause alors identifiée
// comme `derniereDepense: null` explicite plutôt qu'un champ absent) reste
// dans l'historique git et doit être relu avant toute réactivation — le
// crash actuel (avant même le démarrage du JS) est probablement distinct de
// celui-là (qui survenait EN COURS D'USAGE, JS déjà démarré), mais les deux
// pourraient partager une cause côté configuration native.
export async function synchroniserWidgetPlanning(
  _evenements: Evenement[],
  _transactions: Transaction[],
): Promise<void> {}

export async function synchroniserWidgetAjoutRapide(
  _transactions: Transaction[],
): Promise<void> {}
