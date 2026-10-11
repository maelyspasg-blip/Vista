// Pont minimal entre app/onboarding/preferences.tsx et app/_layout.tsx : le
// flag onboarding_complete est écrit directement en base par preferences.tsx,
// mais _layout.tsx garde sa propre copie locale (state React) pour décider
// des redirections — sans ce pont, cette copie locale ne serait jamais mise
// à jour après l'écriture, et l'effet de redirection renverrait
// indéfiniment vers /onboarding/preferences (bug : "boucle infinie" à la fin
// du questionnaire). Même principe que signalerErreurSync dans store.ts,
// réduit à un seul callback puisqu'il n'y a jamais qu'une seule instance de
// _layout.tsx montée à la fois.
type Rappel = () => void;
let rappel: Rappel | null = null;

export function ecouterOnboardingTermine(fn: Rappel | null) {
  rappel = fn;
}

export function signalerOnboardingTermine() {
  rappel?.();
}

// Même pont pour la fin des slides de présentation (app/onboarding/index.tsx)
// : _layout.tsx mémorise la présentation comme vue pour le compte connecté
// (cf. RÈGLE dans app/onboardingStorage.ts) et met à jour sa copie locale
// utilisée par les redirections.
let rappelPresentation: Rappel | null = null;

export function ecouterPresentationVue(fn: Rappel | null) {
  rappelPresentation = fn;
}

export function signalerPresentationVue() {
  rappelPresentation?.();
}
