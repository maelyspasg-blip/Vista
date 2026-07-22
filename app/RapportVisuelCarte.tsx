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
  return (
    <View style={styles.ligneCategorie}>
      <View style={styles.ligneCategorieEnTete}>
        <View style={styles.ligneCategorieNomBloc}>
          <View style={[styles.pastille, { backgroundColor: categorie.couleur }]} />
          <Text style={[styles.nomCategorie, { color: couleurTexte }]}>
            {categorie.nom}
          </Text>
        </View>
        <Text style={[styles.valeurCategorie, { color: couleurTexte }]}>
          {Math.round(categorie.montant)} € · {Math.round(categorie.pourcentage)}%
        </Text>
      </View>
      <View style={[styles.barreFond, { backgroundColor: couleurTexteMuted + "22" }]}>
        <View
          style={[
            styles.barreRemplie,
            {
              width: `${Math.min(100, categorie.pourcentage)}%`,
              backgroundColor: categorie.couleur,
            },
          ]}
        />
      </View>
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
        <Text style={[styles.marque, { color: C.purple }]}>Vista</Text>
        <Text style={[styles.periode, { color: C.texteMuted }]}>{periodeLabel}</Text>
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
          {resume.categories.map((c) => (
            <LigneCategorie
              key={c.nom}
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
  enTete: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 20,
  },
  marque: { fontSize: 18, fontWeight: "800" },
  periode: { fontSize: 13, fontWeight: "600" },
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
  ligneCategorieNomBloc: { flexDirection: "row", alignItems: "center", gap: 8 },
  pastille: { width: 9, height: 9, borderRadius: 4.5 },
  nomCategorie: { fontSize: 13, fontWeight: "600" },
  valeurCategorie: { fontSize: 12, fontWeight: "600" },
  barreFond: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  barreRemplie: { height: 8, borderRadius: 4 },
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
