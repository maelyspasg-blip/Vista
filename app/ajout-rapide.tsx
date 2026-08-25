import { Redirect } from "expo-router";

// RÈGLE À NE JAMAIS CASSER : cette route existe UNIQUEMENT comme cible du
// deep link vista://ajout-rapide (widget "Ajout rapide") — le formulaire
// d'ajout de dépense lui-même reste le <Modal> déjà géré par
// app/(tabs)/budget.tsx (state local modalAjoutVisible), jamais dupliqué
// ici. On redirige vers l'onglet Budget avec ?ouvrirAjout=1, que
// budget.tsx lit au montage pour ouvrir ce modal automatiquement — cf.
// RÈGLE dans budget.tsx à l'endroit où ce paramètre est lu.
export default function AjoutRapideRedirect() {
  return <Redirect href="/(tabs)/budget?ouvrirAjout=1" />;
}
