export type EntreeCalcul = {
  titre: string;
  explication: string;
};

export type PageCalculs = {
  page: string;
  entrees: EntreeCalcul[];
};

export const CALCULS_DOC: PageCalculs[] = [
  {
    page: "Aperçu",
    entrees: [
      {
        titre: "BUDGET",
        explication:
          "La somme de toutes les entrées de Budget comptées pour le mois en cours — déjà reçues et encore attendues confondues. Chaque entrée est ajoutée via \"+ Ajouter une entrée\" sur cette carte (ou via une catégorie \"Entrée d'argent\" créée ailleurs dans l'app — même mécanisme, même liste, seuls la présentation et le libellé diffèrent). Une entrée compte pour le mois indiqué par son sélecteur \"Compter pour le mois de\" à la création (par défaut le mois calendaire de sa date réelle, mais modifiable), pas forcément le mois de sa date réelle. C'est ce total — pas une seule entrée — qui est utilisé partout ailleurs dans l'app (Budget, Stats) chaque fois qu'il est question du \"Budget\".",
      },
      {
        titre: "X entrée(s) ce mois-ci",
        explication:
          "Sous-ligne dépliable sous BUDGET, qui liste chaque entrée comptée pour le mois en cours avec son nom, son montant et sa date — reçues et encore attendues confondues (les entrées encore attendues sont affichées dans une couleur plus neutre).",
      },
      {
        titre: "RESTE ESTIMÉ EN FIN DE MOIS",
        explication:
          "Une projection de fin de mois, pas un solde déjà réalisé : BUDGET (voir ci-dessus, la somme des entrées de Budget comptées pour ce mois) moins tout ce qui est prévu d'être dépensé ce mois-ci (Dépensé + Dépense prévue, soit le budget complet de chaque catégorie de dépense, qu'il soit déjà consommé ou non — une catégorie déjà en dépassement contribue son dépassement réel, jamais moins que ça) moins l'argent immobilisé (épargne + objectifs mis de côté ce mois-ci). Le libellé et la couleur changent selon un seuil sur ce même total : \"RESTE ESTIMÉ EN FIN DE MOIS\" si le reste dépasse 15% du BUDGET, \"RESTE ESTIMÉ — BUDGET SERRÉ\" en dessous de ce seuil, \"DÉPASSEMENT ESTIMÉ EN FIN DE MOIS\" si le reste est négatif (le montant affiché devient alors la valeur absolue du dépassement). Important : comme ce chiffre compte les dépenses encore seulement prévues, il ne correspond plus exactement au montant réellement reporté au mois suivant — voir \"Reporter le reste non dépensé\" plus bas, qui lui ne reporte que les flux déjà réalisés.",
      },
      {
        titre: "Bandeau de projection (\"Il te restera environ...\")",
        explication:
          "N'est pas un deuxième calcul : ce bandeau met en phrase exactement le même montant que \"RESTE ESTIMÉ EN FIN DE MOIS\" ci-dessus (aucune extrapolation séparée du rythme de dépense) — chiffre principal, phrase et delta vs mois dernier découlent tous de la même valeur, pour ne jamais afficher deux estimations qui pourraient se contredire. Si ce montant est positif ou nul : \"Il te restera environ [X]€ à la fin du mois si tu continues comme ça.\" S'il est négatif : \"Si tu continues comme ça, tu risques d'être à environ [X]€ de dépassement en fin de mois.\"",
      },
      {
        titre: "Nos conseils",
        explication:
          "Sous le bandeau de projection, jusqu'à 3 phrases de coaching courtes, sans jargon, choisies parmi une dizaine de règles possibles et classées par ordre de priorité (dépassement de budget en premier, bonnes nouvelles en dernier) — seules les 2-3 plus pertinentes du moment s'affichent, jamais une liste qui s'allonge. Chaque règle regarde un signal déjà utilisé ailleurs dans l'app (le \"reste estimé\" ci-dessus, le taux d'épargne et le rythme des objectifs de Stats, la plus grosse dépense de Budget) ou compare le cumul de dépenses d'une catégorie à celui du mois dernier au même jour. Une puce verte signale une bonne nouvelle, orange une vigilance, rouge une alerte (dépassement réel ou quasi certain). Recalculé à chaque rendu à partir des données du mois en cours, jamais mis en cache.",
      },
      {
        titre: "+X € / +X % vs mois dernier",
        explication:
          "Écart entre le Reste estimé de ce mois et celui du mois dernier archivé, rejoué avec la même formule (Dépensé + Dépense prévue du snapshot archivé) sur les valeurs figées du mois précédent — comparé mois complet à mois complet. Un tap sur la valeur bascule l'affichage entre euros et pourcentage (pourcentage non disponible si le reste du mois dernier était nul).",
      },
      {
        titre: "Ordre des segments de la barre de progression et de sa légende",
        explication:
          "Dans cet ordre, sur la barre comme dans la légende juste en dessous : \"Dépensé\", puis \"Argent immobilisé\", puis \"Dépense prévue\". Le reste de la barre (entrées de Budget déjà reçues ou encore attendues ce mois-ci) n'a plus de couleur ni de nom propre — il se fond avec le fond neutre de la barre, comme de l'argent encore disponible. Ces montants restent comptés normalement dans BUDGET et dans RESTE ESTIMÉ EN FIN DE MOIS ci-dessus : seul l'affichage détaillé de la barre a changé, aucune formule.",
      },
      {
        titre: "Légende « Argent immobilisé »",
        explication:
          "Sous la barre de progression, l'épargne générique et les versements aux objectifs sont regroupés sous une seule pastille \"Argent immobilisé\" (total combiné) — la barre de progression fusionne alors aussi ses deux segments en un seul, de la même couleur que la pastille. Un tap la déplie en deux pastilles, \"Épargne\" (versements hors objectif) et \"Objectifs\" (somme des versements à tes objectifs actifs) ; la barre se redécompose alors en deux segments correspondants. \"Dépense prévue\" (montant encore budgété mais non dépensé dans les catégories de dépense) reste affiché en permanence, à part, non concerné par ce dépli.",
      },
      {
        titre: "Rayures diagonales sur la barre de progression",
        explication:
          "Distingue visuellement ce qui est déjà réalisé/engagé (couleur pleine) de ce qui reste une prévision (rayures diagonales légères, y compris sur la petite pastille de légende correspondante). En rayures : \"Dépense prévue\" (budget de catégorie pas encore dépensé). En couleur pleine : \"Dépensé\" et \"Argent immobilisé\", qui sont soit déjà sortis, soit déjà mis de côté — jamais une prévision incertaine.",
      },
      {
        titre: "Mis de côté ce mois",
        explication:
          "Le total épargné ce mois-ci, versements manuels et versements automatiques de tes objectifs récurrents confondus.",
      },
      {
        titre: "{X}€ de dépenses non catégorisées",
        explication:
          "Somme des événements financiers du Planning qui n'ont aucune catégorie liée, dont la date est déjà passée et tombe dans le mois en cours.",
      },
      {
        titre: "Barre de progression d'une catégorie",
        explication:
          "Dépensé divisé par le budget de la catégorie, affiché en pourcentage (plafonné visuellement à 100%, même si la dépense réelle le dépasse).",
      },
      {
        titre: "Vue d'ensemble des dépenses (graphique en anneau)",
        explication:
          "Chaque tranche représente la dépense d'une catégorie (hors Entrée d'argent) divisée par le total dépensé sur l'ensemble de ces catégories. Le pourcentage affiché dans la légende suit la même logique.",
      },
      {
        titre: "Progression d'un objectif d'épargne",
        explication:
          "Montant actuel divisé par le montant cible, plafonné à 100%. Le badge \"Atteint\" apparaît dès que le montant actuel est supérieur ou égal à la cible (la catégorie doit ensuite être clôturée manuellement pour ne plus être alimentée automatiquement — voir plus bas).",
      },
      {
        titre: "Reporter le reste non dépensé",
        explication:
          "Ce switch, affiché directement sur la carte BUDGET, détermine ce qui alimente le Budget du mois suivant. À la clôture du mois, le reste reporté n'est pas calculé comme \"RESTE ESTIMÉ EN FIN DE MOIS\" ci-dessus, mais uniquement à partir de ce qui a été réellement réalisé, jamais des dépenses encore prévues : BUDGET du mois − dépenses réelles − épargne mise de côté. Si le switch est activé, ce reste réalisé devient automatiquement une nouvelle entrée « Report du mois précédent » comptée pour le mois suivant. Séparément, chaque entrée de Budget marquée \"Répéter ce montant chaque mois\" est elle aussi reconduite pour le mois suivant sous forme d'une nouvelle entrée identique — les deux mécanismes s'additionnent, ils ne s'excluent pas. Ce total reporté est donc généralement différent (plus élevé) de ce qu'affichait \"RESTE ESTIMÉ EN FIN DE MOIS\" juste avant la clôture, puisque celui-ci avait déjà déduit les dépenses encore seulement prévues.",
      },
    ],
  },
  {
    page: "Budget",
    entrees: [
      {
        titre: "DÉPENSES ET ARGENT IMMOBILISÉ",
        explication:
          "Somme des dépenses réelles de tes catégories (hors catégories \"Entrée d'argent\"), plus l'argent immobilisé — l'épargne et les objectifs — que tu as mis de côté ce mois-ci. Cet argent reste à toi, mais n'est plus disponible immédiatement. Cette carte a remplacé l'ancien \"TOTAL DÉPENSÉ\" et vient d'Aperçu, où elle n'apparaît plus.",
      },
      {
        titre: "+X € vs mois dernier (au J)",
        explication:
          "Compare les dépenses cumulées de ce mois à celles du mois dernier au même jour du mois (cumul reconstruit depuis les transactions/paiements individuels, jamais purgés) — pas au mois dernier entier, pour ne pas comparer un mois en cours forcément partiel à un mois complet. Un \"Voir l'historique\" déplie les 6 derniers mois archivés avec le même cumul \"au même jour\".",
      },
      {
        titre: "Ordre des segments de la barre de progression et de sa légende",
        explication:
          "Dans cet ordre, sur la barre comme dans la légende juste en dessous : \"Dépenses\", puis \"Argent immobilisé\". Le reste de la barre (entrées d'argent déjà reçues ou encore attendues ce mois-ci) n'a plus de couleur ni de nom propre — il se fond avec le fond neutre de la barre, comme de l'argent encore disponible. Ces montants restent comptés normalement dans le budget mensuel affiché ci-dessous : seul l'affichage détaillé de la barre a changé, aucune formule.",
      },
      {
        titre: "Légende « Argent immobilisé »",
        explication:
          "Sous la barre de progression, l'épargne générique et les versements aux objectifs sont regroupés sous une seule pastille \"Argent immobilisé\" (total combiné) — la barre de progression fusionne alors aussi ses deux segments en un seul, de la même couleur que la pastille. Un tap la déplie en deux pastilles, \"Épargne\" (versements hors objectif) et \"Objectifs\" (somme des versements à tes objectifs actifs) ; la barre se redécompose alors en deux segments correspondants.",
      },
      {
        titre: "/ {X}€ budget mensuel",
        explication:
          "Le même total combiné que BUDGET sur Aperçu : la somme des entrées de Budget comptées pour ce mois, déjà reçues et encore attendues confondues.",
      },
      {
        titre: "\"X représente ta plus grosse dépense ce mois-ci\"",
        explication:
          "Repère la catégorie de dépense (Fixe ou Variable, hors Entrée d'argent) qui a la dépense réelle la plus élevée du mois — affiché seulement si cette dépense est supérieure à 0. Recalculé à chaque rendu à partir des catégories courantes, jamais mis en cache : une nouvelle transaction, un montant modifié ou une catégorie supprimée s'y reflètent immédiatement.",
      },
      {
        titre: "Barre de progression d'une catégorie",
        explication:
          "Identique à Aperçu : dépensé divisé par le budget de la catégorie.",
      },
      {
        titre: "Alerte \"% du budget total\" (à venir ce mois-ci)",
        explication:
          "Pour chaque dépense à venir (catégorie fixe non payée, événement Planning lié, etc.), son montant est divisé par le budget mensuel total. L'alerte ne s'affiche que si ce pourcentage atteint 30% ou plus.",
      },
      {
        titre: "Entrées d'argent reçues / Catégories fixes payées",
        explication:
          "Une fois qu'une entrée d'argent ou une dépense fixe est marquée comme reçue/payée, son montant prévu s'affiche tel quel avec une barre pleine à 100% — ce n'est pas un calcul, c'est le montant que tu as confirmé.",
      },
    ],
  },
  {
    page: "Stats",
    entrees: [
      {
        titre: "DÉPENSE MOY. / JOUR",
        explication:
          "Dépenses réelles du mois en cours (hors Entrée d'argent), divisées par le nombre de jours déjà écoulés dans le mois. La comparaison \"vs mois dernier\" prend les dépenses réelles du mois précédent divisées par 30 jours fixes (pas le nombre exact de jours de ce mois-là) : un tap sur la valeur bascule l'affichage entre variation en % (par défaut) et écart en €, comme les autres comparaisons mois-à-mois de l'app.",
      },
      {
        titre: "TAUX D'ÉPARGNE",
        explication:
          "Épargne du mois divisée par le Budget combiné du mois (même formule que BUDGET sur Aperçu), exprimée en pourcentage.",
      },
      {
        titre: "Graphique \"Évolution\"",
        explication:
          "Trois courbes sur la période sélectionnée : Budget (le total combiné, mois par mois), Épargne (épargne mise de côté ce mois-là, versements aux objectifs inclus), et Dépenses (dépenses réelles hors Entrée d'argent). Un tap sur un point affiche le détail des trois valeurs pour ce mois précis.",
      },
      {
        titre: "Graphique \"Dépensé vs dépenses prévues\"",
        explication:
          "La courbe \"Dépensé\" reprend les dépenses réelles ; la courbe \"Dépenses prévues\" additionne les budgets définis pour chaque catégorie (hors Entrée d'argent), mois par mois sur la période sélectionnée.",
      },
      {
        titre: "Graphique \"Épargne dans le temps\"",
        explication:
          "Une barre par mois de la période sélectionnée, hauteur proportionnelle à l'épargne mise de côté ce mois-là.",
      },
      {
        titre: "Ce qu'il faut retenir",
        explication:
          "Jusqu'à 3 phrases générées automatiquement à partir de la période sélectionnée (pas du seul mois en cours, voir \"Nos conseils\" sur Aperçu pour le coaching mensuel) : tendance des dépenses et de l'épargne entre le début et la fin de la période (à partir de 15% d'écart), mois le plus dépensier de la période, nombre de mois où le budget a été respecté, record de régularité tout juste établi (série en cours égale au record historique, à partir de 3 mois), et stabilité ou volatilité des dépenses d'un mois à l'autre. Les mois antérieurs au début de l'usage de l'app (zéro-remplis) sont ignorés dans ces calculs. Si aucun signal n'est disponible (pas assez d'historique sur cette période), un message neutre l'indique.",
      },
      {
        titre: "Comparaison \"{Mois} vs {Mois précédent}\"",
        explication:
          "L'écart en haut de la carte est la variation en % des dépenses totales du mois vs le mois précédent. Pour chaque catégorie, le pourcentage affiché est sa dépense réelle divisée par son propre budget.",
      },
      {
        titre: "Objectifs d'épargne (Stats)",
        explication:
          "Même calcul de progression qu'sur Aperçu (actuel / cible, plafonné à 100%), avec en plus l'écart en euros par rapport au montant atteint le mois précédent, quand cette donnée est disponible.",
      },
      {
        titre: "\"À ce rythme, encore environ {X} mois.\"",
        explication:
          "Sous la jauge de chaque objectif : (cible − actuel) divisé par le rythme mensuel récent. Ce rythme est le montant mensuel fixe si l'objectif est récurrent (signal le plus fiable), sinon la moyenne des versements réels des 3 derniers mois (reconstruits à partir de l'\"actuel\" archivé mois par mois, plus le mois en cours) — ou, s'il n'y a pas assez d'historique, le seul versement de ce mois-ci. N'apparaît pas si la cible est déjà atteinte. Si le rythme récent est nul ou négatif, affiche \"Rythme actuel insuffisant pour estimer une date\" à la place plutôt qu'une estimation absurde.",
      },
      {
        titre: "Répartition des dépenses / Entrées d'argent",
        explication:
          "Pour chaque catégorie du groupe concerné (dépenses hors Entrée d'argent, ou catégories Entrée d'argent), son montant est divisé par le total du groupe pour obtenir son pourcentage — sur la période sélectionnée.",
      },
      {
        titre: "Top dépenses — {N} derniers mois",
        explication:
          "Les 5 montants individuels les plus élevés (une catégorie, un mois donné) sur toute la période sélectionnée, triés du plus grand au plus petit. Une même catégorie peut apparaître plusieurs fois si elle a eu de grosses dépenses sur différents mois — ce n'est pas un total par catégorie.",
      },
      {
        titre: "Séries — Épargne croissante",
        explication:
          "Compte les mois consécutifs où l'épargne du mois est strictement supérieure à celle du mois précédent. Le premier mois suivi ne peut jamais qualifier ce critère (il n'y a pas de mois précédent à comparer). \"Record\" est la plus longue série jamais atteinte, même si la série en cours est différente ou rompue.",
      },
      {
        titre: "Séries — Budget respecté",
        explication:
          "Compte les mois consécutifs où les dépenses réelles (hors Entrée d'argent) sont restées inférieures ou égales au budget total de tes catégories. Si aucun budget n'est défini un mois donné, ce mois ne compte pas comme respecté.",
      },
      {
        titre: "Séries — Épargne constante",
        explication:
          "Compte les mois consécutifs où l'épargne du mois atteint le seuil que tu as toi-même défini. Tant qu'aucun seuil n'est défini, aucun mois ne peut valider cette série.",
      },
      {
        titre: "Séries — \"Ce mois-ci : ...\"",
        explication:
          "Sous le nombre de mois de chaque série, une phrase explique avec les vrais chiffres du mois en cours pourquoi la série continue ou repart à zéro (ex. épargne de ce mois vs mois dernier, dépenses vs budget, épargne vs seuil). N'apparaît pas si la donnée nécessaire manque encore (premier mois d'historique, aucun budget défini, aucun seuil configuré).",
      },
      {
        titre: "Score de santé financière",
        explication:
          "Une moyenne pondérée de 3 signaux, ramenée sur 100 : le respect du budget du mois en cours (40% — 100 si les dépenses réelles restent sous le budget total, puis descend de 2 points par tranche de 1% de dépassement, jusqu'à 0), la tendance d'épargne récente (30% — reprend la série \"Épargne croissante\", 6 mois consécutifs ou plus donnant le score maximum), et la progression moyenne de tes objectifs d'épargne actifs (30% — moyenne de actuel/cible sur tous les objectifs non clôturés). Si un signal ne peut pas être calculé (aucun budget défini, aucun objectif actif...), son poids est redistribué sur les signaux restants plutôt que de faire baisser artificiellement le score. Le mot-clé associé : 75 et plus = \"Solide\", 50 à 74 = \"À surveiller\", en dessous de 50 = \"Attention\".",
      },
      {
        titre: "Simulateur — puces explicatives",
        explication:
          "Sous le curseur de budget simulé, jusqu'à 3 puces détaillent les hypothèses derrière la projection : la moyenne d'épargne réelle des derniers mois (jusqu'à 6, moins si l'historique est plus court) qui sert de base à la trajectoire actuelle, l'écart mensuel introduit par l'ajustement du curseur, et son cumul sur la période de projection. Les deux dernières n'apparaissent pas si le budget simulé est identique au budget actuel (rien à expliquer).",
      },
    ],
  },
];
