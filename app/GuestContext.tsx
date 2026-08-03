import { createContext, useContext } from "react";

// Statut invité partagé, alimenté uniquement par app/_layout.tsx (seul
// endroit qui connaît is_guest/guest_expires_at avant même le premier
// rendu). Consommé par GuestBanner, analytics.tsx (flou des stats
// avancées) et profil.tsx (avertissement avant déconnexion) — évite à
// chacun de refaire sa propre requête profils (flash de contenu non
// protégé le temps du fetch, deux copies qui pourraient diverger).
export type GuestStatus = {
  isGuest: boolean;
  // ms restants avant guest_expires_at ; null si pas invité ou pas encore connu.
  msRestants: number | null;
};

export const GuestContext = createContext<GuestStatus>({
  isGuest: false,
  msRestants: null,
});

export function useGuest() {
  return useContext(GuestContext);
}
