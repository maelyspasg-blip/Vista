import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { widgetsDirectory } from "expo-widgets";
import { Platform } from "react-native";

import type {
  Enveloppe,
  Evenement,
  Objectif,
  PaiementHistorique,
  Transaction,
} from "../app/store";
import AjoutRapideWidget from "../widgets/AjoutRapideWidget";
import PlanningWidget from "../widgets/PlanningWidget";
import { construireTousLesEvenements, heureEnMinutes, memeJour } from "./evenements";

const NOM_FICHIER_LOGO = "vista-logo-mark.png";
const MAX_EVENEMENTS_WIDGET_PLANNING = 5;
const NB_JOURS_CATEGORIES_FREQUENTES = 7;
const MAX_CATEGORIES_FREQUENTES = 4;

// Un widget ne peut pas lire le sandbox de l'app — le logo doit être copié
// une fois dans le conteneur App Group partagé (widgetsDirectory) pour que
// PlanningWidget puisse le référencer par chemin (prop `logoUri`). Copie
// idempotente : ne réécrit rien si le fichier existe déjà (asset statique,
// jamais modifié).
let copieLogoEnCours: Promise<string | null> | null = null;

function copierLogoWidget(): Promise<string | null> {
  if (!widgetsDirectory) return Promise.resolve(null);
  const destination = new File(widgetsDirectory, NOM_FICHIER_LOGO);
  if (destination.exists) return Promise.resolve(destination.uri);

  if (!copieLogoEnCours) {
    copieLogoEnCours = (async () => {
      try {
        const asset = Asset.fromModule(require("../assets/images/vista-logo-mark.png"));
        await asset.downloadAsync();
        if (!asset.localUri) return null;
        new File(asset.localUri).copy(destination);
        return destination.uri;
      } catch {
        return null;
      } finally {
        copieLogoEnCours = null;
      }
    })();
  }
  return copieLogoEnCours;
}

/**
 * Recalcule et pousse les données du widget "Planning du jour" — à appeler
 * depuis app/(tabs)/_layout.tsx à chaque chargement/vérification d'état
 * (même rythme que verifierEtat), pour que le widget reste synchronisé sans
 * mécanisme de polling séparé.
 */
export async function synchroniserWidgetPlanning(params: {
  evenements: Evenement[];
  enveloppes: Enveloppe[];
  historiquePaiements: PaiementHistorique[];
  objectifs: Objectif[];
}): Promise<void> {
  if (Platform.OS !== "ios") return;

  const logoUri = await copierLogoWidget();

  const aujourdhui = new Date();
  const tousLesEvenements = construireTousLesEvenements({
    ...params,
    dateReference: aujourdhui,
  });
  // Les événements "toute la journée" (échéances de catégories Fixe,
  // contributions d'objectifs, historique de paiements — heure vide) ne
  // s'intègrent pas dans une liste "heure + nom" : mêmes distinction que la
  // vue Jour de Planning (evsHorairesJour vs evsToutLaJourneeJour).
  const evenementsAujourdhui = tousLesEvenements
    .filter((e) => !e.touteLaJournee && memeJour(e.date, aujourdhui))
    .sort((a, b) => heureEnMinutes(a.heure) - heureEnMinutes(b.heure));

  const evenementsVisibles = evenementsAujourdhui
    .slice(0, MAX_EVENEMENTS_WIDGET_PLANNING)
    .map((e) => ({ id: e.id, nom: e.nom, heure: e.heure, estFinancier: e.estFinancier }));
  const nbAutres = evenementsAujourdhui.length - evenementsVisibles.length;

  // TEMPORAIRE — à retirer une fois le widget vide diagnostiqué : confirme
  // que cette fonction est bien appelée et avec quelles données exactement,
  // pour distinguer "jamais appelée"/"appelée avec des données vides" d'un
  // problème côté rendu SwiftUI.
  console.log("[widgetsSync] synchroniserWidgetPlanning →", {
    widgetsDirectory,
    logoUri,
    nbEvenementsAujourdhui: evenementsAujourdhui.length,
    evenementsVisibles,
    nbAutres,
  });

  PlanningWidget.updateSnapshot({
    evenements: evenementsVisibles,
    nbAutres,
    logoUri,
  });
}

/**
 * Recalcule et pousse les données du widget "Ajout rapide" — catégories de
 * dépense (hors Entrée) les plus utilisées sur les derniers jours, comptées
 * en nombre de transactions (pas en montant, pour ne jamais exposer de
 * chiffre sur ce widget). Même point d'appel que synchroniserWidgetPlanning
 * (app/(tabs)/_layout.tsx) et en plus après chaque transaction (store.ts).
 */
export async function synchroniserWidgetAjoutRapide(params: {
  transactions: Transaction[];
  enveloppes: Enveloppe[];
}): Promise<void> {
  if (Platform.OS !== "ios") return;

  const logoUri = await copierLogoWidget();

  const seuilDate = new Date();
  seuilDate.setDate(seuilDate.getDate() - NB_JOURS_CATEGORIES_FREQUENTES);

  const comptesParCategorie = new Map<string, number>();
  params.transactions.forEach((t) => {
    if (new Date(t.date) < seuilDate) return;
    comptesParCategorie.set(
      t.enveloppeId,
      (comptesParCategorie.get(t.enveloppeId) ?? 0) + 1,
    );
  });

  const enveloppesParId = new Map(params.enveloppes.map((e) => [e.id, e]));
  const categories = [...comptesParCategorie.entries()]
    .map(([enveloppeId, compte]) => ({ env: enveloppesParId.get(enveloppeId), compte }))
    .filter(
      (x): x is { env: Enveloppe; compte: number } =>
        !!x.env && x.env.type !== "Entrée",
    )
    .sort((a, b) => b.compte - a.compte)
    .slice(0, MAX_CATEGORIES_FREQUENTES)
    .map(({ env }) => ({ id: env.id, nom: env.nom, couleur: env.couleur }));

  AjoutRapideWidget.updateSnapshot({ categories, logoUri });
}
