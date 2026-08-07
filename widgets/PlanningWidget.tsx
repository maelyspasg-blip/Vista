import { HStack, Image, Text, VStack } from "@expo/ui/swift-ui";
import {
  containerBackground,
  font,
  foregroundStyle,
  lineLimit,
  padding,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { PlanningWidgetProps } from "./types";

// Composant marqué 'widget' : bundlé isolément par expo-widgets, ne peut
// référencer aucune valeur déclarée hors de cette fonction (y compris une
// const en tête de ce fichier) — toutes les couleurs sont donc redéclarées
// à l'intérieur, et toute donnée vient de `props`/`environment`. Voir
// utils/widgetsSync.ts pour le calcul de ces props côté app.
const PlanningWidget = (
  props: Partial<PlanningWidgetProps>,
  environment: WidgetEnvironment,
) => {
  "widget";

  // Cette version d'expo-widgets ne permet pas de props initiales à
  // createWidget (pas de 3e argument) — avant le tout premier
  // updateSnapshot() envoyé par l'app, `props` peut être vide.
  const evenements = props.evenements ?? [];
  const nbAutres = props.nbAutres ?? 0;
  const logoUri = props.logoUri ?? null;

  const sombre = environment.colorScheme === "dark";
  const couleurFond = sombre ? "#0D1B2A" : "#FFFFFF";
  const couleurTexte = sombre ? "#FFFFFF" : "#2D3A4A";
  const couleurMuted = sombre ? "#8A96A6" : "#7A8699";
  const couleurTeal = "#1D9E75";

  return (
    <VStack
      alignment="leading"
      spacing={7}
      modifiers={[
        padding({ all: 14 }),
        containerBackground(couleurFond, "widget"),
        // Un seul widgetURL par widget (limite SwiftUI/WidgetKit) : tap sur
        // n'importe quelle zone (y compris "+N autres") ouvre Planning —
        // c'est exactement le comportement demandé, une seule destination.
        widgetURL("vista://planning"),
      ]}
    >
      <HStack spacing={6} alignment="center">
        {logoUri && <Image uiImage={logoUri} size={16} />}
        <Text modifiers={[font({ weight: "bold", size: 13 }), foregroundStyle(couleurTexte)]}>
          Vista
        </Text>
      </HStack>

      {evenements.length === 0 ? (
        <VStack modifiers={[padding({ top: 10 })]}>
          <Text modifiers={[font({ size: 13 }), foregroundStyle(couleurMuted)]}>
            Aucun événement aujourd&apos;hui
          </Text>
        </VStack>
      ) : (
        <VStack alignment="leading" spacing={5}>
          {evenements.map((ev) => (
            <HStack key={ev.id} spacing={6} alignment="center">
              <Text
                modifiers={[
                  font({ size: 12, weight: "semibold" }),
                  foregroundStyle(couleurMuted),
                ]}
              >
                {ev.heure}
              </Text>
              <Text
                modifiers={[font({ size: 13 }), foregroundStyle(couleurTexte), lineLimit(1)]}
              >
                {ev.nom}
              </Text>
              {ev.estFinancier && (
                <Image systemName="eurosign.circle.fill" size={12} color={couleurTeal} />
              )}
            </HStack>
          ))}
          {nbAutres > 0 && (
            <Text modifiers={[font({ size: 11 }), foregroundStyle(couleurMuted)]}>
              +{nbAutres} autres
            </Text>
          )}
        </VStack>
      )}
    </VStack>
  );
};

export default createWidget("PlanningWidget", PlanningWidget);
