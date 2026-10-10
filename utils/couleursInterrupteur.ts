// RÈGLE À NE JAMAIS CASSER (demande du 2026-10-10) : TOUS les interrupteurs
// (Switch) de l'app ont la même apparence — piste teal Vista (#1D9E75) une
// fois activés, piste grise sinon (y compris ios_backgroundColor, sans quoi
// iOS garde sa couleur système à l'état désactivé), bouton blanc dans les
// deux états. Toujours `<Switch {...couleursInterrupteur(C)} />` — ne jamais
// redéfinir trackColor/thumbColor au cas par cas.
export function couleursInterrupteur(C: { separateur: string }) {
  return {
    trackColor: { false: C.separateur, true: "#1D9E75" },
    thumbColor: "#FFFFFF",
    ios_backgroundColor: C.separateur,
  };
}
