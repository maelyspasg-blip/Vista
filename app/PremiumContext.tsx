import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { chargerPremiumSimule, sauvegarderPremiumSimule } from "../utils/premium";

type PremiumContextValue = {
  estPremium: boolean;
  definirPremium: (actif: boolean) => void;
  simulerNonPremium: boolean;
  definirSimulerNonPremium: (actif: boolean) => void;
};

const PremiumContext = createContext<PremiumContextValue | null>(null);

export function PremiumProvider({ children }: { children: ReactNode }) {
  const [estPremium, setEstPremium] = useState(false);
  // RÈGLE À NE JAMAIS CASSER : contrairement à estPremium (persisté via
  // AsyncStorage), simulerNonPremium n'est JAMAIS lu/écrit sur disque — un
  // simple state en mémoire suffit et c'est justement le comportement
  // recherché : revenir à false à chaque redémarrage de l'app, jamais
  // rester bloqué en "vue non-premium" d'une session à l'autre.
  const [simulerNonPremium, setSimulerNonPremium] = useState(false);

  useEffect(() => {
    chargerPremiumSimule().then(setEstPremium);
  }, []);

  const definirPremium = (actif: boolean) => {
    setEstPremium(actif);
    sauvegarderPremiumSimule(actif);
  };

  return (
    <PremiumContext.Provider
      value={{
        estPremium,
        definirPremium,
        simulerNonPremium,
        definirSimulerNonPremium: setSimulerNonPremium,
      }}
    >
      {children}
    </PremiumContext.Provider>
  );
}

export function usePremium() {
  const ctx = useContext(PremiumContext);
  if (!ctx) {
    throw new Error("usePremium doit être utilisé dans PremiumProvider");
  }
  return ctx;
}
