import { createWidget } from "expo-widgets";
import { Divider, HStack, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  background,
  font,
  foregroundStyle,
  padding,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";

// RÈGLE À NE JAMAIS CASSER — AUCUNE ÉCRITURE SUPABASE DANS CE FICHIER : ce
// widget tourne dans une extension iOS séparée, sans accès réseau/session
// Supabase de l'app principale — il ne doit JAMAIS contenir d'appel
// .delete()/.update()/.insert()/.upsert(), ni même tenter d'importer
// supabaseClient. Toute donnée provient d'un snapshot déjà préparé et
// poussé par utils/widgetsSync.ts (app principale) — jamais une lecture ou
// écriture directe. Toute écriture Supabase réelle vit dans app/store.ts
// (cf. RÈGLE DE SÉCURITÉ en tête de ce fichier).
//
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
  estFinancier: boolean;
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
    // RÈGLE À NE JAMAIS CASSER : la directive "widget" doit rester la toute
    // première instruction du corps de cette fonction — c'est le marqueur
    // que le plugin babel expo-widgets/widgets-plugin utilise pour repérer
    // et extraire ce corps de fonction afin de le sérialiser pour
    // l'extension widget (même rôle que "worklet" pour react-native-
    // reanimated). Sans elle en première position, le plugin ne reconnaît
    // pas la fonction comme un widget et la sérialisation échoue ou prend
    // le mauvais corps.
    "widget";

    // RÈGLE À NE JAMAIS CASSER — PALETTE VISTA STRICTE : uniquement ces 2
    // couleurs de marque + fond blanc/#0D1B2A, jamais une couleur inventée
    // pour ce widget — cohérence avec le reste de l'app (cf. ThemeContext).
    const navy = "#2D3A4A";
    const teal = "#1D9E75";
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
    // "[WidgetRenderSession] Invalidated". En attendant, le header affiche
    // uniquement le wordmark texte "Vista" — jamais l'icône PNG.
    void props?.logoUri;

    // RÈGLE À NE JAMAIS CASSER — 3 TAILLES, 3 DENSITÉS : small = juste le
    // prochain événement (ou l'état vide), pas de liste — pas la place.
    // medium = liste plafonnée (agenda utile sans déborder). large = agenda
    // quasi complet (plus de place verticale). Toujours brancher sur
    // `environment.widgetFamily`, jamais un layout unique qui déborderait
    // ou resterait trop vide selon la taille réellement affichée.
    const estPetit = environment.widgetFamily === "systemSmall";
    const estGrand = environment.widgetFamily === "systemLarge";
    const MAX_EVENEMENTS_AFFICHES = estGrand ? 8 : 4;
    const tousEvenements = props?.evenements ?? [];
    const evenementsAffiches = tousEvenements.slice(0, MAX_EVENEMENTS_AFFICHES);
    const nbAutres = tousEvenements.length - evenementsAffiches.length;
    const prochain = tousEvenements.find((e) => !e.estPasse);
    const tousPasses = tousEvenements.length > 0 && !prochain;

    return (
      <VStack
        alignment="leading"
        spacing={0}
        modifiers={[
          background(fond),
          padding({ all: 12 }),
          widgetURL("vista://planning"),
        ]}
      >
        <Text modifiers={[font({ size: 13, weight: "bold" }), foregroundStyle(texte)]}>
          Vista
        </Text>
        <Spacer minLength={4} />
        <Text modifiers={[font({ size: 12 }), foregroundStyle(texteMuted)]}>
          {dateFormatee}
        </Text>
        <Spacer minLength={10} />
        {estPetit ? (
          prochain ? (
            <VStack alignment="leading" spacing={2}>
              <Text
                modifiers={[font({ size: 12, weight: "bold" }), foregroundStyle(teal)]}
              >
                {prochain.heureDebut}
              </Text>
              <Text modifiers={[font({ size: 13, weight: "semibold" }), foregroundStyle(texte)]}>
                {prochain.nom}
              </Text>
            </VStack>
          ) : (
            <Text modifiers={[font({ size: 12 }), foregroundStyle(texteMuted)]}>
              {tousPasses ? "Bonne fin de journée" : "Aucun événement aujourd'hui"}
            </Text>
          )
        ) : evenementsAffiches.length > 0 ? (
          <VStack alignment="leading" spacing={6}>
            {evenementsAffiches.map((e, i) => (
              <VStack key={`${e.heureDebut}-${e.nom}-${i}`} alignment="leading" spacing={6}>
                <HStack alignment="center" spacing={6}>
                  <Text
                    modifiers={[font({ size: 12, weight: "bold" }), foregroundStyle(teal)]}
                  >
                    {e.heureDebut}
                  </Text>
                  <Text modifiers={[font({ size: 13 }), foregroundStyle(texte)]}>
                    {e.nom}
                  </Text>
                  <Spacer />
                  {e.estFinancier && (
                    <Text modifiers={[font({ size: 12 }), foregroundStyle(texteMuted)]}>
                      €
                    </Text>
                  )}
                </HStack>
                {i < evenementsAffiches.length - 1 && <Divider />}
              </VStack>
            ))}
          </VStack>
        ) : (
          // RÈGLE : pas de maxWidth "infini" fiable dans ce pont SwiftUI —
          // centrage via le classique HStack + Spacer de part et d'autre
          // plutôt qu'un frame(maxWidth:alignment:) potentiellement mal
          // ponté.
          <HStack alignment="center">
            <Spacer />
            <Text
              modifiers={[
                font({ size: 12 }),
                foregroundStyle(texteMuted),
                padding({ vertical: 8 }),
              ]}
            >
              {"Aucun événement aujourd'hui"}
            </Text>
            <Spacer />
          </HStack>
        )}
        {!estPetit && nbAutres > 0 && (
          <Text
            modifiers={[
              font({ size: 11 }),
              foregroundStyle(texteMuted),
              padding({ top: 6 }),
            ]}
          >
            +{nbAutres} autres
          </Text>
        )}
      </VStack>
    );
  },
);
