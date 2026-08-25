import { createWidget } from "expo-widgets";
import { HStack, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  background,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  padding,
  shapes,
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

    // RÈGLE À NE JAMAIS CASSER — LOGO ENCORE VOLONTAIREMENT PAS RENDU :
    // logoUri est reçu mais reste inutilisé tant que le crash natif
    // "[WidgetRenderSession] Invalidated" (crash pendant la construction
    // SwiftUI, après que le JS ait déjà réussi — donc invisible côté
    // red-box) n'est pas confirmé stable sur device avec <Image
    // uiImage=.../>. Décision reconfirmée explicitement lors du redesign
    // premium ci-dessous : le header garde le wordmark texte "Vista" seul,
    // jamais l'icône PNG, tant que ce checkpoint n'a pas été validé sur un
    // vrai device (impossible à faire depuis cet environnement).
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
          padding({ all: 12 }),
          widgetURL("vista://ajout-rapide"),
          // RÈGLE À NE JAMAIS CASSER — containerBackground, PAS background :
          // voir la même RÈGLE détaillée dans widgets/PlanningWidget.tsx —
          // seul containerBackground(_, "widget") couvre tout le canevas du
          // widget (padding inclus) et évite le fond système par défaut
          // (parfois sombre) qui pouvait apparaître avec un simple
          // background() sur iOS 17+.
          containerBackground(fond, "widget"),
        ]}
      >
        <Text modifiers={[font({ size: 11, weight: "bold" }), foregroundStyle(teal)]}>
          Vista
        </Text>
        <Spacer />
        {estPetit ? (
          <VStack alignment="leading" spacing={0}>
            {/* RÈGLE : centrage horizontal via HStack + Spacer de part et
                d'autre — voir la même note dans widgets/PlanningWidget.tsx. */}
            <HStack alignment="center">
              <Spacer />
              <VStack alignment="center" spacing={8}>
                {/* RÈGLE : bouton "+" — cercle teal 56px de diamètre, icône
                    36px, blanc pour contraster. Même taille sur small et
                    medium pour une identité visuelle cohérente (identique
                    plus bas dans la branche medium). */}
                <Text
                  modifiers={[
                    font({ size: 36, weight: "bold" }),
                    foregroundStyle("#FFFFFF"),
                    frame({ width: 56, height: 56, alignment: "center" }),
                    background(teal, shapes.circle()),
                  ]}
                >
                  +
                </Text>
                <Text
                  modifiers={[font({ size: 12, weight: "bold" }), foregroundStyle(texte)]}
                >
                  Nouvelle dépense
                </Text>
              </VStack>
              <Spacer />
            </HStack>
            <Spacer />
            {depenseAujourdHui > 0 && (
              <HStack alignment="center">
                <Spacer />
                <Text modifiers={[font({ size: 10 }), foregroundStyle(texteMuted)]}>
                  {`Aujourd'hui : ${Math.round(depenseAujourdHui)}€`}
                </Text>
                <Spacer />
              </HStack>
            )}
          </VStack>
        ) : (
          <VStack alignment="leading" spacing={0}>
            <HStack alignment="center">
              <Text
                modifiers={[
                  font({ size: 36, weight: "bold" }),
                  foregroundStyle("#FFFFFF"),
                  frame({ width: 56, height: 56, alignment: "center" }),
                  background(teal, shapes.circle()),
                ]}
              >
                +
              </Text>
              <Spacer />
              <VStack alignment="trailing" spacing={2}>
                <Text modifiers={[font({ size: 11 }), foregroundStyle(texteMuted)]}>
                  Aujourd&apos;hui
                </Text>
                <Text
                  modifiers={[font({ size: 20, weight: "bold" }), foregroundStyle(texte)]}
                >
                  {`${Math.round(depenseAujourdHui)}€`}
                </Text>
                <Text modifiers={[font({ size: 10 }), foregroundStyle(texteMuted)]}>
                  dépensé
                </Text>
              </VStack>
            </HStack>
            {derniereDepense && (
              <VStack alignment="leading" spacing={0}>
                <Spacer minLength={8} />
                <HStack alignment="center">
                  <Spacer />
                  <Text modifiers={[font({ size: 10 }), foregroundStyle(texteMuted)]}>
                    {`${derniereDepense.nom} — ${Math.round(derniereDepense.montant)}€`}
                  </Text>
                </HStack>
              </VStack>
            )}
          </VStack>
        )}
      </VStack>
    );
  },
);
