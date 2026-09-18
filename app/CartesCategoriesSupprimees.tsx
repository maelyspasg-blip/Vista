import { StyleSheet, View } from "react-native";
import { estSupprimeeCeMois } from "../utils/budget";
import { estDansMois } from "../utils/exportExcel";
import { formaterMontant } from "../utils/montant";
import { parseDateFixeLocale, useObjectifs } from "./store";
import { Text } from "./Texte";
import { useTheme } from "./ThemeContext";

function formaterDateCourte(dateISO: string): string {
  const d = parseDateFixeLocale(dateISO);
  if (Number.isNaN(d.getTime())) return dateISO;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

// RÈGLE À NE JAMAIS CASSER — DÉCISION PRODUIT DU 2026-09-18 (P052,
// AUDIT_V1.md §2.2, suppression douce) : une catégorie supprimée disparaît
// de "Tes catégories" (estCategorieActiveCeMois, utils/budget.ts) — donc du
// rendu normal de renderCarteCategorie (budget.tsx)/la liste équivalente
// (index.tsx) — le mois même de sa suppression. Ce composant est le SEUL
// endroit qui la rend encore visible pour CE mois précis : sans lui, une
// catégorie supprimée en cours de mois resterait invisible de tout écran
// jusqu'à l'archivage suivant (elle réapparaîtrait alors, avec son badge,
// dans VueMoisArchive.tsx — cf. RÈGLE là-bas). Composant partagé entre
// app/(tabs)/budget.tsx et app/(tabs)/index.tsx plutôt que dupliqué : les
// deux écrans ont chacun leur propre "Tes catégories", mais un seul concept
// de "catégories supprimées ce mois-ci".
//
// Volontairement EN LECTURE SEULE (pas de montant à ajouter, pas de budget
// à éditer, pas de nouveau bouton "supprimer" — la catégorie est déjà
// supprimée) : seules la consultation du total et le détail par transaction
// sont couverts ici. Modifier/supprimer une transaction individuelle depuis
// cette vue reste un chantier séparé (cf. AUDIT_V1.md, finding P052) — la
// modale d'édition standard (ouvrirEditionTransaction, budget.tsx) part du
// principe qu'un picker de catégories ACTIVES existe pour la transaction en
// cours d'édition, ce qui n'est justement plus le cas ici.
export function CartesCategoriesSupprimees({
  annee,
  mois,
}: {
  annee: number;
  mois: number;
}) {
  const objStore = useObjectifs();
  const { couleurs: C } = useTheme();

  const categoriesSupprimees = objStore.enveloppes.filter(
    (e) => e.type !== "Entrée" && estSupprimeeCeMois(e, annee, mois),
  );

  if (categoriesSupprimees.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitre, { color: C.texteMuted }]}>
        CATÉGORIES SUPPRIMÉES CE MOIS-CI
      </Text>
      {categoriesSupprimees.map((env) => {
        const lignes = objStore.transactions
          .filter(
            (t) => t.enveloppeId === env.id && estDansMois(t.date, mois, annee),
          )
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return (
          <View
            key={env.id}
            style={[styles.carte, { backgroundColor: env.couleur + "22" }]}
          >
            <View style={styles.enTete}>
              <View style={styles.nomRow}>
                <View style={[styles.point, { backgroundColor: env.couleur }]} />
                <Text
                  style={[styles.nom, { color: C.texte }]}
                  numberOfLines={1}
                >
                  {env.nom}
                </Text>
                <View style={[styles.badge, { backgroundColor: C.separateur }]}>
                  <Text style={[styles.badgeTexte, { color: C.texteMuted }]}>
                    Catégorie supprimée
                  </Text>
                </View>
              </View>
              <Text style={[styles.montant, { color: env.couleur }]}>
                {formaterMontant(env.depense)} €
              </Text>
            </View>
            {lignes.length > 0 && (
              <View style={styles.liste}>
                {lignes.map((ligne) => (
                  <View key={ligne.id} style={styles.ligne}>
                    <View style={styles.ligneInfos}>
                      <Text
                        style={[styles.ligneNom, { color: C.texte }]}
                        numberOfLines={1}
                      >
                        {ligne.nom}
                      </Text>
                      <Text style={[styles.ligneDate, { color: C.texteMuted }]}>
                        {formaterDateCourte(ligne.date)}
                      </Text>
                    </View>
                    <Text style={[styles.ligneMontant, { color: C.texteMuted }]}>
                      - {formaterMontant(ligne.montant)} €
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 8 },
  sectionTitre: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 12,
  },
  carte: { borderRadius: 16, padding: 18, marginBottom: 10 },
  enTete: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  nomRow: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1, marginRight: 8 },
  point: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  nom: { fontSize: 16, fontWeight: "700", flexShrink: 1 },
  montant: { fontSize: 14, fontWeight: "700", flexShrink: 0 },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, flexShrink: 0 },
  badgeTexte: { fontSize: 10, fontWeight: "600" },
  liste: { marginTop: 14 },
  ligne: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  ligneInfos: { flexShrink: 1, marginRight: 8 },
  ligneNom: { fontSize: 14, fontWeight: "500" },
  ligneDate: { fontSize: 12, marginTop: 2 },
  ligneMontant: { fontSize: 14, fontWeight: "600" },
});
