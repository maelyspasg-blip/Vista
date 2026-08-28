import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Enveloppe, SnapshotMois } from "./store";

// RÈGLE À NE JAMAIS CASSER — BANDEAU IN-APP, PAS DE NOTIFICATION PUSH :
// remplace l'ancien mécanisme à base d'expo-notifications (voir git blame —
// supprimé de app/notifications.ts). Ce fichier ne fait QUE déterminer
// QUELLE alerte (s'il y en a une) doit s'afficher — jamais d'écriture
// Supabase, jamais d'appel à expo-notifications. L'affichage lui-même vit
// dans AlerteBudgetBanner.tsx, l'état courant dans app/store.ts.
export type TypeAlerteBudget = "depassement" | "approche" | "rythme";

export type AlerteBudget = {
  enveloppeId: string;
  categorie: string;
  type: TypeAlerteBudget;
  texte: string;
};

function dateVersISOJour(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const PREFIXE_CLE_ALERTE_BUDGET_VUE = "vista_alerte_budget_vue_";

// RÈGLE À NE JAMAIS CASSER — NE PAS RÉPÉTER, PAR CATÉGORIE ET PAR JOUR :
// persiste la date (jour civil, comparaison par égalité de string ISO,
// jamais un delta en millisecondes) de la dernière fois où une alerte a été
// AFFICHÉE pour cette catégorie. Clé par enveloppe.id (l'enveloppe VIVANTE
// du mois en cours) — cohérent avec le fait que ces alertes portent
// uniquement sur le mois en cours.
async function alerteDejaVueAujourdHui(enveloppeId: string): Promise<boolean> {
  try {
    const derniere = await AsyncStorage.getItem(
      `${PREFIXE_CLE_ALERTE_BUDGET_VUE}${enveloppeId}`,
    );
    return derniere === dateVersISOJour(new Date());
  } catch {
    return false;
  }
}

async function marquerAlerteVue(enveloppeId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${PREFIXE_CLE_ALERTE_BUDGET_VUE}${enveloppeId}`,
      dateVersISOJour(new Date()),
    );
  } catch {
    // Best-effort : une erreur d'écriture locale ne doit jamais empêcher
    // l'affichage du bandeau, juste faire courir le risque (rare) qu'il
    // réapparaisse une fois de plus le même jour au pire.
  }
}

// Moyenne de la dépense des 2 DERNIERS mois archivés pour une catégorie
// (appariée par nom — cf. RÈGLE dans app/store.ts::renommerCategoriePartout
// sur pourquoi le nom, pas l'id, est la clé stable d'une catégorie à
// travers les mois archivés). `historiquesMois` est alimenté en ordre
// chronologique (cf. archiverMois dans app/store.ts) : les 2 DERNIERS
// éléments du tableau sont donc les 2 mois les plus récents. Renvoie `null`
// si moins de 2 mois archivés contiennent cette catégorie — pas assez de
// données pour une moyenne significative, l'alerte de rythme ne doit alors
// jamais se déclencher plutôt que de comparer contre une moyenne sur un
// seul mois.
function moyenneDeuxDerniersMoisPourCategorie(
  historiquesMois: SnapshotMois[],
  nomCategorie: string,
): number | null {
  const montants = historiquesMois
    .slice(-2)
    .map((snap) => snap.enveloppes.find((e) => e.nom === nomCategorie)?.depense)
    .filter((m): m is number => typeof m === "number");
  if (montants.length < 2) return null;
  return montants.reduce((a, b) => a + b, 0) / montants.length;
}

// RÈGLE À NE JAMAIS CASSER — APPELÉE DEPUIS ajouterTransaction ET
// modifierTransaction (app/store.ts), JAMAIS depuis une autre catégorie
// d'action (ajout d'enveloppe, etc.) : les alertes ci-dessous ne concernent
// que les DÉPENSES réelles (transactions), pas les budgets planifiés en
// eux-mêmes.
//
// RÈGLE À NE JAMAIS CASSER — UNE SEULE ALERTE À LA FOIS : renvoie au plus
// UNE alerte (jamais un tableau) — la plus prioritaire parmi toutes les
// catégories Variable qualifiées et pas encore vues aujourd'hui. Priorité :
// dépassement > approche 80% > rythme anormal. Jamais plusieurs bandeaux
// empilés.
//
// RÈGLE À NE JAMAIS CASSER — JAMAIS DE REJET NON CAPTÉ : appelée sans
// `await` depuis ajouterTransaction/modifierTransaction (fire-and-forget,
// même principe que synchroniserWidgetPlanning dans utils/widgetsSync.ts) —
// un try/catch englobant tout le corps est donc indispensable.
export async function determinerAlerteBudget(
  enveloppes: Enveloppe[],
  historiquesMois: SnapshotMois[],
  alertesBudgetActif: boolean,
): Promise<AlerteBudget | null> {
  if (!alertesBudgetActif) return null;

  try {
    const jourActuelMois = new Date().getDate();

    // RÈGLE À NE JAMAIS CASSER — FILTRE EXPLICITE, JAMAIS IMPLICITE :
    // uniquement les catégories Variable. Une catégorie Fixe est toujours à
    // 100% d'un coup (montant récurrent connu à l'avance) — une alerte à
    // 80% n'a aucun sens pour elle et serait trompeuse.
    const enveloppesVariables = enveloppes.filter((e) => e.type === "Variable");

    const candidatsParPriorite: Record<TypeAlerteBudget, AlerteBudget[]> = {
      depassement: [],
      approche: [],
      rythme: [],
    };

    for (const enveloppe of enveloppesVariables) {
      if (enveloppe.budget <= 0) continue;

      const pourcentageUtilise = enveloppe.depense / enveloppe.budget;
      const reste = enveloppe.budget - enveloppe.depense;
      const depassement = enveloppe.depense - enveloppe.budget;

      if (depassement > 0) {
        candidatsParPriorite.depassement.push({
          enveloppeId: enveloppe.id,
          categorie: enveloppe.nom,
          type: "depassement",
          texte: `${enveloppe.nom} — budget dépassé de ${Math.round(depassement)}€`,
        });
      } else if (pourcentageUtilise >= 0.8) {
        candidatsParPriorite.approche.push({
          enveloppeId: enveloppe.id,
          categorie: enveloppe.nom,
          type: "approche",
          texte: `${enveloppe.nom} — 80% utilisé, il te reste ${Math.round(reste)}€`,
        });
      } else if (jourActuelMois > 10) {
        // RÈGLE : ne se déclenche qu'après le 10ème jour du mois — avant
        // ça, le rythme quotidien (depense / jourActuelMois) est trop
        // bruité (une seule grosse dépense en début de mois fausserait
        // complètement le calcul) pour être un signal fiable.
        const moyenne = moyenneDeuxDerniersMoisPourCategorie(
          historiquesMois,
          enveloppe.nom,
        );
        if (moyenne !== null && moyenne > 0) {
          const rythmeActuel = enveloppe.depense / jourActuelMois;
          const rythmeHabituel = moyenne / 30;
          if (rythmeActuel > rythmeHabituel * 1.2) {
            candidatsParPriorite.rythme.push({
              enveloppeId: enveloppe.id,
              categorie: enveloppe.nom,
              type: "rythme",
              texte: `${enveloppe.nom} — rythme 20% plus élevé que d'habitude à mi-mois`,
            });
          }
        }
      }
    }

    const parOrdrePriorite = [
      ...candidatsParPriorite.depassement,
      ...candidatsParPriorite.approche,
      ...candidatsParPriorite.rythme,
    ];

    for (const candidat of parOrdrePriorite) {
      if (await alerteDejaVueAujourdHui(candidat.enveloppeId)) continue;
      await marquerAlerteVue(candidat.enveloppeId);
      return candidat;
    }
    return null;
  } catch (e) {
    console.error("[alertesBudget] Détermination de l'alerte budget a échoué :", e);
    return null;
  }
}
