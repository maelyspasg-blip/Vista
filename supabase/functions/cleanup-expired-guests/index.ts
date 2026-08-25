import { createClient } from "npm:@supabase/supabase-js@2";
import { supprimerDonneesUtilisateur } from "../_shared/tables.ts";
import { CORS_HEADERS, reponseJSON } from "../_shared/cors.ts";

// Invoquée quotidiennement (Supabase Dashboard -> Integrations -> Cron
// Jobs -> Invoke Edge Function). Source de vérité pour l'expiration du mode
// invité à 7 jours : supprime toutes les données + le compte auth des
// invités dont guest_expires_at est dépassé, que la personne rouvre l'app
// ou non. Le check côté app (_layout.tsx) n'est qu'un garde-fou UX, pas le
// mécanisme de suppression.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  // RÈGLE À NE JAMAIS CASSER — SECRET TOUJOURS REQUIS, JAMAIS DE BYPASS
  // SILENCIEUX : auparavant `if (cronSecret && ...)` laissait passer TOUT
  // appelant dès lors que CLEANUP_CRON_SECRET n'était pas configuré côté
  // fonction — un attaquant pouvait alors déclencher la suppression en
  // masse de comptes invités sans aucune authentification. Un secret
  // absent doit bloquer l'accès (500, erreur de config serveur), jamais
  // l'ouvrir (401 silencieux permissif).
  const cronSecret = Deno.env.get("CLEANUP_CRON_SECRET");
  if (!cronSecret) {
    console.error("[cleanup-expired-guests] CLEANUP_CRON_SECRET non configuré côté serveur.");
    return reponseJSON({ error: "Fonction non configurée." }, 500);
  }
  if (req.headers.get("Authorization") !== `Bearer ${cronSecret}`) {
    return reponseJSON({ error: "Non autorisé" }, 401);
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
    console.error("[cleanup-expired-guests] Échec lecture invités expirés :", erreurSelect.message);
    return reponseJSON({ error: "Échec de lecture des comptes invités expirés." }, 500);
  }

  const resultats: Record<string, string> = {};

  for (const { user_id } of invitesExpires ?? []) {
    const erreurDonnees = await supprimerDonneesUtilisateur(supabaseAdmin, user_id);
    if (erreurDonnees) {
      console.error(`[cleanup-expired-guests] Nettoyage partiel pour ${user_id} :`, erreurDonnees);
      resultats[user_id] = "échec partiel (voir logs serveur)";
      continue;
    }

    const { error: erreurSuppression } =
      await supabaseAdmin.auth.admin.deleteUser(user_id);
    if (erreurSuppression) {
      console.error(`[cleanup-expired-guests] Échec suppression auth pour ${user_id} :`, erreurSuppression.message);
    }
    resultats[user_id] = erreurSuppression ? "échec (voir logs serveur)" : "supprimé";
  }

  return reponseJSON({ traites: invitesExpires?.length ?? 0, resultats }, 200);
});
