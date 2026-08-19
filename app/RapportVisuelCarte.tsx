import { forwardRef } from "react";
import { StyleSheet, View } from "react-native";
import type { MotCleScore, ScoreSante } from "../utils/score";
import { CategorieResumeVisuel, ResumeVisuel } from "../utils/rapportVisuel";
import { Text } from "./Texte";
import { COULEURS, useTheme } from "./ThemeContext";

function couleurMotTeinte(mot: MotCleScore, C: typeof COULEURS.clair): string {
  if (mot === "Solide") return C.vertLight;
  if (mot === "À surveiller") return C.peachLight;
  return C.peachText;
}

function couleurMotForte(mot: MotCleScore, C: typeof COULEURS.clair): string {
  if (mot === "Solide") return C.vertText;
  if (mot === "À surveiller") return C.peachText;
  return "#FFFFFF";
}

function LigneCategorie({
  categorie,
  couleurTexte,
  couleurTexteMuted,
}: {
  categorie: CategorieResumeVisuel;
  couleurTexte: string;
  couleurTexteMuted: string;
}) {
  // Protection immédiate contre un champ manquant/mal typé sur UN objet par
  // ailleurs présent (distinct du filtre sur les éléments null/undefined du
  // tableau lui-même, appliqué au site d'appel) — Math.round(undefined) et
  // `${undefined}%` ne plantent pas React Native en eux-mêmes, mais autant
  // ne jamais laisser une valeur non numérique atteindre un style ("NaN%"
  // n'est pas un pourcentage valide).
  const nom = categorie?.nom ?? "—";
  const couleur = categorie?.couleur ?? "#A0A8C0";
  const montant = typeof categorie?.montant === "number" ? categorie.montant : 0;
  const pourcentage =
    typeof categorie?.pourcentage === "number" ? categorie.pourcentage : 0;
  const transactions = Array.isArray(categorie?.transactionsPrincipales)
    ? categorie.transactionsPrincipales.filter((t) => t != null)
    : [];

  return (
    <View style={styles.ligneCategorie}>
      <View style={styles.ligneCategorieEnTete}>
        <View style={styles.ligneCategorieNomBloc}>
          <View style={[styles.pastille, { backgroundColor: couleur }]} />
          <Text
            style={[styles.nomCategorie, { color: couleurTexte }]}
            numberOfLines={1}
          >
            {nom}
          </Text>
        </View>
        <Text style={[styles.valeurCategorie, { color: couleurTexte }]}>
          {Math.round(montant)} € · {Math.round(pourcentage)}%
        </Text>
      </View>
      <View style={[styles.barreFond, { backgroundColor: couleurTexteMuted + "22" }]}>
        <View
          style={[
            styles.barreRemplie,
            {
              width: `${Math.min(100, Math.max(0, pourcentage))}%`,
              backgroundColor: couleur,
            },
          ]}
        />
      </View>
      {transactions.length > 0 && (
        <View style={styles.sousTransactions}>
          {transactions.map((t, i) => (
            <Text
              key={i}
              style={[styles.sousTransactionTexte, { color: couleurTexteMuted }]}
              numberOfLines={1}
            >
              {t.nom ?? "—"} · {Math.round(typeof t.montant === "number" ? t.montant : 0)} €
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

export const RapportVisuelCarte = forwardRef<View, {
  periodeLabel: string;
  resume: ResumeVisuel;
  score: ScoreSante | null;
}>(function RapportVisuelCarte({ periodeLabel, resume, score }, ref) {
  const { couleurs: C } = useTheme();

  return (
    <View ref={ref} style={[styles.carte, { backgroundColor: C.carte }]} collapsable={false}>
      <View style={styles.enTete}>
        <Text style={[styles.marque, { color: C.purple }]}>VISTA</Text>
        <Text style={[styles.periode, { color: C.texte }]}>{periodeLabel}</Text>
      </View>

      <View style={styles.tuiles}>
        <View style={[styles.tuile, { backgroundColor: C.fondSecondaire }]}>
          <Text style={[styles.tuileLabel, { color: C.texteMuted }]}>Dépensé</Text>
          <Text style={[styles.tuileValeur, { color: C.texte }]}>
            {Math.round(resume.totalDepense)} €
          </Text>
        </View>
        <View style={[styles.tuile, { backgroundColor: C.fondSecondaire }]}>
          <Text style={[styles.tuileLabel, { color: C.texteMuted }]}>Épargné</Text>
          <Text style={[styles.tuileValeur, { color: C.vertText }]}>
            {Math.round(resume.totalEpargne)} €
          </Text>
        </View>
        <View style={[styles.tuile, { backgroundColor: C.fondSecondaire }]}>
          <Text style={[styles.tuileLabel, { color: C.texteMuted }]}>Reçu</Text>
          <Text style={[styles.tuileValeur, { color: C.vertText }]}>
            {Math.round(resume.totalRecu)} €
          </Text>
        </View>
      </View>

      {resume.categories.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitre, { color: C.texteMuted }]}>
            RÉPARTITION DES DÉPENSES
          </Text>
          {/* Protection immédiate : filtre les éléments null/undefined avant
              de les rendre. Voir la réponse détaillée sur pourquoi
              calculerResumeVisuel ne devrait normalement jamais en produire
              — gardé quand même, au cas où une source de données amont
              (ex: une ligne malformée) en introduirait un jour. */}
          {resume.categories
            .filter((c) => c != null)
            .map((c, i) => (
              <LigneCategorie
                key={`${c.nom ?? "categorie"}-${i}`}
                categorie={c}
                couleurTexte={C.texte}
                couleurTexteMuted={C.texteMuted}
              />
            ))}
        </View>
      )}

      {score && (
        <View style={[styles.scoreBloc, { backgroundColor: couleurMotTeinte(score.mot, C) }]}>
          <Text style={[styles.scoreLabel, { color: couleurMotForte(score.mot, C) }]}>
            Santé financière
          </Text>
          <View style={styles.scoreLigne}>
            <Text style={[styles.scoreNombre, { color: couleurMotForte(score.mot, C) }]}>
              {score.score}
            </Text>
            <Text style={[styles.scoreSur100, { color: couleurMotForte(score.mot, C) }]}>
              /100 · {score.mot}
            </Text>
          </View>
        </View>
      )}

      <Text style={[styles.pied, { color: C.texteMuted }]}>
        Généré avec Vista
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  carte: {
    borderRadius: 20,
    padding: 24,
    width: 340,
  },
  // Colonne plutôt que ligne côte à côte : la période est l'info la plus
  // importante en haut de la carte, elle a besoin de sa propre ligne pour
  // rester bien visible plutôt que de partager l'espace avec la marque.
  enTete: { marginBottom: 20 },
  marque: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 4,
  },
  periode: { fontSize: 20, fontWeight: "800" },
  tuiles: { flexDirection: "row", gap: 10, marginBottom: 24 },
  tuile: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  tuileLabel: { fontSize: 11, fontWeight: "600", marginBottom: 6 },
  tuileValeur: { fontSize: 16, fontWeight: "700" },
  section: { marginBottom: 8 },
  sectionTitre: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  ligneCategorie: { marginBottom: 14 },
  ligneCategorieEnTete: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  ligneCategorieNomBloc: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
    marginRight: 8,
  },
  pastille: { width: 9, height: 9, borderRadius: 4.5, flexShrink: 0 },
  nomCategorie: { fontSize: 13, fontWeight: "600", flexShrink: 1 },
  valeurCategorie: { fontSize: 12, fontWeight: "600", flexShrink: 0 },
  barreFond: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  barreRemplie: { height: 8, borderRadius: 4 },
  sousTransactions: { marginTop: 6, marginLeft: 17, gap: 2 },
  sousTransactionTexte: { fontSize: 11, fontWeight: "500" },
  scoreBloc: {
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    marginBottom: 20,
  },
  scoreLabel: { fontSize: 11, fontWeight: "700", marginBottom: 6 },
  scoreLigne: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  scoreNombre: { fontSize: 22, fontWeight: "800" },
  scoreSur100: { fontSize: 13, fontWeight: "600" },
  pied: { fontSize: 11, fontWeight: "500", textAlign: "center" },
});
