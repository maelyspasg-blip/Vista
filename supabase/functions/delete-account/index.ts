import { createClient } from "npm:@supabase/supabase-js@2";
import { supprimerDonneesUtilisateur } from "../_shared/tables.ts";
import { CORS_HEADERS, reponseJSON } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  // RÈGLE : préflight CORS — le SDK supabase-js envoie un header
  // Authorization personnalisé, ce qui déclenche une requête OPTIONS
  // préalable depuis un navigateur (Expo web). Sans réponse dédiée ici,
  // cette requête échouerait avant même d'atteindre la logique métier.
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return reponseJSON({ error: "Non authentifié" }, 401);
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
    return reponseJSON({ error: "Session invalide" }, 401);
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
    // RÈGLE : le détail Postgres/Auth (erreurSuppression.message,
    // erreurDonnees) reste dans les logs serveur (console.error, visibles
    // dans le dashboard Supabase) mais ne part jamais dans la réponse HTTP —
    // ni le client (app/profil.tsx) ni un attaquant potentiel ne doivent
    // recevoir de détails internes (noms de table, contraintes SQL...).
    console.error("[delete-account] Échec suppression auth.users :", erreurSuppression.message);
    return reponseJSON({ error: "Suppression du compte impossible pour le moment." }, 500);
  }

  return reponseJSON({ success: true }, 200);
});
