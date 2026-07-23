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
          "Le montant que tu saisis manuellement, additionné des entrées d'argent déjà reçues ce mois-ci et des entrées d'argent encore attendues ce mois-ci (budget restant des catégories \"Entrée d'argent\"). C'est ce total combiné — pas seulement le montant que tu saisis — qui est utilisé partout ailleurs dans l'app (Budget, Stats) chaque fois qu'il est question du \"Budget\".",
      },
      {
        titre: "dont X entrée(s) reçue(s) ce mois-ci",
        explication:
          "Sous-ligne dépliable sous BUDGET. Additionne le montant prévu (\"budget\") de chaque catégorie \"Entrée d'argent\" marquée comme reçue, dont la date est bien ce mois-ci.",
      },
      {
        titre: "RESTE ESTIMÉ EN FIN DE MOIS",
        explication:
          "Une projection de fin de mois, pas un solde déjà réalisé : BUDGET (voir ci-dessus, disponible saisi + entrées reçues + entrées encore attendues) moins tout ce qui est prévu d'être dépensé ce mois-ci (Dépensé + Dépense prévue, soit le budget complet de chaque catégorie de dépense, qu'il soit déjà consommé ou non — une catégorie déjà en dépassement contribue son dépassement réel, jamais moins que ça) moins l'argent immobilisé (épargne + objectifs mis de côté ce mois-ci). Le libellé et la couleur changent selon un seuil sur ce même total : \"RESTE ESTIMÉ EN FIN DE MOIS\" si le reste dépasse 15% du BUDGET, \"RESTE ESTIMÉ — BUDGET SERRÉ\" en dessous de ce seuil, \"DÉPASSEMENT ESTIMÉ EN FIN DE MOIS\" si le reste est négatif (le montant affiché devient alors la valeur absolue du dépassement). Important : comme ce chiffre compte les dépenses encore seulement prévues, il ne correspond plus exactement au montant réellement reporté au mois suivant — voir \"Reporter le reste non dépensé au mois prochain\" plus bas, qui lui ne reporte que les flux déjà réalisés.",
      },
      {
        titre: "Bandeau de projection (\"Il te restera environ...\")",
        explication:
          "N'est pas un deuxième calcul : ce bandeau met en phrase exactement le même montant que \"RESTE ESTIMÉ EN FIN DE MOIS\" ci-dessus (aucune extrapolation séparée du rythme de dépense) — chiffre principal, phrase et delta vs mois dernier découlent tous de la même valeur, pour ne jamais afficher deux estimations qui pourraient se contredire. Si ce montant est positif ou nul : \"Il te restera environ [X]€ à la fin du mois si tu continues comme ça.\" S'il est négatif : \"Si tu continues comme ça, tu risques d'être à environ [X]€ de dépassement en fin de mois.\"",
      },
      {
        titre: "+X € / +X % vs mois dernier",
        explication:
          "Écart entre le Reste estimé de ce mois et celui du mois dernier archivé, rejoué avec la même formule (Dépensé + Dépense prévue du snapshot archivé) sur les valeurs figées du mois précédent — comparé mois complet à mois complet. Un tap sur la valeur bascule l'affichage entre euros et pourcentage (pourcentage non disponible si le reste du mois dernier était nul).",
      },
      {
        titre: "Légende « Argent immobilisé »",
        explication:
          "Sous la barre de progression, l'épargne générique et les versements aux objectifs sont regroupés sous une seule pastille \"Argent immobilisé\" (total combiné) — la barre de progression fusionne alors aussi ses deux segments en un seul, de la même couleur que la pastille. Un tap la déplie en deux pastilles, \"Épargne\" (versements hors objectif) et \"Objectifs\" (somme des versements à tes objectifs actifs) ; la barre se redécompose alors en deux segments correspondants. \"Dépense prévue\" (montant encore budgété mais non dépensé dans les catégories de dépense) reste affiché en permanence, à part, non concerné par ce dépli.",
      },
      {
        titre: "Rayures diagonales sur la barre de progression",
        explication:
          "Distingue visuellement ce qui est déjà réalisé/engagé (couleur pleine) de ce qui reste une prévision (rayures diagonales légères, y compris sur la petite pastille de légende correspondante). En rayures : \"Dépense prévue\" (budget de catégorie pas encore dépensé), \"Entrée prévue\" (entrées d'argent encore attendues ce mois-ci, catégories \"Entrée d'argent\" non reçues) et \"Libre\" (la part du montant saisi manuellement qui n'est ni dépensée, ni prévue dans une catégorie, ni immobilisée — de l'argent non encore affecté). En couleur pleine : \"Dépensé\", \"Entrée reçue\" et \"Argent immobilisé\", qui sont soit déjà arrivés/sortis, soit déjà mis de côté — jamais une prévision incertaine.",
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
        titre: "Reporter le reste non dépensé au mois prochain",
        explication:
          "Ce switch (dans la fenêtre d'édition de BUDGET) détermine ce qui alimente le Budget du mois suivant. À la clôture du mois, le reste reporté n'est pas calculé comme \"RESTE ESTIMÉ EN FIN DE MOIS\" ci-dessus, mais uniquement à partir de ce qui a été réellement réalisé, jamais des dépenses encore prévues : montant saisi manuellement + entrées d'argent réellement reçues − dépenses réelles − épargne mise de côté. Si le switch est activé, ce reste réalisé est reporté sur le mois suivant. Séparément, si \"Répéter ce montant chaque mois\" est activé, le montant saisi est aussi reconduit — les deux s'additionnent, ils ne s'excluent pas. Ce montant reporté est donc généralement différent (plus élevé) de ce qu'affichait \"RESTE ESTIMÉ EN FIN DE MOIS\" juste avant la clôture, puisque celui-ci avait déjà déduit les dépenses encore seulement prévues.",
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
        titre: "Légende « Argent immobilisé »",
        explication:
          "Sous la barre de progression, l'épargne générique et les versements aux objectifs sont regroupés sous une seule pastille \"Argent immobilisé\" (total combiné) — la barre de progression fusionne alors aussi ses deux segments en un seul, de la même couleur que la pastille. Un tap la déplie en deux pastilles, \"Épargne\" (versements hors objectif) et \"Objectifs\" (somme des versements à tes objectifs actifs) ; la barre se redécompose alors en deux segments correspondants.",
      },
      {
        titre: "Rayures diagonales sur la barre de progression",
        explication:
          "Distingue visuellement ce qui est déjà réalisé/engagé (couleur pleine) de ce qui reste une prévision (rayures diagonales légères). En rayures : \"Entrée prévue\" (entrées d'argent encore attendues ce mois-ci, catégories \"Entrée d'argent\" non reçues) et \"Libre\" (la part du montant saisi manuellement qui n'est ni dépensée, ni immobilisée — de l'argent non encore affecté). En couleur pleine : \"Dépenses\", \"Entrée reçue\" et \"Argent immobilisé\", qui sont soit déjà arrivés/sortis, soit déjà mis de côté — jamais une prévision incertaine.",
      },
      {
        titre: "/ {X}€ budget mensuel",
        explication:
          "Le même total combiné que BUDGET sur Aperçu : montant du budget saisi manuellement + entrées d'argent déjà reçues ce mois + entrées d'argent encore attendues ce mois.",
      },
      {
        titre: "\"X représente ta plus grosse dépense ce mois-ci\"",
        explication:
          "Repère simplement la catégorie de type Variable qui a la dépense réelle la plus élevée du mois — affiché seulement si cette dépense est supérieure à 0.",
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
          "Dépenses réelles du mois en cours (hors Entrée d'argent), divisées par le nombre de jours déjà écoulés dans le mois. La comparaison \"vs mois dernier\" prend les dépenses réelles du mois précédent divisées par 30 jours fixes (pas le nombre exact de jours de ce mois-là), puis calcule la variation en %.",
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
          "Des phrases générées automatiquement à partir de trois signaux déjà calculés : l'évolution de la dépense moyenne par jour vs le mois dernier, le taux d'épargne du mois (mentionné s'il atteint 20% ou plus), et la variation en % des dépenses totales vs le mois dernier.",
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
        titre: "Score de santé financière",
        explication:
          "Une moyenne pondérée de 3 signaux, ramenée sur 100 : le respect du budget du mois en cours (40% — 100 si les dépenses réelles restent sous le budget total, puis descend de 2 points par tranche de 1% de dépassement, jusqu'à 0), la tendance d'épargne récente (30% — reprend la série \"Épargne croissante\", 6 mois consécutifs ou plus donnant le score maximum), et la progression moyenne de tes objectifs d'épargne actifs (30% — moyenne de actuel/cible sur tous les objectifs non clôturés). Si un signal ne peut pas être calculé (aucun budget défini, aucun objectif actif...), son poids est redistribué sur les signaux restants plutôt que de faire baisser artificiellement le score. Le mot-clé associé : 75 et plus = \"Solide\", 50 à 74 = \"À surveiller\", en dessous de 50 = \"Attention\".",
      },
    ],
  },
];
