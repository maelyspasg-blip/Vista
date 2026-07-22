import { createContext, useContext, useState } from "react";
import { supabase } from "../supabaseClient";
import { useAccessibilite } from "./AccessibiliteContext";
import { signalerErreurSync } from "./store";

export type Theme = "clair" | "sombre";

export const COULEURS = {
  clair: {
    fond: "#F5F6F8",
    fondPage: "#F1EFF7",
    hero: "#2D3A4A",
    heroBanniereTexte: "rgba(255,255,255,0.8)",
    texte: "#2D3A4A",
    texteMuted: "#999999",
    texteHero: "#FFFFFF",
    accent: "#4DB8A0",
    accentLight: "#E1F5EE",
    accentText: "#0F6E56",
    peach: "#F4956A",
    peachLight: "#FFF0EA",
    peachText: "#993C1D",
    bleuGris: "#6B8CAE",
    bleuGrisLight: "#E8EDF2",
    lavande: "#C4C9E8",
    lavandeLight: "#ECEEF8",
    purple: "#8B6FE8",
    purpleLight: "#F0EEFF",
    purpleText: "#5A3DC4",
    vert: "#3FAE58",
    vertLight: "#E4F5E8",
    vertText: "#237A3A",
    carte: "#FFFFFF",
    carteBorder: "#E5E5EA",
    fondSecondaire: "#F5F6F8",
    separateur: "#E5E5EA",
    tabActif: "#2D3A4A",
    tabInactif: "#A0A8C0",
    iconeBouton: "#2D3A4A",
    iconeBoutonFond: "#E8EDF2",
  },
  sombre: {
    fond: "#0D1B2A",
    fondPage: "#1A2530",
    hero: "#0D1B2A",
    heroBanniereTexte: "rgba(196,201,232,0.8)",
    texte: "#C4C9E8",
    texteMuted: "#6B8CAE",
    texteHero: "#FFFFFF",
    accent: "#4DB8A0",
    accentLight: "rgba(77,184,160,0.12)",
    accentText: "#4DB8A0",
    peach: "#F4956A",
    peachLight: "rgba(244,149,106,0.12)",
    peachText: "#F4956A",
    bleuGris: "#6B8CAE",
    bleuGrisLight: "rgba(107,140,174,0.15)",
    lavande: "#C4C9E8",
    lavandeLight: "rgba(196,201,232,0.08)",
    purple: "#8B6FE8",
    purpleLight: "rgba(139,111,232,0.15)",
    purpleText: "#8B6FE8",
    vert: "#4CC26B",
    vertLight: "rgba(76,194,107,0.15)",
    vertText: "#4CC26B",
    carte: "#243041",
    carteBorder: "rgba(196,201,232,0.1)",
    fondSecondaire: "#1A2530",
    separateur: "rgba(196,201,232,0.1)",
    tabActif: "#4DB8A0",
    tabInactif: "#6B8CAE",
    iconeBouton: "#C4C9E8",
    iconeBoutonFond: "rgba(196,201,232,0.1)",
  },
};

// Contraste renforcé : assombrit le texte secondaire et les bordures/
// séparateurs (trop clairs par défaut pour bien ressortir) sans dupliquer
// toute la palette — seuls ces tokens changent.
const CONTRASTE_OVERRIDES: Record<Theme, Partial<typeof COULEURS.clair>> = {
  clair: {
    texteMuted: "#5C5C5C",
    carteBorder: "#B8B8C0",
    separateur: "#B8B8C0",
  },
  sombre: {
    texteMuted: "#4A6478",
    carteBorder: "rgba(196,201,232,0.35)",
    separateur: "rgba(196,201,232,0.35)",
  },
};

type ThemeContextType = {
  theme: Theme;
  couleurs: typeof COULEURS.clair;
  contrasteRenforce: boolean;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: "clair",
  couleurs: COULEURS.clair,
  contrasteRenforce: false,
  toggleTheme: () => {},
});

function majThemeSupabase(theme: Theme) {
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) return;
    supabase
      .from("profils")
      .update({ theme })
      .eq("user_id", user.id)
      .then(({ error }) => {
        if (error) {
          console.error("Supabase update theme a échoué :", error);
          signalerErreurSync(
            `Impossible de sauvegarder le thème : ${error.message}`,
          );
        }
      });
  });
}

export function ThemeProvider({
  children,
  themeInitial,
}: {
  children: React.ReactNode;
  themeInitial?: Theme;
}) {
  const [theme, setTheme] = useState<Theme>(themeInitial ?? "clair");
  const { contrasteRenforce } = useAccessibilite();

  const toggleTheme = () => {
    setTheme((t) => {
      const nouveau: Theme = t === "clair" ? "sombre" : "clair";
      majThemeSupabase(nouveau);
      return nouveau;
    });
  };

  const couleurs = contrasteRenforce
    ? { ...COULEURS[theme], ...CONTRASTE_OVERRIDES[theme] }
    : COULEURS[theme];

  return (
    <ThemeContext.Provider
      value={{ theme, couleurs, contrasteRenforce, toggleTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
