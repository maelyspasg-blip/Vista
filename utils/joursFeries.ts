import type { Evenement } from "../app/store";

// RÈGLE À NE JAMAIS CASSER — AUCUNE ÉCRITURE SUPABASE DANS CE FICHIER : calcul
// pur (jours fériés français), jamais persisté — regénéré à la demande à
// chaque rendu de Planning (app/(tabs)/planning.tsx), jamais inséré en base
// ni synchronisé avec les widgets. Les id (préfixés `ferie_`) permettent de
// distinguer ces événements synthétiques d'un vrai Evenement utilisateur
// partout où les deux tableaux sont fusionnés (cf. site d'appel).
//
// RÈGLE : couleur gris discret — mêmes valeurs que les entrées d'historique
// de paiement (planning.tsx, `#BBBBBB`) — jamais une couleur vive, ce ne
// sont pas des événements personnels.
const COULEUR_FERIE = "#BBBBBB";

function dateVersISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Dimanche de Pâques pour une année donnée — algorithme de Meeus/Jones/
// Butcher (calendrier grégorien), valide pour toute année >= 1583. Sert de
// base aux 3 jours fériés mobiles (Lundi de Pâques, Ascension, Lundi de
// Pentecôte), calculés par décalage en jours depuis cette date.
function calculerPaques(annee: number): Date {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const moisIndex = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0 = janvier
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(annee, moisIndex, jour);
}

function ajouterJours(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function creerFerie(idSuffixe: string, nom: string, date: Date): Evenement {
  return {
    id: `ferie_${idSuffixe}`,
    nom,
    date: dateVersISO(date),
    heure: "00:00",
    duree: 0,
    couleur: COULEUR_FERIE,
    estFinancier: false,
    recurrent: false,
    touteLaJournee: true,
    notifierActif: false,
  };
}

// RÈGLE : SEULE fonction qui connaît la liste des jours fériés français —
// jamais dupliquée ailleurs. Calcul pur, sans dépendance au store ni à
// Supabase (cf. RÈGLE en tête de fichier) : peut être appelée pour
// n'importe quelle année, y compris hors de l'année en cours — la fenêtre
// affichée par Planning peut chevaucher deux années civiles (ex: vue de
// décembre à mars), cf. site d'appel qui calcule les années nécessaires.
export function getJoursFeries(annee: number): Evenement[] {
  const paques = calculerPaques(annee);
  return [
    creerFerie(`${annee}_01_01`, "Jour de l'An", new Date(annee, 0, 1)),
    creerFerie(`${annee}_lundi_paques`, "Lundi de Pâques", ajouterJours(paques, 1)),
    creerFerie(`${annee}_05_01`, "Fête du Travail", new Date(annee, 4, 1)),
    creerFerie(`${annee}_05_08`, "Victoire 1945", new Date(annee, 4, 8)),
    creerFerie(`${annee}_ascension`, "Ascension", ajouterJours(paques, 39)),
    creerFerie(`${annee}_lundi_pentecote`, "Lundi de Pentecôte", ajouterJours(paques, 50)),
    creerFerie(`${annee}_07_14`, "Fête Nationale", new Date(annee, 6, 14)),
    creerFerie(`${annee}_08_15`, "Assomption", new Date(annee, 7, 15)),
    creerFerie(`${annee}_11_01`, "Toussaint", new Date(annee, 10, 1)),
    creerFerie(`${annee}_11_11`, "Armistice", new Date(annee, 10, 11)),
    creerFerie(`${annee}_12_25`, "Noël", new Date(annee, 11, 25)),
  ];
}
