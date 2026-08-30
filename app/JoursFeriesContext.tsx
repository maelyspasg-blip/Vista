import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState } from "react";

// RÈGLE : préférence 100% locale (AsyncStorage), jamais synchronisée avec
// Supabase — contrairement à tailleTexte/reduireAnimations (profils, cf.
// AccessibiliteContext.tsx), l'affichage des jours fériés n'a aucune raison
// de suivre l'utilisateur d'un appareil à l'autre, cf. demande explicite.
const CLE_AFFICHER_JOURS_FERIES = "vista_afficher_jours_feries";

type JoursFeriesContextType = {
  afficherJoursFeries: boolean;
  setAfficherJoursFeries: (actif: boolean) => void;
};

const JoursFeriesContext = createContext<JoursFeriesContextType>({
  afficherJoursFeries: true,
  setAfficherJoursFeries: () => {},
});

export function JoursFeriesProvider({ children }: { children: React.ReactNode }) {
  // Activé par défaut tant que la valeur locale n'a pas encore été lue (cf.
  // effet ci-dessous) — un bref affichage des jours fériés avant qu'un
  // désactivage précédent ne soit rechargé est un compromis acceptable pour
  // ce réglage mineur (contrairement au thème, jamais de cache écrit avant
  // premier montage ici, cf. themeStorage.ts).
  const [afficherJoursFeries, setAfficherJoursFeriesState] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(CLE_AFFICHER_JOURS_FERIES)
      .then((valeur) => {
        if (valeur !== null) setAfficherJoursFeriesState(valeur === "true");
      })
      .catch(() => {
        // Best-effort : une erreur de lecture locale ne doit jamais faire
        // planter l'app, on garde simplement la valeur par défaut (activé).
      });
  }, []);

  const setAfficherJoursFeries = (actif: boolean) => {
    setAfficherJoursFeriesState(actif);
    AsyncStorage.setItem(CLE_AFFICHER_JOURS_FERIES, String(actif)).catch(() => {
      // Best-effort, même raison que ci-dessus.
    });
  };

  return (
    <JoursFeriesContext.Provider value={{ afficherJoursFeries, setAfficherJoursFeries }}>
      {children}
    </JoursFeriesContext.Provider>
  );
}

export function useJoursFeries() {
  return useContext(JoursFeriesContext);
}
