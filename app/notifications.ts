import * as Notifications from "expo-notifications";

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
