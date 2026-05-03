# PRD : Wave 10 — Second Cerveau IA (Kairos comme brique d'enrichissement)

> **Date** : 2026-05-03 **Pivot acté avec founder** : Kairos n'est PAS un outil de veille standalone produisant des briefs. C'est une **brique d'enrichissement structuré du Second Cerveau** dont les briefs sont une _vue parmi d'autres_. **Source méthodologique** : « Second Cerveau IA » + architecture PARA/IPCRA + Méthode CMA (Clarifier-Mapper-Amplifier) **Effort total estimé** : \~37 user stories · 5-7 semaines-agent (Sonnet 4.6 / Haiku 4.5) **Mode d'exécution** : ralph-loop spawn-agents par phase, jamais Opus **Anti-fragilité** : Postgres source de vérité, Neo4j vue dérivée. Phase rollback possible à chaque étape.

---

## 0. Pivot conceptuel

**AVANT** :

```
scrape → score → digest fourre-tout
```

Le digest est la finalité. L'utilisateur lit, parfois copie. C'est tout.

**APRÈS** :

```
scrape → ENRICHISSEMENT MULTI-AXES → graph + Postgres
                                           ↓
                                    [vues à la demande]
                                    /brief @project:GITEX
                                    /presentation @hat:cto --slides 10
                                    /recap weekly --audience board
                                    /explorer (filtre libre)
                                    Neo4j queries pour patterns
```

Les signaux deviennent une **matière structurée** alimentant le Second Cerveau de l'org. Le brief est une requête « give me a slice » — pas l'output final.

### Le moat n'est plus le scoring

Le moat principal devient :

1.  **La taxonomie tenant** (PARA + custom) qui n'existe que chez Kairos pour l'org
2.  **Le graph 90 j+** d'entités liées (auteurs, topics, sources, projets)
3.  **Les vues paramétrables** par persona/projet/casquette
4.  **L'historique d'exploitation** (qui a partagé quoi, qui a annoté quoi)

Wave 9.1 (multi-LLM consensus) et Wave 9.2 (backtest) restent valides comme **attributs d'enrichissement** parmi d'autres, pas comme moat principal.

### Wave 9 partiellement freezée

| Wave                           | Statut         | Raison                                                     |
| ------------------------------ | -------------- | ---------------------------------------------------------- |
| 9.1 Multi-LLM consensus        | ✅ Mergée      | Reste utile (attribut score consensus + variance)          |
| 9.2 Backtest rubrics           | ✅ Mergée      | Reste utile (validation rubrics avant adoption)            |
| 9.3 Negative propagation       | ❄️ **Freezée** | Sera intégrée dans Phase C async enrichment (différemment) |
| 9.4 Cross-source corroboration | ❄️ **Freezée** | Sera intégrée dans Phase C (clustering = couche graph)     |
| 9.5 Author Reputation          | ❄️ **Freezée** | Sera intégrée dans Phase C (auteur = nœud du graph)        |

Pas de gaspillage : leur logique migre dans le nouveau modèle.

---

## 1. Architecture en 5 couches

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 5 — DISTRIBUTION                                          │
│   PDF brandé · Email HTML · Share cards · Webhooks · Audio TTS  │
└─────────────────────────────────────────────────────────────────┘
                            ▲ consomme
┌─────────────────────────────────────────────────────────────────┐
│ Layer 4 — EXPLOITATION À LA DEMANDE                             │
│   /brief @project · /presentation · /recap · /explorer          │
│   API GraphQL · Filtres multi-axes · Annotations team           │
└─────────────────────────────────────────────────────────────────┘
                            ▲ consomme
┌─────────────────────────────────────────────────────────────────┐
│ Layer 3 — GRAPH (Neo4j self-hosted, vue dérivée)                │
│   (Signal)-[:HAS_TOPIC]→(Topic)                                 │
│   (Signal)-[:MENTIONS]→(Entity)                                 │
│   (Signal)-[:RELEVANT_TO]→(Persona)                             │
│   (Author)-[:AUTHORED]→(Signal)                                 │
└─────────────────────────────────────────────────────────────────┘
                            ▲ shadow push
┌─────────────────────────────────────────────────────────────────┐
│ Layer 2 — TAXONOMIE & ENRICHISSEMENT (Postgres source de vérité)│
│   topics_taxonomy · personas (Projects/Hats) · entities         │
│   signal_topics · signal_entities · signal_audiences            │
│   Edge fn enrich-signal (sync) + pg_cron (async)                │
└─────────────────────────────────────────────────────────────────┘
                            ▲ enrichit
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1 — CAPTURE (existant)                                    │
│   Apify X / Reddit / arXiv → table signals (raw_payload jsonb)  │
└─────────────────────────────────────────────────────────────────┘
```

**Principe directeur** : Postgres reste la source de vérité, Neo4j est une vue dérivée pour les requêtes graph-natives. Si Neo4j tombe une semaine, l'app continue à marcher en mode dégradé.

---

## 2. Modèle de données enrichi (Postgres)

### Tables nouvelles

```sql
-- Hiérarchie de topics (org-scoped, configurable)
CREATE TABLE topics_taxonomy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES topics_taxonomy(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  is_seeded BOOLEAN DEFAULT false,  -- Vrai pour la taxonomie commune par défaut
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (org_id, slug)
);

-- Personas alignées PARA : Project / Hat / Resource
CREATE TYPE persona_kind AS ENUM ('project', 'hat', 'resource', 'inbox');
CREATE TABLE personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL = persona partagée org
  kind persona_kind NOT NULL,
  name TEXT NOT NULL,
  key TEXT NOT NULL,  -- pour /brief @key
  context_md TEXT,    -- note de contexte rich (vision/équipe/KPIs/accès)
  date_start DATE,
  date_end DATE,      -- NULL pour Hat (sans date de fin)
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (org_id, key)
);

-- Entités extraites (people, orgs, technologies, papers)
CREATE TYPE entity_kind AS ENUM ('person', 'organization', 'technology', 'paper', 'product');
CREATE TABLE entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind entity_kind NOT NULL,
  canonical_name TEXT NOT NULL,
  aliases TEXT[],
  external_url TEXT,
  metadata JSONB,
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  signal_count INT DEFAULT 0,  -- denormalized counter
  UNIQUE (org_id, kind, canonical_name)
);

-- Liens many-to-many signaux ←→ topics
CREATE TABLE signal_topics (
  signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics_taxonomy(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  confidence NUMERIC(3,2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  source TEXT NOT NULL DEFAULT 'llm',  -- 'llm' | 'rule' | 'manual'
  PRIMARY KEY (signal_id, topic_id)
);

-- Liens signaux ←→ entités
CREATE TABLE signal_entities (
  signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  mention_text TEXT,
  context_snippet TEXT,
  confidence NUMERIC(3,2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  PRIMARY KEY (signal_id, entity_id)
);

-- Liens signaux ←→ personas (audience relevance)
CREATE TABLE signal_personas (
  signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  persona_id UUID NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  relevance_score NUMERIC(3,2) NOT NULL CHECK (relevance_score BETWEEN 0 AND 1),
  reasoning TEXT,
  PRIMARY KEY (signal_id, persona_id)
);

-- Queue d'enrichissement async (résilience)
CREATE TABLE pending_enrichments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  pass_kind TEXT NOT NULL,  -- 'entities' | 'reputation' | 'clustering' | 'neo4j_push'
  status TEXT DEFAULT 'pending',  -- 'pending' | 'in_progress' | 'completed' | 'failed'
  attempts INT DEFAULT 0,
  last_error TEXT,
  scheduled_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_pending_enrichments_pending ON pending_enrichments(scheduled_at)
  WHERE status IN ('pending', 'failed');
```

### Tables modifiées

```sql
-- Ajout colonnes pour scoring composite
ALTER TABLE signals ADD COLUMN weight NUMERIC(4,3);  -- importance × fréquence × utilité
ALTER TABLE signals ADD COLUMN editorial_kind TEXT;  -- 'news' | 'rumor' | 'academic' | 'how-to' | 'hot-take'
ALTER TABLE signals ADD COLUMN enriched_at TIMESTAMPTZ;
```

### Vues pratiques

```sql
-- Vue : signaux enrichis avec topics + personas pour vue Dashboard
CREATE VIEW signals_enriched AS
SELECT
  s.*,
  ARRAY(SELECT t.slug FROM signal_topics st JOIN topics_taxonomy t ON t.id = st.topic_id WHERE st.signal_id = s.id) AS topic_slugs,
  ARRAY(SELECT p.key FROM signal_personas sp JOIN personas p ON p.id = sp.persona_id WHERE sp.signal_id = s.id ORDER BY sp.relevance_score DESC LIMIT 3) AS top_personas,
  ARRAY(SELECT e.canonical_name FROM signal_entities se JOIN entities e ON e.id = se.entity_id WHERE se.signal_id = s.id ORDER BY se.confidence DESC LIMIT 5) AS top_entities
FROM signals s;
```

---

## 3. Phases de déploiement

| Phase                    | Durée   | Livrable user-visible              | Anti-fragile fallback        |
| ------------------------ | ------- | ---------------------------------- | ---------------------------- |
| **A — Foundation**       | 1-2 sem | Taxonomie + persona PARA éditables | Si pète, retombée Wave 9     |
| **B — Vues filtrables**  | 1 sem   | `/digest` filtré par topic+persona | 100 % Postgres, pas de Neo4j |
| **C — Async enrichment** | 1 sem   | Entities + reputation + clustering | Tolère échec via retries     |
| **D — Neo4j shadow**     | 1 sem   | Graph builds en background         | Postgres reste source vérité |
| **E — Neo4j active**     | 1-2 sem | Cypher queries + commandes /slash  | Fallback Postgres si timeout |

---

## 4. User stories par phase

### Phase A — Foundation Postgres + Taxonomie (10 stories)

#### US-10A.1 — DB schema topics_taxonomy + RLS

**Description** : Table hiérarchique de topics scopée org pour le multi-label classification. **Acceptance** :

- [ ] Migration `topics_taxonomy(id, org_id, parent_id, name, slug, description, is_seeded)`
- [ ] RLS org-scoped
- [ ] Constraint UNIQUE (org_id, slug)
- [ ] Self-reference parent_id avec ON DELETE CASCADE
- [ ] Types regen **Files** : migration + types **Agent model** : sonnet · **Effort** : S

#### US-10A.2 — Seed taxonomie commune (40-60 topics IPCRA-aware)

**Description** : Insérer un set par défaut de topics couvrant les 6 segments + IA tech. **Acceptance** :

- [ ] Migration seed avec hiérarchie : Tech IA (LLM, Agents, RAG, Vision, Multimodal, Safety, Ethics, IA Act) / Business (VC dealflow, Brand, Newsletter) / Vertical (Legal, Health, Finance) / Méta (Tooling, Infra, Models)
- [ ] `is_seeded = true` pour distinguer custom user
- [ ] Les seeds sont insérées pour chaque org existante au moment de la migration **Files** : migration seed **Agent model** : sonnet · **Effort** : M

#### US-10A.3 — DB schema personas (PARA Projects + Hats + Resources)

**Description** : Table aligned avec méthodologie PARA pour le second cerveau. **Acceptance** :

- [ ] Migration `personas(id, org_id, user_id NULL, kind enum, name, key, context_md, dates, archived)`
- [ ] ENUM persona_kind = project\|hat\|resource\|inbox
- [ ] RLS : user voit ses propres personas + personas org-shared (user_id NULL)
- [ ] UNIQUE (org_id, key)
- [ ] Contraintes : Project a date_end, Hat n'en a pas **Files** : migration + types **Agent model** : sonnet · **Effort** : M

#### US-10A.4 — DB schema signal_topics + signal_entities + signal_personas

**Description** : 3 tables many-to-many liant signaux à leur enrichissement. **Acceptance** :

- [ ] 3 migrations : `signal_topics`, `signal_entities`, `signal_personas`
- [ ] Toutes avec PRIMARY KEY composite (signal_id, X_id), org_id pour RLS, confidence
- [ ] CHECK contraintes sur confidence [0,1]
- [ ] Cascade delete depuis signals
- [ ] Indexes : (signal_id), (X_id)
- [ ] RLS org-scoped **Files** : 3 migrations + types **Agent model** : sonnet · **Effort** : M

#### US-10A.5 — DB schema entities (canonical names + aliases)

**Description** : Table de personnes/orgs/techs/papers extraites avec dedup par canonical name. **Acceptance** :

- [ ] Migration `entities(id, org_id, kind, canonical_name, aliases[], external_url, metadata, signal_count, first_seen_at, last_seen_at)`
- [ ] ENUM entity_kind = person\|organization\|technology\|paper\|product
- [ ] UNIQUE (org_id, kind, canonical_name)
- [ ] Trigger pour incrémenter signal_count au insert dans signal_entities
- [ ] RLS org-scoped **Files** : migration + trigger + types **Agent model** : sonnet · **Effort** : M

#### US-10A.6 — Edge fn enrich-signal (sync : topic + persona scoring)

**Description** : Au scoring, lance en parallèle 2 sub-passes LLM rapides (Haiku) qui classifient topic et scorent l'audience. **Acceptance** :

- [ ] Edge fn POST `/enrich-signal` avec body `{ signal_ids: uuid[] }`
- [ ] Pour chaque signal : 2 appels parallèles dispatch-llm Haiku
  - Topic classification : retourne array `[{ slug, confidence }]` (multi-label, max 3)
  - Persona relevance : retourne array `[{ persona_key, relevance, reasoning }]` pour les top 3 personas pertinentes
- [ ] Insert dans signal_topics + signal_personas
- [ ] Update `signals.enriched_at`
- [ ] Logs verbeux + cost tracking llm_costs (task `enrich:topic` et `enrich:persona`)
- [ ] Triggered automatiquement par `llm-score-batch` après scoring
- [ ] Tests Deno : 5 cas (signal politique → tag legal+IA Act, signal RAG → tag tech tools, etc.) **Files** : new edge fn + tests **Agent model** : sonnet · **Effort** : L

#### US-10A.7 — UI Settings : éditeur taxonomie (CRUD topics)

**Description** : Onglet « Topics » dans Settings où l'admin org peut ajouter/éditer/supprimer des topics. **Acceptance** :

- [ ] Nouvel onglet `Topics` dans `/settings`
- [ ] Hiérarchie expansible (parent → children) via Tree component
- [ ] Bouton « Ajouter topic » avec parent picker
- [ ] Édition inline du nom + description
- [ ] Suppression avec confirmation (cascade child topics)
- [ ] Distinction visuelle `is_seeded` (badge "Par défaut") vs custom
- [ ] Hook `useTopicsTaxonomy()` + mutations
- [ ] Tests RTL **Files** : Settings.tsx + new component + hook + tests **Agent model** : sonnet · **Effort** : L

#### US-10A.8 — UI Settings : éditeur personas PARA

**Description** : Onglet « PARA » dans Settings pour gérer Projects + Hats + Resources. **Acceptance** :

- [ ] Nouvel onglet `PARA` dans `/settings` avec 4 sections (Inbox / Projects / Hats / Resources)
- [ ] CRUD persona : kind, name, key (auto-slug), context_md (textarea Markdown), dates si Project
- [ ] Toggle « Partagée org » (user_id NULL) vs « Personnelle »
- [ ] Filter archivées
- [ ] Hook `usePersonas()` + mutations
- [ ] Validation key unique org **Files** : Settings.tsx + nouveau composant + hook + tests **Agent model** : sonnet · **Effort** : L

#### US-10A.9 — Recommandations IA pour personas

**Description** : Bouton "Suggérer" dans l'éditeur PARA qui propose des personas custom basées sur l'historique de l'org. **Acceptance** :

- [ ] Bouton "Suggérer Hats/Projects" dans l'onglet PARA
- [ ] Appel edge fn `suggest-personas` qui :
  - Analyse 30j de signaux + topics fréquents
  - Propose 3-5 Hats et 2-3 Projects pertinents
  - Pre-rempli avec nom + key + context_md draft
- [ ] User accepte/refuse chaque suggestion individuellement
- [ ] Tests **Files** : new edge fn + UI button + tests **Agent model** : sonnet · **Effort** : M

#### US-10A.10 — Hook scoring batch trigger enrichissement

**Description** : Modifier `llm-score-batch` pour appeler `enrich-signal` après scoring (sync, parallèle au consensus existant). **Acceptance** :

- [ ] À la fin du scoring d'un batch, appel parallèle à `/enrich-signal` avec les ids
- [ ] Best-effort : si enrich fail, scoring reste persisté (pas de rollback)
- [ ] Logs avec timing breakdown
- [ ] Tests Deno mocking enrich-signal **Files** : `llm-score-batch/index.ts` modif + tests **Agent model** : sonnet · **Effort** : S

---

### Phase B — Vues exploitables (6 stories)

#### US-10B.1 — Hook useSignalsEnriched + filtres multi-axes

**Description** : Hook qui retourne les signaux avec leur enrichissement + filtre par topic/persona/source/score. **Acceptance** :

- [ ] Hook `useSignalsEnriched({ topics?, personas?, sources?, minScore?, window? })`
- [ ] Query view `signals_enriched` avec WHERE org_id + filtres dynamiques
- [ ] Pagination cursor-based
- [ ] React Query staleTime 60s
- [ ] Tests **Files** : hook + tests **Agent model** : haiku · **Effort** : S

#### US-10B.2 — Dashboard avec filtres topic + persona + source

**Description** : Sidebar filtres sur le Dashboard : multi-select topics, picker persona, sources. **Acceptance** :

- [ ] Section sidebar « Filtres » au-dessus de la liste signaux
- [ ] Multi-select topics depuis topics_taxonomy
- [ ] Multi-select personas (groupé par kind)
- [ ] Multi-select sources (X / Reddit / arXiv)
- [ ] Slider score min
- [ ] Slider window (1h / 24h / 7j / 30j / 90j)
- [ ] URL param sync (filtres bookmarkables)
- [ ] Reset filtres **Files** : Dashboard.tsx + new component + tests **Agent model** : sonnet · **Effort** : L

#### US-10B.3 — Page /explorer (vue libre tableau croisé)

**Description** : Nouvelle page /explorer pour explorer la matière par n'importe quel axe. **Acceptance** :

- [ ] Route `/explorer`
- [ ] Pivot table : axes lignes/colonnes choisis (topic × persona, source × topic, etc.)
- [ ] Cellules = count + click = drill-down liste signaux
- [ ] Export CSV de la pivot **Files** : new page + tests **Agent model** : sonnet · **Effort** : L

#### US-10B.4 — /digest contextualisé : pré-écran génération

**Description** : Avant de générer un brief, panneau pré-écran avec scope obligatoire. **Acceptance** :

- [ ] Modal/panel pré-génération sur /digest
- [ ] Champs : topics (multi-select), persona (single ou multi pour ciblage audience), sources, langue, fenêtre, score min
- [ ] Champ libre « Angle / question » optionnel pour custom prompt
- [ ] Cost estimate via tokens \~ count signaux × prompt size
- [ ] Si scope vide → bouton désactivé avec message « sélectionne au moins 1 topic ou 1 persona » **Files** : Digest.tsx + new component + tests **Agent model** : sonnet · **Effort** : M

#### US-10B.5 — Edge fn digest enrichi avec scope params

**Description** : `/digest` accepte maintenant `topic_ids[]`, `persona_ids[]`, `sources[]`, `custom_angle` en plus des params existants. **Acceptance** :

- [ ] Body params étendus
- [ ] Filtrage SQL par jointure signal_topics + signal_personas avant le top-30
- [ ] Inclus persona context_md dans le prompt LLM (donne du contexte)
- [ ] Inclus custom_angle dans le system prompt
- [ ] Persiste les params utilisés dans `digests.scope_params jsonb`
- [ ] Tests Deno **Files** : `digest/index.ts` modif + migration scope_params + tests **Agent model** : sonnet · **Effort** : L

#### US-10B.6 — Stratégie sélection : score ≥ 80 first, fenêtre extensible

**Description** : Le founder a critiqué que les scores 95/90 ne remontaient pas car hors fenêtre 24h. Nouvelle stratégie : top score d'abord, fenêtre flexible. **Acceptance** :

- [ ] Quand `prioritize: 'score'` (default) : prend top 30 by score desc dans la fenêtre, et si \<30 résultats → étend à 7 jours
- [ ] Quand `prioritize: 'freshness'` : strict window
- [ ] Toggle UI dans pré-écran : « Privilégier score / Privilégier fraîcheur »
- [ ] Documenté dans le digest persisté **Files** : `digest/index.ts` + UI + tests **Agent model** : sonnet · **Effort** : M

---

### Phase C — Async enrichissement + queue (7 stories)

#### US-10C.1 — DB schema pending_enrichments + queue

**Description** : Table queue résiliente pour passes async (entities, reputation, clustering, Neo4j push). **Acceptance** :

- [ ] Migration `pending_enrichments(id, signal_id, org_id, pass_kind, status, attempts, last_error, scheduled_at, completed_at)`
- [ ] Index partiel `WHERE status IN ('pending', 'failed')`
- [ ] RLS org-scoped
- [ ] Trigger : à l'insert d'un nouveau signal, append 4 rows queue (entities + reputation + clustering + neo4j_push) **Files** : migration + trigger + types **Agent model** : sonnet · **Effort** : M

#### US-10C.2 — Edge fn enrich-entities (NER async)

**Description** : Worker batch pour extraire entities depuis raw_payload + title. **Acceptance** :

- [ ] Edge fn `/enrich-entities` consomme batch 50 pending_enrichments where pass_kind='entities'
- [ ] Pour chaque signal : appel LLM Haiku NER → array `[{ kind, canonical_name, aliases?, mention_text }]`
- [ ] Dedup avec entities existantes (via canonical_name + kind)
- [ ] Insert/update entities + signal_entities
- [ ] Update pending_enrichments status
- [ ] pg_cron : lancer toutes les 30 min
- [ ] Tests **Files** : new edge fn + cron migration + tests **Agent model** : sonnet · **Effort** : L

#### US-10C.3 — Edge fn compute-reputation (auteur reputation hebdo)

**Description** : Recalcul hebdomadaire de la reputation des auteurs. Logique Wave 9.5 mais intégrée à la queue. **Acceptance** :

- [ ] Edge fn `/compute-reputation` consomme tous les pending where pass_kind='reputation'
- [ ] Lookup `signals.author` (nouveau champ via raw_payload extract) ou `signal_entities.entity_id` kind=person
- [ ] Compute reputation_score basé sur n_high_score / n_total / n_flagged sur 90j
- [ ] Update entity.metadata.reputation_score
- [ ] pg_cron : daily 3am UTC **Files** : new edge fn + migration cron + tests **Agent model** : sonnet · **Effort** : L

#### US-10C.4 — Edge fn cluster-signals (cross-source corroboration via embeddings)

**Description** : Clustering periodique via embeddings titres pour cross-source corroboration. Wave 9.4 réintégré. **Acceptance** :

- [ ] Edge fn `/cluster-signals` consomme pending where pass_kind='clustering'
- [ ] Calcul embeddings via OpenAI text-embedding-3-small si pas déjà fait
- [ ] Cosine similarity \> 0.80 sur fenêtre 48h → ajoute à un cluster (ou crée)
- [ ] Stocke dans `signal_clusters` (Wave 9.4 schema)
- [ ] pg_cron : hourly **Files** : new edge fn + tests **Agent model** : sonnet · **Effort** : L

#### US-10C.5 — Calcul du weight composite signal

**Description** : Compute `signals.weight` = importance × fréquence × utilité depuis enrichissement. **Acceptance** :

- [ ] Function SQL `compute_signal_weight(signal_id)` qui combine :
  - importance = max(score, score_consensus) / 100
  - frequency = log(1 + topic.signal_count_30d) normalisé
  - utility = max(persona.relevance_score) si persona pertinente, 0.5 sinon
  - reputation = author.reputation_score si dispo, 0.5 sinon
  - weight = importance × 0.4 + frequency × 0.2 + utility × 0.3 + reputation × 0.1
- [ ] Trigger update on insert into signal_topics/personas
- [ ] Tests SQL **Files** : migration function + trigger + tests **Agent model** : sonnet · **Effort** : M

#### US-10C.6 — Page /admin/queue : monitoring pending_enrichments

**Description** : Vue admin pour voir l'état de la queue + retry manuel. **Acceptance** :

- [ ] Route `/admin/queue` (gated app_admin)
- [ ] Tableau avec status counts par pass_kind
- [ ] Liste failed jobs avec last_error
- [ ] Bouton "Retry" sur failed individual
- [ ] Bouton "Retry all failed" bulk **Files** : new page + tests **Agent model** : sonnet · **Effort** : M

#### US-10C.7 — Edge fn process-pending-enrichments (orchestrateur cron)

**Description** : Master worker qui appelle les 4 sub-workers selon le scheduling. **Acceptance** :

- [ ] Edge fn `/process-pending-enrichments` consume queue avec retries (max 5 attempts, exponential backoff)
- [ ] Dispatch vers le bon worker selon pass_kind
- [ ] pg_cron : every 30 min **Files** : new edge fn + cron + tests **Agent model** : sonnet · **Effort** : M

---

### Phase D — Neo4j shadow mode (6 stories)

#### US-10D.1 — Provisioning Neo4j Community sur Coolify

**Description** : Déploiement Neo4j self-hosted via Coolify avec persistent volume. **Acceptance** :

- [ ] Image officielle `neo4j:5-community`
- [ ] Volume persistant `/data` + `/logs`
- [ ] Ports : 7474 (HTTP UI), 7687 (Bolt)
- [ ] Auth : password set via env
- [ ] Backup script S3 quotidien (cron Coolify)
- [ ] Doc déploiement dans `docs/ops/neo4j-setup.md` **Files** : doc ops · pas de code repo **Agent model** : sonnet · **Effort** : M (manuel)

#### US-10D.2 — Edge fn neo4j-init (schema + constraints)

**Description** : Initialise les constraints unicité + indexes au démarrage. **Acceptance** :

- [ ] Edge fn `/neo4j-init` qui exécute :
  - `CREATE CONSTRAINT signal_id_unique IF NOT EXISTS FOR (s:Signal) REQUIRE s.id IS UNIQUE`
  - Idem pour Topic, Entity, Persona, Author
  - Index sur les properties fréquemment queried (org_id, kind)
- [ ] Idempotent
- [ ] Auth admin **Files** : new edge fn **Agent model** : sonnet · **Effort** : S

#### US-10D.3 — Edge fn push-to-neo4j (worker async)

**Description** : Worker qui consomme pending where pass_kind='neo4j_push' et push vers Neo4j. **Acceptance** :

- [ ] Edge fn `/push-to-neo4j` avec driver `neo4j-driver-deno`
- [ ] Pour chaque signal pending :
  - MERGE (s:Signal {id}) SET s.\* = props
  - MERGE relationships HAS_TOPIC, MENTIONS, RELEVANT_TO depuis signal_topics/entities/personas
  - MERGE (a:Author {handle, source}) si auteur extrait
- [ ] Si Neo4j down → mark failed avec retry, ne pas crasher
- [ ] Logs metrics : nodes/relationships créés **Files** : new edge fn + tests **Agent model** : sonnet · **Effort** : L

#### US-10D.4 — Backfill historique 90j vers Neo4j

**Description** : One-shot script pour push tous les signaux historiques vers Neo4j. **Acceptance** :

- [ ] Script `/backfill-neo4j` que admin peut trigger
- [ ] Batch 100 signaux à la fois avec progress logging
- [ ] Idempotent (MERGE plutôt que CREATE)
- [ ] Time estimate visible **Files** : new edge fn + tests **Agent model** : sonnet · **Effort** : M

#### US-10D.5 — Health check Neo4j + dashboard

**Description** : Edge fn health-check + display dans /admin. **Acceptance** :

- [ ] Edge fn `/neo4j-health` retourne `{ alive, latency_ms, node_count, relationship_count }`
- [ ] Affiché dans /admin avec timestamp last check
- [ ] Alert orange si latency \> 1s, rouge si down **Files** : new edge fn + AdminCockpit modif + tests **Agent model** : sonnet · **Effort** : S

#### US-10D.6 — Backup S3 quotidien Neo4j (script cron Coolify)

**Description** : Script qui dump Neo4j et upload vers S3 (ou MinIO). **Acceptance** :

- [ ] Script bash dans `scripts/neo4j-backup.sh`
- [ ] `neo4j-admin database dump --to-path` puis upload S3
- [ ] Retention 30 derniers backups
- [ ] Cron Coolify daily 4am UTC
- [ ] Documenté dans `docs/ops/neo4j-setup.md` **Files** : script + doc **Agent model** : sonnet · **Effort** : M

---

### Phase E — Neo4j active + commandes /slash (8 stories)

#### US-10E.1 — Helper neo4jQuery() avec fallback Postgres

**Description** : Lib partagée pour query Neo4j avec timeout + fallback automatique. **Acceptance** :

- [ ] `_shared/neo4j.ts` exporte `queryWithFallback(cypher, params, fallbackFn, options?)`
- [ ] Timeout 500ms par défaut → fallback
- [ ] Logs metrics si fallback déclenché
- [ ] Tests Deno **Files** : new shared module + tests **Agent model** : sonnet · **Effort** : M

#### US-10E.2 — Edge fn brief-by-persona (`/brief @key`)

**Description** : Génère un brief filtré par persona (project/hat). **Acceptance** :

- [ ] Edge fn `/brief-by-persona` body `{ persona_key, window_hours, min_score, custom_angle? }`
- [ ] Cypher query : signaux RELEVANT_TO persona avec relevance \> 0.5 dans la fenêtre
- [ ] Fallback Postgres si Neo4j down (via signal_personas join)
- [ ] Inclus persona.context_md dans le prompt LLM
- [ ] Persists comme digest standard **Files** : new edge fn + tests **Agent model** : sonnet · **Effort** : L

#### US-10E.3 — Edge fn presentation-for-persona (slidev markdown)

**Description** : Génère un deck markdown Slidev (10 slides) à partir des signaux + persona context. **Acceptance** :

- [ ] Edge fn `/presentation-for-persona` body `{ persona_key, slides_count: 10, audience? }`
- [ ] Output markdown Slidev format
- [ ] Inclut : 1 slide cover, 1 TLDR, 5-7 insight slides, 1 next steps, 1 sources
- [ ] Sources cliquables (footnotes)
- [ ] Telechargeable .md ou render PDF **Files** : new edge fn + UI button + tests **Agent model** : sonnet · **Effort** : L

#### US-10E.4 — Edge fn weekly-recap (auto-pushed Slack/email)

**Description** : Génération hebdo automatique d'un recap par persona, push Slack. **Acceptance** :

- [ ] Edge fn `/weekly-recap` triggered par pg_cron lundi 9am UTC
- [ ] Pour chaque persona avec activité (≥3 signaux dans 7j) → génère recap
- [ ] Push vers webhook Slack si configuré dans org settings
- [ ] Push email via Resend si email configuré **Files** : new edge fn + cron + tests **Agent model** : sonnet · **Effort** : L

#### US-10E.5 — Page /explorer améliorée avec graph visualizer

**Description** : Vue interactive du graph Neo4j (avec lib type vis-network ou cytoscape.js). **Acceptance** :

- [ ] Mode "graph" sur `/explorer`
- [ ] Sélection point d'entrée (Topic, Persona, Entity, Author)
- [ ] Render nodes + relationships
- [ ] Click node = drill panel droite
- [ ] Filtres : depth (1-3 hops), edge type **Files** : page modif + new component + tests **Agent model** : sonnet · **Effort** : L

#### US-10E.6 — Annotations + commentaires team sur signaux/digests

**Description** : Layer annotation pour exploitation collaborative. **Acceptance** :

- [ ] Migration `annotations(id, target_kind, target_id, user_id, org_id, body_md, created_at)`
- [ ] target_kind = 'signal' \| 'digest' \| 'entity'
- [ ] UI : panel latéral sur signal/digest/entity avec thread commentaires
- [ ] Mentions @user notifient
- [ ] Tests **Files** : migration + hook + components + tests **Agent model** : sonnet · **Effort** : L

#### US-10E.7 — API GraphQL minimale pour intégrations externes

**Description** : Endpoint GraphQL via PostGraphile ou Hasura pour permettre des intégrations. **Acceptance** :

- [ ] Edge fn `/graphql` ou Supabase pg_graphql activé
- [ ] Schema exposant : signals, topics, personas, entities, signal_topics, etc.
- [ ] Auth via JWT
- [ ] Rate limiting tenant-level
- [ ] Doc usage dans `docs/api/graphql.md` **Files** : config + doc **Agent model** : sonnet · **Effort** : M

#### US-10E.8 — Lien public partageable avec landing page

**Description** : Permettre de partager un brief/digest sans authentification. **Acceptance** :

- [ ] Edge fn `/create-public-share` génère un slug court (8 chars) + auth-bypass token
- [ ] Route publique `/share/:slug` qui lit la digest sans JWT
- [ ] Affichage clean : branding org + brief + footer Kairos
- [ ] Expire après 30j (configurable)
- [ ] Track views + clicks **Files** : migration + edge fn + new public page + tests **Agent model** : sonnet · **Effort** : L

---

## 5. Quality gates (par story)

```bash
bun x tsc -b --noEmit              # 0 erreur
bun x eslint . --max-warnings 0    # 0 warning
bun x vitest run                   # 100 % pass
```

Pour stories DB :

```bash
bunx supabase db push --include-all
bunx supabase gen types typescript --project-id crplceoptyeslqyfcqvj > src/types/database.ts
```

Pour stories Neo4j :

- Test connexion + Cypher idempotent
- Vérification fallback Postgres si Neo4j down

---

## 6. Anti-fragility patterns

| Risque                            | Mitigation                                                          |
| --------------------------------- | ------------------------------------------------------------------- |
| Neo4j down                        | Fallback Postgres automatique avec timeout 500ms                    |
| MinIO bucket disparait            | Edge fn `minio-init` re-applique config idempotente (déjà déployée) |
| Coût LLM enrichissement explose   | Sync = Haiku 4.5 (\$0.0003/signal), Async = batch + cache           |
| Migration DB casse Wave 9         | Tests d'intégration avant push, rollback prévu par migration `down` |
| Backfill 90j prend des heures     | Job en background avec progress + resume on failure                 |
| Queue pending_enrichments saturée | Auto-scaling workers + alert admin si \> 1000 pending               |
| Neo4j data drift vs Postgres      | Job de réconciliation hebdo qui détecte et corrige                  |

---

## 7. Migration & rollback strategy

Chaque phase a un point de rollback documenté :

- **Phase A** : drop des nouvelles tables, code Wave 9 reste fonctionnel
- **Phase B** : feature flag `enable_enriched_views` côté frontend, rollback = false
- **Phase C** : pause cron jobs, queue se vide naturellement
- **Phase D** : arrêt push Neo4j (Postgres reste source vérité)
- **Phase E** : feature flag `use_neo4j_for_queries` côté backend, rollback = false → tout revient sur Postgres

---

## 8. Mapping ralph-loop

```yaml
loop_config:
  max_iterations: 25
  circuit_breaker_threshold: 3
  default_agent_model: sonnet-4-6
  fallback_agent_model: haiku-4-5
  forbidden_models: [opus-4-7, opus-4-6]
  worktree_strategy: per-phase # 1 worktree par phase, stories séquentielles dedans
  worktree_base: /c/temp/kairos-w10
  base_branch: main
  merge_strategy: fast-forward-via-no-ff
  auto_deploy_after_merge: true
  deploy_target: coolify

phases:
  - id: phase-A
    name: Foundation Postgres
    branch: feat/wave-10A-foundation
    stories: [10A.1, 10A.2, 10A.3, 10A.4, 10A.5, 10A.6, 10A.7, 10A.8, 10A.9, 10A.10]
  - id: phase-B
    name: Vues filtrables
    branch: feat/wave-10B-views
    stories: [10B.1, 10B.2, 10B.3, 10B.4, 10B.5, 10B.6]
    depends_on: phase-A
  - id: phase-C
    name: Async enrichment
    branch: feat/wave-10C-async
    stories: [10C.1, 10C.2, 10C.3, 10C.4, 10C.5, 10C.6, 10C.7]
    depends_on: phase-A
  - id: phase-D
    name: Neo4j shadow
    branch: feat/wave-10D-neo4j-shadow
    stories: [10D.1, 10D.2, 10D.3, 10D.4, 10D.5, 10D.6]
    depends_on: phase-C
  - id: phase-E
    name: Neo4j active + commandes
    branch: feat/wave-10E-neo4j-active
    stories: [10E.1, 10E.2, 10E.3, 10E.4, 10E.5, 10E.6, 10E.7, 10E.8]
    depends_on: phase-D

exit_conditions:
  all_stories_pass: true
  typecheck_zero_errors: true
  lint_zero_warnings: true
  vitest_all_pass: true
  promised_signal: '<promise>COMPLETE</promise>'
```

---

## 9. Open Questions

1.  **Neo4j cloud d'urgence** : si self-host Coolify pète durablement, fallback temporaire vers Aura free tier (50k nodes) ? → **Décision provisoire** : oui, mais en cas de crise documentée seulement.
2.  **Personas user_id NULL (org-shared) vs propres** : où se range Inbox ? user-level ou org ? → **Décision** : Inbox toujours user-level (un user a sa propre inbox), Projects/Hats peuvent être les 2.
3.  **Coût enrichissement à 500 signaux/jour** : \~\$0.30/jour tenant avec Haiku → \$9/mois → couvert par tier Pro.
4.  **GraphQL schema** : pg_graphql natif Supabase ou PostGraphile dédié ? → **Décision provisoire** : pg_graphql Supabase pour MVP, PostGraphile si limites.

---

_PRD généré 2026-05-03. À valider par founder avant spawn agents par phase._
