import { createClient } from "npm:@supabase/supabase-js@2";
import { supprimerDonneesUtilisateur } from "../_shared/tables.ts";

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Non authentifié" }), {
      status: 401,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: erreurUser,
  } = await supabaseUser.auth.getUser();

  if (erreurUser || !user) {
    return new Response(JSON.stringify({ error: "Session invalide" }), {
      status: 401,
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  // RÈGLE À NE JAMAIS CASSER — BEST-EFFORT, JAMAIS BLOQUÉ PAR UN ÉCHEC
  // PARTIEL : contrairement à cleanup-expired-guests (cron automatique, qui
  // reste volontairement conservateur et saute auth.admin.deleteUser en cas
  // d'erreur, pour laisser une trace à examiner), ici l'utilisateur a
  // explicitement demandé la suppression de SON compte — un échec isolé sur
  // UNE table (cf. RÈGLE dans supprimerDonneesUtilisateur) ne doit JAMAIS
  // empêcher la suppression du compte auth.users lui-même, qui reste
  // l'objectif principal et le plus visible pour l'utilisateur. Un
  // nettoyage de données partiel est signalé (avertissementDonnees) sans
  // jamais faire échouer la requête si le compte a bien été supprimé.
  const erreurDonnees = await supprimerDonneesUtilisateur(supabaseAdmin, user.id);
  if (erreurDonnees) {
    console.error("[delete-account] Nettoyage de données partiel :", erreurDonnees);
  }

  const { error: erreurSuppression } = await supabaseAdmin.auth.admin.deleteUser(
    user.id,
  );
  if (erreurSuppression) {
    return new Response(
      JSON.stringify({
        error: erreurSuppression.message,
        ...(erreurDonnees ? { avertissementDonnees: erreurDonnees } : {}),
      }),
      { status: 500 },
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      ...(erreurDonnees ? { avertissementDonnees: erreurDonnees } : {}),
    }),
    { status: 200 },
  );
});
