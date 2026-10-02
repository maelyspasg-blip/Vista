// RÈGLE : @types/jest n'est pas auto-découvert par tsc dans ce projet (pas
// de "types" explicite dans tsconfig.json, et son absence ne suffit pas
// ici à déclencher la découverte automatique habituelle des @types/* —
// confirmé en isolant le problème via `tsc --types jest`, qui corrige tout
// à lui seul). Plutôt que d'ajouter "types": ["jest"] à tsconfig.json
// (compilerOptions.types EXPLICITE désactiverait l'auto-découverte des
// AUTRES @types pour TOUT le projet, dont le namespace JSX global de
// @types/react — risque de régression massive sur l'app entière), cette
// triple-slash directive ne charge QUE @types/jest, sans toucher au
// comportement du reste du projet.
/// <reference types="jest" />

// RÈGLE : @types/jest (à partir de la v29) ne déclare plus le global `jest`
// comme VALEUR (seulement comme namespace, pour typer `jest.Mock<T>` etc.)
// — describe/it/expect/beforeEach restent déclarés par @types/jest, mais
// `jest.mock()/jest.fn()` ont besoin de cette déclaration complémentaire,
// seule façon officiellement documentée de garder l'usage ambient (sans
// `import { jest } from "@jest/globals"` dans chaque fichier de test, qui
// casserait le hoisting de `jest.mock()` par babel-plugin-jest-hoist).
import type { jest as jestGlobal } from "@jest/globals";

declare global {
  // eslint-disable-next-line no-var
  var jest: typeof jestGlobal;
}

export {};
