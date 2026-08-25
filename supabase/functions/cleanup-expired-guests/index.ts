import { createClient } from "npm:@supabase/supabase-js@2";
import { supprimerDonneesUtilisateur } from "../_shared/tables.ts";

// Invoquée quotidiennement (Supabase Dashboard -> Integrations -> Cron
// Jobs -> Invoke Edge Function). Source de vérité pour l'expiration du mode
// invité à 7 jours : supprime toutes les données + le compte auth des
// invités dont guest_expires_at est dépassé, que la personne rouvre l'app
// ou non. Le check côté app (_layout.tsx) n'est qu'un garde-fou UX, pas le
// mécanisme de suppression.
Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CLEANUP_CRON_SECRET");
  if (cronSecret && req.headers.get("Authorization") !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: "Non autorisé" }), {
      status: 401,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const { data: invitesExpires, error: erreurSelect } = await supabaseAdmin
    .from("profils")
    .select("user_id")
    .eq("is_guest", true)
    .lt("guest_expires_at", new Date().toISOString());

  if (erreurSelect) {
    return new Response(
      JSON.stringify({ error: `Échec lecture invités expirés : ${erreurSelect.message}` }),
      { status: 500 },
    );
  }

  const resultats: Record<string, string> = {};

  for (const { user_id } of invitesExpires ?? []) {
    const erreurDonnees = await supprimerDonneesUtilisateur(supabaseAdmin, user_id);
    if (erreurDonnees) {
      resultats[user_id] = erreurDonnees;
      continue;
    }

    const { error: erreurSuppression } =
      await supabaseAdmin.auth.admin.deleteUser(user_id);
    resultats[user_id] = erreurSuppression ? erreurSuppression.message : "supprimé";
  }

  return new Response(
    JSON.stringify({ traites: invitesExpires?.length ?? 0, resultats }),
    { status: 200 },
  );
});
