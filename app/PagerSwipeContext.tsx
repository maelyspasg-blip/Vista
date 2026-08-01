import { createContext, ReactNode, useContext, useState } from "react";

type PagerSwipeContextValue = {
  swipeOngletsActif: boolean;
  setSwipeOngletsActif: (actif: boolean) => void;
};

const PagerSwipeContext = createContext<PagerSwipeContextValue | null>(null);

export function PagerSwipeProvider({ children }: { children: ReactNode }) {
  const [swipeOngletsActif, setSwipeOngletsActif] = useState(true);

  return (
    <PagerSwipeContext.Provider
      value={{ swipeOngletsActif, setSwipeOngletsActif }}
    >
      {children}
    </PagerSwipeContext.Provider>
  );
}

/**
 * Permet à un écran (ex: le swipe jour/semaine de Planning) de désactiver
 * temporairement le swipe natif entre onglets pendant qu'un geste horizontal
 * interne est en cours, pour éviter que le PagerView du tab layout capte le
 * même geste en parallèle.
 */
export function usePagerSwipe() {
  const ctx = useContext(PagerSwipeContext);
  if (!ctx) {
    throw new Error("usePagerSwipe doit être utilisé dans PagerSwipeProvider");
  }
  return ctx;
}
