import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { supabase } from "../supabaseClient";
import { getMembreEspace } from "../utils/espacePartage";
import type { Evenement } from "./store";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function demanderPermissionNotifications(): Promise<boolean> {
  const { status: statutActuel } = await Notifications.getPermissionsAsync();
  if (statutActuel === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

// RÈGLE À NE JAMAIS CASSER — NOTIFICATIONS PUSH ÉVÉNEMENTS PARTAGÉS (demande
// du 2026-09-13) : best-effort de bout en bout, ne doit JAMAIS faire
// échouer la création d'un événement ni afficher d'erreur visible —
// permission refusée, device sans capacité push, partenaire pas encore
// enregistré son token, requête réseau échouée... tous des cas silencieux,
// jamais une Alert ni un throw remonté à l'appelant (cf. RÈGLE explicite
// demandée : "Si refusée → ne pas envoyer de notification, pas d'erreur
// visible").
export async function enregistrerPushToken(userId: string): Promise<void> {
  try {
    const autorise = await demanderPermissionNotifications();
    if (!autorise) return;

    // RÈGLE : projectId requis par getExpoPushTokenAsync depuis SDK 49+ —
    // lu depuis app.json (extra.eas.projectId), jamais codé en dur ici.
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    if (!token) return;

    await supabase
      .from("profils")
      .update({ push_token: token })
      .eq("user_id", userId);
  } catch (e) {
    console.error(
      "[enregistrerPushToken] échec (best-effort, ignoré) :",
      e,
    );
  }
}

// RÈGLE : jour+mois sans année, même formatage que la bannière in-app
// équivalente (app/(tabs)/planning.tsx, "vous a ajouté à un événement") —
// notification proche dans le temps, jamais recalculé différemment.
// DIFFÉRENCE ASSUMÉE avec cette bannière : elle affiche toujours l'heure
// même pour un événement "toute la journée" (ev.heure vaut alors une valeur
// par défaut sans grande signification) ; ici, l'heure est omise dans ce
// cas précis (demande explicite du 2026-09-13, "[date] à [heure]" OU
// "[date]" si toute la journée) — pas une parité totale avec la bannière,
// seulement le format jour+mois.
function formaterDateNotifPush(
  evenement: Pick<Evenement, "date" | "heure" | "touteLaJournee">,
): string {
  const dateFormatee = new Date(evenement.date).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  });
  return evenement.touteLaJournee
    ? dateFormatee
    : `${dateFormatee} à ${evenement.heure}`;
}

// RÈGLE À NE JAMAIS CASSER — JAMAIS DE LECTURE DIRECTE profils.push_token
// DEPUIS LE CLIENT : ce projet n'a et n'aura jamais de policy SELECT
// cross-compte ouverte sur `profils` (cf. RÈGLE sur MembreEspace.prenom,
// utils/espacePartage.ts) — le token du partenaire passe TOUJOURS par la
// RPC security definer push_token_partenaire() (supabase/migrations/
// 20260913120000_planning_partage_push_notifications.sql), qui revalide
// elle-même le partage d'espace via partage_un_espace_avec(), jamais un
// `.eq("user_id", partenaireId)` direct sur profils.
export async function envoyerNotificationEvenementCommun(
  evenement: Evenement,
  prenomMoi: string,
  monUserId: string,
): Promise<void> {
  try {
    const etatEspace = await getMembreEspace();
    if (!etatEspace || etatEspace.statut !== "actif") return;

    const autreMembre = etatEspace.membres.find(
      (m) => m.userId !== monUserId,
    );
    if (!autreMembre) return;

    const { data: token, error } = await supabase.rpc(
      "push_token_partenaire",
      { p_partenaire_user_id: autreMembre.userId },
    );
    if (error || !token) return;

    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: token,
        title: `${prenomMoi} vous a invité à un événement`,
        body: `${evenement.nom} · ${formaterDateNotifPush(evenement)}`,
        data: { type: "evenement_commun", date: evenement.date },
      }),
    });
  } catch (e) {
    console.error(
      "[envoyerNotificationEvenementCommun] échec (best-effort, ignoré) :",
      e,
    );
  }
}

const MINUTES_AVANT_DEBUT = 15;

// Identifiants possibles pour un événement, selon son type — "toute la
// journée" utilise veille/jour, un horaire précis utilise avant/debut.
// annulerNotificationsEvenement doit annuler les 4 (voir sa propre règle) :
// le type d'un événement peut changer d'une édition à l'autre.
const SUFFIXES_IDENTIFIANT = ["veille", "jour", "avant", "debut"] as const;

function heureVersHM(heure: string): { h: number; m: number } {
  const [hStr, mStr] = heure.replace("h", ":").split(":");
  return {
    h: Math.min(23, Math.max(0, parseInt(hStr, 10) || 0)),
    m: Math.min(59, Math.max(0, parseInt(mStr, 10) || 0)),
  };
}

async function programmerSiFutur(
  identifiant: string,
  titre: string,
  date: Date,
): Promise<void> {
  if (date.getTime() <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    identifier: identifiant,
    content: { title: titre },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
    },
  });
}

// RÈGLE À NE JAMAIS CASSER : les textes exacts ci-dessous ("Demain : ...",
// "... dans 15 minutes", etc.) doivent rester synchronisés avec l'aperçu
// affiché dans le formulaire d'événement (planning.tsx, section
// Notifications) — l'utilisateur y voit une promesse de ce qui sera
// envoyé, elle doit correspondre exactement à ce qui l'est réellement.
export async function programmerNotificationsEvenement(
  id: string,
  nom: string,
  dateEvenement: Date,
  heure: string,
  touteLaJournee: boolean,
): Promise<void> {
  if (touteLaJournee) {
    const veille = new Date(dateEvenement);
    veille.setDate(veille.getDate() - 1);
    veille.setHours(20, 0, 0, 0);

    const jourJ = new Date(dateEvenement);
    jourJ.setHours(9, 0, 0, 0);

    await programmerSiFutur(`evt-${id}-veille`, `Demain : ${nom}`, veille);
    await programmerSiFutur(`evt-${id}-jour`, `Aujourd'hui : ${nom}`, jourJ);
    return;
  }

  const { h, m } = heureVersHM(heure);
  const debut = new Date(dateEvenement);
  debut.setHours(h, m, 0, 0);
  const avant = new Date(debut.getTime() - MINUTES_AVANT_DEBUT * 60 * 1000);

  await programmerSiFutur(`evt-${id}-avant`, `${nom} dans 15 minutes`, avant);
  await programmerSiFutur(`evt-${id}-debut`, `${nom} commence maintenant`, debut);
}

// RÈGLE À NE JAMAIS CASSER : annule les 4 identifiants possibles (pas
// seulement ceux du type actuel de l'événement) — un événement modifié
// pour passer de "toute la journée" à horaire précis (ou l'inverse) doit
// voir ses anciennes notifications annulées, pas seulement les nouvelles
// reprogrammées par-dessus (les identifiants ne se recouvrent pas entre
// les deux types).
export async function annulerNotificationsEvenement(id: string): Promise<void> {
  await Promise.all(
    SUFFIXES_IDENTIFIANT.map((suffixe) =>
      Notifications.cancelScheduledNotificationAsync(`evt-${id}-${suffixe}`).catch(
        () => {},
      ),
    ),
  );
}

export async function annulerToutesNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
