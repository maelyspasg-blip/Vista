import { createContext, useContext, useState } from "react";

export type Theme = "clair" | "sombre";

export const COULEURS = {
  clair: {
    fond: "#F5F6F8",
    fondPage: "#FFFFFF",
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

type ThemeContextType = {
  theme: Theme;
  couleurs: typeof COULEURS.clair;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: "clair",
  couleurs: COULEURS.clair,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("clair");

  const toggleTheme = () => {
    setTheme((t) => (t === "clair" ? "sombre" : "clair"));
  };

  return (
    <ThemeContext.Provider
      value={{ theme, couleurs: COULEURS[theme], toggleTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
