// RÈGLE À NE JAMAIS CASSER : `Access-Control-Allow-Origin: *` est
// délibéré, pas un oubli — ces fonctions sont appelées via
// supabase.functions.invoke(...) avec un header Authorization (Bearer JWT),
// jamais avec des cookies/`credentials: "include"`. Sans credentials
// cookie-based, `*` ne donne accès à rien qu'un attaquant n'a pas déjà
// (le JWT reste requis et validé côté fonction) — restreindre l'origin ne
// changerait pas la surface d'attaque ici, seulement la commodité de dev
// (Expo web tourne sur un port localhost différent à chaque run). Les
// headers listés sont volontairement minimaux (seuls ceux réellement
// envoyés par supabase-js), pas un `*` générique.
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function reponseJSON(
  corps: unknown,
  status: number,
): Response {
  return new Response(JSON.stringify(corps), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
