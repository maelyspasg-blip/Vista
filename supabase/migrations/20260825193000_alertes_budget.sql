-- Nouveau réglage utilisateur : active/désactive les notifications
-- intelligentes de dépassement de budget (catégories Variable uniquement,
-- cf. app/notifications.ts::verifierEtNotifierBudgets). Défaut à true pour
-- rester cohérent avec notifications_actives (même philosophie : activé par
-- défaut, l'utilisateur peut désactiver dans Profil > Paramètres).
ALTER TABLE profils ADD COLUMN IF NOT EXISTS alertes_budget boolean DEFAULT true;
