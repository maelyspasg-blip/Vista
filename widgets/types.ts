// Types purs (aucun code au runtime) partagés entre les fichiers widgets/*.tsx
// (bundlés isolément, cf. la directive 'widget') et utils/widgetsSync.ts (code
// app normal). Un `import type` est effacé à la compilation — sûr à utiliser
// depuis un composant 'widget', contrairement à un import de valeur.

export type EvenementWidget = {
  id: string;
  nom: string;
  heure: string;
  estFinancier: boolean;
};

export type PlanningWidgetProps = {
  evenements: EvenementWidget[];
  nbAutres: number;
  // file:// vers le logo copié dans le App Group par utils/widgetsSync.ts, ou
  // null tant que la copie n'a pas encore eu lieu (premier lancement).
  logoUri: string | null;
};

export type CategorieWidget = {
  id: string;
  nom: string;
  couleur: string;
};

export type AjoutRapideWidgetProps = {
  categories: CategorieWidget[];
  logoUri: string | null;
};
