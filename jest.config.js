// RÈGLE : préset officiel Expo (jest-expo, version alignée sur le SDK 56 du
// projet) — gère déjà les transforms TypeScript/JSX et les mocks des
// modules natifs React Native courants. Les tests de ce projet restent
// volontairement HORS du dossier app/ (cf. __tests__/ à la racine) : Expo
// Router scanne app/ comme des routes potentielles, un fichier .test.ts
// placé là pourrait être interprété à tort comme un écran.
module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/__tests__/**/*.test.ts"],
};
