# Moats & value capture — `theresa-scrap` / `zlatan-scrap`

> Analyse stratégique 2026-05-02 — sortie du skill `moat-hunter` (analogies inter-industries) couplée à un raisonnement « avocat du diable business » (value capture par segment, pricing tiers, positionnement défensif).
>
> Cible : éclairer la Wave 5 (S-LandingContent) et le PRD Wave 6+ (multi-tenant, billing, features moat).

---

## Phase 1 — Job universel

### Niveaux d'abstraction

| Niveau               | Formulation                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Niveau 1 (surface)   | « Outil de veille IA personnalisée »                                                                                                                                                                                                        |
| Niveau 2 (fonction)  | « Filtrer le bruit informationnel d'une niche en évolution rapide »                                                                                                                                                                         |
| Niveau 3 (universel) | « **Réduire l'asymétrie d'information dans un domaine où le signal change plus vite que la capacité humaine d'absorption, en injectant les critères propres de l'acteur dans la priorisation et en gardant une mémoire des trajectoires** » |

### Test de transversalité

Le job niveau 3 s'applique à **≥ 12 industries** : finance / trading, renseignement / OSINT, médecine / radiologie, sport / scouting, légal / jurisprudence, journalisme d'investigation, VC / private equity, climatologie / early warning, recherche académique, marketing / brand monitoring, défense / IFF, aviation / black box, pharma / vigilance.

→ Job suffisamment abstrait pour générer des analogies fertiles.

---

## Phase 2 — Hunt — 15 analogies inter-industries

| #   | Industrie source                             | Mécanisme exact                                                                  | Tension résolue                                       |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | Finance / Bloomberg Terminal                 | Heat map tick-by-tick + alertes audio sur déviations N sigmas                    | Densité d'info > capacité de scan visuel              |
| 2   | Renseignement / Palantir Gotham              | Graph d'entités (personnes/orgs) avec time-decay des liens                       | Identifier les acteurs derrière les événements isolés |
| 3   | Radiologie / second opinion                  | 2-3 experts indépendants notent ; le rapport cite l'écart                        | Qualifier la robustesse d'un jugement subjectif       |
| 4   | NBA scouting / Synergy Sports                | Score relatif à la baseline historique du joueur (pas à la moyenne ligue)        | Détecter l'anormal dans le bruit individuel           |
| 5   | Légal / Westlaw KeyCite                      | Propagation rétro du discrédit : un arrêt cassé invalide tous ceux qui le citent | Garder la base à jour sans relire tout l'historique   |
| 6   | Journalisme / Bellingcat OSINT               | Aucune claim n'est publiée sans corroboration ≥ 3 sources indépendantes          | Distinguer rumeur vs information                      |
| 7   | VC / Crunchbase Pro                          | Triggers automatiques sur lifecycle events (levée, pivot, hire C-level)          | Manquer l'événement déclencheur                       |
| 8   | Climatologie / NOAA                          | Indice composite multi-stations pondéré (jamais un seul capteur)                 | Faux positifs sur signaux isolés                      |
| 9   | Médecine / dossier longitudinal              | Suivi par patient sur trajectoire personnelle (pas comparaison population)       | Pertinence individuelle > statistique générale        |
| 10  | Trading systematic / backtest                | Simulation rétrospective de stratégies sur données historiques                   | Tester avant déployer                                 |
| 11  | Marketing / Brandwatch                       | Quadrant volume × sentiment : repérer les pépites bas-volume positives           | Prioriser au-delà du buzz                             |
| 12  | Recherche académique / Connected Papers      | Réseau de citations bidirectionnel (ancêtres + descendants)                      | Mesurer la profondeur intellectuelle d'une idée       |
| 13  | Défense / IFF (Identification Friend or Foe) | Trust score auteur intégré au scoring du signal                                  | Pondérer par fiabilité historique de la source        |
| 14  | Aviation / Flight Data Recorder              | Replay forensic de tous les paramètres post-incident                             | Apprendre des événements rares                        |
| 15  | Pharma / FAERS adverse events                | Crowd reporting anonymisé, agrégation centrale                                   | Détecter les effets émergents avant le régulateur     |

---

## Phase 3 — Translate & Score

### Méthode

Score = **Novelty (1-5)** + **Feasibility (1-5)** + **Moat potential (1-5)** = **/15**

- _Novelty_ : à quel point l'analogie est rare chez les concurrents directs (Exa, You.com, Glasp, Readwise Reader, Feedly AI, Particle, Smart News, Ben's Bites)
- _Feasibility_ : faisable sur la stack actuelle (Vite + Supabase + 11 edge fns + BYOK 10 providers + MinIO) en ≤ 3 sprints
- _Moat potential_ : effet de verrouillage / rétention / data accumulation propriétaire

### Top 5 features prioritaires

#### 1. Multi-LLM consensus scoring — **Score 14/15**

- **Analogie source** : Radiologie / second opinion → 2 radiologues lisent indépendamment, l'écart est exposé.
- **Translation** : Pour chaque signal, lancer le scoring sur **2-3 LLM différents** (ex : Haiku + Mistral + DeepSeek) en parallèle. Stocker les 3 scores. Calculer **score consensus** = moyenne, **dispersion** = écart-type. Afficher dans le dashboard : score principal + badge dispersion (`high agreement` = signal robuste / `high variance` = sujet polarisant ou ambigu).
- **Pourquoi personne n'y pense** : tous les concurrents font 1 LLM (cost-driven). Le BYOK 10 providers actuel rend ça quasi-gratuit en effort.
- **Effort** : M (étendre `llm-score-batch` pour boucler N modèles, schéma `scores` ajouter `score_consensus, score_variance, models_used jsonb`).
- **Moat** : très fort. La data accumulée (« quels modèles convergent sur quel type de signal ») devient un actif propriétaire qu'aucun nouveau venu ne peut backfiller. Crée aussi une **valeur produit unique** : « confidence interval » sur chaque score, que ni Exa ni Feedly n'ont.

#### 2. Backtest des grilles de scoring — **Score 14/15**

- **Analogie source** : Trading systematic / backtest → simuler une stratégie sur données historiques avant de la déployer.
- **Translation** : Quand un user crée / édite une `scoring_rubric`, lancer un **bouton « Backtester »** qui re-score les 30 derniers jours de signaux (déjà en DB) avec la nouvelle rubric. Affiche : top 20 signaux qu'elle aurait surfacés, distribution des scores, comparaison avec la rubric actuelle (delta de signaux promus / rétrogradés). User peut itérer sa rubric avant de la rendre `is_default`.
- **Pourquoi personne n'y pense** : les concurrents traitent leurs grilles comme des prompts statiques. Personne n'expose le « replay ».
- **Effort** : M (besoin d'un endpoint edge fn `backtest-rubric` qui boucle sur les signaux des 30 derniers jours et appelle dispatch-llm sans persister).
- **Moat** : élevé. Effet de **switching cost** énorme : un user qui a investi 2 h à itérer une rubric backtestée ne change plus de produit. Crée aussi un nouveau pricing tier (« backtest unlimited » réservé aux plans payants).

#### 3. Negative signal propagation — **Score 13/15**

- **Analogie source** : Westlaw KeyCite → un arrêt cassé invalide rétroactivement tous les arrêts qui le citent.
- **Translation** : Quand un user (ou crowd) flag un signal comme « débunké / faux / hype » (bouton thumbs-down avec raison optionnelle), tous les signaux qui le citent / le reprennent dans les 14 jours suivants reçoivent un **badge orange « contested »** dans le dashboard, et leur score effectif est minoré (penalty configurable). Détection des chains de RT / posts dérivés via similarité de texte (embeddings) ou présence d'URL identique.
- **Pourquoi personne n'y pense** : le scoring est traité comme « point in time » par tous les concurrents. La rétro-invalidation est complexe mais rare.
- **Effort** : L (nécessite embeddings sur les titres + tâche pg_cron qui propage les flags).
- **Moat** : très fort. Plus le user accumule de flags, plus son corpus est « propre ». Effet réseau : si un tenant active le crowd flagging entre membres, la qualité grimpe collectivement.

#### 4. Cross-source corroboration score — **Score 13/15**

- **Analogie source** : Bellingcat OSINT → ne publier qu'une claim corroborée par ≥ 3 sources indépendantes.
- **Translation** : Pour chaque signal scoré ≥ 70, **chercher en DB** s'il existe d'autres signaux dans une fenêtre 24-48 h sur des sources différentes (Reddit + arXiv + X) qui parlent du **même sujet** (clustering par embeddings sur titres + entités extraites). Si oui : badge **« 3 sources confirment »** sur le signal, et boost du score effectif (+10 points). Si non : badge **« 1 source unique »** avec petite warning.
- **Pourquoi personne n'y pense** : les concurrents traitent chaque source en silo. La corroboration cross-source nécessite embeddings + une vraie fenêtre temporelle.
- **Effort** : M (embeddings via OpenAI ou Voyage, table `signal_clusters`, RPC pour requêter).
- **Moat** : élevé. Une fois que l'utilisateur a goûté à « confirmé 3 sources », il ne peut plus revenir au « 1 tweet isolé ». Crée aussi une feature très demoable / shareable.

#### 5. Author Reputation Layer — **Score 13/15**

- **Analogie source** : Défense / IFF → trust score auteur intégré au scoring.
- **Translation** : Pour chaque handle X / user Reddit / auteur arXiv, calculer un **score de fiabilité historique** : sur les 90 derniers jours, combien de leurs signaux scorés 80+ se sont avérés vrais / cités / repris ? Stocker dans une table `authors` avec `(handle, source, reputation_score, sample_size, last_updated)`. Le scoring final d'un nouveau signal = **`score_signal × √(reputation_auteur)`**. Auteurs au top trust = boost. Auteurs serial-hype = malus systématique.
- **Pourquoi personne n'y pense** : nécessite une mémoire longue par auteur, ce qui ne s'aligne pas avec les architectures stateless typiques. Stack `topics` + MinIO 90 j est déjà le terrain idéal.
- **Effort** : L (nouvelle table + tâche pg_cron quotidienne pour recalculer le reputation_score, + intégration dans `llm-score-batch`).
- **Moat** : massif. La data accumulée sur les auteurs est un asset unique non-réplicable. Crée un **feedback loop défensif** : plus le produit tourne, plus le scoring devient précis, plus il devient cher à concurrencer.

### Toutes les analogies (table de scoring)

| #   | Feature                    | Novelty | Feasibility | Moat | Total  | Décision          |
| --- | -------------------------- | ------- | ----------- | ---- | ------ | ----------------- |
| 3   | Multi-LLM consensus        | 5       | 4           | 5    | **14** | **Top 5**         |
| 10  | Backtest grilles scoring   | 5       | 4           | 5    | **14** | **Top 5**         |
| 5   | Negative propagation       | 5       | 3           | 5    | **13** | **Top 5**         |
| 6   | Cross-source corroboration | 4       | 5           | 4    | **13** | **Top 5**         |
| 13  | Author Reputation Layer    | 4       | 4           | 5    | **13** | **Top 5**         |
| 4   | NBA player baseline        | 5       | 4           | 4    | 13     | Wave 7            |
| 2   | Palantir entity graph      | 4       | 3           | 5    | 12     | Wave 7            |
| 9   | Patient longitudinal       | 4       | 3           | 5    | 12     | Wave 7            |
| 14  | Aviation black box replay  | 5       | 3           | 4    | 12     | Wave 7            |
| 8   | NOAA composite index       | 4       | 4           | 3    | 11     | Wave 8            |
| 11  | Marketing quadrant view    | 3       | 4           | 2    | 9      | Drop              |
| 12  | Connected Papers biblio    | 4       | 3           | 4    | 11     | Wave 8            |
| 15  | Pharma crowd reporting     | 3       | 4           | 4    | 11     | Wave 8 (lié à #5) |
| 7   | Crunchbase lifecycle       | 3       | 4           | 3    | 10     | Drop ou v0        |
| 1   | Bloomberg heat map         | 2       | 4           | 2    | 8      | Drop (commodity)  |

---

## Phase 4 — Avocat du diable business : value capture par segment

> _« Ne dis jamais 'pour tout le monde'. Le marketing efficace cible un acteur qui paie cher pour résoudre un problème spécifique. Voici les 6 segments les plus rentables, par ordre de WTP (willingness to pay) décroissante. »_

### Segment 1 — VC / private equity (deal flow IA) — **WTP très élevée**

**Le job qu'ils ont** : trouver la prochaine startup IA à investir AVANT que TechCrunch ne la couvre. Chaque deal raté coûte plusieurs millions. Chaque deal trouvé tôt rapporte 10x-100x.

**Pourquoi ils paient cher** :

- Le coût d'opportunité d'un deal raté est >> n'importe quel pricing SaaS
- Ils ont des budgets « research tools » illimités (ils paient déjà PitchBook 50k$/an, Crunchbase Pro 30k$/an)
- 1 deal trouvé via theresa-scrap → ROI infini

**Pricing maximal** : **300-500 $/user/mois** sur un plan « VC Edition », avec custom :

- Multi-LLM consensus (feature #1) → ils veulent la confiance
- Author reputation (feature #5) → ils veulent suivre les builders sérieux
- Lifecycle events (analogie #7) → triggers sur « lève de fonds annoncée »
- Custom rubrics avec backtest illimité (feature #2)
- Slack integration : push des top signaux dans #deals

**Positionnement défensif** : « PitchBook for AI builders, before Pitchbook ». Distance avec Crunchbase = données amont (signal weak), pas events confirmés.

**Risque** : peu de VCs (~5000 funds globaux, ~500 actifs en early-stage IA). Marché TAM petit mais ARPU énorme.

### Segment 2 — Cabinet d'avocats / juristes IA Act — **WTP élevée**

**Le job qu'ils ont** : comprendre les évolutions réglementaires + jurisprudence IA + risque produit pour leurs clients. Chaque dossier client compliance IA = facturé 50-200k€.

**Pourquoi ils paient cher** :

- Le client paie le temps facturable, pas l'outil
- Ils paient déjà Westlaw / LexisNexis 5-15k€/an/user
- Risque réputationnel énorme s'ils ratent une décision

**Pricing maximal** : **150-250 $/user/mois**, plan « Legal AI Watch », avec :

- Sources spécifiques : EU AI Office, AAAI, ACM FAccT, plus arXiv categories `cs.CY`
- Cross-source corroboration (feature #4) → ils veulent du multi-confirmé pour leurs notes clients
- Negative propagation (feature #3) → ils suivent les standards qui sont contestés
- Export PDF des digests pour insertion dans rapports clients

**Positionnement défensif** : « LexisNexis pour le risque IA, mis à jour à la seconde ». Westlaw = historique, theresa = anticipation.

**Risque** : besoin de partenariat avec un cabinet pilote pour cred (référence client).

### Segment 3 — Newsletter / media IA (Ben's Bites, TLDR AI, Last Week in AI) — **WTP modérée mais récurrente**

**Le job qu'ils ont** : publier une newsletter quotidienne avec les top 10-20 signaux IA. Leur produit = ce flux. Sans flux qualifié → pas de newsletter → pas de revenus.

**Pourquoi ils paient** :

- Leur newsletter est leur monétisation directe (sponso, paid tier)
- Gain de temps massif (4-6 h/jour en curation manuelle aujourd'hui)
- 1 newsletter à 50 000 abonnés × 5 $/mois = 250 000 $/mois de revenus → un outil qui les fait gagner 30 % de temps justifie 1 000 $/mois facile

**Pricing** : **200-400 $/mois** par newsletter, plan « Editorial », avec :

- Backtest des rubrics (feature #2) → ils itèrent leur ligne éditoriale
- Bulk export CSV / API → ils piping dans leur workflow
- Multi-LLM consensus (feature #1) → ils citent « cross-validated by 3 models » = différenciation
- Custom branding sur les digests publics

**Positionnement défensif** : « le AP / Bloomberg de la veille IA pour les éditeurs ». Substitut = curation manuelle (chronophage) ou Feedly (générique, pas IA-aware).

### Segment 4 — Brand / Marketing IA-corp (OpenAI, Anthropic, Hugging Face brand teams) — **WTP modérée**

**Le job qu'ils ont** : monitorer comment leur marque, leurs produits et leurs concurrents sont mentionnés. Détecter les crises naissantes, les opportunités de partnership.

**Pricing** : **300-600 $/mois** par équipe, plan « Brand Pulse », avec :

- Sentiment analysis sur top signaux mentionnant leur marque
- Cross-source corroboration (feature #4) → distinguer rumeur vs leak vs annonce officielle
- Author reputation (feature #5) → identifier les voix qui comptent (positives ou négatives)
- Slack alert sur tout signal mentionnant leur brand avec score ≥ 70

**Positionnement défensif** : « Brandwatch / Mention pour la niche IA spécifiquement ». Avantage : sources curatées (vs scraping général qui rate 80 % des conversations vraies en arXiv / niches Reddit).

**Risque** : compétition Brandwatch ($150k/an enterprise). Doit jouer le « niche play » et pas frontal.

### Segment 5 — CTO / Tech Lead PME tech (50-500 employés) — **WTP modérée**

**Le job qu'ils ont** : décider quoi adopter dans leur stack (RAG, agents, vector DB, modèles locaux). Chaque mauvais choix = 6 mois de dev gaspillés.

**Pourquoi ils paient** :

- Ils paient déjà Linear / Notion / Plausible 50-200 $/mois sans broncher
- Mauvaise décision techno = bien plus cher qu'un SaaS
- Veille interne « tech radar » coûte du temps senior

**Pricing** : **49-99 $/user/mois**, plan « Builder », avec :

- Toutes les features de base
- Backtest des rubrics
- Quelques rubrics seed dédiées (« RAG architecture », « Local LLM », « Agent frameworks »)
- Slack integration

**Positionnement défensif** : « ce que ThoughtWorks Tech Radar voudrait être, mais en temps réel et personnalisable ».

**Risque** : segment fragmenté, churn élevé. Compenser par self-serve onboarding.

### Segment 6 — Solo créateur de contenu IA (Twitter / YouTube influencer) — **WTP faible mais volume élevé**

**Le job qu'ils ont** : trouver des sujets de tweets / vidéos avant les autres pour maximiser engagement.

**Pricing** : **9-19 $/mois** plan « Solo », features réduites :

- Pas de multi-LLM consensus (1 modèle suffit)
- Pas de backtest unlimited (5/mois)
- Limité à 1 rubric active
- Pas d'API
- Cap signaux/jour à 100

**Positionnement défensif** : entry-level qui converti vers Builder ou Editorial quand le créateur monétise.

**Risque** : faible WTP, churn, cost of acquisition probablement supérieur au LTV. **Soit drop ce segment, soit en faire un funnel SEO**.

### Tableau de synthèse

| Segment               | WTP / mois | TAM                        | ARPU annuel | Difficulté de vente              |
| --------------------- | ---------- | -------------------------- | ----------- | -------------------------------- |
| VC / PE IA            | 300-500 $  | 5 000 funds                | 4 800 $     | Élevée (cycle long, mais sticky) |
| Avocats IA Act        | 150-250 $  | 50 000 cabinets touchés    | 2 400 $     | Moyenne (besoin référence)       |
| Newsletter / media IA | 200-400 $  | ~5 000 newsletters actives | 3 600 $     | Faible (self-serve, FOMO)        |
| Brand / Marketing     | 300-600 $  | ~500 brands IA             | 5 400 $     | Moyenne (compétition Brandwatch) |
| CTO / Tech Lead       | 49-99 $    | ~100 000 PME tech          | 900 $       | Faible (self-serve, churn)       |
| Créateur solo         | 9-19 $     | ~50 000 micro-créateurs    | 168 $       | Faible (faible LTV)              |

---

## Recommandations stratégiques

### Court terme (Wave 5-6)

1. **Landing marketing** : positionner d'abord sur **VC + Newsletter + Avocats** (les 3 WTP haut). Trois sections personas distinctes en bas du fold. Pas adresser le solo créateur en hero (cannibalise le pricing).
2. **Pricing teaser** : 3 tiers visibles → **Solo 19 $/mois** (entry funnel) / **Team 299 $/mois jusqu'à 5 users** / **Business 999 $/mois jusqu'à 25 users + features moat**. Custom au-delà.
3. **Wave 6 multi-tenant** : c'est la clé du **Team** et **Business** pricing. Sans ça, on plafonne au prix solo. Prioritaire absolu.
4. **Wave 7 Top 5 features moat** : prioriser Multi-LLM consensus (#1) en premier — quick win + différenciation immédiate démontrable sur la landing.

### Moyen terme (Wave 7-9)

5. **Building the moat data** : Author reputation Layer (#5) doit tourner en background dès Wave 7. La data accumule en silence pendant 90 j → quand activée publiquement, elle est déjà unique et impossible à backfiller pour un concurrent.
6. **Backtest UI** : feature démo killer pour la conversion. Permet une démo « avant / après » sur la landing, conversion x2.
7. **Cross-source corroboration** : badge demoable (« confirmé 3 sources ») = social proof viral.

### Long terme (Wave 10+)

8. **API publique premium** : à 99 $/mois extra, expose l'API des signaux scorés à des intégrateurs (Slack bots, n8n workflows, Zapier). Crée un effet d'écosystème.
9. **Newsletter as a service** : edge fn `digest` peut alimenter directement une newsletter Substack / Beehiiv via webhook. Tier dédié 199 $/mois pour newsletters.
10. **White-label « Veille IA pour [secteur] »** : décliner la solution par verticale (Veille IA Santé, Veille IA Légal, Veille IA Finance) avec sources curatées différentes. Multiplicateur ARR x3-5.

### Positionnement défensif global

- **Différenciateur 1** : BYOK 10 providers → unique vs concurrents qui sont single-LLM. À mettre EN PREMIER sur la landing.
- **Différenciateur 2** : Topic memory 90 jours (déjà construit) → moat structurel. Aucun concurrent n'a la stack MinIO + Welford active.
- **Différenciateur 3** : Cascade prompts admin (`{{run:reddit}}`) → quasi-unique, à breveter en marque (« Compose Engine ») sur la landing.
- **Différenciateur 4 (à venir)** : Multi-LLM consensus → analogie radiologie, racontable au public ; storyline marketing forte.

### Risques business

- **Concurrent #1 Exa.ai** : 50 M$ levés, position search-engine-for-AI. Différence : Exa = retrieval, theresa = scoring + memory. Mais ils peuvent pivoter.
- **Concurrent #2 Smart News / Particle** : niche IA grand public. Différence : pas de BYOK ni de scoring custom. Risque mode « news app » low-margin.
- **Concurrent #3 Build internes des VCs / cabinets** : un VC tech-savvy peut bricoler un truc équivalent en 2 semaines avec Claude Code. Réponse : moat = data accumulée (reputation, backtest history) qui prend 90+ jours à backfiller. Vendre VITE avant que les VCs y pensent.
- **Risque modèle** : si les LLM coûtent diviser par 10 (probable d'ici 2027), le différenciateur BYOK perd en valeur. Réponse : pivoter le moat vers la data layer (#3, #5, backtest history).

---

## Implications sur le PRD Wave 6+

| Wave         | Stories prioritaires (issue de cette analyse)                                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wave 6**   | Multi-tenant complet (org + members + RLS rewrite + Stripe billing org-level + tiers Solo/Team/Business). 12 stories. Sans ça, plafond ARPU = 19 $. |
| **Wave 7**   | Multi-LLM consensus (#1, score 14) + Backtest des rubrics (#2, score 14). 6-8 stories. Différenciation marketing immédiate.                         |
| **Wave 8**   | Author Reputation Layer (#5, score 13) + Cross-source corroboration (#4, score 13). 8-10 stories. Construction du moat data.                        |
| **Wave 9**   | Negative signal propagation (#3, score 13). 4-6 stories. Demande embeddings → dépend de Wave 8.                                                     |
| **Wave 10+** | API publique, newsletter integration, white-label par verticale.                                                                                    |

---

## Format pitch landing (synthèse pour S-LandingContent)

### Hero

> **« La veille IA qui comprend vos critères, pas seulement les mots-clés. »**
> Agrégez X, Reddit et arXiv. Scorez chaque signal selon VOS priorités, avec le LLM de votre choix (10 providers). Synthétisez en brief 80/20 dans votre langue. Suivez les topics qui émergent — pas ceux qui buzzent.

### Sections clés (par ordre)

1. **Le problème** : « 90 % de bruit IA, 10 % de signal, 100 % de fatigue ».
2. **La solution en 3 étapes** : agrégation → scoring custom BYOK → digest 80/20.
3. **Différenciateurs (les moats)** :
   - 10 providers LLM au choix (BYOK)
   - Cascade `{{run:<source>}}` pour synthèses transversales (unique au marché)
   - Topic memory 90 jours (z-score Welford)
   - _À venir_ : Multi-LLM consensus, backtest rubrics, author reputation
4. **Cas d'usage par persona** :
   - VC : « ne ratez plus un deal qui démarre sur arXiv »
   - Newsletter / media : « publiez avant TechCrunch »
   - Avocat IA Act : « anticipez la réglementation »
   - CTO / Tech Lead : « validez vos choix techno avant 6 mois de dev »
5. **Pricing** :
   - **Solo** 19 $/mois (1 user, 1 rubric, 100 signaux/jour)
   - **Team** 299 $/mois (5 users, rubrics illimitées, multi-LLM consensus)
   - **Business** 999 $/mois (25 users, backtest illimité, API, author reputation, SLA)
   - **Custom** (VC / cabinet d'avocats / éditeurs) → contact
6. **FAQ** : pourquoi pas Feedly ? (générique) ; pourquoi pas Exa ? (search ≠ veille) ; combien ça coûte vraiment en LLM ? (BYOK, vous payez votre conso, pas une marge) ; mes données sont-elles sécurisées ? (RLS Postgres, BYOK, hosted EU possible).

---

---

# ADDENDUM v2 — Analyse conjointe pricing (2026-05-02, révision)

> **Révision majeure** : le pricing initial (Solo 19 / Team 299 / Business 999) **laissait de l'argent sur la table**. En particulier le tier Solo à 19 € ne couvrait même pas le COG (Apify + LLM maison ≈ 18-20 €/mois). Cette section réfute la grille initiale et la remplace par une analyse conjointe rigoureuse, avec **2 offres par segment** :
>
> - **Offre Maison** — LLM mutualisé côté nous (notre clé OpenRouter wholesale, Haiku économique ou Sonnet premium). Tout-inclus, l'utilisateur ne gère rien.
> - **Offre BYOK** — Utilisateur amène ses clés LLM (10 providers). **Plus chère** que l'offre Maison parce qu'elle adresse un acteur **enterprise / souverain / power user** qui veut Opus, le contrôle de stack, les données qui ne sortent pas de son tenant. La WTP de cette cible est structurellement plus élevée.

## 1. Coûts marginaux (COG) — base de calcul

| Poste                                   | Tarif unitaire         | Volume référence                      | COG mensuel ref.             |
| --------------------------------------- | ---------------------- | ------------------------------------- | ---------------------------- |
| Apify `apidojo/twitter-list-scraper`    | ~ $0,40 / 1 000 tweets | 100 tweets/jour × 30 j = 3 000        | ~ 1,20 $                     |
| Apify `automation-lab/reddit-scraper`   | ~ $1,00 / 1 000 posts  | 450 posts/jour × 30 j = 13 500        | ~ 13,50 $                    |
| arXiv API                               | gratuit                | n/a                                   | 0 $                          |
| OpenRouter Haiku 4.5 (scoring)          | ~ $0,001 / 1k tokens   | 700 sig × 150 tk × 30 = 3,15 M tokens | ~ 3,15 $                     |
| OpenRouter Sonnet 4.6 (scoring premium) | ~ $0,015 / 1k tokens   | idem                                  | ~ 47,25 $                    |
| OpenRouter Opus 4.7 (scoring élite)     | ~ $0,075 / 1k tokens   | idem                                  | ~ 236 $                      |
| Embeddings (cross-source / reputation)  | ~ $0,00002 / signal    | 700 sig × 30 = 21 000                 | ~ 0,40 $                     |
| Supabase compute + bandwidth            | inclus tier ≤ 8 GB     | 1 tenant                              | ~ 0 $ (tier free / Pro 25 $) |
| MinIO storage (90 j topic memory)       | ~ $0,01 / GB / mois    | 1 GB / tenant                         | ~ 0,01 $                     |

### COG mensuel par tier d'usage (approximation conservatrice)

| Profil d'usage                      | Apify  | LLM Haiku | LLM Sonnet | Embeddings | **Total Maison Haiku** | **Total Maison Sonnet** |
| ----------------------------------- | ------ | --------- | ---------- | ---------- | ---------------------- | ----------------------- |
| Solo (100 sig/jour, 1 user)         | ~3 €   | ~1 €      | ~15 €      | ~0,1 €     | **~ 4 € / mois**       | **~ 18 € / mois**       |
| Team (1 000 sig/jour, 5 users)      | ~30 €  | ~10 €     | ~150 €     | ~1 €       | **~ 41 € / mois**      | **~ 181 € / mois**      |
| Business (5 000 sig/jour, 25 users) | ~150 € | ~50 €     | ~750 €     | ~5 €       | **~ 205 € / mois**     | **~ 905 € / mois**      |
| Enterprise (illimité, 100+ users)   | ~500 € | ~200 €    | ~3 000 €   | ~25 €      | **~ 725 € / mois**     | **~ 3 525 € / mois**    |

> **Règle de pricing** : prix de vente ≥ 4 × COG (marge brute ≥ 75 %). En dessous, on perd de l'argent ou on n'a pas la marge pour acquérir / supporter.

## 2. Méthodologie — analyse conjointe par utility (part-worth)

L'analyse conjointe identifie quels **attributs** créent la valeur perçue chez chaque segment, et permet de construire les **bundles optimaux**. Sans données quanti d'enquête, on utilise un raisonnement business assis sur **8 attributs × 3-4 niveaux**.

### Attributs et niveaux

| #   | Attribut            | Niveau 1           | Niveau 2            | Niveau 3           | Niveau 4                       |
| --- | ------------------- | ------------------ | ------------------- | ------------------ | ------------------------------ |
| A1  | Volume signaux/jour | 100                | 1 000               | 5 000              | illimité                       |
| A2  | Sources scrapées    | X seul             | X + Reddit          | X + Reddit + arXiv | + custom (RSS, listes privées) |
| A3  | Mode LLM            | Maison Haiku       | Maison Sonnet       | Maison Opus        | BYOK 10 providers              |
| A4  | Topic memory        | 30 j               | 90 j                | 365 j              | illimité                       |
| A5  | Power features      | Aucune             | Multi-LLM consensus | + Backtest         | + Author reputation            |
| A6  | API publique        | Aucune             | Read-only           | Read + write       | + webhooks                     |
| A7  | Hébergement         | Multi-tenant cloud | Tenant isolé        | Self-host (Docker) | On-prem dédié                  |
| A8  | Support / SLA       | Communauté         | Email 48 h          | CSM dédié          | SLA 99,9 %                     |

### Utility coefficients (0-100) par segment

> Lecture : pour chaque segment, score d'importance × niveau préféré. Plus le total est élevé, plus le segment paiera cher pour ce bundle. _Méthode : ranking par cas d'usage Mom Test, calibrage avec WTP estimée._

| Attribut → Niveau préféré       | VC / PE             | Avocats IA Act       | Newsletter / éditeurs | Brand IA-corp        | CTO PME               | Solo créateur     |
| ------------------------------- | ------------------- | -------------------- | --------------------- | -------------------- | --------------------- | ----------------- |
| **A1 Volume → niveau préféré**  | illimité (95)       | 1 000 (70)           | illimité (90)         | 1 000 (80)           | 1 000 (75)            | 100 (40)          |
| **A2 Sources → niveau préféré** | + custom (95)       | + custom (90)        | X+R+A (75)            | + custom (85)        | X+R+A (70)            | X+R+A (60)        |
| **A3 LLM → niveau préféré**     | **BYOK Opus (100)** | **BYOK Sonnet (90)** | Maison Sonnet (75)    | **BYOK Sonnet (85)** | BYOK / Maison (60-70) | Maison Haiku (50) |
| **A4 Memory → préféré**         | illimité (95)       | illimité (90)        | 365 j (75)            | 365 j (75)           | 90 j (50)             | 30 j (30)         |
| **A5 Power features**           | + Reputation (100)  | Consensus (85)       | + Backtest (90)       | + Reputation (80)    | Consensus (60)        | Aucune (20)       |
| **A6 API**                      | Read+write (90)     | Read-only (50)       | + webhooks (95)       | Read+write (75)      | Read+write (70)       | Aucune (10)       |
| **A7 Hébergement**              | Self-host (90)      | Tenant isolé (85)    | Multi-tenant (60)     | Tenant isolé (75)    | Multi-tenant (60)     | Multi-tenant (50) |
| **A8 Support**                  | CSM dédié (100)     | SLA 99,9 % (95)      | Email 48 h (60)       | CSM dédié (80)       | Email (50)            | Communauté (20)   |
| **Total utility (Σ/800)**       | **765**             | **655**              | **620**               | **635**              | **485**               | **280**           |

### Lecture business

- **VC / PE** est le segment qui paie le plus cher pour un **package complet** (Opus + reputation + self-host + CSM).
- **Avocats** sont presque équivalents en exigence mais préfèrent BYOK Sonnet (compromise coût / souveraineté) et tenant isolé (vs self-host).
- **Newsletter** privilégient volume + backtest + webhooks. Pas besoin de souveraineté forte.
- **Brand IA-corp** : reputation prime (qui dit quoi de la marque) + tenant isolé.
- **CTO PME** : sweet spot mid-market, BYOK ou Maison équivalent, SLA pas critique.
- **Solo** : utility totale ~280/800 → **fondamentalement low-fit**. À considérer comme funnel SEO uniquement (voir section 5).

## 3. Pricing optimal par segment — 12 SKUs (6 segments × 2 modes)

### Logique BYOK > Maison (positionnement, pas COG)

Contre-intuitivement, le BYOK est **plus cher** que l'offre Maison équivalente. Justification :

| Dimension         | Maison                                                  | BYOK                                                                                  |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Cible             | « Je veux que ça marche, j'investis pas dans la stack » | « Je veux Opus, ma clé Anthropic, mes données chez moi »                              |
| Persona           | Mid-market, ops non-tech                                | Enterprise, CTO, équipe data, fonds tech-savvy                                        |
| WTP               | Modérée à élevée                                        | Très élevée (a déjà budget « tooling » illimité)                                      |
| Coût pour nous    | COG LLM (notre wholesale)                               | UI provider config + monitoring multi-providers + cascade engine + support multi-clés |
| Notre marge       | Volume × ratio                                          | Premium × souveraineté                                                                |
| Argument de vente | « Tout-inclus, zéro friction »                          | « Votre stack, votre contrôle, vos modèles élites »                                   |
| Comparable        | Notion AI 10 $/user/mois                                | Vercel AI SDK Cloud / LangChain Enterprise 50-200 $/seat                              |

→ **Le delta BYOK n'est pas un coût technique, c'est un signal de marché** : les acteurs qui demandent BYOK ont déjà une WTP supérieure. On prix la souveraineté, pas le COG.

### Tableau pricing v2 — 12 SKUs

| Segment                                     | Offre **Maison**                                                                             | Offre **BYOK**                                                                                       | Argument BYOK                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **VC / PE IA** (utility 765)                | **599 €/seat/mois** (LLM Sonnet inclus, multi-LLM consensus, author reputation, CSM)         | **999 €/seat/mois** (BYOK Opus + données souveraines + tenant dédié + SLA 99,9 %)                    | « Vos deals, votre Opus, votre tenant. Aucun signal ne quitte. »         |
| **Cabinet d'avocats IA Act** (utility 655)  | **399 €/seat/mois** (Sonnet inclus, sources EU AI Office curatées, cross-source)             | **699 €/seat/mois** (BYOK + tenant isolé + export PDF rapports clients + audit log)                  | « Vos requêtes confidentielles, votre stack LLM, traçabilité complète. » |
| **Newsletter / éditeurs IA** (utility 620)  | **499 €/mois** (org, jusqu'à 3 éditeurs, Sonnet inclus, backtest illimité, API + webhooks)   | **799 €/mois** (BYOK + branding white-label sur digests publics + custom domain)                     | « Votre rédacteur en chef LLM. Pas de marge cachée sur votre conso. »    |
| **Brand / Marketing IA-corp** (utility 635) | **499 €/seat/mois** (Sonnet inclus, author reputation, Slack alerting, sentiment)            | **799 €/seat/mois** (BYOK + tenant isolé + custom rubrics confidentielles + SLA)                     | « Vos conversations brand restent dans VOTRE infrastructure. »           |
| **CTO / Tech Lead PME** (utility 485)       | **149 €/seat/mois** (Haiku éco / Sonnet, 5 seats min, rubrics RAG/agents/local LLM curatées) | **249 €/seat/mois** (BYOK + access aux modèles internes Ollama / vLLM auto-hosted + intégration K8s) | « Votre infra LLM, notre intelligence de filtrage. »                     |
| **Solo créateur IA** (utility 280)          | **49 €/mois** (Haiku éco, 100 sig/jour, 1 rubric, 30 j memory) — **funnel SEO**              | **99 €/mois** (BYOK pour ceux qui veulent Sonnet/Opus + 1 rubric + memory 90 j)                      | « Votre clé, votre choix de modèle, votre contrôle de coût. »            |

### Marges brutes par SKU

| SKU                             | Prix    | COG estimé               | Marge brute | % marge |
| ------------------------------- | ------- | ------------------------ | ----------- | ------- |
| VC Maison Sonnet 1 seat         | 599 €   | ~36 €                    | 563 €       | 94 %    |
| VC BYOK 1 seat (Opus côté user) | 999 €   | ~5 €                     | 994 €       | 99,5 %  |
| Avocats Maison 1 seat           | 399 €   | ~36 €                    | 363 €       | 91 %    |
| Avocats BYOK 1 seat             | 699 €   | ~5 €                     | 694 €       | 99 %    |
| Newsletter Maison org           | 499 €   | ~181 €                   | 318 €       | 64 %    |
| Newsletter BYOK org             | 799 €   | ~14 €                    | 785 €       | 98 %    |
| Brand Maison 1 seat             | 499 €   | ~36 €                    | 463 €       | 93 %    |
| Brand BYOK 1 seat               | 799 €   | ~5 €                     | 794 €       | 99 %    |
| CTO Maison 5 seats (745 €)      | 745 €   | ~110 €                   | 635 €       | 85 %    |
| CTO BYOK 5 seats (1 245 €)      | 1 245 € | ~25 €                    | 1 220 €     | 98 %    |
| Solo Maison Haiku               | 49 €    | ~4 €                     | 45 €        | 92 %    |
| Solo BYOK                       | 99 €    | ~3 € (Apify, embeddings) | 96 €        | 97 %    |

> **Insight clé** : sur tous les segments BYOK, la marge brute > 95 % parce que le COG LLM est nul côté nous. Le BYOK est une vache à lait pure si on cible bien les acteurs WTP-haute.

## 4. Bundles & dégressivité par seat (volume discount)

Pour les **équipes** (Team / Business / Enterprise), pricing dégressif par seat :

| Tranche seats | Discount Maison            | Discount BYOK |
| ------------- | -------------------------- | ------------- |
| 1-5           | 0 %                        | 0 %           |
| 6-25          | -15 % par seat additionnel | -10 %         |
| 26-100        | -30 % par seat additionnel | -20 %         |
| 100+          | Custom (négocié)           | Custom        |

Exemple **Cabinet d'avocats Maison, 10 seats** : 5 × 399 + 5 × 339 = 1 995 + 1 695 = **3 690 €/mois** (vs 3 990 € linéaire).

## 5. Add-ons modulaires (cross-sell sur tous les segments)

Pour augmenter ARPU sans casser le SKU principal :

| Add-on                                                   | Prix / mois     | Cible                  |
| -------------------------------------------------------- | --------------- | ---------------------- |
| **Webhook Slack/Teams illimités**                        | +49 €           | Toute équipe           |
| **API publique read+write**                              | +99 €           | Newsletter, CTO, Brand |
| **Custom sources (RSS, listes privées, scraping ciblé)** | +199 €          | VC, Brand, Avocats     |
| **Audit log + export Compliance**                        | +149 €          | Avocats, Enterprise    |
| **Tenant isolé (vs multi-tenant)**                       | +299 €          | Brand, Avocats         |
| **Self-host on-prem (Docker + support)**                 | +499 € (annuel) | VC, Enterprise         |
| **CSM dédié + onboarding**                               | +999 € (annuel) | VC, Enterprise         |
| **Backtest illimité (vs 5/mois)**                        | +149 €          | Newsletter, Brand      |
| **Author Reputation API**                                | +199 €          | Newsletter, VC, Brand  |

## 6. Le segment Solo : funnel SEO uniquement

Le Solo créateur a une utility de seulement **280/800**. WTP réelle ~9-19 €. **C'est un mauvais business** :

- LTV 168 € / churn 15 %/mois → durée de vie ~7 mois
- CAC réaliste sur Twitter/Product Hunt : ~50-150 €
- ROI marginalement positif voire négatif

**Décision recommandée** : ne PAS commercialiser activement le Solo. Le garder comme **page d'accueil SEO** (« Outil de veille IA personnalisée — gratuit 14 jours »), 100 % self-serve, **upsell agressif vers Team / Business** dès que l'utilisateur arrive à 50 % du quota Solo.

## 7. Tableau récap final — la grille définitive

| Segment                   | Solo                        | Team / Pro                                      | Business / Premium                                       | Enterprise / Custom |
| ------------------------- | --------------------------- | ----------------------------------------------- | -------------------------------------------------------- | ------------------- |
| **Solo créateur**         | 49 € (Maison) / 99 € (BYOK) | —                                               | —                                                        | —                   |
| **CTO PME**               | —                           | 745 € (5 × 149) Maison / 1 245 € (5 × 249) BYOK | 2 615 € (15 × 149 - 15 % discount) Maison / 4 350 € BYOK | Custom              |
| **Newsletter / éditeurs** | —                           | 499 € / 799 € (3 éditeurs)                      | 999 € / 1 599 € (10 éditeurs + branding + API)           | Custom              |
| **Brand IA-corp**         | —                           | 2 495 € (5 × 499) Maison / 3 995 € BYOK         | 8 491 € (20 seats avec discount)                         | Custom              |
| **Avocats IA Act**        | —                           | 1 995 € (5 × 399) Maison / 3 495 € BYOK         | 6 781 € (20 seats avec discount)                         | Custom              |
| **VC / PE IA**            | —                           | 2 995 € (5 × 599) Maison / 4 995 € BYOK         | 10 192 € (20 seats) Maison + add-ons                     | 30 k+ €/an custom   |

### MRR cible par segment (an 1)

| Segment               | Cibles vendues            | ARPU moyen | MRR contribution                   |
| --------------------- | ------------------------- | ---------- | ---------------------------------- |
| Solo (SEO funnel)     | 200 paying / 5 000 trials | 70 €       | 14 k €/mois                        |
| CTO PME               | 30 contrats Team          | 1 000 €    | 30 k €/mois                        |
| Newsletter / éditeurs | 20 contrats               | 700 €      | 14 k €/mois                        |
| Brand IA-corp         | 5 contrats Premium        | 4 000 €    | 20 k €/mois                        |
| Avocats IA Act        | 8 cabinets Pro            | 3 000 €    | 24 k €/mois                        |
| VC / PE IA            | 5 fonds Premium           | 6 000 €    | 30 k €/mois                        |
| **Total**             |                           |            | **132 k €/mois ≈ 1,58 M €/an ARR** |

## 8. Recommandations actionables (révision V2)

1. **Tier visible sur la landing** : afficher 3 paliers seulement → **Solo 49 €** (entry / SEO) · **Pro à partir de 399 €/mois** (toutes équipes, slider seats) · **Enterprise sur devis**. Les 12 SKUs détaillés ne sont PAS exposés en façade ; ils émergent du configurateur (« Vous êtes : VC / Avocat / Éditeur / Brand / CTO / Solo → voici votre offre adaptée »).
2. **Configurateur interactif** sur la landing : 3 questions (« Qui êtes-vous ? Combien de seats ? BYOK ou Maison ? ») → calcule le prix exact + bundle add-ons recommandés.
3. **Le BYOK est la marge** : positionner toutes les communications enterprise sur le BYOK. Maison = entrée gamme. Pousser le upsell BYOK dès que l'utilisateur configure plus de 5 seats.
4. **Solo n'est PAS un business** : le marketer comme funnel uniquement, jamais comme tier principal. Cap des conversions Solo → upsell Team à 30 j.
5. **Add-ons = ARPU x1,5** : structurellement, viser que 50 % des contrats Pro+ achètent ≥ 1 add-on (typiquement « Custom sources » ou « API publique »).
6. **MRR cible an 1** : 132 k €/mois = 1,58 M € ARR. Réaliste si on signe 5 VCs + 8 cabinets + 5 brands + 20 newsletters + 30 CTOs + 200 solo. Ce qui ne tient PAS dans cette projection : aucun tier ≤ 49 €.

## 9. Mise à jour Wave 6 PRD pour supporter ce pricing

Pour que ce pricing tienne, Wave 6 doit livrer :

- Schema `organizations` + `organization_members` + `subscriptions` + `subscription_seats` (pas juste org)
- Stripe Connect ou Stripe Billing avec **metered usage** (Apify + LLM consommation par tenant) pour le Maison
- **Configurateur de tenant** : segment + seats + LLM mode → génère un Stripe Checkout custom
- **Tableau de bord admin** : COG par tenant, marge brute en temps réel, alertes sur outliers (tenant qui consomme 10× la médiane)
- **Self-serve provisioning BYOK** : UI où l'utilisateur entre ses clés Apify + LLM, validation automatique, fallback Maison si clé invalide
- **Audit log + Compliance pack** (add-on Avocats)
- **Tenant isolé** (Postgres schéma séparé OU projet Supabase dédié) — option add-on
- **Self-host Docker** : packaging + doc + support contract — bundle Enterprise

> **Wave 6 estimée** : 18-22 stories (multi-tenant + billing + 12 SKUs Stripe + configurateur). Doublement de l'effort vs ma première estimation (12 stories).

---

## Conclusion (V2)

Le moat principal de `theresa-scrap` n'est **pas** le scoring (commodifiable). C'est la **mémoire longue + la composabilité** :

- 90 jours de topic tracking par utilisateur
- Cascade de prompts admin
- (À venir) Author reputation accumulée
- (À venir) Backtest history par rubric

Toutes ces données sont **non-réplicables** par un concurrent qui démarre — il lui faudrait 90 jours minimum à coût élevé.

**Action immédiate** : la landing (Wave 5) doit pitcher cette histoire **« la veille qui apprend de vous »**, pas « le ChatGPT pour votre veille ». Et derrière, Wave 6 multi-tenant déverrouille l'ARPU x10-20.

> _Date du brief : 2026-05-02. Stack au moment de l'analyse : Wave 4 fermée, 11 edge fns, BYOK 10 providers, topic tracking 90 j, admin cascade. Source : skill `moat-hunter` + analyse business interne._
