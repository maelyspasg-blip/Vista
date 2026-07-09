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

export async function programmerNotificationsEvenement(
  id: string,
  nom: string,
  dateEvenement: Date,
): Promise<void> {
  const veille = new Date(dateEvenement);
  veille.setDate(veille.getDate() - 1);
  veille.setHours(9, 0, 0, 0);

  const jourJ = new Date(dateEvenement);
  jourJ.setHours(9, 0, 0, 0);

  if (veille.getTime() > Date.now()) {
    await Notifications.scheduleNotificationAsync({
      identifier: `evt-${id}-veille`,
      content: { title: nom, body: "C'est demain" },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: veille,
      },
    });
  }
  if (jourJ.getTime() > Date.now()) {
    await Notifications.scheduleNotificationAsync({
      identifier: `evt-${id}-jour`,
      content: { title: nom, body: "C'est aujourd'hui" },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: jourJ,
      },
    });
  }
}

export async function annulerNotificationsEvenement(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(`evt-${id}-veille`).catch(
    () => {},
  );
  await Notifications.cancelScheduledNotificationAsync(`evt-${id}-jour`).catch(
    () => {},
  );
}
