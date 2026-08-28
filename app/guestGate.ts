import { useRouter } from "expo-router";
import { Alert } from "react-native";

// RÈGLE À NE JAMAIS CASSER — LECTURE SEULE POUR LE COMPTE D'ESSAI : un
// compte invité (is_guest, cf. GuestContext) peut consulter les données de
// démonstration mais ne doit jamais pouvoir en créer/modifier de
// nouvelles — sinon ces données fictives se mélangeraient avec un futur
// vrai compte, ou seraient perdues à l'expiration de l'essai sans avoir
// prévenu l'utilisateur. Point d'entrée UNIQUE pour ce blocage : appeler
// systématiquement à l'OUVERTURE du formulaire/modal concerné (jamais
// seulement à la soumission, pour ne pas faire perdre du temps à
// l'utilisateur à remplir un formulaire qui sera de toute façon rejeté).
// Retourne true si l'action a été bloquée (l'appelant doit alors stopper
// net, ne pas ouvrir son modal/formulaire).
export function bloquerSiInvite(
  isGuest: boolean,
  router: ReturnType<typeof useRouter>,
): boolean {
  if (!isGuest) return false;
  Alert.alert(
    "Compte d'essai",
    "Vous êtes sur un compte d'essai. Créez votre compte Vista pour enregistrer vos vraies données et profiter de toutes les fonctionnalités.",
    [
      { text: "Plus tard", style: "cancel" },
      {
        text: "Créer mon compte",
        onPress: () => router.push("/onboarding/inscription"),
      },
    ],
  );
  return true;
}
