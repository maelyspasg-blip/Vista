import { createClient } from "npm:@supabase/supabase-js@2";

const TABLES_UTILISATEUR = [
  "transactions",
  "evenements",
  "historique_paiements",
  "snapshot_enveloppes",
  "snapshot_objectifs",
  "snapshots_mois",
  "objectifs",
  "enveloppes",
  "profils",
];

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

  for (const table of TABLES_UTILISATEUR) {
    const { error } = await supabaseAdmin
      .from(table)
      .delete()
      .eq("user_id", user.id);
    if (error) {
      return new Response(
        JSON.stringify({ error: `Échec suppression ${table} : ${error.message}` }),
        { status: 500 },
      );
    }
  }

  const { error: erreurSuppression } = await supabaseAdmin.auth.admin.deleteUser(
    user.id,
  );
  if (erreurSuppression) {
    return new Response(JSON.stringify({ error: erreurSuppression.message }), {
      status: 500,
    });
  }

  return new Response(JSON.stringify({ success: true }), { status: 200 });
});
