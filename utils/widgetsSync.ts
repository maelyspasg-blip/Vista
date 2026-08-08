import { Asset } from "expo-asset";
import { Directory, File } from "expo-file-system";
import { widgetsDirectory } from "expo-widgets";
import type { Evenement } from "../app/store";
import { PlanningWidget, type EvenementWidgetJour } from "../widgets/PlanningWidget";
import { AjoutRapideWidget } from "../widgets/AjoutRapideWidget";

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

// Ne considère que les événements ponctuels rattachés directement à
// aujourd'hui (date === aujourd'hui, avec une heure précise) — les
// événements récurrents ne sont volontairement pas développés ici pour
// garder cette synchro simple : la logique d'expansion des occurrences
// (genererOccurrencesEvenement) vit dans app/(tabs)/planning.tsx et n'est
// pas partagée pour l'instant. À réévaluer si des événements récurrents
// doivent apparaître dans le widget.
function evenementsDuJourPourWidget(
  evenements: Evenement[],
): EvenementWidgetJour[] {
  const maintenant = new Date();
  const aujourdhuiISO = dateVersISO(maintenant);
  const maintenantMinutes = maintenant.getHours() * 60 + maintenant.getMinutes();

  return evenements
    .filter((e) => e.date === aujourdhuiISO && !e.touteLaJournee && e.heure)
    .map((e) => ({
      nom: e.nom,
      heureDebut: e.heure,
      estPasse: heureEnMinutes(e.heure) < maintenantMinutes,
    }))
    .sort((a, b) => heureEnMinutes(a.heureDebut) - heureEnMinutes(b.heureDebut));
}

export async function synchroniserWidgetPlanning(
  evenements: Evenement[],
): Promise<void> {
  try {
    const logoUri = await obtenirLogoUri();
    PlanningWidget.updateSnapshot({
      evenements: evenementsDuJourPourWidget(evenements),
      logoUri,
    });
  } catch (e) {
    console.error("[widgetsSync] Mise à jour du widget Planning a échoué :", e);
  }
}

export async function synchroniserWidgetAjoutRapide(): Promise<void> {
  try {
    const logoUri = await obtenirLogoUri();
    AjoutRapideWidget.updateSnapshot({ logoUri });
  } catch (e) {
    console.error(
      "[widgetsSync] Mise à jour du widget Ajout rapide a échoué :",
      e,
    );
  }
}
