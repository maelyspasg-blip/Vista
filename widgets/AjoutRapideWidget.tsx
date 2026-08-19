import { createWidget } from "expo-widgets";
import { Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  background,
  font,
  foregroundStyle,
  padding,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";

// Type pur, effacé à la compilation — voir la même note dans
// widgets/PlanningWidget.tsx sur pourquoi c'est safe à garder au niveau
// module contrairement à une const/function.
export type AjoutRapideWidgetProps = {
  logoUri?: string | null;
};

// Tout ce dont cette fonction a besoin est déclaré ICI, à l'intérieur — voir
// la note dans widgets/PlanningWidget.tsx sur la sérialisation babel.
export const AjoutRapideWidget = createWidget<AjoutRapideWidgetProps>(
  "AjoutRapideWidget",
  (props, environment) => {
    // RÈGLE À NE JAMAIS CASSER : voir la même règle dans
    // widgets/PlanningWidget.tsx — "widget" doit rester la toute première
    // instruction du corps de cette fonction (marqueur pour le plugin babel
    // expo-widgets/widgets-plugin).
    "widget";

    const navy = "#2D3A4A";
    const teal = "#1D9E75";

    const sombre = environment.colorScheme === "dark";
    const fond = sombre ? "#0D1B2A" : "#FFFFFF";
    const texte = sombre ? "#FFFFFF" : navy;

    // TEMPORAIRE — logoUri reçu mais volontairement pas rendu (voir
    // note en tête de fichier) : isole si <Image uiImage=.../> est la
    // cause du crash natif "[WidgetRenderSession] Invalidated" (un crash
    // pendant la construction SwiftUI, après que le JS ait déjà réussi —
    // donc invisible du côté red-box géré par evaluateLayout). À
    // réintroduire une fois ce checkpoint confirmé stable sur device.
    void props?.logoUri;

    return (
      <VStack
        alignment="leading"
        modifiers={[
          background(fond),
          padding({ all: 12 }),
          widgetURL("vista://ajout-rapide"),
        ]}
      >
        <Spacer minLength={16} />
        <Spacer />
        <VStack alignment="center" spacing={6}>
          <Text modifiers={[font({ size: 28, weight: "bold" }), foregroundStyle(teal)]}>
            +
          </Text>
          <Text
            modifiers={[
              font({ size: 13, weight: "semibold" }),
              foregroundStyle(texte),
            ]}
          >
            Ajouter une dépense
          </Text>
        </VStack>
        <Spacer />
      </VStack>
    );
  },
);
