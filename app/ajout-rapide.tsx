import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";

/**
 * Landing pad du deep link `vista://ajout-rapide?categorieId=[id]` (widget
 * "Ajout rapide") — traduit `categorieId` vers les params internes déjà
 * utilisés par le FAB d'Aperçu pour ouvrir Budget sur "Nouvelle dépense".
 * Aucun rendu : redirige immédiatement, catégorie pré-sélectionnée si
 * fournie (le "+ Autre" du widget appelle ce même lien sans categorieId).
 */
export default function AjoutRapide() {
  const router = useRouter();
  const { categorieId } = useLocalSearchParams<{ categorieId?: string }>();

  useEffect(() => {
    router.replace({
      pathname: "/budget",
      params: {
        ouvrirAjout: "1",
        ...(categorieId ? { enveloppeId: categorieId } : {}),
      },
    });
  }, [categorieId, router]);

  return null;
}
