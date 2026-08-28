import { Asset } from "expo-asset";
import { Directory, File } from "expo-file-system";
import { widgetsDirectory } from "expo-widgets";
import type { Evenement, Transaction } from "../app/store";
import { genererOccurrencesEvenement } from "./evenements";
import {
  PlanningWidget,
  type DepenseWidgetJour,
  type EvenementWidgetJour,
  type JourSemaineWidget,
} from "../widgets/PlanningWidget";
import { AjoutRapideWidget } from "../widgets/AjoutRapideWidget";

// RÈGLE À NE JAMAIS CASSER — MOITIÉ NATIVE DE LA PAIRE widgetsSync.ts/
// widgetsSync.web.ts : ce fichier importe (en cascade, via
// widgets/PlanningWidget.tsx et widgets/AjoutRapideWidget.tsx) expo-widgets
// et @expo/ui/swift-ui, deux modules qui appellent
// expo-modules-core.requireNativeViewManager au chargement — absent sur
// web, ce qui casse le rendu serveur d'expo-router pour TOUTE la app (ce
// fichier est importé par app/store.ts, lui-même importé par tous les
// écrans). C'est pour ça qu'existe widgetsSync.web.ts (stub no-op, mêmes
// signatures) : Metro le préfère automatiquement à celui-ci sur toute
// build web. Ne jamais fusionner les deux fichiers avec un
// `Platform.OS === "web"` : ce garde runtime n'empêcherait pas Metro de
// résoudre/transformer ces imports natifs au moment du bundling (même
// piège que la paire utils/adMobModule.ts/.web.ts).
//
// RÈGLE À NE JAMAIS CASSER — AUCUNE ÉCRITURE SUPABASE DANS CE FICHIER : ce
// module ne fait que PRÉPARER un snapshot (à partir de données déjà
// chargées par l'app) et l'écrire dans le dossier App Group partagé avec
// les extensions widget (updateSnapshot) — il ne doit JAMAIS contenir
// d'appel .delete()/.update()/.insert()/.upsert() vers Supabase. Toute
// écriture Supabase réelle vit dans app/store.ts (cf. RÈGLE DE SÉCURITÉ en
// tête de ce fichier).

const NOM_FICHIER_LOGO = "vista-logo-mark.png";

// Copie une seule fois le logo vers le dossier partagé App Group exposé par
// expo-widgets (widgetsDirectory) — les widgets tournent dans une extension
// séparée qui n'a pas accès aux assets require()'d de l'app principale, seul
// ce dossier partagé (ou UserDefaults) leur est accessible. Le chemin change
// potentiellement d'une installation à l'autre, donc chaque widget reçoit
// l'URI courante via ses props plutôt que de la coder en dur dans son layout.
let logoUriPromise: Promise<string | null> | null = null;

function obtenirLogoUri(): Promise<string | null> {
  if (!widgetsDirectory) return Promise.resolve(null);
  if (!logoUriPromise) {
    logoUriPromise = (async () => {
      try {
        const destination = new File(new Directory(widgetsDirectory), NOM_FICHIER_LOGO);
        if (destination.exists) return destination.uri;

        const asset = Asset.fromModule(
          require("../assets/images/vista-logo-mark.png"),
        );
        await asset.downloadAsync();
        if (!asset.localUri) return null;

        await new File(asset.localUri).copy(destination);
        return destination.uri;
      } catch (e) {
        console.error(
          "[widgetsSync] Copie du logo vers widgetsDirectory a échoué :",
          e,
        );
        return null;
      }
    })();
  }
  return logoUriPromise;
}

function heureEnMinutes(heure: string): number {
  const [h, m] = heure.replace("h", ":").split(":");
  return parseInt(h, 10) * 60 + (parseInt(m, 10) || 0);
}

function dateVersISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// RÈGLE À NE JAMAIS CASSER — PROPS TOUJOURS SÉRIALISABLES : updateSnapshot
// ET updateTimeline passent leurs props au pont natif (JSI HostFunction) qui
// les sérialise côté widget — un NaN/Infinity/undefined dans un champ
// numérique fait planter cette sérialisation avec une "Exception in
// HostFunction" qui peut survenir HORS du call stack synchrone (donc pas
// toujours rattrapable par un simple try/catch JS, cf. RÈGLE plus bas sur
// AjoutRapideWidget). La seule protection fiable est de garantir que ces
// valeurs sont déjà propres AVANT l'appel, jamais de compter sur le pont
// natif pour les valider — d'où cet usage systématique, y compris pour les
// champs numériques imbriqués dans `semaine`/`evenements` du widget
// Planning.
function nombreSur(valeur: number): number {
  return Number.isFinite(valeur) ? valeur : 0;
}

// Date au même jour que `reference`, à l'heure "XhYY" donnée — utilisé pour
// transformer un horaire d'événement en Date exploitable par
// Widget.updateTimeline (une entrée par horaire de début, cf. RÈGLE plus
// bas). setHours(0, minutesTotales, ...) gère nativement le débordement
// (ex: 90 minutes → 1h30), pas besoin d'extraire heures/minutes séparément.
function dateAvecHeure(reference: Date, heure: string): Date {
  const d = new Date(reference);
  d.setHours(0, heureEnMinutes(heure), 0, 0);
  return d;
}

// Un événement récurrent tombe-t-il le jour de `reference` ? Réutilise
// EXACTEMENT la même expansion d'occurrences que app/(tabs)/planning.tsx
// (import partagé depuis utils/evenements.ts, cf. RÈGLE là-bas) — jamais
// une seconde implémentation qui pourrait diverger. Fenêtre réduite à
// [reference 00:00, reference 23:59] : on ne veut savoir que "ce jour-là
// en fait partie", pas la liste complète des occurrences futures.
function evenementRecurrentTombeCeJourLa(e: Evenement, reference: Date): boolean {
  if (!e.recurrent || !e.frequence) return false;
  const debutFenetre = new Date(reference);
  debutFenetre.setHours(0, 0, 0, 0);
  const finFenetre = new Date(reference);
  finFenetre.setHours(23, 59, 59, 999);
  return (
    genererOccurrencesEvenement(new Date(e.date), e.frequence, debutFenetre, finFenetre)
      .length > 0
  );
}

// Événements du jour de `reference` pour le widget Planning — ponctuels
// datés ce jour-là OU récurrents dont une occurrence y tombe (cf.
// evenementRecurrentTombeCeJourLa ci-dessus). `reference` pilote aussi
// `estPasse` : appelée avec des dates différentes (cf.
// synchroniserWidgetPlanning), ça permet à CHAQUE entrée de la timeline de
// porter le bon état "passé/à venir" pour l'heure à laquelle WidgetKit
// l'affichera réellement, plutôt que de figer `estPasse` à l'heure de la
// synchro pour toutes les entrées futures.
function evenementsDuJourPourWidget(
  evenements: Evenement[],
  reference: Date,
): EvenementWidgetJour[] {
  const referenceISO = dateVersISO(reference);
  const referenceMinutes = reference.getHours() * 60 + reference.getMinutes();

  return evenements
    .filter(
      (e) =>
        !e.touteLaJournee &&
        e.heure &&
        (e.date === referenceISO || evenementRecurrentTombeCeJourLa(e, reference)),
    )
    .map((e) => ({
      nom: e.nom,
      heureDebut: e.heure,
      estPasse: heureEnMinutes(e.heure) < referenceMinutes,
      estFinancier: e.estFinancier,
      // RÈGLE : jamais `null` (cf. RÈGLE PROPS TOUJOURS SÉRIALISABLES plus
      // bas, et RÈGLE sur EvenementWidgetJour.montant) — `nombreSur` (défini
      // plus bas, hissé par hoisting de déclaration de fonction) ramène tout
      // NaN/undefined à 0, jamais `null`.
      montant: nombreSur(e.montant ?? 0),
    }))
    .sort((a, b) => heureEnMinutes(a.heureDebut) - heureEnMinutes(b.heureDebut));
}

// Lundi 00:00 de la semaine calendaire contenant `reference` — base de la
// rangée des 7 jours (medium/large). `getDay()` renvoie 0 (dimanche) à 6
// (samedi) ; `(jour + 6) % 7` le convertit en offset lundi-premier (0 pour
// lundi, 6 pour dimanche) à soustraire pour revenir au lundi de la semaine.
function lundiDeLaSemaine(reference: Date): Date {
  const d = new Date(reference);
  const offsetLundi = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offsetLundi);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Transactions réelles (pas des événements de calendrier) du jour de
// `reference` — pour la ligne "− 35 €  Courses" du widget Planning
// medium/large (cf. RÈGLE DONNÉES demandée : distinct des `Evenement`
// estFinancier, qui restent des événements planifiés). `montant` passe par
// `nombreSur` — jamais de NaN/Infinity transmis au pont natif (cf. RÈGLE
// PROPS TOUJOURS SÉRIALISABLES plus haut).
function transactionsDuJourPourWidget(
  transactions: Transaction[],
  reference: Date,
): DepenseWidgetJour[] {
  const referenceISO = dateVersISO(reference);
  return transactions
    .filter((t) => t.date === referenceISO)
    .map((t) => ({ nom: t.nom, montant: nombreSur(t.montant) }));
}

// Les 7 jours (lundi -> dimanche) de la semaine de `reference`, chacun avec
// ses propres événements ET dépenses — pour la vue semaine du widget
// Planning (medium/large). Réutilise `evenementsDuJourPourWidget` /
// `transactionsDuJourPourWidget` jour par jour (même filtrage/tri/expansion
// des récurrences que le format actuel), donc aucune divergence possible
// entre les deux vues. `estPasse` compare la date du jour à la date de
// `reference` (pas `new Date()` — cf. RÈGLE en tête de widgets/
// PlanningWidget.tsx) : un jour AVANT le jour de `reference` est passé,
// jamais le jour de `reference` lui-même (qui est "aujourd'hui", pas
// "passé", même en fin de journée).
function semaineWidgetPourReference(
  evenements: Evenement[],
  transactions: Transaction[],
  reference: Date,
): JourSemaineWidget[] {
  const lundi = lundiDeLaSemaine(reference);
  const referenceISO = dateVersISO(reference);

  return Array.from({ length: 7 }, (_, i) => {
    const jourDate = new Date(lundi);
    jourDate.setDate(jourDate.getDate() + i);
    const jourISO = dateVersISO(jourDate);
    return {
      dateISO: jourISO,
      jourMois: jourDate.getDate(),
      estAujourdHui: jourISO === referenceISO,
      estPasse: jourISO < referenceISO,
      evenements: evenementsDuJourPourWidget(evenements, jourDate),
      depenses: transactionsDuJourPourWidget(transactions, jourDate),
    };
  });
}

export async function synchroniserWidgetPlanning(
  evenements: Evenement[],
  transactions: Transaction[],
): Promise<void> {
  try {
    const logoUri = await obtenirLogoUri();
    const maintenant = new Date();

    // RÈGLE À NE JAMAIS CASSER — TIMELINE, PAS UN SIMPLE SNAPSHOT : une
    // entrée par horaire de début d'événement encore à venir aujourd'hui
    // (pour que "prochain événement" avance tout seul dans le widget small,
    // sans réveil de l'app) + une dernière entrée à minuit ce soir. Cette
    // dernière entrée bascule elle-même sur le jour suivant : comme
    // `evenementsDuJourPourWidget` calcule "aujourd'hui" par rapport à la
    // `reference` reçue, lui passer minuit (qui déborde nativement sur le
    // jour suivant via setHours(24, ...)) donne directement l'agenda de
    // DEMAIN — le widget change de jour sans dépendre d'une réouverture de
    // l'app, tant que cette entrée n'a pas été remplacée entre-temps par
    // une nouvelle synchro (ajout/modif/suppression d'événement).
    const evenementsAujourdHui = evenementsDuJourPourWidget(evenements, maintenant);
    const horairesAVenir = evenementsAujourdHui
      .filter((e) => !e.estPasse)
      .map((e) => dateAvecHeure(maintenant, e.heureDebut))
      .filter((d) => d > maintenant);

    const minuitCeSoir = new Date(maintenant);
    minuitCeSoir.setHours(24, 0, 0, 0);

    const datesEntrees = [maintenant, ...horairesAVenir, minuitCeSoir].sort(
      (a, b) => a.getTime() - b.getTime(),
    );

    PlanningWidget.updateTimeline(
      datesEntrees.map((date) => {
        const semaine = semaineWidgetPourReference(evenements, transactions, date);
        // Dérivé de `semaine` (jamais recalculé indépendamment) — même
        // source que les lignes de dépenses affichées, aucune divergence
        // possible entre le total et le détail (cf. RÈGLE sur
        // PlanningWidgetProps.depensesParJour dans widgets/PlanningWidget.tsx).
        const depensesParJour = semaine.map((jour) => ({
          dateISO: jour.dateISO,
          total: nombreSur(jour.depenses.reduce((acc, d) => acc + d.montant, 0)),
        }));
        return {
          date,
          props: {
            evenements: evenementsDuJourPourWidget(evenements, date),
            semaine,
            depensesParJour,
            derniereMiseAJour: maintenant.getTime(),
            logoUri,
          },
        };
      }),
    );
  } catch (e) {
    console.error("[widgetsSync] Mise à jour du widget Planning a échoué :", e);
  }
}

// RÈGLE : pas de updateTimeline ici, contrairement au widget Planning — il
// n'y a pas d'état "futur déjà connu" à programmer (contrairement à "cet
// événement commence à telle heure"), juste un total courant qui ne change
// que sur action utilisateur (ajout/modif/suppression de dépense) —
// updateSnapshot + un appel de synchro à chaque CRUD (cf. app/store.ts,
// mêmes points d'appel que appliquerEnveloppes) suffit, jamais de
// rafraîchissement programmé inutile. `nombreSur` (défini plus haut) reste
// utilisé ci-dessous pour les mêmes raisons de sérialisation.

// TEMPORAIRE — DEBUG PAR ÉLIMINATION : le crash natif persiste malgré la
// sanitisation des valeurs (Number.isFinite, nom forcé en string) ET un
// try/catch autour de l'appel — cf. RÈGLE plus haut : une "Exception in
// HostFunction" peut survenir HORS du call stack synchrone, donc un
// try/catch JS ne la voit pas forcément passer. À DÉFAUT DE POUVOIR TESTER
// SUR DEVICE DEPUIS CET ENVIRONNEMENT, ce palier permet de rejouer
// manuellement les 4 étapes demandées sans réécrire le fichier à chaque
// fois : changer UNIQUEMENT ce nombre, relancer sur device, noter à quel
// palier ça replante. 4 = comportement normal (toutes les props), à
// remettre une fois la vraie cause identifiée — ne JAMAIS livrer autre
// chose que 4.
const ETAPE_DEBUG_AJOUT_RAPIDE: 1 | 2 | 3 | 4 = 4;

export async function synchroniserWidgetAjoutRapide(
  transactions: Transaction[],
): Promise<void> {
  try {
    const logoUri = await obtenirLogoUri();
    const logoUriSur = typeof logoUri === "string" ? logoUri : null;

    // Palier 1 : minimum absolu, cf. étape 1 de la demande.
    if (ETAPE_DEBUG_AJOUT_RAPIDE === 1) {
      const props = { logoUri: logoUriSur };
      console.log("[widgetsSync] DEBUG palier 1 — props :", JSON.stringify(props));
      AjoutRapideWidget.updateSnapshot(props);
      return;
    }

    const aujourdhuiISO = dateVersISO(new Date());
    const depenseAujourdHui = nombreSur(
      transactions
        .filter((t) => t.date === aujourdhuiISO)
        .reduce((acc, t) => acc + nombreSur(t.montant), 0),
    );

    // Palier 2 : + depenseAujourdHui figé à 0, cf. étape 2 de la demande —
    // isole depenseAujourdHui de derniereDepense.
    if (ETAPE_DEBUG_AJOUT_RAPIDE === 2) {
      const props = { logoUri: logoUriSur, depenseAujourdHui: 0 };
      console.log("[widgetsSync] DEBUG palier 2 — props :", JSON.stringify(props));
      AjoutRapideWidget.updateSnapshot(props);
      return;
    }

    // Palier 3 : + derniereDepense absent (jamais `null` explicite — cf.
    // RÈGLE CAUSE IDENTIFIÉE plus bas, corrigée ici aussi par cohérence).
    if (ETAPE_DEBUG_AJOUT_RAPIDE === 3) {
      const props = { logoUri: logoUriSur, depenseAujourdHui: 0, derniereDepense: undefined };
      console.log("[widgetsSync] DEBUG palier 3 — props :", JSON.stringify(props));
      AjoutRapideWidget.updateSnapshot(props);
      return;
    }

    // RÈGLE : `transactions` est alimenté par le store en ORDRE
    // D'INSERTION (le plus récent toujours ajouté en fin de tableau, cf.
    // app/store.ts) — le dernier élément EST la dépense la plus récente,
    // jamais besoin de re-trier par date (Transaction.date n'a pas de
    // composante horaire, un tri par date seule ne départagerait pas deux
    // dépenses du même jour).
    const derniere =
      transactions.length > 0 ? transactions[transactions.length - 1] : null;
    // RÈGLE — CAUSE IDENTIFIÉE PAR LES LOGS DEVICE : les crashs
    // "Exception in HostFunction" corrélaient à 5/5 avec `derniereDepense:
    // null` explicite dans les props envoyées (jamais avec un objet
    // rempli) — cf. logs .expo/dev/logs/start.log. Le pont natif accepte
    // visiblement mal une valeur JSON `null` pour ce champ optionnel
    // objet, contrairement à la clé absente. `derniereDepense` est donc
    // soit ABSENT (jamais `null` explicite), soit un objet SIMPLE à deux
    // champs déjà validés (nom forcé en string, montant fini) — jamais
    // l'objet Transaction brut (qui porte enveloppeId/id/date, sans
    // intérêt ici et sans garantie de sérialisation propre). Reste à
    // reconfirmer sur device : si le crash persiste malgré ça, la cause
    // est ailleurs et il faudra revenir à la ladder ETAPE_DEBUG_AJOUT_RAPIDE
    // ci-dessus pour continuer l'élimination.
    const derniereDepense =
      derniere && typeof derniere.nom === "string" && Number.isFinite(derniere.montant)
        ? { nom: derniere.nom, montant: derniere.montant }
        : undefined;
    // Palier 4 (normal) : + les vraies valeurs calculées, cf. étape 4 — log
    // systématique des props exactement envoyées, pour comparer avec ce
    // que le natif reçoit réellement en cas de crash à ce palier.
    const props = { logoUri: logoUriSur, depenseAujourdHui, derniereDepense };
    console.log("[widgetsSync] props avant updateSnapshot :", JSON.stringify(props));
    try {
      AjoutRapideWidget.updateSnapshot(props);
    } catch (e) {
      console.error(
        "[widgetsSync] AjoutRapideWidget.updateSnapshot a planté — props envoyées :",
        JSON.stringify(props),
        "erreur :",
        e,
      );
    }
  } catch (e) {
    console.error(
      "[widgetsSync] Mise à jour du widget Ajout rapide a échoué :",
      e,
    );
  }
}
