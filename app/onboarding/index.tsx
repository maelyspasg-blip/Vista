import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
    StyleSheet,
    TouchableOpacity,
    View,
} from "react-native";
import Svg, { Rect } from "react-native-svg";
import { useGuest } from "../GuestContext";
import { marquerOnboardingVu } from "../onboardingStorage";
import { Text } from "../Texte";
import { BoutonPrincipal } from "../BoutonPrincipal";
import { useTheme } from "../ThemeContext";
import { styleModaleTablette, useEstTablette } from "../useTablette";
import { ESPACE_PARTAGE_ACTIF } from "../../utils/premium";

const PURPLE = "#8B6FE8";
const PURPLE_LIGHT = "#F0EEFF";
const MINT = "#5DC8A0";
const PEACH = "#F4956A";
// RÈGLE : même teal que le reste de l'app pour l'espace partagé (cf.
// palette Vista dans CLAUDE.md — #1D9E75), jamais une des 3 couleurs
// ci-dessus déjà utilisées par les slides de présentation "solo".
const TEAL = "#1D9E75";
const TEAL_LIGHT = "#E1F5EE";
// Violet "Partenaire" déjà utilisé partout où la vue partagée distingue
// les deux comptes (Aperçu/Budget/Stats/Planning, cf. CLAUDE.md) — jamais
// une couleur inventée ici pour ce même rôle.
const VIOLET_PARTENAIRE = "#c084fc";

type SlideStandard = {
  id: number;
  type: "standard";
  icone: React.ComponentProps<typeof Ionicons>["name"];
  titre: string;
  description: string;
  couleur: string;
  bg: string;
};

// RÈGLE : type distinct (pas juste un champ optionnel sur SlideStandard) —
// ce slide a sa propre composition (icône + titre + description + mockup
// Espace partagé + mini-carrousel, cf. le rendu conditionnel plus bas). Le
// distinguer par `type` évite un rendu accidentellement incomplet si un
// champ `icone`/`bg` manquait sur une variante "couple".
type SlideCouple = {
  id: number;
  type: "couple";
  titre: string;
  description: string;
  couleur: string;
};

type Slide = SlideStandard | SlideCouple;

const SLIDE_APERCU: SlideStandard = {
  id: 1,
  type: "standard",
  icone: "hand-right-outline",
  titre: "Bienvenue sur Vista",
  description:
    "Ton assistant financier personnel. Suis tes dépenses, anticipe tes besoins et garde le contrôle de ton budget.",
  couleur: PURPLE,
  bg: PURPLE_LIGHT,
};
const SLIDE_BUDGET: SlideStandard = {
  id: 3,
  type: "standard",
  icone: "wallet-outline",
  titre: "Pilote ton budget",
  description:
    "Crée tes catégories, suis tes dépenses en temps réel et visualise ton prévisionnel du mois.",
  couleur: MINT,
  bg: "#E8F8F2",
};
const SLIDE_PLANNING: SlideStandard = {
  id: 4,
  type: "standard",
  icone: "calendar-outline",
  titre: "Organise ta semaine",
  description:
    "Planifie tes événements et connecte ton agenda à ton budget pour une vision complète de ta vie.",
  couleur: PEACH,
  bg: "#FFF0EA",
};

// RÈGLE À NE JAMAIS CASSER : ordre des 3 slides de présentation "solo" —
// SLIDE_COUPLE (juste en dessous) s'insère entre SLIDE_APERCU et
// SLIDE_BUDGET (cf. calcul de `slides` plus bas), jamais à la fin de ce
// tableau.
const SLIDES_PRESENTATION: SlideStandard[] = [
  SLIDE_APERCU,
  SLIDE_BUDGET,
  SLIDE_PLANNING,
];

// RÈGLE À NE JAMAIS CASSER — ÉCRAN "VISTA À DEUX" (roadmap) : positionné
// JUSTE APRÈS le slide Aperçu (demande du 2026-09-13, corrige un
// positionnement précédent en toute fin de présentation) — cf. le calcul
// de `slides` plus bas, jamais ajouté ailleurs dans le tableau. Présente
// l'espace partagé comme une extension naturelle d'Aperçu, pas comme un
// écran à part détaché du reste de la présentation. Visible UNIQUEMENT si
// ESPACE_PARTAGE_ACTIF === true (feature encore désactivée en bêta, cf.
// utils/premium.ts) et jamais pour un compte invité (un essai de
// découverte n'a pas de partenaire à inviter).
const SLIDE_COUPLE: SlideCouple = {
  id: 2,
  type: "couple",
  titre: "Vista à deux",
  description:
    "Depuis votre Profil, accédez à la section Espace partagé pour inviter votre partenaire.",
  couleur: TEAL,
};

// RÈGLE À NE JAMAIS CASSER — MOCKUP EN VIEW (PAS EN SVG), CORRECTIF DU
// 2026-09-13 : la version précédente construisait ce mockup en primitives
// react-native-svg (Svg/Rect/Circle) — signalée par l'utilisateur comme ne
// s'affichant toujours pas correctement en test. Remplacée ici par une
// simple carte View/Text/Ionicons — approche plus simple et plus fiable,
// demande explicite. Ne jamais réintroduire de canvas SVG pour cet écran
// précis (les 3 mini-illustrations du carrousel plus bas, elles, restent en
// SVG — pas concernées par ce correctif).
//
// RÈGLE : mockup TRÈS simplifié de la section "Espace partagé" de la page
// Profil (pas les vrais composants de app/profil.tsx — ceci est une
// illustration marketing d'onboarding, jamais un vrai rendu de l'écran).
function MockupEspacePartage() {
  const { couleurs: C } = useTheme();
  return (
    <View style={[styles.mockupCarte, { backgroundColor: C.carte }]}>
      <View style={styles.mockupEntete}>
        <Ionicons name="people-outline" size={24} color={TEAL} />
        <Text style={[styles.mockupEnteteTexte, { color: C.texte }]}>
          Espace partagé
        </Text>
      </View>
      <Text style={[styles.mockupTexte, { color: C.texteMuted }]}>
        Crée un code d&apos;invitation et partage-le à ton partenaire
      </Text>
      <View style={[styles.mockupCodeBloc, { backgroundColor: `${TEAL}15` }]}>
        <Text style={styles.mockupCodeTexte}>VISTA-XXXXXX</Text>
        <Text style={[styles.mockupCodeLegende, { color: C.texteMuted }]}>
          Code d&apos;invitation
        </Text>
      </View>
    </View>
  );
}

// Mini illustration SVG 1/3 — code d'invitation stylisé + icône partage.
function IllustrationCode() {
  return (
    <View style={styles.illustrationCoupleLigne}>
      <View style={[styles.codeCarte, { borderColor: TEAL }]}>
        <Ionicons name="share-social-outline" size={20} color={TEAL} />
        <Text style={[styles.codeTexte, { color: TEAL }]}>VISTA-3F92K1</Text>
      </View>
    </View>
  );
}

// Mini illustration SVG 2/3 — deux jauges côte à côte, badges "Moi" /
// "Partenaire". Rect (react-native-svg) plutôt qu'une vraie jauge animée
// de l'app (GraphiqueDonutCouple etc.) — volontairement statique et
// simplifié, ceci est une illustration marketing d'onboarding, pas un vrai
// graphique de données.
function IllustrationJauges() {
  return (
    <View style={styles.illustrationCoupleLigne}>
      <View style={styles.jaugeColonne}>
        <View style={[styles.jaugeBadge, { backgroundColor: TEAL_LIGHT }]}>
          <Text style={[styles.jaugeBadgeTexte, { color: TEAL }]}>Moi</Text>
        </View>
        <Svg width={56} height={80}>
          <Rect x={4} y={0} width={48} height={80} rx={12} fill={`${TEAL}26`} />
          <Rect x={4} y={30} width={48} height={50} rx={12} fill={TEAL} />
        </Svg>
      </View>
      <View style={styles.jaugeColonne}>
        <View
          style={[
            styles.jaugeBadge,
            { backgroundColor: `${VIOLET_PARTENAIRE}26` },
          ]}
        >
          <Text style={[styles.jaugeBadgeTexte, { color: VIOLET_PARTENAIRE }]}>
            Partenaire
          </Text>
        </View>
        <Svg width={56} height={80}>
          <Rect
            x={4}
            y={0}
            width={48}
            height={80}
            rx={12}
            fill={`${VIOLET_PARTENAIRE}26`}
          />
          <Rect x={4} y={48} width={48} height={32} rx={12} fill={VIOLET_PARTENAIRE} />
        </Svg>
      </View>
    </View>
  );
}

// Mini illustration SVG 3/3 — balance partagée, deux prénoms + barre
// bicolore (même esprit que la "Balance partagée" réelle de Stats, en
// version très simplifiée pour l'onboarding).
function IllustrationBalance() {
  return (
    <View style={styles.illustrationCoupleLigne}>
      <View style={styles.balanceContenu}>
        <View style={styles.balanceNomsRow}>
          <Text style={[styles.balanceNom, { color: TEAL }]}>Toi</Text>
          <Text style={[styles.balanceNom, { color: VIOLET_PARTENAIRE }]}>
            Partenaire
          </Text>
        </View>
        <Svg width={200} height={20}>
          <Rect x={0} y={0} width={116} height={20} rx={10} fill={TEAL} />
          <Rect x={118} y={0} width={82} height={20} rx={10} fill={VIOLET_PARTENAIRE} />
        </Svg>
      </View>
    </View>
  );
}

const ILLUSTRATIONS_COUPLE = [
  IllustrationCode,
  IllustrationJauges,
  IllustrationBalance,
];
const DELAI_ROTATION_CARROUSEL_MS = 2000;

// RÈGLE À NE JAMAIS CASSER — DÉFILEMENT UNIQUEMENT PENDANT LE MONTAGE DE
// CE COMPOSANT : l'intervalle est créé/nettoyé par le cycle de vie normal
// de ce composant (monté seulement quand le slide "couple" est affiché,
// cf. site d'appel plus bas) — jamais un intervalle global qui tournerait
// aussi pendant les autres slides.
function CarrouselVistaADeux() {
  const [indexActuel, setIndexActuel] = useState(0);

  useEffect(() => {
    const intervalle = setInterval(() => {
      setIndexActuel((i) => (i + 1) % ILLUSTRATIONS_COUPLE.length);
    }, DELAI_ROTATION_CARROUSEL_MS);
    return () => clearInterval(intervalle);
  }, []);

  const Illustration = ILLUSTRATIONS_COUPLE[indexActuel];

  return (
    <View style={styles.carrouselCouple}>
      <Illustration />
      <View style={styles.carrouselDots}>
        {ILLUSTRATIONS_COUPLE.map((_, i) => (
          <View
            key={i}
            style={[
              styles.carrouselDot,
              {
                backgroundColor: i === indexActuel ? TEAL : "#E0E0E0",
                width: i === indexActuel ? 16 : 6,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

export default function Onboarding() {
  const router = useRouter();
  const estTablette = useEstTablette();
  const { isGuest } = useGuest();
  const [slideActuel, setSlideActuel] = useState(0);

  // RÈGLE : recalculé uniquement quand isGuest change — ESPACE_PARTAGE_ACTIF
  // est une constante de module, jamais besoin de la revalider ici.
  // RÈGLE : SLIDE_COUPLE inséré en position 1 (juste après SLIDE_APERCU),
  // jamais ajouté à la fin — cf. RÈGLE sur SLIDE_COUPLE plus haut.
  const slides = useMemo<Slide[]>(
    () =>
      ESPACE_PARTAGE_ACTIF && !isGuest
        ? [SLIDE_APERCU, SLIDE_COUPLE, SLIDE_BUDGET, SLIDE_PLANNING]
        : SLIDES_PRESENTATION,
    [isGuest],
  );
  // RÈGLE : log de diagnostic temporaire (demande explicite du 2026-09-13,
  // pour confirmer visuellement que SLIDE_COUPLE ("couple") est bien inclus
  // au bon index dès que ESPACE_PARTAGE_ACTIF===true et isGuest===false) —
  // à retirer une fois le diagnostic terminé, jamais destiné à rester en
  // production.
  console.log(
    "[Onboarding] slides:",
    slides.map((s) => s.id),
    { ESPACE_PARTAGE_ACTIF, isGuest },
  );

  const suivant = () => {
    if (slideActuel < slides.length - 1) {
      setSlideActuel(slideActuel + 1);
    } else {
      marquerOnboardingVu();
      router.push("/onboarding/inscription");
    }
  };

  const passer = () => {
    marquerOnboardingVu();
    router.push("/onboarding/inscription");
  };

  const slide = slides[slideActuel];
  const estDernierSlide = slideActuel === slides.length - 1;
  // RÈGLE : le slide "couple" affiche toujours "Suivant", jamais
  // "Commencer" — quelle que soit sa position dans le tableau (demande
  // explicite) : ce n'est jamais lui la véritable validation finale.
  const texteBouton =
    slide.type === "couple" ? "Suivant" : estDernierSlide ? "Commencer" : "Suivant";

  return (
    <View style={styles.container}>
      {/* RÈGLE — iPad : colonne limitée à 560px — `container` est déjà
          `alignItems:"center"`, donc ce wrapper se centre naturellement.
          `illustration` (ci-dessous) est passée de "largeur d'écran - 56"
          en dur à "100%" pour que son bord suive ce wrapper au lieu de
          continuer à viser la largeur RÉELLE de l'appareil (bien plus
          large que 560px sur iPad). */}
      <View style={[{ width: "100%" }, styleModaleTablette(estTablette, 560)]}>
      <TouchableOpacity
        style={styles.skip}
        onPress={passer}
        activeOpacity={0.7}
      >
        <Text style={styles.skipTexte}>Passer</Text>
      </TouchableOpacity>

      {slide.type === "standard" ? (
        <>
          <View style={[styles.illustration, { backgroundColor: slide.bg }]}>
            <Ionicons name={slide.icone} size={80} color="#1A1A1A" />
          </View>
          <View style={styles.content}>
            <Text style={[styles.titre, { color: slide.couleur }]}>
              {slide.titre}
            </Text>
            <Text style={styles.description}>{slide.description}</Text>
          </View>
        </>
      ) : (
        // RÈGLE À NE JAMAIS CASSER — COMPOSITION DÉDIÉE AU SLIDE "COUPLE"
        // (restructurée le 2026-09-13, correctif suite à un mockup SVG ne
        // s'affichant pas de façon fiable) : icône people-outline en grand
        // D'ABORD, puis titre + description, puis la carte
        // MockupEspacePartage (View simple, pas de SVG), puis le
        // mini-carrousel. Ne jamais réutiliser `styles.illustration`
        // (hauteur fixe 280, pensée pour une simple icône) pour ce bloc,
        // qui a bien plus de contenu.
        <View style={styles.coupleContenu}>
          <Ionicons
            name="people-outline"
            size={48}
            color={TEAL}
            style={styles.coupleIconeTop}
          />
          <View style={styles.contentCouple}>
            <Text style={[styles.titre, { color: slide.couleur }]}>
              {slide.titre}
            </Text>
            <Text style={styles.description}>{slide.description}</Text>
          </View>

          <MockupEspacePartage />

          <CarrouselVistaADeux />
        </View>
      )}

      <View style={styles.dots}>
        {slides.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i === slideActuel ? slide.couleur : "#E0E0E0",
                width: i === slideActuel ? 24 : 8,
              },
            ]}
          />
        ))}
      </View>

      <BoutonPrincipal
        style={[styles.btnSuivant, { backgroundColor: slide.couleur }]}
        onPress={suivant}
        activeOpacity={0.8}
      >
        <Text style={styles.btnTexte}>{texteBouton}</Text>
      </BoutonPrincipal>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 40,
  },
  skip: { alignSelf: "flex-end", marginBottom: 20 },
  skipTexte: { fontSize: 14, color: "#BBBBBB" },
  illustration: {
    width: "100%",
    height: 280,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 40,
    gap: 16,
  },
  content: { alignItems: "center", marginBottom: 32 },
  titre: {
    fontSize: 26,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 14,
  },
  description: {
    fontSize: 15,
    color: "#888",
    textAlign: "center",
    lineHeight: 24,
  },
  dots: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 32,
    alignItems: "center",
  },
  dot: { height: 8, borderRadius: 4 },
  btnSuivant: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
  },
  btnTexte: { fontSize: 16, fontWeight: "600", color: "#FFFFFF" },
  // --- Slide "Vista à deux" ------------------------------------------------
  coupleContenu: { width: "100%", alignItems: "center", marginBottom: 18 },
  // RÈGLE : taille réduite (48, initialement 64) + marge resserrée — revue
  // du 2026-09-13, l'icône pleine taille aggravait de ~66px le risque de
  // dépassement vertical déjà documenté ci-dessous (chaque valeur de ce
  // bloc "Vista à deux" a été resserrée en réaction à ce même constat).
  coupleIconeTop: { marginBottom: 8 },
  // RÈGLE : marges/paddings resserrés en revue (2026-09-13, puis à nouveau
  // après l'ajout de coupleIconeTop ci-dessus) — risque de dépassement
  // vertical sur petit écran signalé (empilement icône+titre+intro +
  // mockup Espace partagé + carrousel + chrome partagé, sans ScrollView
  // dans ce fichier). Toujours à confirmer sur device avant diffusion
  // large — resserrer encore ou retirer coupleIconeTop (redondant avec
  // l'icône déjà présente dans MockupEspacePartage) si le dépassement est
  // confirmé.
  contentCouple: { alignItems: "center", marginBottom: 10 },
  // RÈGLE : `width:"100%"` plutôt que le `marginHorizontal` initialement
  // proposé — `container` applique déjà `paddingHorizontal:28` (cf. plus
  // haut), un marginHorizontal supplémentaire ici aurait doublé l'inset
  // (28+24) et inutilement rétréci la carte.
  mockupCarte: {
    width: "100%",
    borderRadius: 16,
    padding: 14,
    borderWidth: 2,
    borderColor: TEAL,
    marginBottom: 14,
  },
  mockupEntete: { flexDirection: "row", alignItems: "center", gap: 10 },
  mockupEnteteTexte: { fontWeight: "700", fontSize: 15 },
  mockupTexte: { marginTop: 6, fontSize: 13, lineHeight: 18 },
  mockupCodeBloc: { borderRadius: 10, padding: 10, marginTop: 10, alignItems: "center" },
  mockupCodeTexte: {
    fontFamily: "monospace",
    fontSize: 18,
    fontWeight: "700",
    color: TEAL,
  },
  mockupCodeLegende: { fontSize: 11, marginTop: 4 },
  carrouselCouple: { alignItems: "center", gap: 10 },
  illustrationCoupleLigne: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  carrouselDots: { flexDirection: "row", gap: 5, alignItems: "center" },
  carrouselDot: { height: 6, borderRadius: 3 },
  codeCarte: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    backgroundColor: "#FFFFFF",
  },
  codeTexte: { fontSize: 16, fontWeight: "700", letterSpacing: 1 },
  jaugeColonne: { alignItems: "center", gap: 8, marginHorizontal: 12 },
  jaugeBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  jaugeBadgeTexte: { fontSize: 11, fontWeight: "700" },
  balanceContenu: { alignItems: "center", gap: 10 },
  balanceNomsRow: { flexDirection: "row", justifyContent: "space-between", width: 200 },
  balanceNom: { fontSize: 12, fontWeight: "700" },
});
