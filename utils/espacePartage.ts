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
};

// Caractères sans ambiguïté de lecture/saisie (exclut I/O/0/1) — un code
// d'invitation doit rester facile à recopier à la main entre deux
// téléphones.
const CARACTERES_CODE_INVITATION = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LONGUEUR_SUFFIXE_CODE = 6;

// Génère un code d'invitation au format "VISTA-XXXXXX" — calcul pur, ne
// touche pas Supabase. Utilisée par creerEspacePartage() ci-dessous pour
// produire le code AVANT insertion — jamais affichée à l'utilisateur sans
// être d'abord réellement enregistrée (cf. RÈGLE sur creerEspacePartage).
export function genererCodeInvitation(): string {
  let suffixe = "";
  for (let i = 0; i < LONGUEUR_SUFFIXE_CODE; i++) {
    suffixe +=
      CARACTERES_CODE_INVITATION[
        Math.floor(Math.random() * CARACTERES_CODE_INVITATION.length)
      ];
  }
  return `VISTA-${suffixe}`;
}

// RÈGLE À NE JAMAIS CASSER — LA SEULE FAÇON DE CRÉER UN ESPACE PARTAGÉ
// VALIDE : bug confirmé — un code affiché via genererCodeInvitation() SEUL
// (jamais inséré en base) est systématiquement rejeté par
// rejoindreEspacePartage() ("code invalide ou expiré"), non pas à cause
// d'un problème de policy RLS ou de requête, mais parce qu'AUCUNE ligne
// espaces_partages n'a jamais existé pour ce code — un SELECT sur une
// ligne qui n'existe pas retourne normalement 0 résultat, quelle que soit
// la policy. Cette fonction insère RÉELLEMENT la ligne avant de retourner
// le code, pour que le code affiché à l'utilisateur soit TOUJOURS
// rejoignable immédiatement après. Ne jamais afficher un code produit par
// genererCodeInvitation() seul dans l'UI sans passer par ici.
export async function creerEspacePartage(): Promise<EspacePartage | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // RÈGLE : le prénom du créateur est dénormalisé sur espaces_partages
    // ICI (au moment où l'utilisateur peut encore lire SON PROPRE profil,
    // toujours autorisé par profils_select_own) — c'est la seule fenêtre
    // où cette information est simplement accessible ; une fois l'espace
    // créé, un autre utilisateur qui le rejoint ne pourrait jamais lire ce
    // même profil directement (cf. RÈGLE sur le type EspacePartage).
    const { data: profil } = await supabase
      .from("profils")
      .select("prenom")
      .eq("user_id", user.id)
      .maybeSingle();

    const code = genererCodeInvitation();
    const { data: espace, error: erreurEspace } = await supabase
      .from("espaces_partages")
      .insert({ code, cree_par_prenom: profil?.prenom || null })
      .select()
      .single();

    if (erreurEspace || !espace) {
      console.error(
        "Supabase insert espaces_partages (creerEspacePartage) a échoué :",
        erreurEspace,
      );
      return null;
    }

    const { error: erreurMembre } = await supabase
      .from("membres_espace")
      .insert({ espace_id: espace.id, user_id: user.id, role: "proprietaire" });

    if (erreurMembre) {
      console.error(
        "Supabase insert membres_espace (creerEspacePartage) a échoué :",
        erreurMembre,
      );
      // L'espace existe et son code reste valide/rejoignable même si
      // l'ajout du créateur comme membre a échoué ici — ne pas bloquer sur
      // ce second insert, l'utilisateur peut retenter de rejoindre lui-même
      // son propre espace si besoin.
    }

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

// RÈGLE À NE JAMAIS CASSER — 5 CAS DISTINGUÉS, JAMAIS UN null GÉNÉRIQUE :
// résout le code en ligne espaces_partages, vérifie qu'il n'a pas expiré,
// vérifie que l'utilisateur n'est pas déjà membre, puis l'ajoute comme
// membre. Chaque échec retourne une `raison` précise (jamais un message ni
// une erreur Supabase brute, cf. RÈGLE sur RaisonEchecRejoindre) pour que
// l'UI (app/profil.tsx) affiche un message humain adapté à CHAQUE cas —
// jamais un message technique visible par l'utilisateur, jamais de throw.
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
    const { data: espace, error: erreurEspace } = await supabase
      .from("espaces_partages")
      .select("*")
      .eq("code", codeNormalise)
      .maybeSingle();
    console.log("[espacePartage] résultat:", espace, erreurEspace);

    if (erreurEspace) {
      console.error(
        "Supabase select espaces_partages (rejoindreEspacePartage) a échoué :",
        erreurEspace,
      );
      return { succes: false, raison: "erreur_reseau" };
    }
    // Cas 2 — code invalide : aucune ligne en base pour ce code.
    if (!espace) return { succes: false, raison: "code_invalide" };
    // Cas 3 — code expiré.
    if (new Date(espace.expire_at).getTime() <= Date.now()) {
      return { succes: false, raison: "code_expire" };
    }

    // Cas 4 — déjà membre : vérifié explicitement AVANT l'insert (la
    // contrainte unique (espace_id, user_id) côté base, cf. migration
    // 20260830140000, protège contre une course, mais un message humain
    // précis a besoin de le détecter en amont plutôt que d'interpréter une
    // erreur de contrainte après coup).
    const { data: membreExistant, error: erreurVerifMembre } = await supabase
      .from("membres_espace")
      .select("id")
      .eq("espace_id", espace.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (erreurVerifMembre) {
      console.error(
        "Supabase select membres_espace (vérif déjà membre) a échoué :",
        erreurVerifMembre,
      );
      return { succes: false, raison: "erreur_reseau" };
    }
    if (membreExistant) return { succes: false, raison: "deja_membre" };

    const { error: erreurMembre } = await supabase
      .from("membres_espace")
      .insert({ espace_id: espace.id, user_id: user.id, role: "membre" });

    if (erreurMembre) {
      console.error(
        "Supabase insert membres_espace (rejoindreEspacePartage) a échoué :",
        erreurMembre,
      );
      return { succes: false, raison: "erreur_reseau" };
    }

    return {
      succes: true,
      espace: {
        id: espace.id,
        code: espace.code,
        createdAt: espace.created_at,
        expireAt: espace.expire_at,
        creeParPrenom: espace.cree_par_prenom ?? null,
      },
    };
  } catch (e) {
    console.error("rejoindreEspacePartage a échoué :", e);
    return { succes: false, raison: "erreur_reseau" };
  }
}

// Récupère tous les membres de l'espace partagé de l'utilisateur courant
// (lui-même inclus) — tableau vide si l'utilisateur n'est membre d'aucun
// espace, ou en cas d'erreur.
export async function getMembreEspace(): Promise<MembreEspace[]> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data: mesMembres, error: erreurMesMembres } = await supabase
      .from("membres_espace")
      .select("*")
      .eq("user_id", user.id);

    if (erreurMesMembres) {
      console.error(
        "Supabase select membres_espace (own) a échoué :",
        erreurMesMembres,
      );
      return [];
    }
    if (!mesMembres || mesMembres.length === 0) return [];

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
      return [];
    }

    return (tousLesMembres ?? []).map((m) => ({
      id: m.id,
      espaceId: m.espace_id,
      userId: m.user_id,
      role: m.role,
      createdAt: m.created_at,
    }));
  } catch (e) {
    console.error("getMembreEspace a échoué :", e);
    return [];
  }
}
