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
};

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
// touche pas Supabase (la création de la ligne espaces_partages
// correspondante est une étape séparée, pas encore branchée ici).
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

// Rejoint un espace partagé existant via son code d'invitation — résout le
// code en ligne espaces_partages, vérifie qu'il n'a pas expiré, puis ajoute
// l'utilisateur courant comme membre. Retourne l'espace rejoint, ou `null`
// si le code est invalide/expiré ou en cas d'erreur réseau (jamais de
// throw, cf. RÈGLE en tête de fichier).
export async function rejoindreEspacePartage(
  code: string,
): Promise<EspacePartage | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: espace, error: erreurEspace } = await supabase
      .from("espaces_partages")
      .select("*")
      .eq("code", code.trim().toUpperCase())
      .maybeSingle();

    if (erreurEspace) {
      console.error(
        "Supabase select espaces_partages (rejoindreEspacePartage) a échoué :",
        erreurEspace,
      );
      return null;
    }
    if (!espace) return null;
    if (new Date(espace.expire_at).getTime() <= Date.now()) return null;

    const { error: erreurMembre } = await supabase
      .from("membres_espace")
      .insert({ espace_id: espace.id, user_id: user.id, role: "membre" });

    if (erreurMembre) {
      console.error(
        "Supabase insert membres_espace (rejoindreEspacePartage) a échoué :",
        erreurMembre,
      );
      return null;
    }

    return {
      id: espace.id,
      code: espace.code,
      createdAt: espace.created_at,
      expireAt: espace.expire_at,
    };
  } catch (e) {
    console.error("rejoindreEspacePartage a échoué :", e);
    return null;
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
