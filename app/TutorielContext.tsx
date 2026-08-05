import { createContext, useContext } from "react";

// Statut des tutoriels de premier lancement (coach marks), alimenté
// uniquement par app/_layout.tsx — même principe que GuestContext.tsx : une
// seule lecture des colonnes profils au démarrage, pas de requête dupliquée
// par page. true = déjà vu, ne rien afficher.
export type PageTutoriel = "apercu" | "budget" | "planning" | "stats";

export type TutorielStatus = {
  apercu: boolean;
  budget: boolean;
  planning: boolean;
  stats: boolean;
  // Marque une page comme vue : persiste en base et met à jour l'état local
  // (sans re-fetch), pour que l'overlay se ferme immédiatement et ne
  // réapparaisse plus tant que "Revoir le tutoriel" n'est pas utilisé.
  marquerVu: (page: PageTutoriel) => void;
  // "Revoir le tutoriel" (profil.tsx) : repasse les 4 flags à false, comme
  // au tout premier lancement — chaque page réaffichera alors son tutoriel
  // à son prochain focus.
  reinitialiser: () => void;
};

export const TutorielContext = createContext<TutorielStatus>({
  apercu: true,
  budget: true,
  planning: true,
  stats: true,
  marquerVu: () => {},
  reinitialiser: () => {},
});

export function useTutoriel() {
  return useContext(TutorielContext);
}
