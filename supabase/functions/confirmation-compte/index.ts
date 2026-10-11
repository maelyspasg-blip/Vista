// Ancienne page de destination après clic sur le lien de confirmation email
// envoyé par Supabase Auth (inscription normale et conversion invité -> vrai
// compte, cf. app/onboarding/inscription.tsx). Supabase vérifie et confirme
// le compte côté serveur AVANT de rediriger ici — aucune logique de
// confirmation à faire ici.
//
// RÈGLE À NE JAMAIS CASSER (P072, 2026-10-11) : cette fonction ne sert plus
// AUCUN HTML. Sur le domaine par défaut *.supabase.co, Supabase réécrit toute
// réponse HTML d'une Edge Function en `text/plain` (sans charset) avec une
// CSP `sandbox` : le navigateur affichait le code source brut, sans styles
// ni script, et décodait mal l'UTF-8 (Ã© au lieu de é). La page vit
// désormais dans docs/confirmation/index.html (GitHub Pages) ; cette
// fonction se contente d'y rediriger, pour que les liens de confirmation
// déjà envoyés par email (qui pointent encore ici) restent valides.
//
// RÈGLE À NE JAMAIS CASSER : le `#` final est volontaire. Supabase arrive ici
// avec les jetons de session dans le fragment (#access_token=…&
// refresh_token=…) ; sans fragment dans `Location`, le navigateur le
// recopierait sur github.io (historique, barre d'adresse). Un fragment vide
// le remplace.
const PAGE_CONFIRMATION =
  "https://maelyspasg-blip.github.io/Vista/confirmation/#";

Deno.serve(() => {
  return new Response(null, {
    status: 302,
    headers: { Location: PAGE_CONFIRMATION },
  });
});
