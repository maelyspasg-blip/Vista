import { supabase } from "../supabaseClient";

// RÈGLE À NE JAMAIS CASSER — RESTE DERRIÈRE ESPACE_PARTAGE_ACTIF : ce
// fichier est maintenant appelé depuis app/profil.tsx (modale "Espace
// partagé"), mais UNIQUEMENT depuis du JSX déjà gardé par
// `{ESPACE_PARTAGE_ACTIF && (...)}` (cf. utils/premium.ts) — tant que ce
// flag reste `false`, ce code ne s'exécute jamais dans la bêta TestFlight.
// Ne jamais appeler une fonction de ce fichier depuis un site qui n'est pas
// lui-même derrière cette même garde.
//
// RÈGLE : contrairement à la convention "aucune écriture Supabase" de
// utils/evenements.ts ou utils/premium.ts, ce fichier PEUT écrire dans
// Supabase — l'espace partagé porte sur des tables entièrement nouvelles
// (espaces_partages, membres_espace) qui n'appartiennent à aucun domaine
// déjà géré par app/store.ts, donc pas de risque de dupliquer une logique
// d'écriture existante. Mêmes garde-fous que le reste de l'app cependant :
// jamais de throw qui remonte à l'UI, toujours un retour sûr (null/tableau
// vide) en cas d'erreur, cf. RÈGLE générale du projet (CLAUDE.md).

export type EspacePartage = {
  id: string;
  code: string;
  createdAt: string;
  expireAt: string;
  // Prénom du créateur de l'espace, dénormalisé sur la ligne
  // espaces_partages à la création — cf. RÈGLE sur creerEspacePartage plus
  // bas pour pourquoi (RLS empêche de lire le profil d'un autre
  // utilisateur avant d'être soi-même membre de son espace).
  creeParPrenom: string | null;
};

// RÈGLE : raisons d'échec structurées, jamais un message texte brut ni une
// erreur Supabase — c'est à l'appelant (UI) de choisir le message humain
// affiché pour chaque raison (cf. app/profil.tsx), jamais ce module qui ne
// doit rien savoir de la présentation.
export type RaisonEchecRejoindre =
  | "code_invalide"
  | "code_expire"
  | "deja_membre"
  | "erreur_reseau";

export type ResultatRejoindreEspace =
  | { succes: true; espace: EspacePartage }
  | { succes: false; raison: RaisonEchecRejoindre };

export type MembreEspace = {
  id: string;
  espaceId: string;
  userId: string;
  role: string;
  createdAt: string;
  // Dénormalisé sur la ligne au moment où CE membre a rejoint/créé
  // l'espace (cf. RÈGLE dans creerEspacePartage/rejoindreEspacePartage) —
  // jamais lu depuis `profils` directement, RLS l'interdirait pour
  // n'importe qui d'autre que soi-même.
  prenom: string | null;
};

// RÈGLE À NE JAMAIS CASSER — prenomPartenaire, JAMAIS espace.creeParPrenom
// POUR AFFICHER "AVEC QUI" : creeParPrenom est le prénom du CRÉATEUR de
// l'espace, qui est SOI-MÊME quand on l'a créé (bug corrigé : "Tu es dans
// l'espace partagé de Louis" alors que Louis est l'utilisateur connecté).
// prenomPartenaire est calculé ici en identifiant, parmi `membres`, celui
// dont le userId N'EST PAS auth.uid() — c'est la SEULE source correcte du
// prénom "de l'autre" côté client, quel que soit qui a créé l'espace.
// `espace.creeParPrenom` reste utile UNIQUEMENT dans le flux de création
// (creerEspacePartage) et le flux de jointure (rejoindreEspacePartage), où
// il désigne bien "l'autre" par construction (on ne peut pas rejoindre son
// propre espace).
//
// RÈGLE À NE JAMAIS CASSER — "ACTIF" EXIGE 2 MEMBRES, JAMAIS 1 : un espace
// tout juste créé n'a que son créateur comme membre — le considérer
// "actif" à ce stade affichait la carte verte "Tu es dans l'espace partagé
// de [Prénom]" alors que personne n'avait encore rejoint (bug corrigé).
// `getMembreEspace()` distingue donc explicitement 3 états, jamais un
// simple booléen/objet-ou-null : `null` (aucun espace du tout),
// `{statut: "en_attente"}` (créé, un seul membre — le créateur, en attente
// que quelqu'un rejoigne avec le code), `{statut: "actif"}` (2 membres —
// prenomPartenaire est alors garanti non-null en pratique, mais typé
// nullable par cohérence défensive avec le reste du fichier).
export type EtatEspacePartage =
  | { statut: "en_attente"; code: string; expireAt: string }
  | {
      statut: "actif";
      espaceId: string;
      membres: MembreEspace[];
      prenomPartenaire: string | null;
    };

// RÈGLE : types volontairement DISTINCTS des Enveloppe/Transaction de
// app/store.ts — ce sont des données EN LECTURE SEULE d'un AUTRE
// utilisateur (jamais de champs d'édition, jamais fusionnées dans
// etat.enveloppes/etat.transactions), et les fonctions de mapping de
// store.ts (enveloppeDepuisLigne etc.) ne sont pas exportées. Champs
// strictement limités à ce que l'UI "vue partagée" affiche (cf. étape 3 du
// mode espace partagé, app/(tabs)/index.tsx).
//
// RÈGLE À NE JAMAIS CASSER — CHAMPS AU-DELÀ DE L'AFFICHAGE, NÉCESSAIRES AU
// CALCUL : recurrente/type/payee/repeteChaqueMois/moisComptage sont repris
// ici (en plus de id/nom/depense/budget/couleur) uniquement parce que
// utils/budget.ts::calculerResteEstimeCourant / entreesBudgetDuMois (SEULE
// source du "reste estimé", cf. RÈGLE dans app/(tabs)/index.tsx) en ont
// besoin pour filtrer correctement les catégories actives du mois et
// distinguer entrées reçues/attendues. Ce type reste structurellement
// compatible avec `Enveloppe` (app/store.ts) exprès, pour pouvoir passer un
// EnveloppePartenaire[] directement à ces fonctions sans dupliquer la
// formule côté partenaire — jamais recalculer resteEstime localement pour
// le partenaire, cf. étape 4 du mode espace partagé.
export type EnveloppePartenaire = {
  id: string;
  nom: string;
  depense: number;
  budget: number;
  couleur: string;
  type: "Fixe" | "Variable" | "Entrée";
  recurrente: boolean;
  dateFixe?: string;
  payee?: boolean;
  repeteChaqueMois?: boolean;
  moisComptage?: string;
};

export type TransactionPartenaire = {
  id: string;
  nom: string;
  montant: number;
  enveloppeId: string;
  date: string;
};

export type DonneesPartenaire = {
  enveloppes: EnveloppePartenaire[];
  transactions: TransactionPartenaire[];
};

// RÈGLE À NE JAMAIS CASSER — CRÉATION ENTIÈREMENT SERVEUR, VIA RPC : la
// génération du code ET son insertion se font maintenant DANS la fonction
// Postgres `creer_espace_partage()` (security definer, cf. migration
// 20260831110000), jamais côté client. Nécessaire depuis que la policy
// SELECT sur espaces_partages est restreinte aux membres
// (espaces_partages_select_membres) : un .insert().select() direct depuis
// le client ne pourrait plus jamais relire la ligne qu'il vient de créer,
// puisque son auteur n'est pas encore membre au moment de cet insert (cet
// ajout est une étape séparée). La fonction RPC fait les deux inserts
// (espace + membre propriétaire) et la lecture finale dans la MÊME
// transaction security definer, qui bypass RLS en interne — l'ordre des
// opérations n'a donc plus d'importance vis-à-vis de la lecture.
export async function creerEspacePartage(): Promise<EspacePartage | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase.rpc("creer_espace_partage");

    if (error || !data || data.length === 0) {
      console.error(
        "Supabase rpc creer_espace_partage a échoué :",
        error,
      );
      return null;
    }

    const espace = data[0];
    return {
      id: espace.id,
      code: espace.code,
      createdAt: espace.created_at,
      expireAt: espace.expire_at,
      creeParPrenom: espace.cree_par_prenom ?? null,
    };
  } catch (e) {
    console.error("creerEspacePartage a échoué :", e);
    return null;
  }
}

// RÈGLE À NE JAMAIS CASSER — 5 CAS DISTINGUÉS, JAMAIS UN null GÉNÉRIQUE, VIA
// RPC : résolution du code + vérif expiration + vérif déjà-membre + insert
// de la ligne membres_espace se font DANS `rejoindre_espace_par_code()`
// (security definer, cf. migration 20260831110000), en une seule opération
// atomique côté serveur — plus aucune requête directe du client sur
// espaces_partages/membres_espace pour rejoindre (les policies INSERT/
// SELECT correspondantes ont été fermées, cf. RÈGLE dans la migration). La
// fonction retourne un `statut` texte distinct par cas — jamais une
// exception PostgREST pour un cas métier normal, qui perdrait la
// distinction déjà construite ici pour les 4 messages utilisateur
// différents (cf. RaisonEchecRejoindre).
export async function rejoindreEspacePartage(
  code: string,
): Promise<ResultatRejoindreEspace> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { succes: false, raison: "erreur_reseau" };

    const codeNormalise = code.trim().toUpperCase();
    console.log("[espacePartage] recherche code:", codeNormalise);
    const { data, error } = await supabase.rpc("rejoindre_espace_par_code", {
      p_code: codeNormalise,
    });
    console.log("[espacePartage] résultat:", data, error);

    if (error) {
      console.error(
        "Supabase rpc rejoindre_espace_par_code a échoué :",
        error,
      );
      return { succes: false, raison: "erreur_reseau" };
    }

    const ligne = data?.[0];
    if (!ligne) return { succes: false, raison: "erreur_reseau" };

    if (
      ligne.statut === "code_invalide" ||
      ligne.statut === "code_expire" ||
      ligne.statut === "deja_membre"
    ) {
      return { succes: false, raison: ligne.statut };
    }
    if (ligne.statut !== "succes") {
      return { succes: false, raison: "erreur_reseau" };
    }

    return {
      succes: true,
      espace: {
        id: ligne.espace_id,
        code: ligne.code,
        createdAt: ligne.created_at,
        expireAt: ligne.expire_at,
        creeParPrenom: ligne.cree_par_prenom ?? null,
      },
    };
  } catch (e) {
    console.error("rejoindreEspacePartage a échoué :", e);
    return { succes: false, raison: "erreur_reseau" };
  }
}

// Récupère l'état de l'espace partagé de l'utilisateur courant. Retourne
// `null` si l'utilisateur n'est membre d'aucun espace, ou en cas d'erreur —
// jamais de throw (cf. RÈGLE en tête de fichier). Sinon, distingue
// "en_attente" (créateur seul, personne n'a encore rejoint avec le code)
// de "actif" (2 membres) — cf. RÈGLE À NE JAMAIS CASSER sur
// EtatEspacePartage ci-dessus.
export async function getMembreEspace(): Promise<EtatEspacePartage | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: mesMembres, error: erreurMesMembres } = await supabase
      .from("membres_espace")
      .select("*")
      .eq("user_id", user.id);

    if (erreurMesMembres) {
      console.error(
        "Supabase select membres_espace (own) a échoué :",
        erreurMesMembres,
      );
      return null;
    }
    if (!mesMembres || mesMembres.length === 0) return null;

    const espaceId = mesMembres[0].espace_id;
    const { data: tousLesMembres, error: erreurTousLesMembres } =
      await supabase
        .from("membres_espace")
        .select("*")
        .eq("espace_id", espaceId);

    if (erreurTousLesMembres) {
      console.error(
        "Supabase select membres_espace (espace) a échoué :",
        erreurTousLesMembres,
      );
      return null;
    }

    const membres = tousLesMembres ?? [];

    if (membres.length < 2) {
      const { data: espaceRow, error: erreurEspace } = await supabase
        .from("espaces_partages")
        .select("*")
        .eq("id", espaceId)
        .maybeSingle();

      if (erreurEspace || !espaceRow) {
        console.error(
          "Supabase select espaces_partages (getMembreEspace, en_attente) a échoué :",
          erreurEspace,
        );
        return null;
      }

      return {
        statut: "en_attente",
        code: espaceRow.code,
        expireAt: espaceRow.expire_at,
      };
    }

    const autreMembre = membres.find((m) => m.user_id !== user.id);

    return {
      statut: "actif",
      espaceId,
      membres: membres.map((m) => ({
        id: m.id,
        espaceId: m.espace_id,
        userId: m.user_id,
        role: m.role,
        createdAt: m.created_at,
        prenom: m.prenom ?? null,
      })),
      prenomPartenaire: autreMembre?.prenom ?? null,
    };
  } catch (e) {
    console.error("getMembreEspace a échoué :", e);
    return null;
  }
}

// RÈGLE À NE JAMAIS CASSER — LOGIQUE DE DÉPART ATOMIQUE, VIA RPC, JAMAIS UN
// DELETE CLIENT DIRECT : décision explicite de l'utilisateur — à 2 membres,
// quitter DISSOUT l'espace entier (les deux comptes sont déliés) ; à 3
// membres ou plus, seul l'appelant est retiré, l'espace continue pour les
// autres. Le comptage ET la décision (dissoudre vs retirer un seul membre)
// se font DANS quitter_espace_partage() (security definer, migration
// 20260831140000) — jamais reconstruits côté client à partir d'un nombre
// de membres qui pourrait être périmé au moment du clic (race entre deux
// membres qui quittent en même temps, notamment). L'appelant (app/profil.tsx)
// peut choisir le message de confirmation à afficher AVANT l'appel à partir
// de membres.length (juste pour l'UX), mais ne doit jamais faire confiance
// à ce nombre pour la logique elle-même.
export async function quitterEspacePartage(): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase.rpc("quitter_espace_partage");

    if (error) {
      console.error(
        "Supabase rpc quitter_espace_partage a échoué :",
        error,
      );
      return false;
    }
    return true;
  } catch (e) {
    console.error("quitterEspacePartage a échoué :", e);
    return false;
  }
}

// RÈGLE À NE JAMAIS CASSER — 'commun' EST UNE BARRIÈRE D'ACCÈS, JAMAIS UN
// SIMPLE FILTRE D'AFFICHAGE : la policy RLS (enveloppes_select_espace_partage/
// transactions_select_espace_partage, cf. migration 20260831120000) ne
// laisse de toute façon jamais passer une ligne 'personnel' d'un autre
// utilisateur — mais le filtre `.eq("attribue_a", "commun")` ci-dessous est
// posé explicitement EN PLUS, en défense en profondeur (même principe que
// le filtre user_id explicite déjà utilisé partout ailleurs dans l'app,
// cf. RÈGLE DE SÉCURITÉ dans app/store.ts) : jamais compter sur RLS comme
// seule ligne de défense, même quand elle est censée déjà suffire.
//
// Charge les enveloppes ET transactions marquées 'commun' d'un AUTRE
// membre du même espace partagé — tableaux vides si aucune donnée
// partagée ou en cas d'erreur (jamais de throw, cf. RÈGLE en tête de
// fichier). Lecture seule : ce module n'expose aucune fonction pour
// modifier les données d'un autre utilisateur, les policies RLS
// correspondantes (INSERT/UPDATE/DELETE) restent strictement "own" côté
// base de toute façon.
export async function chargerDonneesPartenaire(
  partenaireId: string,
): Promise<DonneesPartenaire> {
  try {
    // DEBUG TEMPORAIRE — à retirer une fois le bug de vue "Partagé"
    // diagnostiqué.
    console.log("[chargerDonneesPartenaire] appel pour:", partenaireId);
    const [
      { data: enveloppesData, error: erreurEnveloppes },
      { data: transactionsData, error: erreurTransactions },
    ] = await Promise.all([
      supabase
        .from("enveloppes")
        .select("*")
        .eq("user_id", partenaireId)
        .eq("attribue_a", "commun"),
      supabase
        .from("transactions")
        .select("*")
        .eq("user_id", partenaireId)
        .eq("attribue_a", "commun"),
    ]);

    // DEBUG TEMPORAIRE — idem.
    console.log(
      "[chargerDonneesPartenaire] résultat enveloppes:",
      enveloppesData,
      erreurEnveloppes,
    );

    if (erreurEnveloppes) {
      console.error(
        "Supabase select enveloppes (chargerDonneesPartenaire) a échoué :",
        erreurEnveloppes,
      );
    }
    if (erreurTransactions) {
      console.error(
        "Supabase select transactions (chargerDonneesPartenaire) a échoué :",
        erreurTransactions,
      );
    }

    return {
      enveloppes: (enveloppesData ?? []).map((e) => ({
        id: e.id,
        nom: e.nom,
        depense: e.depense,
        budget: e.budget,
        couleur: e.couleur,
        type: e.type,
        recurrente: !!e.recurrente,
        dateFixe: e.date_fixe ?? undefined,
        payee: e.payee ?? undefined,
        repeteChaqueMois: e.repete_chaque_mois ?? undefined,
        moisComptage: e.mois_comptage ?? undefined,
      })),
      transactions: (transactionsData ?? []).map((t) => ({
        id: t.id,
        nom: t.nom,
        montant: t.montant,
        enveloppeId: t.enveloppe_id,
        date: t.date,
      })),
    };
  } catch (e) {
    console.error("chargerDonneesPartenaire a échoué :", e);
    return { enveloppes: [], transactions: [] };
  }
}
