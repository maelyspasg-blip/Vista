import { createWidget } from "expo-widgets";
import { HStack, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  background,
  font,
  foregroundStyle,
  padding,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";

// RÈGLE À NE JAMAIS CASSER — AUCUNE ÉCRITURE SUPABASE DANS CE FICHIER : voir
// la même règle dans widgets/PlanningWidget.tsx — extension iOS séparée,
// aucun accès Supabase direct, jamais un appel .delete()/.update()/
// .insert()/.upsert(). Toute écriture Supabase réelle vit dans
// app/store.ts.
//
// Type pur, effacé à la compilation — voir la même note dans
// widgets/PlanningWidget.tsx sur pourquoi c'est safe à garder au niveau
// module contrairement à une const/function.
export type AjoutRapideWidgetProps = {
  logoUri?: string | null;
  depenseAujourdHui?: number;
  derniereDepense?: { nom: string; montant: number } | null;
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

    // RÈGLE À NE JAMAIS CASSER — PALETTE VISTA STRICTE : uniquement ces 2
    // couleurs de marque + fond blanc/#0D1B2A, jamais une couleur inventée
    // pour ce widget — cohérence avec le reste de l'app (cf. ThemeContext).
    const navy = "#2D3A4A";
    const teal = "#1D9E75";

    const sombre = environment.colorScheme === "dark";
    const fond = sombre ? "#0D1B2A" : "#FFFFFF";
    const texte = sombre ? "#FFFFFF" : navy;
    const texteMuted = sombre ? "#8A96A3" : "#6B7684";

    // TEMPORAIRE — logoUri reçu mais volontairement pas rendu (voir
    // note en tête de fichier) : isole si <Image uiImage=.../> est la
    // cause du crash natif "[WidgetRenderSession] Invalidated" (un crash
    // pendant la construction SwiftUI, après que le JS ait déjà réussi —
    // donc invisible du côté red-box géré par evaluateLayout). À
    // réintroduire une fois ce checkpoint confirmé stable sur device. En
    // attendant, le header affiche uniquement le wordmark texte "Vista" —
    // jamais l'icône PNG.
    void props?.logoUri;

    // RÈGLE : small = juste le bouton "+" (pas la place pour autre chose) ;
    // medium = même bouton + infos utiles (dépense du jour, dernière
    // dépense), cf. RÈGLE LISIBILITÉ dans PlanningWidget.tsx (même principe
    // de densité par taille).
    const estPetit = environment.widgetFamily === "systemSmall";
    const depenseAujourdHui = props?.depenseAujourdHui ?? 0;
    const derniereDepense = props?.derniereDepense ?? null;

    return (
      <VStack
        alignment="leading"
        spacing={0}
        modifiers={[
          background(fond),
          padding({ all: 12 }),
          widgetURL("vista://ajout-rapide"),
        ]}
      >
        <Text modifiers={[font({ size: 13, weight: "bold" }), foregroundStyle(texte)]}>
          Vista
        </Text>
        <Spacer />
        {/* RÈGLE : centrage horizontal via HStack + Spacer de part et
            d'autre — voir la même note dans widgets/PlanningWidget.tsx. */}
        <HStack alignment="center">
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
              {"Ajouter une dépense"}
            </Text>
          </VStack>
          <Spacer />
        </HStack>
        <Spacer />
        {!estPetit && (
          <VStack alignment="leading" spacing={2}>
            <Text modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(texte)]}>
              {`Dépense aujourd'hui : ${Math.round(depenseAujourdHui)}€`}
            </Text>
            {derniereDepense && (
              <Text modifiers={[font({ size: 11 }), foregroundStyle(texteMuted)]}>
                {`Dernière : ${derniereDepense.nom} — ${Math.round(derniereDepense.montant)}€`}
              </Text>
            )}
          </VStack>
        )}
      </VStack>
    );
  },
);
