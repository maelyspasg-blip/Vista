-- Migration de données : "Budget" devient une liste d'entrées réutilisant
-- le mécanisme "Entrée d'argent" (même table enveloppes, type = 'Entrée')
-- au lieu du triptyque de colonnes scalaires profils.argent_disponible /
-- argent_disponible_recurrent / argent_disponible_report_auto.
--
-- Pour chaque profil ayant un montant non nul, on crée une enveloppe
-- Entrée équivalente (déjà "reçue" — payee = true — puisque le montant
-- était jusqu'ici traité comme immédiatement disponible), comptée pour le
-- mois calendaire en cours au moment de cette migration, en reportant le
-- flag de récurrence existant.
--
-- Volontairement NON destructif : les colonnes argent_disponible* restent
-- en base, inutilisées par l'app après cette migration, pour servir de
-- filet de sécurité. Une migration de nettoyage ultérieure pourra les
-- supprimer une fois le nouveau système validé en production.

insert into public.enveloppes
  (user_id, nom, depense, budget, couleur, recurrente, type, date_fixe, payee, mois_comptage)
select
  user_id,
  'Budget',
  argent_disponible,
  argent_disponible,
  '#845EC2',
  argent_disponible_recurrent,
  'Entrée',
  date_trunc('month', now())::date,
  true,
  date_trunc('month', now())::date
from public.profils
where argent_disponible is not null
  and argent_disponible <> 0;
