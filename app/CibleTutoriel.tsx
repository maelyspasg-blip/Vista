import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { View, type ViewProps } from "react-native";

export type RectCible = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// RÈGLE À NE JAMAIS CASSER : wrapper transparent qui mesure la position
// ABSOLUE à l'écran de son contenu (measureInWindow, jamais onLayout seul —
// onLayout ne donne qu'une position relative au parent, insuffisant pour
// positionner un overlay plein écran superposé à toute la page). Utilisé
// pour découper les "trous" dans TutorielOverlay.
//
// Ne jamais retirer collapsable={false} : sur Android, sans lui, cette View
// peut être aplatie par l'optimiseur de rendu natif, et measureInWindow
// mesure alors le mauvais noeud.
export function CibleTutoriel({
  id,
  onMesure,
  cleFocus,
  children,
  style,
  ...rest
}: {
  id: string;
  onMesure: (id: string, rect: RectCible) => void;
  // RÈGLE À NE JAMAIS CASSER : cleFocus (valeur fournie par
  // useCiblesTutoriel()) doit être passé à TOUS les CibleTutoriel de
  // l'app, SANS EXCEPTION — même les cibles qui semblent toujours visibles
  // au premier montage. C'est ce qui garantit la re-mesure au focus (voir
  // le useEffect ci-dessous) : sans lui, une cible se mesure correctement
  // une première fois via son propre onLayout, puis plus JAMAIS — les
  // onglets de l'app restant montés en permanence une fois visités (pas de
  // démontage/remontage entre deux visites), rien d'autre ne redéclenche
  // onLayout. Un seul CibleTutoriel oublié suffit à bloquer TOUT le
  // tutoriel de sa page dès la deuxième visite : toutesCiblesActivesMesurees
  // (dans TutorielOverlay) exige que CHAQUE cible d'une étape soit mesurée
  // avant d'afficher quoi que ce soit.
  cleFocus: number;
} & ViewProps) {
  const ref = useRef<View>(null);

  const mesurer = useCallback(() => {
    ref.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) onMesure(id, { x, y, width, height });
    });
  }, [id, onMesure]);

  // RÈGLE À NE JAMAIS CASSER : useCiblesTutoriel() vide `positions` à
  // CHAQUE focus de la page (voir sa propre règle dans ce même fichier),
  // en pariant sur le fait que chaque CibleTutoriel encore monté va se
  // remesurer via son propre onLayout. Ça marche au tout premier montage,
  // mais PAS aux focus suivants : les onglets de l'app (MaterialTopTabs)
  // gardent leurs écrans montés en permanence une fois visités (juste une
  // transition, jamais un démontage), donc onLayout ne se redéclenche
  // jamais — sans ce useEffect, `positions` resterait vide pour toujours
  // dès la deuxième visite d'une page, et son tutoriel ne pourrait plus
  // jamais s'afficher.
  //
  // Pourquoi ne PAS utiliser un second useFocusEffect ici, sur le même
  // événement 'focus' que useCiblesTutoriel : les callbacks d'un même
  // navigation.addListener('focus', ...) sont notifiés dans leur ordre
  // d'abonnement, et les effets d'un composant enfant (CibleTutoriel) sont
  // TOUJOURS commités — donc abonnés — avant ceux de son parent (la page
  // qui appelle useCiblesTutoriel), React committant les effets
  // enfants-avant-parent. Un useFocusEffect posé ici se déclencherait donc
  // AVANT le vidage de useCiblesTutoriel à chaque refocus, pas après — la
  // re-mesure serait immédiatement écrasée. En dépendant plutôt de
  // `cleFocus`, une simple prop dont la valeur ne change QUE parce que le
  // parent vient de committer son propre setPositions({}), ce useEffect ne
  // peut par construction s'exécuter qu'après ce commit : React doit
  // d'abord appliquer le nouvel état du parent et re-rendre pour que ce
  // composant reçoive la nouvelle valeur de cleFocus, avant que cet effet
  // ne puisse se déclencher sur ce changement.
  //
  // Rappelle mesurer() pour de vrai (measureInWindow), pas une simple
  // relecture d'une valeur en cache : au refocus d'un onglet déjà monté, la
  // position réelle n'a pas changé donc le résultat est identique à un
  // cache — mais forcerRemesure() (voir useCiblesTutoriel) déclenche aussi
  // ce même effet après un scroll automatique du tutoriel, où la position
  // a, elle, réellement changé. Un cache donnerait alors une valeur
  // périmée.
  useEffect(() => {
    mesurer();
    // mesurer est mémoïsé (useCallback ci-dessus, deps [id, onMesure], tous
    // deux stables) : l'inclure ici n'ajoute pas de déclenchement, seul un
    // changement de cleFocus fait réellement re-courir cet effet.
  }, [cleFocus, mesurer]);

  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={mesurer}
      style={style}
      {...rest}
    >
      {children}
    </View>
  );
}

// RÈGLE À NE JAMAIS CASSER : toute page utilisant CibleTutoriel doit gérer
// ses positions mesurées via CE hook, pas via un useState local fait
// maison — le reset systématique à chaque focus (ci-dessous) garantit que
// les mesures ne sont jamais des valeurs périmées d'une session
// précédente. Sans ce reset, un utilisateur qui quitte une page en plein
// tutoriel (rotation d'écran, redimensionnement, ou simplement le temps
// écoulé) et y revient plus tard verrait l'overlay utiliser d'anciennes
// coordonnées, potentiellement fausses.
export function useCiblesTutoriel() {
  const [positions, setPositions] = useState<Record<string, RectCible>>({});
  // Incrémenté UNIQUEMENT dans le même callback que le setPositions({})
  // ci-dessous — jamais ailleurs — pour que chaque CibleTutoriel puisse s'en
  // servir comme déclencheur de re-mesure garanti postérieur au vidage (voir
  // le useEffect dépendant de cleFocus dans CibleTutoriel plus haut dans ce
  // fichier, et son commentaire détaillé sur pourquoi un second
  // useFocusEffect indépendant ne suffirait pas).
  const [cleFocus, setCleFocus] = useState(0);

  const mesurer = useCallback((id: string, rect: RectCible) => {
    setPositions((p) => ({ ...p, [id]: rect }));
  }, []);

  // Recalcul systématique à chaque prise de focus de la page (premier
  // montage inclus, retour sur la page aussi) — jamais de cache d'une
  // session à l'autre. Chaque CibleTutoriel encore présent dans l'arbre se
  // remesure naturellement via son propre onLayout au tout premier montage,
  // et via son useEffect dépendant de cleFocus à tout focus suivant ; celles
  // qui ne sont plus montées (ex : la cible "evenement" de Planning un jour
  // sans événement) restent simplement absentes de `positions`, exactement
  // comme au tout premier affichage.
  useFocusEffect(
    useCallback(() => {
      setPositions({});
      setCleFocus((c) => c + 1);
    }, []),
  );

  // Déclenchement manuel de la même re-mesure que cleFocus, SANS vider
  // `positions` au passage (contrairement au focus ci-dessus) — utilisé
  // après un scroll automatique du tutoriel (voir utils/tutorielScroll.ts)
  // pour rafraîchir la position de la cible qu'on vient d'amener à
  // l'écran, sans perturber les autres cibles déjà mesurées.
  const forcerRemesure = useCallback(() => {
    setCleFocus((c) => c + 1);
  }, []);

  return { positions, mesurer, cleFocus, forcerRemesure };
}
