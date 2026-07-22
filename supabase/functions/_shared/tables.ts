// Tables contenant des données utilisateur, dans l'ordre de suppression
// (avant de supprimer le compte auth.users lui-même). Partagé entre
// delete-account et cleanup-expired-guests pour rester synchronisé.
export const TABLES_UTILISATEUR = [
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
