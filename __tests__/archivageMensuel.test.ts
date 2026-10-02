// Test unitaire demandé explicitement le 2026-10-02 (point 3) : simule le
// passage au 1er du mois (appel direct à archiverMoisActuelInterneCoeur,
// le cœur de l'archivage mensuel, cf. RÈGLE À NE JAMAIS CASSER en tête de
// cette fonction dans app/store.ts) et vérifie que les catégories Variable
// sont bien remises à 0 et qu'un snapshot existe pour le mois archivé.
//
// RÈGLE : __testArchivage (app/store.ts) est un export réservé À CE
// FICHIER — jamais à du code applicatif, cf. RÈGLE à son site de
// déclaration. Les modules natifs (Supabase, AsyncStorage, notifications,
// widgets) sont mockés ci-dessous : ce test vérifie la LOGIQUE
// d'archivage, jamais une vraie écriture réseau (aucun accès Supabase
// direct depuis cet environnement, cf. CLAUDE.md).

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// RÈGLE : notifications/widgetsSync s'appuient sur des modules natifs
// (expo-notifications, expo-widgets...) sans intérêt pour ce test — mockés
// en no-op plutôt que de tirer toute leur chaîne de dépendances natives.
jest.mock("../app/notifications", () => ({
  annulerToutesNotifications: jest.fn(),
  envoyerNotificationEvenementCommun: jest.fn(),
}));
jest.mock("../utils/widgetsSync", () => ({
  synchroniserWidgetAjoutRapide: jest.fn(),
  synchroniserWidgetPlanning: jest.fn(),
}));

// RÈGLE — MOCK SUPABASE GÉNÉRIQUE : chaque maillon de chaîne (.select,
// .eq, .in, .single, .insert, .update, .upsert, .delete) renvoie le MÊME
// objet `chain`, qui est lui-même "thenable" — reproduit fidèlement la
// forme utilisée partout dans app/store.ts (ex.
// `.from(x).update(y).eq(z).then(cb)` aussi bien que
// `await .from(x).upsert(y).select().single()`) sans avoir à répliquer le
// vrai client Supabase. `reponses` permet de configurer le résultat par
// table+opération ; par défaut : `insert`/`upsert` ÉCHOENT la charge
// envoyée (comme le fait réellement `.insert(x).select()` côté Supabase —
// nécessaire ici pour que `snapshot_enveloppes` retourne bien AUTANT de
// lignes que fournies, cf. garde-fou `lignesInserees.length !==
// params.enveloppes.length` dans enregistrerSnapshotMoisSupabase),
// `select`/`update`/`delete` non configurés répondent `{ data: null,
// error: null }`, suffisant pour les écritures fire-and-forget de
// appliquerEnveloppes/majDernierMoisArchiveSupabase/majEpargneMoisSupabase
// déclenchées en cascade par l'archivage.
function mockCreerSupabaseMock(reponses: Record<string, Record<string, unknown>>) {
  function chainPour(table: string, operation: string, charge?: unknown) {
    const configure = reponses[table]?.[operation];
    const resultatParDefaut =
      operation === "insert" || operation === "upsert"
        ? { data: charge, error: null }
        : { data: null, error: null };
    const resultat = configure ?? resultatParDefaut;
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      single: () => chain,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(resultat).then(resolve, reject),
    };
    return chain;
  }
  return {
    auth: {
      getUser: () =>
        Promise.resolve({ data: { user: { id: "test-user-id" } } }),
      // app/store.ts s'abonne à onAuthStateChange au chargement du module
      // (réinitialisation d'état à la déconnexion) — jamais déclenché dans
      // ce test, mock minimal pour que l'import du module ne plante pas.
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
    from: (table: string) => ({
      select: () => chainPour(table, "select"),
      insert: (charge: unknown) => chainPour(table, "insert", charge),
      update: () => chainPour(table, "update"),
      upsert: (charge: unknown) => chainPour(table, "upsert", charge),
      delete: () => chainPour(table, "delete"),
    }),
  };
}

// RÈGLE : mockCreerSupabaseMock() est appelée DANS la factory elle-même
// (jamais assignée à une const en dehors) — une fonction déclarée avec
// `function` est intégralement hoistée par JS, donc toujours disponible
// ici quel que soit l'ordre après le hoisting des appels jest.mock() par
// babel-plugin-jest-hoist ; une const externe, elle, ne l'aurait pas été.
jest.mock("../supabaseClient", () => ({
  supabase: mockCreerSupabaseMock({
    snapshots_mois: {
      upsert: { data: { id: "snap-test-1" }, error: null },
    },
  }),
}));

// Importé APRÈS les jest.mock ci-dessus (hoistés par Jest de toute façon,
// mais l'ordre de lecture reste plus clair ainsi).
import { __testArchivage, type Enveloppe } from "../app/store";

function enveloppe(partiel: Partial<Enveloppe> & Pick<Enveloppe, "id" | "nom" | "type">): Enveloppe {
  return {
    depense: 0,
    budget: 0,
    couleur: "#000000",
    recurrente: false,
    ...partiel,
  };
}

describe("archivage mensuel — passage au 1er du mois", () => {
  const MOIS_A_ARCHIVER = 8; // septembre (0-indexé)
  const ANNEE = 2026;

  beforeEach(() => {
    __testArchivage.definirEtatPourTest({
      userId: "test-user-id",
      dernierMoisArchive: null,
      epargneMois: 50,
      objectifs: [],
      historiquesMois: [],
      // RÈGLE : `depense` d'une catégorie Variable est RECALCULÉ depuis la
      // somme réelle des transactions du mois avant tout archivage (P034,
      // cf. RÈGLE "RÉCONCILIATION AVANT SNAPSHOT" dans
      // archiverMoisActuelInterneCoeur) — ces transactions doivent donc
      // correspondre exactement aux montants `depense` ci-dessous, sinon la
      // réconciliation les écraserait avant même d'atteindre la logique de
      // remise à zéro qu'on veut isoler ici.
      transactions: [
        {
          id: "t-courses",
          nom: "Supermarché",
          montant: 150,
          enveloppeId: "env-courses",
          date: "2026-09-15",
        },
        {
          id: "t-reparation",
          nom: "Plombier",
          montant: 80,
          enveloppeId: "env-reparation",
          date: "2026-09-10",
        },
      ],
      argentDisponibleReportAuto: false,
      enveloppes: [
        // Variable récurrente — doit repasser à 0 (c'est le cas normal :
        // une catégorie de budget courant comme "Courses").
        enveloppe({
          id: "env-courses",
          nom: "Courses",
          type: "Variable",
          depense: 150,
          budget: 300,
          recurrente: true,
        }),
        // RÈGLE : une Variable PONCTUELLE (recurrente: false) ne doit
        // JAMAIS être remise à 0 — cf. RÈGLE "REMISE À ZÉRO UNIQUEMENT
        // POUR LES CATÉGORIES PERMANENTES" dans
        // archiverMoisActuelInterneCoeur (app/store.ts). Vérifié ici pour
        // ne jamais régresser vers un "toutes les Variable à 0" trop
        // large, qui contredirait cette RÈGLE existante.
        enveloppe({
          id: "env-reparation",
          nom: "Réparation (ponctuelle)",
          type: "Variable",
          depense: 80,
          budget: 80,
          recurrente: false,
        }),
        // Fixe récurrente — doit aussi repasser à 0, payee: false.
        enveloppe({
          id: "env-loyer",
          nom: "Loyer",
          type: "Fixe",
          depense: 900,
          budget: 900,
          repeteChaqueMois: true,
          payee: true,
        }),
      ],
    });
  });

  it("remet à 0 les catégories Variable récurrentes et crée le snapshot du mois", async () => {
    await __testArchivage.archiverMoisActuelInterneCoeur(MOIS_A_ARCHIVER, ANNEE);

    const etatApres = __testArchivage.obtenirEtatPourTest();

    const courses = etatApres.enveloppes.find((e) => e.id === "env-courses");
    expect(courses?.depense).toBe(0);

    const loyer = etatApres.enveloppes.find((e) => e.id === "env-loyer");
    expect(loyer?.depense).toBe(0);
    expect(loyer?.payee).toBe(false);

    // La catégorie Variable ponctuelle reste intacte (cf. RÈGLE ci-dessus).
    const reparation = etatApres.enveloppes.find((e) => e.id === "env-reparation");
    expect(reparation?.depense).toBe(80);

    const snapshot = etatApres.historiquesMois.find(
      (s) => s.mois === MOIS_A_ARCHIVER && s.annee === ANNEE,
    );
    expect(snapshot).toBeDefined();
    expect(snapshot?.id).toBe("snap-test-1");
    expect(snapshot?.enveloppes.length).toBe(3);

    expect(etatApres.dernierMoisArchive).toEqual({
      mois: MOIS_A_ARCHIVER,
      annee: ANNEE,
    });
    expect(etatApres.epargneMois).toBe(0);
  });

  it("n'archive pas deux fois le même mois (le curseur bloque une 2e tentative)", async () => {
    await __testArchivage.archiverMoisActuelInterneCoeur(MOIS_A_ARCHIVER, ANNEE);
    const nbSnapshotsApres1erAppel = __testArchivage.obtenirEtatPourTest().historiquesMois.length;

    // Un 2e appel pour le MÊME mois doit être un no-op (dejaArchive),
    // jamais un 2e snapshot ni une 2e remise à zéro.
    await __testArchivage.archiverMoisActuelInterneCoeur(MOIS_A_ARCHIVER, ANNEE);
    const etatApres2eAppel = __testArchivage.obtenirEtatPourTest();

    expect(etatApres2eAppel.historiquesMois.length).toBe(nbSnapshotsApres1erAppel);
  });
});
