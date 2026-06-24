import { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useObjectifs } from "../store";

const PURPLE = "#8B6FE8";
const PURPLE_LIGHT = "#F0EEFF";
const MINT = "#5DC8A0";
const MINT_LIGHT = "#E8F8F2";
const PEACH = "#F4956A";
const PEACH_LIGHT = "#FFF0EA";
const ROUGE = "#E24B4A";
const ROUGE_LIGHT = "#FCEBEB";
const VERT = "#1D9E75";
const VERT_LIGHT = "#E1F5EE";

const FILTRES = ["Semaine", "Mois", "Année"];

type Categorie = {
  nom: string;
  montant: number;
  budget: number;
  moisDernier: number;
  couleur: string;
};

const CATEGORIES_DATA: Categorie[] = [
  {
    nom: "Courses",
    montant: 157,
    budget: 250,
    moisDernier: 180,
    couleur: "#5DC8A0",
  },
  {
    nom: "Loisirs",
    montant: 179,
    budget: 200,
    moisDernier: 138,
    couleur: "#D94A8C",
  },
  {
    nom: "Restaurants",
    montant: 66,
    budget: 200,
    moisDernier: 51,
    couleur: "#8B6FE8",
  },
  {
    nom: "Transport",
    montant: 34,
    budget: 80,
    moisDernier: 40,
    couleur: "#4A90D9",
  },
  {
    nom: "Abonnements",
    montant: 20,
    budget: 50,
    moisDernier: 20,
    couleur: "#5BC0BE",
  },
  {
    nom: "Autre",
    montant: 30,
    budget: 100,
    moisDernier: 22,
    couleur: "#9B5DE5",
  },
];

const TOP_DEPENSES = [
  {
    nom: "Anniversaire ami",
    categorie: "Loisirs",
    montant: 120,
    date: "29 mai",
    couleur: "#D94A8C",
  },
  {
    nom: "Carrefour",
    categorie: "Courses",
    montant: 64,
    date: "26 mai",
    couleur: "#5DC8A0",
  },
  {
    nom: "Picard",
    categorie: "Courses",
    montant: 42,
    date: "23 mai",
    couleur: "#5DC8A0",
  },
  {
    nom: "Le Petit Bistrot",
    categorie: "Restaurants",
    montant: 38,
    date: "25 mai",
    couleur: "#8B6FE8",
  },
  {
    nom: "Cinéma",
    categorie: "Loisirs",
    montant: 14,
    date: "24 mai",
    couleur: "#D94A8C",
  },
];

const BUDGET_TOTAL = 1800;
const TOTAL = CATEGORIES_DATA.reduce((acc, c) => acc + c.montant, 0);
const TOTAL_MOIS_DERNIER = CATEGORIES_DATA.reduce(
  (acc, c) => acc + c.moisDernier,
  0,
);

const JOURS_ECOULES = 18;
const JOURS_DANS_MOIS = 30;

function DonutChart({
  data,
  categorieActive,
}: {
  data: Categorie[];
  categorieActive: string | null;
}) {
  const total = data.reduce((acc, d) => acc + d.montant, 0);
  const taille = 160;
  const rayon = 62;
  const epaisseur = 22;
  const centre = taille / 2;
  const circonference = 2 * Math.PI * rayon;

  let cumul = 0;
  const segments = data
    .filter((d) => d.montant > 0)
    .map((d, i) => {
      const pct = d.montant / total;
      const dashArray = pct * circonference;
      const dashOffset = circonference * (1 - cumul);
      cumul += pct;
      return { ...d, dashArray, dashOffset, key: i };
    });

  return (
    <View
      style={{
        width: taille,
        height: taille,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg width={taille} height={taille}>
        {segments.map((seg) => (
          <Circle
            key={seg.key}
            cx={centre}
            cy={centre}
            r={rayon}
            stroke={seg.couleur}
            strokeWidth={
              categorieActive === seg.nom ? epaisseur + 6 : epaisseur
            }
            strokeOpacity={
              categorieActive && categorieActive !== seg.nom ? 0.3 : 1
            }
            strokeDasharray={`${seg.dashArray} ${circonference - seg.dashArray}`}
            strokeDashoffset={seg.dashOffset}
            fill="none"
            strokeLinecap="butt"
            transform={`rotate(-90 ${centre} ${centre})`}
          />
        ))}
      </Svg>
      <View style={{ position: "absolute", alignItems: "center" }}>
        <Text style={{ fontSize: 21, fontWeight: "700", color: "#1A1A1A" }}>
          {total} €
        </Text>
        <Text style={{ fontSize: 11, color: "#999" }}>dépensé</Text>
      </View>
    </View>
  );
}

export default function Analytics() {
  const objStore = useObjectifs();

  const [filtre, setFiltre] = useState("Mois");
  const [categorieSelectionnee, setCategorieSelectionnee] = useState<
    string | null
  >(null);
  const [modalCategorieVisible, setModalCategorieVisible] = useState(false);
  const [modalBudgetVisible, setModalBudgetVisible] = useState(false);
  const [modalEpargneVisible, setModalEpargneVisible] = useState(false);
  const [categorieDetail, setCategorieDetail] = useState<Categorie | null>(
    null,
  );

  const resteBudget = BUDGET_TOTAL - TOTAL;
  const estSousBudget = resteBudget >= 0;
  const moyenneJour = Math.round(TOTAL / JOURS_ECOULES);
  const projectionFinMois = Math.round(moyenneJour * JOURS_DANS_MOIS);
  const pctEpargneRevenu =
    BUDGET_TOTAL > 0
      ? Math.round((objStore.epargneMois / BUDGET_TOTAL) * 100)
      : 0;
  const variationTotal =
    TOTAL_MOIS_DERNIER > 0
      ? Math.round(((TOTAL - TOTAL_MOIS_DERNIER) / TOTAL_MOIS_DERNIER) * 100)
      : 0;

  const categorieDominante = [...CATEGORIES_DATA].sort(
    (a, b) => b.montant - a.montant,
  )[0];
  const pctDominante =
    TOTAL > 0 ? Math.round((categorieDominante.montant / TOTAL) * 100) : 0;

  const ouvrirCategorie = (cat: Categorie) => {
    setCategorieDetail(cat);
    setModalCategorieVisible(true);
  };

  const genererInsights = () => {
    const insights: { texte: string; type: "alerte" | "positif" | "neutre" }[] =
      [];

    CATEGORIES_DATA.forEach((cat) => {
      if (cat.moisDernier > 0) {
        const variation = Math.round(
          ((cat.montant - cat.moisDernier) / cat.moisDernier) * 100,
        );
        if (variation >= 25) {
          insights.push({
            texte: `Tu dépenses ${variation}% de plus en ${cat.nom.toLowerCase()} que le mois dernier`,
            type: "alerte",
          });
        }
      }
    });

    const economiePossible = CATEGORIES_DATA.filter(
      (c) => c.montant > c.budget * 0.8 && c.nom !== "Logement",
    );
    if (economiePossible.length > 0) {
      const cat = economiePossible[0];
      const economie = Math.round(cat.montant * 0.3);
      insights.push({
        texte: `Tu pourrais économiser environ ${economie}€ en réduisant les ${cat.nom.toLowerCase()}`,
        type: "neutre",
      });
    }

    if (estSousBudget) {
      insights.push({
        texte: `Bon rythme ce mois-ci, tu restes maîtrisé sur ton budget global`,
        type: "positif",
      });
    }

    if (projectionFinMois > BUDGET_TOTAL) {
      insights.push({
        texte: `À ce rythme, tu dépenseras environ ${projectionFinMois}€ ce mois — au-delà de ton budget`,
        type: "alerte",
      });
    }

    return insights.slice(0, 4);
  };

  const insights = genererInsights();

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.titre}>Statistiques</Text>
          <Text style={styles.sousTitre}>Vue d'ensemble · {filtre}</Text>
        </View>

        <View style={styles.filtres}>
          {FILTRES.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filtre, filtre === f && styles.filtreActif]}
              onPress={() => setFiltre(f)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.filtreTexte,
                  filtre === f && styles.filtreTexteActif,
                ]}
              >
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[
            styles.resumeBanner,
            { backgroundColor: estSousBudget ? VERT_LIGHT : ROUGE_LIGHT },
          ]}
          activeOpacity={0.7}
          onPress={() => setModalBudgetVisible(true)}
        >
          <Text style={styles.resumeEmoji}>{estSousBudget ? "👍" : "⚠️"}</Text>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.resumeTexte,
                { color: estSousBudget ? VERT : ROUGE },
              ]}
            >
              {estSousBudget
                ? `Ce mois-ci, tu es ${resteBudget}€ sous budget`
                : `Tu dépasses ton budget de ${Math.abs(resteBudget)}€`}
            </Text>
            <Text style={styles.resumeSub}>Toucher pour voir le détail</Text>
          </View>
          <Text style={styles.resumeFleche}>›</Text>
        </TouchableOpacity>

        <View style={styles.kpiGrid}>
          <TouchableOpacity
            style={[styles.kpiCard, { backgroundColor: MINT_LIGHT }]}
            activeOpacity={0.7}
            onPress={() => setModalBudgetVisible(true)}
          >
            <Text style={[styles.kpiVal, { color: "#0F6E56" }]}>{TOTAL} €</Text>
            <Text style={[styles.kpiLabel, { color: MINT }]}>
              Total dépensé
            </Text>
            <Text style={styles.kpiMicro}>
              {variationTotal >= 0 ? "↑" : "↓"} {Math.abs(variationTotal)}% vs
              mois dernier
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.kpiCard,
              { backgroundColor: estSousBudget ? PURPLE_LIGHT : ROUGE_LIGHT },
            ]}
            activeOpacity={0.7}
            onPress={() => setModalBudgetVisible(true)}
          >
            <Text
              style={[
                styles.kpiVal,
                { color: estSousBudget ? "#5A3DC4" : ROUGE },
              ]}
            >
              {resteBudget} €
            </Text>
            <Text
              style={[
                styles.kpiLabel,
                { color: estSousBudget ? PURPLE : ROUGE },
              ]}
            >
              {estSousBudget ? "Reste du budget" : "Dépassement"}
            </Text>
            <Text style={styles.kpiMicro}>
              {estSousBudget ? "Bonne maîtrise" : "À surveiller"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.kpiCard, { backgroundColor: MINT_LIGHT }]}
            activeOpacity={0.7}
            onPress={() => setModalEpargneVisible(true)}
          >
            <Text style={[styles.kpiVal, { color: "#0F6E56" }]}>
              {objStore.epargneMois} €
            </Text>
            <Text style={[styles.kpiLabel, { color: MINT }]}>
              Épargne réalisée
            </Text>
            <Text style={styles.kpiMicro}>
              {objStore.epargneMois > 0
                ? "Bon rythme"
                : "Aucune donnée disponible"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.kpiCard, { backgroundColor: PEACH_LIGHT }]}
            activeOpacity={0.7}
            onPress={() => setModalEpargneVisible(true)}
          >
            <Text style={[styles.kpiVal, { color: "#993C1D" }]}>
              {pctEpargneRevenu}%
            </Text>
            <Text style={[styles.kpiLabel, { color: PEACH }]}>% épargné</Text>
            <Text style={styles.kpiMicro}>du budget disponible</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.kpiCardFull, { backgroundColor: "#FAFAFA" }]}
            activeOpacity={0.7}
          >
            <View>
              <Text style={[styles.kpiVal, { color: "#1A1A1A", fontSize: 19 }]}>
                {moyenneJour} €/jour
              </Text>
              <Text style={[styles.kpiLabel, { color: "#999" }]}>
                Dépense moyenne
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text
                style={[
                  styles.kpiMicro,
                  { color: projectionFinMois > BUDGET_TOTAL ? ROUGE : "#999" },
                ]}
              >
                Projection fin de mois
              </Text>
              <Text
                style={[
                  styles.kpiVal,
                  {
                    fontSize: 17,
                    color: projectionFinMois > BUDGET_TOTAL ? ROUGE : "#1A1A1A",
                  },
                ]}
              >
                ~{projectionFinMois} €
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitre}>Répartition des dépenses</Text>
          <View style={styles.graphContent}>
            <DonutChart
              data={CATEGORIES_DATA}
              categorieActive={categorieSelectionnee}
            />
            <View style={styles.legendeCol}>
              {CATEGORIES_DATA.map((cat) => {
                const pct =
                  TOTAL > 0 ? Math.round((cat.montant / TOTAL) * 100) : 0;
                const estActive = categorieSelectionnee === cat.nom;
                return (
                  <TouchableOpacity
                    key={cat.nom}
                    style={[
                      styles.legendeItem,
                      estActive && styles.legendeItemActive,
                    ]}
                    activeOpacity={0.6}
                    onPress={() =>
                      setCategorieSelectionnee(
                        categorieSelectionnee === cat.nom ? null : cat.nom,
                      )
                    }
                  >
                    <View
                      style={[
                        styles.legendeDot,
                        { backgroundColor: cat.couleur },
                      ]}
                    />
                    <Text style={styles.legendeNom} numberOfLines={1}>
                      {cat.nom}
                    </Text>
                    <Text style={styles.legendePct}>{pct}%</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <View style={styles.highlightBanner}>
            <Text style={styles.highlightTexte}>
              💡 {categorieDominante.nom} représente {pctDominante}% de tes
              dépenses ce mois-ci
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>DÉTAIL PAR CATÉGORIE</Text>
        {CATEGORIES_DATA.map((cat) => {
          const pct = Math.min((cat.montant / cat.budget) * 100, 100);
          const statut = pct >= 100 ? "depasse" : pct >= 80 ? "proche" : "ok";
          const statutEmoji =
            statut === "depasse" ? "🔴" : statut === "proche" ? "🟠" : "🟢";
          const variation =
            cat.moisDernier > 0
              ? Math.round(
                  ((cat.montant - cat.moisDernier) / cat.moisDernier) * 100,
                )
              : 0;

          return (
            <TouchableOpacity
              key={cat.nom}
              style={styles.catCard}
              activeOpacity={0.7}
              onPress={() => ouvrirCategorie(cat)}
            >
              <View style={styles.catHeader}>
                <View style={styles.catLeft}>
                  <Text style={styles.catEmoji}>{statutEmoji}</Text>
                  <Text style={styles.catNom}>{cat.nom}</Text>
                </View>
                <Text style={[styles.catMontant, { color: cat.couleur }]}>
                  {cat.montant} € / {cat.budget} €
                </Text>
              </View>
              <View style={styles.catBarBg}>
                <View
                  style={[
                    styles.catBarFill,
                    { width: `${pct}%`, backgroundColor: cat.couleur },
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.catVariation,
                  { color: variation > 0 ? ROUGE : VERT },
                ]}
              >
                {cat.moisDernier > 0
                  ? `${variation > 0 ? "+" : ""}${variation}% vs mois dernier`
                  : "Aucune donnée disponible"}
              </Text>
            </TouchableOpacity>
          );
        })}

        <Text style={styles.sectionTitle}>ÉPARGNE & OBJECTIFS</Text>
        <View style={styles.card}>
          <View style={styles.epargneHeader}>
            <Text style={styles.epargneEmoji}>💵</Text>
            <View>
              <Text style={styles.epargneMontant}>
                {objStore.epargneMois} € mis de côté
              </Text>
              <Text style={styles.epargneSousTexte}>ce mois-ci</Text>
            </View>
          </View>

          {objStore.objectifs.length === 0 && (
            <Text style={styles.modalVide}>
              Aucun objectif créé — crée-en un depuis l'accueil
            </Text>
          )}

          {objStore.objectifs.map((obj) => {
            const pct = Math.min((obj.actuel / obj.cible) * 100, 100);
            return (
              <TouchableOpacity
                key={obj.id}
                style={styles.objectifItem}
                activeOpacity={0.7}
                onPress={() => setModalEpargneVisible(true)}
              >
                <View style={styles.objectifHeader}>
                  <Text style={styles.objectifNom}>{obj.nom}</Text>
                  <Text
                    style={[styles.objectifMontant, { color: obj.couleur }]}
                  >
                    {obj.actuel}€ / {obj.cible}€
                  </Text>
                </View>
                <View style={styles.catBarBg}>
                  <View
                    style={[
                      styles.catBarFill,
                      { width: `${pct}%`, backgroundColor: obj.couleur },
                    ]}
                  />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>CE QU'IL FAUT RETENIR</Text>
        <View style={styles.insightsCard}>
          {insights.map((insight, i) => (
            <View
              key={i}
              style={[
                styles.insightItem,
                i < insights.length - 1 && styles.insightBorder,
              ]}
            >
              <View
                style={[
                  styles.insightDot,
                  {
                    backgroundColor:
                      insight.type === "alerte"
                        ? ROUGE
                        : insight.type === "positif"
                          ? VERT
                          : PURPLE,
                  },
                ]}
              />
              <Text style={styles.insightTexte}>{insight.texte}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>TOP DÉPENSES</Text>
        <View style={styles.card}>
          {TOP_DEPENSES.map((dep, i) => (
            <TouchableOpacity
              key={i}
              style={styles.topItem}
              activeOpacity={0.7}
            >
              <View style={[styles.topRank, { backgroundColor: dep.couleur }]}>
                <Text style={styles.topRankTexte}>{i + 1}</Text>
              </View>
              <View style={styles.topContent}>
                <Text style={styles.topNom}>{dep.nom}</Text>
                <Text style={styles.topCat}>
                  {dep.categorie} · {dep.date}
                </Text>
              </View>
              <Text style={[styles.topMontant, { color: dep.couleur }]}>
                {dep.montant} €
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>

      <Modal
        visible={modalCategorieVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalCategorieVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalCategorieVisible(false)}
        >
          <View style={styles.modalCard}>
            {categorieDetail && (
              <>
                <Text style={styles.modalTitre}>{categorieDetail.nom}</Text>
                <View style={styles.modalStatsRow}>
                  <View style={styles.modalStat}>
                    <Text style={styles.modalStatLabel}>DÉPENSÉ</Text>
                    <Text
                      style={[
                        styles.modalStatVal,
                        { color: categorieDetail.couleur },
                      ]}
                    >
                      {categorieDetail.montant} €
                    </Text>
                  </View>
                  <View style={styles.modalStat}>
                    <Text style={styles.modalStatLabel}>BUDGET</Text>
                    <Text style={styles.modalStatVal}>
                      {categorieDetail.budget} €
                    </Text>
                  </View>
                  <View style={styles.modalStat}>
                    <Text style={styles.modalStatLabel}>MOIS DERNIER</Text>
                    <Text style={styles.modalStatVal}>
                      {categorieDetail.moisDernier > 0
                        ? `${categorieDetail.moisDernier} €`
                        : "—"}
                    </Text>
                  </View>
                </View>
                <Text style={styles.modalTransactionsTitre}>
                  Dernières transactions
                </Text>
                {TOP_DEPENSES.filter(
                  (d) => d.categorie === categorieDetail.nom,
                ).map((dep, i) => (
                  <View key={i} style={styles.modalTxItem}>
                    <Text style={styles.modalTxNom}>{dep.nom}</Text>
                    <Text style={styles.modalTxDate}>{dep.date}</Text>
                    <Text
                      style={[
                        styles.modalTxMontant,
                        { color: categorieDetail.couleur },
                      ]}
                    >
                      - {dep.montant} €
                    </Text>
                  </View>
                ))}
                {TOP_DEPENSES.filter((d) => d.categorie === categorieDetail.nom)
                  .length === 0 && (
                  <Text style={styles.modalVide}>Aucune donnée disponible</Text>
                )}
                <TouchableOpacity
                  style={styles.btnFermer}
                  onPress={() => setModalCategorieVisible(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.btnFermerTexte}>Fermer</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={modalBudgetVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalBudgetVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalBudgetVisible(false)}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitre}>Budget vs réel</Text>
            <View style={styles.modalStatsRow}>
              <View style={styles.modalStat}>
                <Text style={styles.modalStatLabel}>BUDGET</Text>
                <Text style={styles.modalStatVal}>{BUDGET_TOTAL} €</Text>
              </View>
              <View style={styles.modalStat}>
                <Text style={styles.modalStatLabel}>DÉPENSÉ</Text>
                <Text style={[styles.modalStatVal, { color: PURPLE }]}>
                  {TOTAL} €
                </Text>
              </View>
              <View style={styles.modalStat}>
                <Text style={styles.modalStatLabel}>
                  {estSousBudget ? "RESTANT" : "DÉPASSEMENT"}
                </Text>
                <Text
                  style={[
                    styles.modalStatVal,
                    { color: estSousBudget ? VERT : ROUGE },
                  ]}
                >
                  {Math.abs(resteBudget)} €
                </Text>
              </View>
            </View>
            <Text style={styles.modalTransactionsTitre}>Par catégorie</Text>
            {CATEGORIES_DATA.map((cat, i) => (
              <View key={i} style={styles.modalTxItem}>
                <View
                  style={[styles.legendeDot, { backgroundColor: cat.couleur }]}
                />
                <Text style={[styles.modalTxNom, { flex: 1, marginLeft: 8 }]}>
                  {cat.nom}
                </Text>
                <Text style={styles.modalTxMontant}>
                  {cat.montant} € / {cat.budget} €
                </Text>
              </View>
            ))}
            <TouchableOpacity
              style={styles.btnFermer}
              onPress={() => setModalBudgetVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.btnFermerTexte}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={modalEpargneVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalEpargneVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalEpargneVisible(false)}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitre}>Épargne & objectifs</Text>
            <View style={styles.modalStatsRow}>
              <View style={styles.modalStat}>
                <Text style={styles.modalStatLabel}>CE MOIS</Text>
                <Text style={[styles.modalStatVal, { color: MINT }]}>
                  {objStore.epargneMois} €
                </Text>
              </View>
              <View style={styles.modalStat}>
                <Text style={styles.modalStatLabel}>% DU BUDGET</Text>
                <Text style={styles.modalStatVal}>{pctEpargneRevenu}%</Text>
              </View>
            </View>
            <Text style={styles.modalTransactionsTitre}>
              Objectifs en cours
            </Text>
            {objStore.objectifs.length === 0 && (
              <Text style={styles.modalVide}>
                Aucun objectif créé — crée-en un depuis l'accueil
              </Text>
            )}
            {objStore.objectifs.map((obj) => {
              const pct = Math.min((obj.actuel / obj.cible) * 100, 100);
              return (
                <View key={obj.id} style={{ marginBottom: 14 }}>
                  <View style={styles.objectifHeader}>
                    <Text style={styles.objectifNom}>{obj.nom}</Text>
                    <Text
                      style={[styles.objectifMontant, { color: obj.couleur }]}
                    >
                      {obj.actuel}€ / {obj.cible}€
                    </Text>
                  </View>
                  <View style={styles.catBarBg}>
                    <View
                      style={[
                        styles.catBarFill,
                        { width: `${pct}%`, backgroundColor: obj.couleur },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
            <TouchableOpacity
              style={styles.btnFermer}
              onPress={() => setModalEpargneVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.btnFermerTexte}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF", paddingHorizontal: 20 },
  header: { marginTop: 60, marginBottom: 16 },
  titre: {
    fontSize: 23,
    fontWeight: "700",
    color: "#1A1A1A",
    letterSpacing: 1,
  },
  sousTitre: { fontSize: 14, color: "#999", marginTop: 2 },
  filtres: {
    flexDirection: "row",
    backgroundColor: "#F7F7F7",
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  filtre: {
    flex: 1,
    paddingVertical: 11,
    alignItems: "center",
    borderRadius: 10,
  },
  filtreActif: { backgroundColor: "#FFFFFF" },
  filtreTexte: { fontSize: 14, color: "#999", fontWeight: "500" },
  filtreTexteActif: { color: PURPLE, fontWeight: "700" },
  resumeBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
    gap: 12,
  },
  resumeEmoji: { fontSize: 24 },
  resumeTexte: { fontSize: 15, fontWeight: "700" },
  resumeSub: { fontSize: 12, color: "#999", marginTop: 2 },
  resumeFleche: { fontSize: 24, color: "#BBB" },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  kpiCard: { width: "47%", borderRadius: 16, padding: 16 },
  kpiCardFull: {
    width: "100%",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 0.5,
    borderColor: "#EEE",
  },
  kpiVal: { fontSize: 19, fontWeight: "700", marginBottom: 5 },
  kpiLabel: { fontSize: 12, fontWeight: "700", marginBottom: 5 },
  kpiMicro: { fontSize: 11, color: "#999", fontWeight: "500" },
  card: {
    backgroundColor: "#FAFAFA",
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 0.5,
    borderColor: "#F0EEF8",
  },
  cardTitre: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 18,
  },
  graphContent: { flexDirection: "row", alignItems: "center" },
  legendeCol: { flex: 1, paddingLeft: 16, gap: 8 },
  legendeItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 5,
    paddingHorizontal: 7,
    borderRadius: 9,
  },
  legendeItemActive: { backgroundColor: "rgba(0,0,0,0.04)" },
  legendeDot: { width: 10, height: 10, borderRadius: 5 },
  legendeNom: { flex: 1, fontSize: 13, color: "#1A1A1A" },
  legendePct: { fontSize: 13, color: "#999", fontWeight: "700" },
  highlightBanner: {
    backgroundColor: "#FFFFFF",
    borderRadius: 13,
    padding: 14,
    marginTop: 18,
    borderWidth: 0.5,
    borderColor: "#EEE",
  },
  highlightTexte: { fontSize: 13, color: "#666", lineHeight: 19 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#999",
    letterSpacing: 1,
    marginBottom: 14,
    marginTop: 4,
  },
  catCard: {
    backgroundColor: "#FAFAFA",
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 0.5,
    borderColor: "#F0EEF8",
  },
  catHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 9,
  },
  catLeft: { flexDirection: "row", alignItems: "center", gap: 7 },
  catEmoji: { fontSize: 13 },
  catNom: { fontSize: 15, fontWeight: "700", color: "#1A1A1A" },
  catMontant: { fontSize: 14, fontWeight: "700" },
  catBarBg: {
    height: 6,
    backgroundColor: "#EEEEEE",
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 7,
  },
  catBarFill: { height: "100%", borderRadius: 3 },
  catVariation: { fontSize: 12, fontWeight: "600" },
  epargneHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    marginBottom: 18,
  },
  epargneEmoji: { fontSize: 28 },
  epargneMontant: { fontSize: 17, fontWeight: "700", color: "#1A1A1A" },
  epargneSousTexte: { fontSize: 13, color: "#999" },
  objectifItem: { marginBottom: 13 },
  objectifHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 7,
  },
  objectifNom: { fontSize: 14, fontWeight: "700", color: "#1A1A1A" },
  objectifMontant: { fontSize: 13, fontWeight: "700" },
  insightsCard: {
    backgroundColor: PURPLE_LIGHT,
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
  },
  insightItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    paddingVertical: 11,
  },
  insightBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(139,111,232,0.2)",
  },
  insightDot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
  insightTexte: { flex: 1, fontSize: 14, color: "#1A1A1A", lineHeight: 20 },
  topItem: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 13,
    padding: 11,
    marginBottom: 5,
    gap: 13,
  },
  topRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  topRankTexte: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  topContent: { flex: 1 },
  topNom: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1A1A1A",
    marginBottom: 2,
  },
  topCat: { fontSize: 12, color: "#999" },
  topMontant: { fontSize: 15, fontWeight: "700" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 26,
    paddingBottom: 40,
    maxHeight: "80%",
  },
  modalTitre: {
    fontSize: 21,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 20,
  },
  modalStatsRow: { flexDirection: "row", gap: 8, marginBottom: 22 },
  modalStat: {
    flex: 1,
    backgroundColor: "#F7F7F7",
    borderRadius: 13,
    padding: 13,
    alignItems: "center",
  },
  modalStatLabel: {
    fontSize: 10,
    color: "#999",
    fontWeight: "700",
    marginBottom: 5,
  },
  modalStatVal: { fontSize: 16, fontWeight: "700", color: "#1A1A1A" },
  modalTransactionsTitre: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1A1A1A",
    marginBottom: 11,
  },
  modalTxItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 0.5,
    borderBottomColor: "#F0F0F0",
  },
  modalTxNom: { fontSize: 14, color: "#1A1A1A" },
  modalTxDate: { fontSize: 12, color: "#999", marginHorizontal: 8 },
  modalTxMontant: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1A1A1A",
    marginLeft: "auto",
  },
  modalVide: {
    fontSize: 14,
    color: "#BBB",
    textAlign: "center",
    paddingVertical: 14,
  },
  btnFermer: {
    backgroundColor: "#F7F7F7",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    marginTop: 18,
  },
  btnFermerTexte: { fontSize: 15, color: "#666", fontWeight: "700" },
});
