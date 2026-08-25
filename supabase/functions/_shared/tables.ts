import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// Tables scopées DIRECTEMENT par une colonne user_id — dans l'ordre de
// suppression (avant de supprimer le compte auth.users lui-même). Partagé
// entre delete-account et cleanup-expired-guests pour rester synchronisé.
export const TABLES_UTILISATEUR = [
  "transactions",
  "evenements",
  "historique_paiements",
  "snapshots_mois",
  "objectifs",
  "enveloppes",
  "profils",
];

// RÈGLE À NE JAMAIS CASSER : snapshot_enveloppes et snapshot_objectifs
// n'ont PAS de colonne user_id directe — scopées uniquement via
// snapshot_mois_id → snapshots_mois.user_id (même contrainte que
// app/store.ts::renommerCategoriePartout, qui documente la même
// particularité côté app). Un .eq("user_id", ...) direct sur l'une de ces
// deux tables échoue avec une erreur Postgres "column ... does not
// exist" — c'était la cause racine du bouton "Supprimer mon compte" qui ne
// faisait rien de visible : la fonction s'arrêtait en erreur dès cette
// étape, avant même d'atteindre auth.admin.deleteUser. Toujours les
// supprimer via snapshot_mois_id, et TOUJOURS avant snapshots_mois lui-même
// (contrainte FK ON DELETE NO ACTION, cf. migration
// 20260723090000_snapshot_fk_no_action.sql).
export const TABLES_SNAPSHOT_ENFANTS = ["snapshot_enveloppes", "snapshot_objectifs"];

// RÈGLE À NE JAMAIS CASSER — CHAQUE TABLE EST INDÉPENDANTE, JAMAIS
// D'ABANDON PRÉMATURÉ : un échec isolé sur UNE table (RLS, contrainte,
// erreur réseau transitoire...) ne doit JAMAIS empêcher la tentative de
// suppression des AUTRES tables — sinon un compte (invité ou normal) peut
// rester bloqué en suppression partielle, avec des données orphelines ET
// le compte auth.users toujours vivant (bug confirmé : "Supprimer mon
// compte" retournait une erreur HTTP et n'aboutissait à rien). Chaque
// `.delete()` est isolé dans son propre try/catch ; TOUTES les erreurs sont
// collectées (jamais seulement la première) et renvoyées concaténées à
// l'appelant, qui décide s'il tente quand même auth.admin.deleteUser malgré
// un nettoyage partiel (cf. RÈGLE dans delete-account/index.ts).
//
// Supprime, dans le bon ordre, TOUTES les données Supabase d'un
// utilisateur (jamais le compte auth.users lui-même, laissé à l'appelant
// juste après) — logique PARTAGÉE entre delete-account (suppression
// volontaire depuis Profil) et cleanup-expired-guests (expiration
// automatique des comptes invités à 7 jours), pour ne jamais avoir deux
// implémentations qui pourraient diverger. Retourne un message d'erreur
// combiné (ou null si tout s'est bien passé) plutôt que de lever une
// exception, pour laisser chaque appelant construire sa propre
// Response/résultat.
export async function supprimerDonneesUtilisateur(
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: SupabaseClient<any, any, any>,
  userId: string,
): Promise<string | null> {
  const erreurs: string[] = [];
  const messageErreur = (e: unknown): string =>
    e instanceof Error ? e.message : String(e);

  // Les tables enfants de snapshot n'ont pas de user_id direct — scopées
  // via snapshot_mois_id → snapshots_mois.user_id (cf. RÈGLE existante plus
  // bas). Un échec ICI (lecture des ids, ou suppression d'une des 2 tables
  // enfants) ne doit pas non plus bloquer le reste : on continue vers
  // TABLES_UTILISATEUR quoi qu'il arrive.
  try {
    const { data: snapshots, error: erreurSnapshots } = await supabaseAdmin
      .from("snapshots_mois")
      .select("id")
      .eq("user_id", userId);
    if (erreurSnapshots) {
      erreurs.push(`Lecture snapshots_mois : ${erreurSnapshots.message}`);
    } else {
      const snapshotIds = (snapshots ?? []).map((s: { id: string }) => s.id);
      if (snapshotIds.length > 0) {
        for (const table of TABLES_SNAPSHOT_ENFANTS) {
          try {
            const { error } = await supabaseAdmin
              .from(table)
              .delete()
              .in("snapshot_mois_id", snapshotIds);
            if (error) erreurs.push(`Suppression ${table} : ${error.message}`);
          } catch (e) {
            erreurs.push(`Suppression ${table} : ${messageErreur(e)}`);
          }
        }
      }
    }
  } catch (e) {
    erreurs.push(`Lecture snapshots_mois : ${messageErreur(e)}`);
  }

  for (const table of TABLES_UTILISATEUR) {
    try {
      const { error } = await supabaseAdmin.from(table).delete().eq("user_id", userId);
      if (error) erreurs.push(`Suppression ${table} : ${error.message}`);
    } catch (e) {
      erreurs.push(`Suppression ${table} : ${messageErreur(e)}`);
    }
  }

  return erreurs.length > 0 ? erreurs.join(" | ") : null;
}
