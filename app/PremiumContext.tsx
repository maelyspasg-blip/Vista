import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { chargerPremiumSimule, purgerPremiumSimule, sauvegarderPremiumSimule } from "../utils/premium";
import { supabase } from "../supabaseClient";

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
    // RÈGLE À NE JAMAIS CASSER — ISOLATION ENTRE COMPTES : ce Provider est
    // monté UNE SEULE FOIS pour toute la durée de vie de l'app (racine de
    // app/_layout.tsx) — son state (estPremium, simulerNonPremium) survit
    // donc à n'importe quelle déconnexion/reconnexion sans ce listener.
    // Sur SIGNED_OUT, on revient aux valeurs par défaut ET on purge
    // AsyncStorage (cf. purgerPremiumSimule), sinon le prochain compte
    // connecté sur cet appareil (invité ou non) hériterait du badge/anneau
    // Premium d'un compte précédent — même mécanisme que
    // reinitialiserEtatUtilisateur dans app/store.ts.
    const { data: abonnement } = supabase.auth.onAuthStateChange((evenement) => {
      if (evenement === "SIGNED_OUT") {
        setEstPremium(false);
        setSimulerNonPremium(false);
        purgerPremiumSimule();
      }
    });
    return () => abonnement.subscription.unsubscribe();
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
