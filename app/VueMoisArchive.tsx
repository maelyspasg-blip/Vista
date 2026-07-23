import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { BarreProgression } from "./BarreProgression";
import { PALETTE_COULEURS } from "./ColorPicker";
import { useObjectifs } from "./store";
import { Text } from "./Texte";
import { useTheme } from "./ThemeContext";
import {
  categoriesDuMois,
  depenseEnveloppeDansSnapshot,
  DonneesExport,
  disponibleDuMois,
  epargneDuMois,
  estDansMois,
  MOIS_LABELS,
  moisPrecedent,
  totalParType,
} from "../utils/exportExcel";

function formaterDateCourte(dateISO: string): string {
  const d = new Date(dateISO);
  if (Number.isNaN(d.getTime())) return dateISO;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function VueMoisArchive({ mois, annee }: { mois: number; annee: number }) {
  const objStore = useObjectifs();
  const { couleurs: C, theme } = useTheme();
  const [enveloppeOuverte, setEnveloppeOuverte] = useState<string | null>(null);
  const [deltaPourcentagePour, setDeltaPourcentagePour] = useState<
    Record<string, boolean>
  >({});

  const donnees: DonneesExport = {
    enveloppes: objStore.enveloppes,
    transactions: objStore.transactions,
    historiquesMois: objStore.historiquesMois,
    epargneMois: objStore.epargneMois,
    argentDisponible: objStore.argentDisponible,
  };

  const envs = categoriesDuMois(donnees, mois, annee) ?? [];
  const totalDepense = totalParType(envs, false);
  const totalRecu = totalParType(envs, true);
  const epargne = epargneDuMois(donnees, mois, annee) ?? 0;
  const disponible = disponibleDuMois(donnees, mois, annee) ?? 0;

  const categories = envs.filter((e) => e.type !== "Entrée");
  const snapshot = objStore.historiquesMois.find(
    (s) => s.mois === mois && s.annee === annee,
  );
  const objectifs = snapshot?.objectifs ?? [];
  const { mois: moisPrec, annee: anneePrec } = moisPrecedent(mois, annee);

  return (
    <View style={styles.container}>
      <View style={[styles.bandeau, { backgroundColor: C.fondSecondaire }]}>
        <Ionicons name="time-outline" size={14} color={C.texteMuted} />
        <Text style={[styles.bandeauTexte, { color: C.texteMuted }]}>
          Historique — lecture seule
        </Text>
      </View>

      <View style={styles.tuiles}>
        <View style={[styles.tuile, { backgroundColor: C.fondSecondaire }]}>
          <Text style={[styles.tuileLabel, { color: C.texteMuted }]}>Dépensé</Text>
          <Text style={[styles.tuileValeur, { color: C.texte }]}>
            {Math.round(totalDepense)} €
          </Text>
        </View>
        <View style={[styles.tuile, { backgroundColor: C.fondSecondaire }]}>
          <Text style={[styles.tuileLabel, { color: C.texteMuted }]}>Reçu</Text>
          <Text style={[styles.tuileValeur, { color: C.vertText }]}>
            {Math.round(totalRecu)} €
          </Text>
        </View>
        <View style={[styles.tuile, { backgroundColor: C.fondSecondaire }]}>
          <Text style={[styles.tuileLabel, { color: C.texteMuted }]}>Épargné</Text>
          <Text style={[styles.tuileValeur, { color: C.vertText }]}>
            {Math.round(epargne)} €
          </Text>
        </View>
      </View>
      <Text style={[styles.disponibleTexte, { color: C.texteMuted }]}>
        Disponible en fin de mois : {Math.round(disponible)} €
      </Text>

      <Text style={[styles.sectionTitle, { color: C.texteMuted }]}>
        CATÉGORIES DE {MOIS_LABELS[mois].toUpperCase()} {annee}
      </Text>
      {categories.length === 0 && (
        <Text style={[styles.videTexte, { color: C.texteMuted }]}>
          Aucune catégorie enregistrée ce mois-là.
        </Text>
      )}
      {categories.map((env, index) => {
        const pct = env.budget > 0 ? Math.min((env.depense / env.budget) * 100, 100) : 0;
        const estOuverte = enveloppeOuverte === env.id;
        // Filet de sécurité : `env.id` doit toujours être renseigné (voir le
        // mapping dans store.ts, chargerHistoriquesMois), mais on évite ici
        // toute collision de clé React si une donnée malformée passait au travers.
        const cle = env.id || `${env.nom}-${index}`;
        // `CategorieExport` (utils/exportExcel.ts) ne déclare pas `couleur` — inutile
        // à un classeur Excel — mais les objets réels (enveloppes courantes comme
        // enveloppes archivées) le portent bien à l'exécution.
        const couleur = (env as unknown as { couleur?: string }).couleur ?? C.purple;

        const montantMoisPrecedent = depenseEnveloppeDansSnapshot(
          objStore.historiquesMois,
          env.id,
          moisPrec,
          anneePrec,
        );
        const deltaMoisPrecedent =
          montantMoisPrecedent !== null ? env.depense - montantMoisPrecedent : null;
        // Même mécanique de toggle €/% que sur les cartes hero (Aperçu,
        // Budget) : tap sur le delta pour basculer l'affichage.
        const pctDeltaMoisPrecedent =
          deltaMoisPrecedent !== null &&
          montantMoisPrecedent !== null &&
          montantMoisPrecedent !== 0
            ? (deltaMoisPrecedent / Math.abs(montantMoisPrecedent)) * 100
            : null;

        const lignes = env.type === "Fixe"
          ? objStore.historiquePaiements
              .filter((p) => p.enveloppeId === env.id && estDansMois(p.date, mois, annee))
              .map((p) => ({ id: p.id, nom: p.nom, montant: p.montant, date: p.date }))
          : objStore.transactions
              .filter((t) => t.enveloppeId === env.id && estDansMois(t.date, mois, annee))
              .map((t) => ({ id: t.id, nom: t.nom, montant: t.montant, date: t.date }));
        const lignesTriees = [...lignes].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
        );

        return (
          <View key={cle} style={[styles.envCard, { backgroundColor: couleur + "22" }]}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setEnveloppeOuverte(estOuverte ? null : env.id)}
              accessibilityRole="button"
              accessibilityLabel={`${env.nom}, ${estOuverte ? "replier" : "déplier"} le détail`}
            >
              <View style={styles.envRow}>
                <View style={styles.envNomRow}>
                  <View style={[styles.envDot, { backgroundColor: couleur }]} />
                  <Text style={[styles.envNom, { color: C.texte }]}>{env.nom}</Text>
                </View>
                <View style={styles.envRowRight}>
                  <Text style={[styles.envMontant, { color: couleur }]}>
                    {env.depense} € / {env.budget} €
                  </Text>
                  <Text style={[styles.chevron, { color: couleur }]}>
                    {estOuverte ? "▾" : "▸"}
                  </Text>
                </View>
              </View>
              <BarreProgression
                pourcentage={pct}
                couleur={couleur}
                couleurFond={C.separateur}
                hauteur={6}
              />
              {montantMoisPrecedent !== null && deltaMoisPrecedent !== null && (
                <Text style={[styles.envDeltaTexte, { color: C.texteMuted }]}>
                  Mois précédent : {montantMoisPrecedent} €{" "}
                  <Text
                    onPress={() =>
                      setDeltaPourcentagePour((prev) => ({
                        ...prev,
                        [env.id]: !prev[env.id],
                      }))
                    }
                    style={{
                      color: deltaMoisPrecedent <= 0 ? C.accentText : C.peachText,
                      fontWeight: "700",
                    }}
                  >
                    (
                    {deltaPourcentagePour[env.id] && pctDeltaMoisPrecedent !== null
                      ? `${pctDeltaMoisPrecedent > 0 ? "+" : ""}${pctDeltaMoisPrecedent.toFixed(0)} %`
                      : `${deltaMoisPrecedent > 0 ? "+" : ""}${deltaMoisPrecedent} €`}
                    )
                  </Text>
                </Text>
              )}
            </TouchableOpacity>

            {estOuverte && (
              <View style={[styles.txListe, { borderTopColor: C.separateur }]}>
                {lignesTriees.length === 0 ? (
                  <Text style={[styles.txVide, { color: C.texteMuted }]}>
                    Aucun détail enregistré pour cette catégorie ce mois-là.
                  </Text>
                ) : (
                  lignesTriees.map((ligne) => (
                    <View key={ligne.id} style={styles.txLigne}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.txNom, { color: C.texte }]}>{ligne.nom}</Text>
                        <Text style={[styles.txDate, { color: C.texteMuted }]}>
                          {formaterDateCourte(ligne.date)}
                        </Text>
                      </View>
                      <Text style={[styles.txMontant, { color: couleur }]}>
                        - {ligne.montant} €
                      </Text>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        );
      })}

      {objectifs.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { color: C.texteMuted, marginTop: 20 }]}>
            OBJECTIFS
          </Text>
          {objectifs.map((o, i) => {
            const couleur = PALETTE_COULEURS[i % PALETTE_COULEURS.length];
            const pct = o.cible > 0 ? Math.min((o.actuel / o.cible) * 100, 100) : 0;
            return (
              <View key={o.id || `${o.nom}-${i}`} style={[styles.envCard, { backgroundColor: couleur + "22" }]}>
                <View style={styles.envRow}>
                  <View style={styles.envNomRow}>
                    <View style={[styles.envDot, { backgroundColor: couleur }]} />
                    <Text style={[styles.envNom, { color: C.texte }]}>{o.nom}</Text>
                  </View>
                  <Text style={[styles.envMontant, { color: couleur }]}>
                    {o.actuel} € / {o.cible} €
                  </Text>
                </View>
                <View style={[styles.envBarBg, { backgroundColor: C.separateur }]}>
                  <View
                    style={[styles.envBarFill, { width: `${pct}%`, backgroundColor: couleur }]}
                  />
                </View>
              </View>
            );
          })}
        </>
      )}
      <View style={{ height: theme === "sombre" ? 20 : 40 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: 20 },
  bandeau: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
    alignSelf: "flex-start",
  },
  bandeauTexte: { fontSize: 12, fontWeight: "600" },
  tuiles: { flexDirection: "row", gap: 10, marginBottom: 10 },
  tuile: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  tuileLabel: { fontSize: 11, fontWeight: "600", marginBottom: 6 },
  tuileValeur: { fontSize: 16, fontWeight: "700" },
  disponibleTexte: { fontSize: 12, fontWeight: "500", marginBottom: 20 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 4,
  },
  videTexte: { fontSize: 13, textAlign: "center", paddingVertical: 20 },
  envCard: { borderRadius: 16, padding: 18, marginBottom: 10 },
  envRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 11,
  },
  envNom: { fontSize: 16, fontWeight: "700" },
  envNomRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  envDot: { width: 10, height: 10, borderRadius: 5 },
  envRowRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  envMontant: { fontSize: 14, fontWeight: "700" },
  chevron: { fontSize: 14, fontWeight: "700" },
  envBarBg: { height: 6, borderRadius: 3, overflow: "hidden" },
  envBarFill: { height: "100%", borderRadius: 3 },
  envDeltaTexte: { fontSize: 11, fontWeight: "500", marginTop: 8 },
  txListe: { marginTop: 14, paddingTop: 14, borderTopWidth: 0.5 },
  txVide: { fontSize: 13, textAlign: "center", paddingVertical: 10 },
  txLigne: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 8,
  },
  txNom: { fontSize: 13, fontWeight: "600" },
  txDate: { fontSize: 11 },
  txMontant: { fontSize: 13, fontWeight: "700" },
});
