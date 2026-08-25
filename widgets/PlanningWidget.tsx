import { createWidget } from "expo-widgets";
import { Divider, HStack, Link, Spacer, Text, VStack } from "@expo/ui/swift-ui";
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
  // RÈGLE À NE JAMAIS CASSER — JAMAIS `null` ICI : voir la RÈGLE PROPS
  // TOUJOURS SÉRIALISABLES dans utils/widgetsSync.ts — une valeur `null`
  // explicite dans un champ optionnel a déjà causé un crash natif "Exception
  // in HostFunction" pour AjoutRapideWidget (cause confirmée par logs
  // device). `montant` reste donc toujours un nombre fini, 0 quand non
  // applicable (événement non financier) — jamais `| null`.
  montant: number;
};

// Une dépense réelle (Transaction, pas un événement de calendrier) du jour —
// cf. RÈGLE DONNÉES dans utils/widgetsSync.ts.
export type DepenseWidgetJour = {
  nom: string;
  montant: number;
};

// Un jour de la semaine affichée dans les tailles systemMedium/systemLarge
// — 7 entrées TOUJOURS DANS L'ORDRE lundi -> dimanche (garanti par
// utils/widgetsSync.ts, cf. RÈGLE là-bas), chacune avec ses propres
// événements et dépenses déjà filtrés/triés. `dateISO` ("YYYY-MM-DD") sert
// de clé stable pour le rendu, jamais reparsée en Date côté widget (cf.
// RÈGLE plus bas sur les constructions évitées dans le corps sérialisé).
export type JourSemaineWidget = {
  dateISO: string;
  jourMois: number;
  estAujourdHui: boolean;
  estPasse: boolean;
  evenements: EvenementWidgetJour[];
  depenses: DepenseWidgetJour[];
};

export type PlanningWidgetProps = {
  evenements?: EvenementWidgetJour[];
  semaine?: JourSemaineWidget[];
  // Somme des transactions par jour sur la semaine en cours — donnée brute
  // transmise pour cohérence avec le reste du snapshot (cf. RÈGLE DONNÉES
  // dans utils/widgetsSync.ts) ; le rendu actuel affiche le détail ligne par
  // ligne du jour sélectionné (semaine[i].depenses) plutôt que ce total,
  // mais les deux proviennent du même calcul côté sync, jamais de
  // divergence possible.
  depensesParJour?: { dateISO: string; total: number }[];
  // Horodatage (ms epoch) de la dernière synchro poussée par l'app — pas
  // affiché directement dans ce layout, transmis pour permettre un usage
  // futur (ex. état "à jour" dans une prochaine itération) sans nouvelle
  // migration de props.
  derniereMiseAJour?: number;
  logoUri?: string | null;
};

// Tout ce dont cette fonction a besoin (couleurs, jours/mois, formatage de
// date) est déclaré ICI, à l'intérieur — le plugin babel widgets-plugin ne
// sérialise que le corps de cette fonction fléchée pour le stocker dans
// l'App Group ; toute référence à une const/function déclarée en dehors
// (même dans ce même fichier) est absente du code réellement évalué côté
// widget et lève une ReferenceError silencieuse (cube rouge). Pour la même
// raison, on évite ici toute construction `new Date(...)` : seule
// `environment.date` (déjà une Date valide fournie par WidgetKit) est
// manipulée — jamais de nouvelle Date reconstruite depuis une string dans
// ce corps sérialisé, non éprouvé dans ce pont et impossible à tester
// depuis cet environnement (pas de simulateur/device disponible ici).
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
    // Lundi en premier (convention française) — distinct de `jours`
    // ci-dessus (dimanche en premier, aligné sur Date.getDay()), utilisé
    // uniquement pour l'abrégé affiché dans la rangée des 7 jours.
    const joursAbregesLundiPremier = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];

    const date = environment.date;
    const nomJour = jours[date.getDay()];
    const nomJourCapitalise = nomJour.charAt(0).toUpperCase() + nomJour.slice(1);
    const dateFormatee = `${nomJourCapitalise} ${date.getDate()} ${mois[date.getMonth()]}`;
    // Abrégé du jour courant (lundi = 0) — dérivé de `date.getDay()` (déjà
    // fourni, jamais une nouvelle Date), utilisé pour le repli défensif
    // ci-dessous quand `semaine` n'a pas encore 7 entrées réelles.
    const abregeAujourdHui = joursAbregesLundiPremier[(date.getDay() + 6) % 7];

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
    // Transmis pour usage futur (cf. RÈGLE sur PlanningWidgetProps
    // ci-dessus) — pas encore consommé par ce layout.
    void props?.depensesParJour;
    void props?.derniereMiseAJour;

    // RÈGLE À NE JAMAIS CASSER — 3 TAILLES, 3 DENSITÉS : small = juste le
    // prochain événement (ou l'état vide), pas de liste — pas la place,
    // layout INCHANGÉ par ce redesign. medium/large = mini-dashboard
    // hebdomadaire (rangée des 7 jours + agenda du jour sélectionné,
    // aujourd'hui par défaut — pas d'interactivité de widget ici, jamais
    // demandée et hors de portée sans App Intents). Toujours brancher sur
    // `environment.widgetFamily`, jamais un layout unique qui déborderait ou
    // resterait trop vide selon la taille réellement affichée.
    const estPetit = environment.widgetFamily === "systemSmall";
    const estGrand = environment.widgetFamily === "systemLarge";
    const MAX_ELEMENTS_AFFICHES = estGrand ? 4 : 3;

    // Événements du jour courant — utilisé UNIQUEMENT par le format small
    // (prochain événement), inchangé par ce redesign.
    const tousEvenements = props?.evenements ?? [];
    const prochain = tousEvenements.find((e) => !e.estPasse);
    const tousPasses = tousEvenements.length > 0 && !prochain;

    // RÈGLE — REPLI DÉFENSIF : `semaine` peut être absent (entrée de
    // timeline programmée avant une mise à jour de l'app qui l'a ajouté,
    // ou tout premier rendu avant la première synchro complète) — on
    // retombe alors sur un unique jour "aujourd'hui" reconstruit depuis
    // `evenements` (déjà fourni pour le format small), sans dépenses
    // (aucune source disponible dans ce repli), plutôt que d'afficher une
    // rangée de 7 jours vide ou cassée. `estSemaineComplete` pilote
    // l'abrégé affiché par colonne : par index (garanti lundi->dimanche)
    // quand la vraie semaine est là, sinon l'abrégé du jour courant déjà
    // calculé plus haut.
    const semaineRecue = props?.semaine ?? [];
    const estSemaineComplete = semaineRecue.length === 7;
    const semaineAffichee: JourSemaineWidget[] = estSemaineComplete
      ? semaineRecue
      : [
          {
            dateISO: "",
            jourMois: date.getDate(),
            estAujourdHui: true,
            estPasse: false,
            evenements: tousEvenements,
            depenses: [],
          },
        ];

    const jourSelectionne =
      semaineAffichee.find((j) => j.estAujourdHui) ?? semaineAffichee[0];
    const evenementsJour = jourSelectionne?.evenements ?? [];
    const depensesJour = jourSelectionne?.depenses ?? [];
    const evenementsNonFinanciers = evenementsJour.filter((e) => !e.estFinancier);
    const evenementsFinanciers = evenementsJour.filter((e) => e.estFinancier);

    // Format dépense demandé : "− 35 €  Courses" — même colonne gauche
    // (grasse, teal) que la colonne heure d'un événement, donc réutilise
    // exactement le même rendu à deux colonnes ci-dessous plutôt qu'un
    // second bloc JSX dédié.
    const formaterMontantDepense = (montant: number) => `− ${Math.round(montant)} €`;

    const lignesEvenements = evenementsNonFinanciers.map((e, i) => ({
      cle: `evt-${i}-${e.nom}`,
      colonneGauche: e.heureDebut,
      colonneDroite: e.nom,
    }));
    const lignesEvenementsFinanciers = evenementsFinanciers.map((e, i) => ({
      cle: `fin-${i}-${e.nom}`,
      colonneGauche: formaterMontantDepense(e.montant),
      colonneDroite: e.nom,
    }));
    const lignesDepenses = depensesJour.map((d, i) => ({
      cle: `dep-${i}-${d.nom}`,
      colonneGauche: formaterMontantDepense(d.montant),
      colonneDroite: d.nom,
    }));
    const toutesLesLignes = lignesEvenements
      .concat(lignesEvenementsFinanciers)
      .concat(lignesDepenses);
    const lignesAffichees = toutesLesLignes.slice(0, MAX_ELEMENTS_AFFICHES);
    const nbAutresElements = toutesLesLignes.length - lignesAffichees.length;

    return (
      <VStack
        alignment="leading"
        spacing={0}
        modifiers={[
          padding({ all: 12 }),
          widgetURL("vista://planning"),
          // RÈGLE À NE JAMAIS CASSER — containerBackground, PAS background,
          // POUR LE FOND DU WIDGET : sur iOS 17+, WidgetKit attend le fond
          // réel du widget via .containerBackground(_:for:.widget) — un
          // simple .background() ne peint que les bornes de la VStack (donc
          // pas la marge de padding autour), et laisse le système appliquer
          // SON PROPRE fond par défaut (souvent sombre/matériau) autour et
          // parfois à la place du nôtre selon l'OS/le contexte de rendu —
          // c'est ce qui causait le fond toujours sombre sur certains
          // devices même en thème clair. containerBackground couvre tout le
          // canevas du widget, y compris le padding, quel que soit le
          // device. Reste le tap target par défaut pour tout le widget SAUF
          // le bouton "+ Ajouter" ci-dessous (Link), qui prend le dessus sur
          // sa propre zone — combinaison standard WidgetKit, pas le cas
          // ambigu de "plusieurs widgetURL" (un seul ici).
          containerBackground(fond, "widget"),
        ]}
      >
        {estPetit ? (
          <VStack alignment="leading" spacing={0}>
            <Text modifiers={[font({ size: 13, weight: "bold" }), foregroundStyle(texte)]}>
              Vista
            </Text>
            <Spacer minLength={4} />
            <Text modifiers={[font({ size: 12 }), foregroundStyle(texteMuted)]}>
              {dateFormatee}
            </Text>
            <Spacer minLength={10} />
            {prochain ? (
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
            )}
          </VStack>
        ) : (
          <VStack alignment="leading" spacing={0}>
            <HStack alignment="center">
              <Text modifiers={[font({ size: 11, weight: "bold" }), foregroundStyle(teal)]}>
                Vista
              </Text>
              <Spacer />
              <Link
                label="+ Ajouter"
                destination="vista://ajout-rapide"
                modifiers={[
                  font({ size: 12, weight: "semibold" }),
                  foregroundStyle("#FFFFFF"),
                  padding({ horizontal: 10, vertical: 5 }),
                  background(teal, shapes.capsule()),
                ]}
              />
            </HStack>
            <Spacer minLength={10} />
            <HStack alignment="center">
              <Spacer />
              <HStack alignment="center" spacing={0}>
                {semaineAffichee.map((jour, i) => {
                  const couleurDate = jour.estAujourdHui
                    ? "#FFFFFF"
                    : jour.estPasse
                      ? texteMuted
                      : texte;
                  return (
                    <VStack
                      key={estSemaineComplete ? jour.dateISO : "aujourdhui"}
                      alignment="center"
                      spacing={4}
                      modifiers={[frame({ width: 30 })]}
                    >
                      <Text
                        modifiers={[
                          font({ size: 10, weight: "semibold" }),
                          foregroundStyle(texteMuted),
                        ]}
                      >
                        {estSemaineComplete ? joursAbregesLundiPremier[i] : abregeAujourdHui}
                      </Text>
                      <Text
                        modifiers={[
                          font({ size: 12, weight: jour.estAujourdHui ? "bold" : "regular" }),
                          foregroundStyle(couleurDate),
                          frame({ width: 22, height: 22, alignment: "center" }),
                          background(jour.estAujourdHui ? teal : "clear", shapes.circle()),
                        ]}
                      >
                        {jour.jourMois}
                      </Text>
                    </VStack>
                  );
                })}
              </HStack>
              <Spacer />
            </HStack>
            <Spacer minLength={10} />
            {lignesAffichees.length > 0 ? (
              <VStack alignment="leading" spacing={6}>
                {lignesAffichees.map((ligne, i) => (
                  <VStack key={ligne.cle} alignment="leading" spacing={6}>
                    <HStack alignment="center" spacing={6}>
                      <Text
                        modifiers={[font({ size: 12, weight: "bold" }), foregroundStyle(teal)]}
                      >
                        {ligne.colonneGauche}
                      </Text>
                      <Text modifiers={[font({ size: 13 }), foregroundStyle(texte)]}>
                        {ligne.colonneDroite}
                      </Text>
                      <Spacer />
                    </HStack>
                    {i < lignesAffichees.length - 1 && <Divider />}
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
                  {"Rien de prévu aujourd'hui"}
                </Text>
                <Spacer />
              </HStack>
            )}
            {nbAutresElements > 0 && (
              <Text
                modifiers={[
                  font({ size: 11 }),
                  foregroundStyle(texteMuted),
                  padding({ top: 6 }),
                ]}
              >
                +{nbAutresElements} autres
              </Text>
            )}
          </VStack>
        )}
      </VStack>
    );
  },
);
