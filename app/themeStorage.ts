import AsyncStorage from "@react-native-async-storage/async-storage";
import { Theme } from "./ThemeContext";

// RÈGLE À NE JAMAIS CASSER — POURQUOI CE CACHE EXISTE : le splash JS
// (app/SplashScreen.tsx) s'affiche AVANT que la préférence de thème stockée
// en base (profils.theme) soit chargée — à ce stade, useTheme()/ThemeProvider
// ne sont pas encore montés (cf. RÈGLE dans app/_layout.tsx). Se replier sur
// useColorScheme() (le thème du SYSTÈME) est FAUX dès que l'utilisateur a
// choisi un thème différent de celui de son OS dans l'app (bug confirmé :
// splash toujours en navy malgré un thème "clair" choisi dans l'app, parce
// que l'OS du device était en mode sombre). Ce cache LOCAL (AsyncStorage,
// pas Supabase — pas besoin d'attendre le réseau) retient le DERNIER thème
// d'app connu, écrit à chaque chargement du profil ET à chaque bascule
// manuelle (cf. sites d'appel dans _layout.tsx et ThemeContext.tsx), pour
// que le splash du PROCHAIN lancement affiche immédiatement la bonne
// couleur sans attendre Supabase. Seul le tout premier lancement (aucune
// valeur en cache) retombe sur useColorScheme() en dernier recours.
const CLE_THEME_CACHE = "vista_theme_cache";

export async function getThemeCache(): Promise<Theme | null> {
  try {
    const valeur = await AsyncStorage.getItem(CLE_THEME_CACHE);
    return valeur === "clair" || valeur === "sombre" ? valeur : null;
  } catch {
    return null;
  }
}

export async function setThemeCache(theme: Theme): Promise<void> {
  try {
    await AsyncStorage.setItem(CLE_THEME_CACHE, theme);
  } catch {
    // Best-effort : une erreur d'écriture locale ne doit jamais faire
    // planter l'app, juste faire retomber le prochain splash sur
    // useColorScheme() au pire.
  }
}
