# Roadmap Vista V1 — 5 jours autonomes
Objectif : Vista V1 validée, prête pour le drop iOS et Android

---

## LUNDI — Audit complet vision individuelle

### Matin — Setup
- [ ] Lire CLAUDE.md entièrement
- [ ] Créer AUDIT_V1.md pour tracker les problèmes
- [ ] Créer 10 comptes de test via SQL avec profils variés
- [ ] Vérifier que tsc=10 et lint=50 avant de commencer

### Après-midi — Audit Aperçu + Budget
- [ ] Tester tous les parcours Aperçu (jauge, entrées, dépenses, objectifs)
- [ ] Tester tous les parcours Budget (historique, catégories, entrées)
- [ ] Vérifier tous les calculs manuellement
- [ ] Documenter chaque problème 🔴/🟠/🟡/🔵
- [ ] Corriger les bugs 🟡 autonomement

### Soir — Audit Planning + Stats
- [ ] Tester Planning (jour/semaine/mois, récurrents, financiers)
- [ ] Tester Stats (tous les tiroirs, tous les graphiques)
- [ ] Vérifier cohérence des données entre toutes les pages
- [ ] Corriger les bugs 🟡 autonomement
- [ ] Commit : "Audit J1 - vision individuelle"

---

## MARDI — Audit vision partagée + corrections 🟠

### Matin — Audit vision partagée
- [ ] Tester création espace partagé (invitation, code, liaison)
- [ ] Tester Aperçu partagé (fusion catégories, badges, équilibre)
- [ ] Tester Budget partagé
- [ ] Tester Planning partagé (événements communs, fusion doublons)
- [ ] Tester Stats partagées (donut, barres, balance, 3 modes)
- [ ] Tester Ton bilan partagé (santé, flux consolidé)
- [ ] Vérifier isolation des données entre comptes
- [ ] Documenter chaque problème

### Après-midi — Corrections bugs 🟠
- [ ] Corriger tous les bugs 🟠 identifiés J1 et J2
- [ ] Retester après chaque correction
- [ ] Vérifier les régressions
- [ ] Commit : "Audit J2 - vision partagée + corrections majeures"

---

## MERCREDI — Refonte Planning Timeline

### Étape A — Vue Jour Timeline
- [ ] Implémenter timeline verticale vue Jour
- [ ] Conserver : récurrents, financiers, toute la journée, partagés, pull-to-refresh
- [ ] Tester mode clair ET mode sombre
- [ ] tsc=10, lint=50 obligatoire
- [ ] Commit : "Planning Timeline - vue Jour"

### Étape B — Vue Semaine Timeline
- [ ] Adapter vue Semaine au style Timeline
- [ ] Même contraintes que vue Jour
- [ ] tsc=10, lint=50 obligatoire
- [ ] Commit : "Planning Timeline - vue Semaine"

### Étape C — Vue Mois améliorée
- [ ] Améliorer visuellement vue Mois (garder la grille)
- [ ] Jour actuel cerclé teal, jours fériés discrets
- [ ] tsc=10, lint=50 obligatoire
- [ ] Commit : "Planning Timeline - vue Mois"

---

## JEUDI MATIN — Finalisation et rapport

### Corrections finales
- [ ] Corriger tous les bugs 🟠 restants
- [ ] Vérifier que tous les bugs 🔴 sont documentés pour validation admin
- [ ] Migrations SQL en attente générées et documentées dans AUDIT_V1.md
- [ ] tsc=10, lint=50 sur tout le projet
- [ ] Commit final : "Vista V1 - audit complet, corrections, Timeline Planning"

### Rapport final
- [ ] Compléter AUDIT_V1.md avec rapport complet
- [ ] Résultat : V1 VALIDÉE ou V1 NON VALIDÉE
- [ ] Liste des bugs 🔴 nécessitant validation admin
- [ ] Recommandation finale

---

## Règles pendant les 5 jours

### Toujours
- tsc max 10 lignes après chaque modification
- lint max 51 problèmes après chaque modification
- Commiter après chaque étape validée
- Documenter tout dans AUDIT_V1.md

### Jamais sans validation admin
- Modifier ESPACE_PARTAGE_ACTIF ou TESTFLIGHT_MODE
- Toucher aux bugs 🔴
- Modifier le modèle de données Supabase
- Supprimer une fonctionnalité
- Exécuter des migrations SQL (générer seulement)

### En cas de doute
Documenter dans AUDIT_V1.md section "En attente de validation admin" et continuer sur autre chose.

---

## Critère de succès jeudi soir

Vista V1 est prête si :
- Audit complet effectué sur 10 comptes
- Zéro bug 🔴 non documenté
- Zéro bug 🟠 non corrigé ou non documenté
- Planning Timeline implémenté et testé
- tsc=10, lint=50 sur tout le projet
- Rapport AUDIT_V1.md complet

---

## JEUDI SOIR / VENDREDI MATIN — Onboarding partagé

### Objectif
Intégrer la découverte de l'espace partagé dans l'onboarding pour que les nouveaux utilisateurs sachent que cette fonctionnalité existe.

### À implémenter
- [ ] Ajouter une étape dans l'onboarding (après les préférences de base) présentant l'espace partagé
- [ ] Écran simple : illustration + titre + description courte
- [ ] Titre : "Vista à deux"
- [ ] Description : "Invitez votre partenaire et gérez vos finances ensemble. Dépenses communes, balance équitable, planning partagé."
- [ ] Deux boutons : "Configurer maintenant" → ouvre le flux de création d'espace / "Plus tard" → passe à l'étape suivante
- [ ] Si "Configurer maintenant" → afficher le formulaire de création d'espace partagé (code d'invitation) directement dans l'onboarding
- [ ] Visible uniquement si `ESPACE_PARTAGE_ACTIF === true`
- [ ] Ne pas afficher pour les comptes invités
- [ ] Ne pas afficher si l'utilisateur est déjà dans un espace partagé

### Design
- Même style que les autres écrans d'onboarding existants
- Illustration : deux personnages / icône `people-outline` en grand en teal
- Fond selon le thème (clair/sombre)

### tsc=10, lint=50 obligatoire
### Commit : "Onboarding - étape espace partagé"
