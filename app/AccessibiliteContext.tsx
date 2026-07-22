import { createContext, useContext, useState } from "react";
import { supabase } from "../supabaseClient";
import { signalerErreurSync } from "./store";

export type TailleTexte = "petit" | "normal" | "grand" | "tres_grand";

export const ECHELLES_TEXTE: Record<TailleTexte, number> = {
  petit: 0.9,
  normal: 1,
  grand: 1.15,
  tres_grand: 1.3,
};

type AccessibiliteInitial = {
  tailleTexte?: TailleTexte;
  contrasteRenforce?: boolean;
  reduireAnimations?: boolean;
};

type AccessibiliteContextType = {
  tailleTexte: TailleTexte;
  echelleTexte: number;
  contrasteRenforce: boolean;
  reduireAnimations: boolean;
  setTailleTexte: (taille: TailleTexte) => void;
  setContrasteRenforce: (actif: boolean) => void;
  setReduireAnimations: (actif: boolean) => void;
};

const AccessibiliteContext = createContext<AccessibiliteContextType>({
  tailleTexte: "normal",
  echelleTexte: 1,
  contrasteRenforce: false,
  reduireAnimations: false,
  setTailleTexte: () => {},
  setContrasteRenforce: () => {},
  setReduireAnimations: () => {},
});

function majTailleTexteSupabase(tailleTexte: TailleTexte) {
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) return;
    supabase
      .from("profils")
      .update({ taille_texte: tailleTexte })
      .eq("user_id", user.id)
      .then(({ error }) => {
        if (error) {
          console.error("Supabase update taille_texte a échoué :", error);
          signalerErreurSync(
            `Impossible de sauvegarder la taille du texte : ${error.message}`,
          );
        }
      });
  });
}

function majContrasteRenforceSupabase(actif: boolean) {
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) return;
    supabase
      .from("profils")
      .update({ contraste_renforce: actif })
      .eq("user_id", user.id)
      .then(({ error }) => {
        if (error) {
          console.error("Supabase update contraste_renforce a échoué :", error);
          signalerErreurSync(
            `Impossible de sauvegarder le contraste : ${error.message}`,
          );
        }
      });
  });
}

function majReduireAnimationsSupabase(actif: boolean) {
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) return;
    supabase
      .from("profils")
      .update({ reduire_animations: actif })
      .eq("user_id", user.id)
      .then(({ error }) => {
        if (error) {
          console.error("Supabase update reduire_animations a échoué :", error);
          signalerErreurSync(
            `Impossible de sauvegarder les animations : ${error.message}`,
          );
        }
      });
  });
}

export function AccessibiliteProvider({
  children,
  initial,
}: {
  children: React.ReactNode;
  initial?: AccessibiliteInitial;
}) {
  const [tailleTexte, setTailleTexteState] = useState<TailleTexte>(
    initial?.tailleTexte ?? "normal",
  );
  const [contrasteRenforce, setContrasteRenforceState] = useState(
    initial?.contrasteRenforce ?? false,
  );
  const [reduireAnimations, setReduireAnimationsState] = useState(
    initial?.reduireAnimations ?? false,
  );

  const setTailleTexte = (taille: TailleTexte) => {
    setTailleTexteState(taille);
    majTailleTexteSupabase(taille);
  };

  const setContrasteRenforce = (actif: boolean) => {
    setContrasteRenforceState(actif);
    majContrasteRenforceSupabase(actif);
  };

  const setReduireAnimations = (actif: boolean) => {
    setReduireAnimationsState(actif);
    majReduireAnimationsSupabase(actif);
  };

  return (
    <AccessibiliteContext.Provider
      value={{
        tailleTexte,
        echelleTexte: ECHELLES_TEXTE[tailleTexte],
        contrasteRenforce,
        reduireAnimations,
        setTailleTexte,
        setContrasteRenforce,
        setReduireAnimations,
      }}
    >
      {children}
    </AccessibiliteContext.Provider>
  );
}

export function useAccessibilite() {
  return useContext(AccessibiliteContext);
}
