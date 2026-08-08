import { createWidget } from "expo-widgets";
import { Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  background,
  font,
  foregroundStyle,
  padding,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";

// Types purs (effacés à la compilation, avant que babel ne sérialise le
// corps de la fonction widget ci-dessous) — safe à garder au niveau module,
// contrairement à une const/function dont la RÉFÉRENCE survivrait dans le
// code généré sans que sa DÉCLARATION y soit incluse. Utilisés uniquement
// pour typer createWidget<...> ici et le paramètre de
// utils/widgetsSync.ts::synchroniserWidgetPlanning.
export type EvenementWidgetJour = {
  nom: string;
  heureDebut: string;
  estPasse: boolean;
};

export type PlanningWidgetProps = {
  evenements?: EvenementWidgetJour[];
  logoUri?: string | null;
};

// Tout ce dont cette fonction a besoin (couleurs, jours/mois, formatage de
// date) est déclaré ICI, à l'intérieur — le plugin babel widgets-plugin ne
// sérialise que le corps de cette fonction fléchée pour le stocker dans
// l'App Group ; toute référence à une const/function déclarée en dehors
// (même dans ce même fichier) est absente du code réellement évalué côté
// widget et lève une ReferenceError silencieuse (cube rouge).
export const PlanningWidget = createWidget<PlanningWidgetProps>(
  "PlanningWidget",
  (props, environment) => {
    "widget";

    const navy = "#2D3A4A";
    const jours = [
      "dimanche",
      "lundi",
      "mardi",
      "mercredi",
      "jeudi",
      "vendredi",
      "samedi",
    ];
    const mois = [
      "janvier",
      "février",
      "mars",
      "avril",
      "mai",
      "juin",
      "juillet",
      "août",
      "septembre",
      "octobre",
      "novembre",
      "décembre",
    ];

    const date = environment.date;
    const nomJour = jours[date.getDay()];
    const nomJourCapitalise = nomJour.charAt(0).toUpperCase() + nomJour.slice(1);
    const dateFormatee = `${nomJourCapitalise} ${date.getDate()} ${mois[date.getMonth()]}`;

    const sombre = environment.colorScheme === "dark";
    const fond = sombre ? "#0D1B2A" : "#FFFFFF";
    const texte = sombre ? "#FFFFFF" : navy;
    const texteMuted = sombre ? "#8A96A3" : "#6B7684";

    // TEMPORAIRE — logoUri reçu mais volontairement pas rendu, voir la
    // même note dans widgets/AjoutRapideWidget.tsx : isole si
    // <Image uiImage=.../> est la cause du crash natif
    // "[WidgetRenderSession] Invalidated".
    void props?.logoUri;
    const evenements = props?.evenements ?? [];
    const prochain = evenements.find((e) => !e.estPasse);
    const tousPasses = evenements.length > 0 && !prochain;

    return (
      <VStack
        alignment="leading"
        spacing={6}
        modifiers={[
          background(fond),
          padding({ all: 12 }),
          widgetURL("vista://planning"),
        ]}
      >
        <Spacer minLength={16} />
        <Text
          modifiers={[font({ size: 13, weight: "bold" }), foregroundStyle(texte)]}
        >
          {dateFormatee}
        </Text>
        <Spacer />
        {prochain ? (
          <VStack alignment="leading" spacing={2}>
            <Text
              modifiers={[
                font({ size: 12, weight: "semibold" }),
                foregroundStyle(texte),
              ]}
            >
              {prochain.nom}
            </Text>
            <Text modifiers={[font({ size: 11 }), foregroundStyle(texteMuted)]}>
              {prochain.heureDebut}
            </Text>
          </VStack>
        ) : (
          <Text modifiers={[font({ size: 12 }), foregroundStyle(texteMuted)]}>
            {tousPasses ? "Bonne fin de journée" : "Aucun événement aujourd'hui"}
          </Text>
        )}
      </VStack>
    );
  },
);
