# Playbook CSM Enterprise — Kairos

> **Statut :** opérationnel — Wave 6.5.
> **Add-on commercial :** `prod_addon_csm_onboarding` (+999 €/an).
> **Story d'origine :** S6-CSMOnboarding (Wave 6.5).
> **Public visé :** founder (toi) puis futur CSM hire (segment cible : VC / PE,
> avocats, brands premium, newsletters scaleup).

## 1. Objectif

Standardiser l'onboarding et l'accompagnement des contrats Enterprise pour :

1. Garantir un **time-to-value** ≤ 14 jours (premier digest exploitable).
2. Réduire le **churn** post-30j (cible : < 5 % annuel sur le segment).
3. Détecter en amont les **opportunités d'upsell** (audit log, tenant isolé,
   sources custom, sièges supplémentaires).
4. Produire des **case studies** capitalisables après le QBR M3.

KPIs de succès du playbook lui-même :

| Métrique                             | Cible  | Source                      |
| ------------------------------------ | ------ | --------------------------- |
| Time-to-onboarded (kickoff→training) | ≤ 14 j | `csm_onboardings`           |
| NPS interne M1                       | ≥ +30  | `csm_onboardings.nps_score` |
| Taux d'upsell add-on en M3           | ≥ 20 % | `subscriptions` + audit log |
| Taux de rétention 12 mois            | ≥ 95 % | `subscriptions.status`      |

## 2. Pré-onboarding (J-7 à J0)

### 2.1. Kickoff call template (60 min)

À planifier dans la semaine suivant la signature, avant tout provisioning.

#### Agenda

1. **Présentation Kairos** (5 min) — équipe, vision, support.
2. **Découverte client** (25 min) — questions ci-dessous.
3. **Démo personnalisée** (15 min) — adapter au segment révélé.
4. **Définition succès** (10 min) — KPIs internes du client.
5. **Roadmap onboarding** (5 min) — calendrier semaines 1-2-4-12.

#### Questions découverte (à adapter au segment)

##### Segment VC / PE

- Combien de deals analysez-vous par mois aujourd'hui ?
- Quelles sources signalent le mieux un deal early-stage selon vous ?
- Avez-vous une thèse d'investissement écrite ? (récupérer si possible)
- Quel est votre cycle décisionnel sur un deal (DD, IC, signing) ?
- Qui dans l'équipe consultera Kairos ? Partner, principal, analyst ?

##### Segment Avocats

- Cabinet généraliste ou spécialisé ? (M&A, IP, RGPD, contentieux IA)
- Vos clients vous demandent-ils déjà de la veille IA / réglementaire ?
- Quel volume de réclamations RGPD article 30 traitez-vous par an ?
- Avez-vous un DPO ou faites-vous appel à un externe ?
- Quels noms de clients devez-vous protéger (NDA, pseudonymisation) ?

##### Segment Brand premium

- Mission, valeurs, positionnement éthique IA ?
- Listing concurrent : qui suivez-vous déjà ?
- Quels canaux d'activation : newsletter interne, comité éditorial, RP ?
- Quelle fréquence de digest interne souhaitée : daily, weekly, monthly ?

#### Définition succès — KPIs client

À cocher avec le client durant le kickoff (au minimum 2 KPIs) :

- [ ] Nombre de signaux pertinents lus / semaine
- [ ] Nombre de deals / dossiers / sujets identifiés via Kairos / mois
- [ ] Temps gagné vs. veille manuelle (estimation honest)
- [ ] Nombre de membres actifs de l'équipe / semaine
- [ ] Score moyen des signaux remontés (proxy qualité du tuning)
- [ ] Adoption du digest hebdomadaire (taux d'ouverture interne)

### 2.2. Préparation technique (à faire avant le J0)

- [ ] Création de l'organization Stripe + plan Enterprise
- [ ] Provisioning `organizations` + `subscriptions` (statut `trialing` 14 j)
- [ ] Vérification email primaire owner + 1 admin de backup
- [ ] Upload logo + branding dans `settings.branding` (kit visuel demandé)
- [ ] Liste pré-remplie de sources X / Reddit / ArXiv adaptée au segment

## 3. Semaine 1 — Provisioning & bootstrap

### 3.1. Provisioning org (J+1)

- [ ] `organizations.plan = 'enterprise'`, `billing_mode` selon contrat
- [ ] Inviter **owner** + **1 admin backup** (rôle `admin`)
- [ ] Si add-on tenant isolé acheté : déclencher `provision-isolated-tenant`
- [ ] Si add-on audit log acheté : vérifier que les hooks `audit_log` sont
      activés (rubrics, prompts, settings, members, exports)

### 3.2. Bootstrap admin org (J+2)

- [ ] Importer les **sources custom** (X handles, subreddits, catégories ArXiv)
      validées au kickoff dans `settings.x_queries`, `settings.reddit_subs`,
      `settings.arxiv_categories`.
- [ ] Configurer `settings.daily_budget_usd` (plafond LLM par jour ; recommandé
      starter : 5 USD pour Solo, 25 USD pour Enterprise).
- [ ] Configurer `settings.source_priority` (pondération des sources).
- [ ] Vérifier `settings.apify_config` (acteurs Apify, batch size).

### 3.3. Première rubrique de scoring (J+3)

- [ ] Créer une rubric custom dans `scoring_rubrics` adaptée au segment :
  - **VC / PE** : critères « stade early », « moat technique », « équipe
    fondatrice », « marché TAM », « différenciation ».
  - **Avocats** : critères « risque réglementaire », « jurisprudence
    impactante », « source institutionnelle », « actualité IA juridique ».
  - **Brand** : critères « alignement valeurs », « tonalité publique »,
    « narratif concurrent », « impact réputation ».
- [ ] Marquer `is_default = true` pour cette rubric.
- [ ] Tester la rubric sur 50 signaux historiques (replay via `rescore-signals`).

### 3.4. Première cascade (J+4)

- [ ] Créer un admin prompt cascade `{{run:source}}` (template selon segment).
- [ ] Vérifier l'enchaînement (résumé → enrichissement → scoring).
- [ ] Lancer une exécution pilote — valider la sortie avec le client.

### 3.5. BYOK (J+5, optionnel)

Si le client préfère payer l'IA via sa propre clé OpenRouter / Anthropic :

- [ ] Aider à la création de la clé (lien doc fournisseur).
- [ ] Saisie via UI Settings → BYOK → champ chiffré (`user_api_keys`).
- [ ] Vérifier `useValidateApiKey` retourne `OK`.
- [ ] Switcher `settings.billing_mode = 'byok'` côté DB.

### Checkpoint fin S1

- [ ] Marquer `csm_onboardings.kickoff_done_at = now()` dès kickoff terminé
- [ ] L'org a au moins **3 signaux scorés** dans `scores`
- [ ] Le coût LLM 7j est < seuil daily_budget × 7

## 4. Semaine 2 — Training & ajustements

### 4.1. Training session 60 min (J+10)

Format recommandé : **Loom asynchrone** (15 min) + **call live** (45 min).
La partie Loom permet au client de l'archiver pour onboarder ses propres hires.

#### Sommaire training

1. **Tour produit** (10 min) — Dashboard, Topics, Digest, Costs, Logs.
2. **Configuration avancée** (15 min) — rubrics, cascades, sources priority.
3. **Cas d'usage segment** (15 min) — workflow type d'une journée client.
4. **BYOK & gouvernance coûts** (5 min) — daily budget, alertes.
5. **QA libre** (10 min).

#### Slides à préparer (template Notion / Slides)

- Slide 1 : agenda
- Slide 2 : architecture pipeline (X / Reddit / ArXiv → scoring → digest)
- Slide 3 : démo dashboard (live screenshot)
- Slide 4 : démo création rubric
- Slide 5 : démo cascade `{{run:source}}`
- Slide 6 : checklist hygiène (revue rubric tous les mois, digest weekly, etc.)
- Slide 7 : roadmap publique Kairos (ce qui arrive)
- Slide 8 : contact CSM + SLA support

### 4.2. QA usage actuel (J+12)

- [ ] Revue des 7 premiers jours d'usage avec le client
- [ ] Identifier les signaux faux positifs / faux négatifs (top 10)
- [ ] Ajuster la rubric (critères + pondération + seuil)
- [ ] Documenter les ajustements dans une note interne CSM

### 4.3. Ajustements settings (J+14)

- [ ] Recalibrer `daily_budget_usd` selon consommation réelle (×1.5 marge)
- [ ] Activer le digest hebdomadaire si pertinent (`digests` table)
- [ ] Affiner `source_priority` selon la qualité observée
- [ ] Inviter les autres membres de l'équipe (jusqu'à `subscription.seats`)

### Checkpoint fin S2

- [ ] Marquer `csm_onboardings.training_done_at = now()`
- [ ] L'org a au moins **3 utilisateurs actifs** (login dans les 7 derniers jours)
- [ ] Le client a généré son **1er digest hebdomadaire**
- [ ] Le client a validé sa rubric custom (`is_default = true`)

## 5. Semaine 4 — Check-in 30 jours

### 5.1. Call check-in M1 (45 min)

- [ ] Revue des KPIs définis au kickoff
- [ ] Analyse usage : nombre de signaux lus, signaux scorés, digest ouverts
- [ ] **NPS interne** — question unique : « De 0 à 10, quelle est la probabilité
      que vous recommandiez Kairos à un pair de votre industrie ? »
- [ ] **Pain points résiduels** — note libre dans `csm_onboardings.notes`
- [ ] **Quick wins** — promesses tenues / non-tenues côté Kairos

### 5.2. Identification add-ons à upsell

À évaluer en fin de check-in M1 :

| Signal détecté chez le client                 | Add-on à pitcher             | ARR delta     |
| --------------------------------------------- | ---------------------------- | ------------- |
| Demande RGPD article 30 / NDA strict          | `audit_log` (399 €/seat)     | +5 k€/an      |
| Demande isolation infra / souveraineté        | `tenant_isolated` (+299 €/m) | +3.6 k€/an    |
| Sources internes / scrapers privés à intégrer | `custom_sources` sur devis   | +2 à 10 k€    |
| Croissance équipe (passage 5 → 15 sièges)     | Sièges additionnels          | proportionnel |
| Demande de support prioritaire / SLA          | Support Premium (+150 €/m)   | +1.8 k€/an    |

### Checkpoint fin S4

- [ ] Marquer `csm_onboardings.month_1_check_at = now()`
- [ ] Saisir `csm_onboardings.nps_score` (entier entre -100 et +100)
- [ ] Documenter les opportunités d'upsell détectées
- [ ] Si NPS < 0 : escalader en risque churn et planifier un call sous 7 j

## 6. Mois 3 — Quarterly Business Review (QBR)

### 6.1. QBR (75 min — visio + slides)

#### Agenda

1. **Welcome & objectifs QBR** (5 min)
2. **Métriques d'usage 90j** (15 min) — signaux, digest, membres actifs, ROI
3. **Métriques business Kairos** (10 min) — MRR partagé en transparence,
   roadmap produit publique, gros bugs résolus
4. **ROI client** (15 min) — temps gagné, deals identifiés, dossiers gagnés
5. **Roadmap client** (15 min) — usages M4-M6, équipes à onboarder
6. **Témoignage / case study** (10 min) — demande de consentement écrit
7. **Renouvellement & upsell** (5 min) — annonce des évolutions tarifaires

#### Métriques à présenter (pré-pull avant QBR)

- MRR contrat client
- Nombre total de signaux scrapés / scorés / lus
- Coût LLM 90j vs. budget alloué
- Marge brute Kairos sur ce contrat (transparence rare mais différenciante)
- ROI estimé client (calcul collaboratif)

### 6.2. Demande de consentement case study

Email à envoyer à J+85 (pré-QBR) :

```
Objet : QBR du JJ/MM — pourriez-vous nous accorder un témoignage ?

Bonjour {{prenom}},

Nous arrivons à 3 mois d'utilisation de Kairos. Si l'expérience a été
positive, accepteriez-vous de nous accorder :

  • Un témoignage texte (3-5 phrases) que nous publierions sur notre site
  • Optionnel : une étude de cas plus détaillée (45 min d'interview)

Vous validez l'intégralité du contenu avant publication. Nous pouvons aussi
anonymiser ({{secteur}}, {{taille_equipe}}) si vous préférez.

Bonne soirée,
{{csm_name}}
```

### Checkpoint fin M3

- [ ] Marquer `csm_onboardings.qbr_done_at = now()`
- [ ] Témoignage / case study : statut (refusé / accordé / anonyme)
- [ ] Plan upsell M4-M6 documenté

## 7. Templates emails

### 7.1. Email kickoff (J-3)

```
Objet : Bienvenue chez Kairos — kickoff le JJ/MM à HH:MM

Bonjour {{prenom}},

Nous sommes ravis de vous compter parmi nos clients Enterprise. Avant notre
kickoff prévu le {{date_kickoff}}, voici ce dont nous avons besoin :

1. Le logo HD de votre cabinet / fonds (PNG ou SVG)
2. Les emails des 1-2 admins backup que vous souhaitez désigner
3. Une première liste de 5-10 sources X / subreddits que vous suivez déjà

Le kickoff durera 60 min. À l'issue, vous aurez :
  • Un accès live à votre instance
  • Une rubrique de scoring adaptée à votre métier
  • Un digest hebdomadaire programmé

À très vite,
{{csm_name}}
{{calendar_link}}
```

### 7.2. Invitation training (J+8)

```
Objet : Training Kairos — créneau de 60 min cette semaine ?

Bonjour {{prenom}},

Bravo pour le démarrage : votre instance a déjà traité {{nb_signaux}}
signaux et identifié {{nb_topics}} sujets potentiellement pertinents.

Pour vous aider à exploiter pleinement la plateforme, je vous propose une
training de 60 min couvrant :
  • Création / ajustement de rubriques custom
  • Cascades IA {{run:source}} pour automatiser vos workflows
  • Gouvernance des coûts LLM (BYOK / daily budget)

Voici quelques créneaux : {{créneaux}}.

Bonne journée,
{{csm_name}}
```

### 7.3. Invitation QBR (J+85)

```
Objet : QBR Kairos — bilan 90 jours et roadmap

Bonjour {{prenom}},

Nous arrivons au terme de votre 1er trimestre sur Kairos. C'est l'occasion
d'un point structuré (75 min) pour :
  • Mesurer l'impact concret sur vos workflows
  • Partager nos métriques internes en transparence
  • Discuter des évolutions de votre usage M4-M6

Je peux pré-charger les métriques avant l'appel. Idéalement avec :
  • {{owner_email}}
  • {{admin_backup_email}}

Quels créneaux vous arrangent ? {{créneaux}}.

Cordialement,
{{csm_name}}
```

### 7.4. Email churn risk (NPS < 0 ou usage en chute)

```
Objet : Un point rapide cette semaine ?

Bonjour {{prenom}},

J'ai remarqué que l'usage de Kairos a baissé ces derniers jours, et votre
dernier feedback NPS m'interpelle. Je préfère qu'on en discute honnêtement
plutôt que de laisser la situation s'installer.

Êtes-vous disponible pour 30 min sous 48 h ? Je viendrai avec :
  • Un audit de votre usage actuel
  • 2-3 hypothèses concrètes pour redresser
  • La possibilité d'un avoir / pause si nécessaire

Mon objectif est que Kairos vous serve, pas qu'il pèse.

À très vite,
{{csm_name}}
```

## 8. Checklist exportable (CSV)

À sauvegarder en `docs/enterprise/csm-checklist.csv` (à générer à la demande).
Schéma type pour import Notion / Linear / Trello :

```csv
phase,task,owner,due_relative,notes
pre,Kickoff call planifié,csm,J-3,Calendar invite envoyé
pre,Logo + branding kit reçu,client,J-2,Upload settings.branding
pre,Liste sources custom préparée,csm,J-1,X handles + subreddits + arXiv cats
s1,Provisioning org Enterprise,csm,J+1,plan=enterprise
s1,Owner + 1 admin invités,csm,J+1,Rôles owner / admin
s1,Sources custom importées,csm,J+2,settings.x_queries / reddit_subs / arxiv_categories
s1,Daily budget LLM configuré,csm,J+2,daily_budget_usd
s1,1ère rubric scoring créée,csm,J+3,is_default=true
s1,Rubric testée sur 50 signaux,csm,J+3,via rescore-signals
s1,1ère cascade run:source créée,csm,J+4,admin_prompts table
s1,BYOK (optionnel) configuré,client,J+5,user_api_keys
s1,kickoff_done_at marqué,csm,J+7,csm_onboardings
s2,Training Loom enregistré,csm,J+8,15 min
s2,Training live 45 min,csm,J+10,Sommaire 5 sections
s2,Revue 7j usage avec client,csm,J+12,Top 10 faux pos/neg
s2,Rubric ajustée post-QA,csm,J+13,Critères + pondération
s2,Daily budget recalibré,csm,J+14,×1.5 marge
s2,Digest hebdo activé,csm,J+14,digests table
s2,training_done_at marqué,csm,J+14,csm_onboardings
s4,Call check-in M1,csm,J+30,45 min
s4,NPS interne capturé,csm,J+30,nps_score
s4,Opportunités upsell listées,csm,J+30,csm_onboardings.notes
s4,month_1_check_at marqué,csm,J+30,csm_onboardings
m3,Pré-pull métriques QBR,csm,J+85,COG / MRR / ROI
m3,Email demande témoignage,csm,J+85,Template 7.2
m3,QBR live 75 min,csm,J+90,Slides 6 sections
m3,qbr_done_at marqué,csm,J+90,csm_onboardings
m3,Plan upsell M4-M6 documenté,csm,J+92,csm_onboardings.notes
```

## 9. Annexe — Architecture du suivi CSM

### 9.1. Persistance Supabase (optionnel)

Migration `20260502000011_csm_onboardings.sql` (cf. fichier joint) :

- Une ligne par organization Enterprise.
- Timestamps des étapes clés (kickoff, training, M1, QBR).
- NPS interne stocké, plage `[-100, +100]`.
- RLS : seuls les `app_admins` (super-admins Kairos) peuvent lire / écrire.

### 9.2. Page admin /admin/csm

Sub-page React (`src/pages/admin/CSMOnboarding.tsx`) accessible uniquement
aux `app_admins`. Permet :

- Liste des tenants Enterprise actifs avec leur statut onboarding
- Toggle des étapes franchies par tenant
- Ajout d'un tenant à l'onboarding (dialog)
- Métriques globales : time-to-onboarded moyen, churn risk, NPS moyen

### 9.3. Routes manuelles à brancher (glue commit)

- `/admin/csm` → `<CSMOnboarding />` (lazy-load, gate `useIsAppAdmin`)
- Sidebar admin : ajouter un lien « CSM Onboarding »

## 10. Évolutions futures

- **Wave 6.6** : automatiser les rappels (cron qui mail le CSM J+30, J+85)
- **Wave 6.7** : intégration Slack — channel #cs-{{slug_org}} pour chaque tenant
- **Wave 7** : passage à un CRM dédié (HubSpot / Attio) si > 15 contrats Enterprise
