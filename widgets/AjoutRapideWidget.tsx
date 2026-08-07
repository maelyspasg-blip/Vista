import { HStack, Image, Link, Text, VStack } from "@expo/ui/swift-ui";
import {
  background,
  containerBackground,
  cornerRadius,
  font,
  foregroundStyle,
  lineLimit,
  padding,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { AjoutRapideWidgetProps } from "./types";

// Composant marqué 'widget' — mêmes contraintes que PlanningWidget.tsx (rien
// en dehors de la fonction, tout vient de props/environment). Le tap sur une
// pastille est un <Link> par pastille — pas un <Button onPress> : onPress
// mute les props du widget lui-même sans ouvrir l'app (utile pour un widget
// auto-suffisant), alors qu'ici on veut explicitement ouvrir l'app sur le
// FAB avec la catégorie choisie. Plusieurs <Link> avec des destinations
// différentes dans un même widget ne fonctionnent comme cibles indépendantes
// que depuis iOS 17 (interactivité multi-zone WidgetKit) ; sur iOS 16 et
// avant, un seul widgetURL est honoré pour tout le widget et un tap
// n'importe où ouvre donc l'app sans présélection — exactement le repli
// demandé, obtenu gratuitement, sans AppIntent à écrire côté natif.
const AjoutRapideWidget = (
  props: Partial<AjoutRapideWidgetProps>,
  environment: WidgetEnvironment,
) => {
  "widget";

  const categories = props.categories ?? [];
  const logoUri = props.logoUri ?? null;

  const sombre = environment.colorScheme === "dark";
  const couleurFond = sombre ? "#0D1B2A" : "#FFFFFF";
  const couleurTexte = sombre ? "#FFFFFF" : "#2D3A4A";
  const couleurMuted = sombre ? "#8A96A6" : "#7A8699";
  const couleurPastilleAutreFond = sombre ? "#1B2A3A" : "#F2F4F7";

  // Regroupées sur 2 lignes (3 puis le reste) : ni @expo/ui/swift-ui ni
  // WidgetKit n'offrent de layout à retour à la ligne automatique équivalent
  // à un flexWrap RN — un HStack ne wrap jamais ses enfants.
  const items = [
    ...categories.map((cat) => ({
      key: cat.id,
      label: cat.nom,
      url: `vista://ajout-rapide?categorieId=${cat.id}`,
      fond: `${cat.couleur}22`,
      texte: cat.couleur,
    })),
    {
      key: "autre",
      label: "+ Autre",
      url: "vista://ajout-rapide",
      fond: couleurPastilleAutreFond,
      texte: couleurMuted,
    },
  ];
  const ligne1 = items.slice(0, 3);
  const ligne2 = items.slice(3);

  const rendrePastille = (item: (typeof items)[number]) => (
    <Link key={item.key} destination={item.url}>
      <HStack
        modifiers={[
          padding({ horizontal: 10, vertical: 7 }),
          background(item.fond),
          cornerRadius(14),
        ]}
      >
        <Text
          modifiers={[
            font({ size: 12, weight: "semibold" }),
            foregroundStyle(item.texte),
            lineLimit(1),
          ]}
        >
          {item.label}
        </Text>
      </HStack>
    </Link>
  );

  return (
    <VStack
      alignment="leading"
      spacing={10}
      modifiers={[
        padding({ all: 14 }),
        containerBackground(couleurFond, "widget"),
        // Repli obligatoire pour iOS < 17 (les <Link> par pastille ci-dessous
        // ne sont honorés comme zones tactiles indépendantes que depuis
        // iOS 17 — l'interactivité multi-zone d'un widget) et pour tout tap
        // hors des pastilles sur iOS 17+ (en-tête, espace vide) : ouvre
        // l'app sans présélection, exactement le "+ Autre" par défaut.
        widgetURL("vista://ajout-rapide"),
      ]}
    >
      <HStack spacing={6} alignment="center">
        {logoUri && <Image uiImage={logoUri} size={16} />}
        <Text modifiers={[font({ weight: "bold", size: 13 }), foregroundStyle(couleurTexte)]}>
          Vista
        </Text>
      </HStack>

      <VStack alignment="leading" spacing={8}>
        <HStack spacing={8}>{ligne1.map(rendrePastille)}</HStack>
        {ligne2.length > 0 && <HStack spacing={8}>{ligne2.map(rendrePastille)}</HStack>}
      </VStack>
    </VStack>
  );
};

export default createWidget("AjoutRapideWidget", AjoutRapideWidget);
