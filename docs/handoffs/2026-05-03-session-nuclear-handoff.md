# PASSATION NUCLÉAIRE — Session 2026-05-02 → 2026-05-03

> Document de reprise complet permettant à toute nouvelle session (toi-même après reboot, ou un nouvel agent) de continuer sans devoir relire 24h de chat. Self-contained. Authoritative à `HANDOFF.md` + `.ralph/prd.json` pour le détail.

---

## TL;DR (45 secondes)

- **Session intensive ~48h** : 2 nuits de travail. 4 PRD + 90 user stories + 20 bugs critiques fixés + Wave 11 livrée partielle.
- **Pivot conceptuel acté** : Kairos = brique d'enrichissement Second Cerveau. Briefs = vue parmi d'autres. Wave 9.3-9.5 freezées et migrées vers Wave 10 phases A-E (37 stories sur 5-7 sem-agent).
- **Production stable** : `https://scrap.ai-mpower.com` HEAD `4f2a055`. 0 typecheck error, 0 lint warning, 181/181 tests vitest verts.
- **Reste à faire urgent** : rotation 4 credentials leakés, configuration Stripe (3 secrets), re-trigger run-pipeline pour rétablir 148 signaux X.
- **Reste à dispatcher** : Wave 10 Phase A (10 stories Foundation Postgres + Taxonomie PARA), validation founder déjà donnée.

---

## 1. État technique vérifié post-session

### Git

```
local main HEAD = origin/main HEAD = 4f2a055 (« docs(handoff): mise à jour complete »)
working tree   = clean
branches       = main + feat/topic-tracking-minio (les 2 alignées)
worktrees      = /c/temp/kairos-hotfix uniquement
                 (Wave 9.X et 10.0 worktrees + branches déjà cleanup)
```

### DB Supabase (project `crplceoptyeslqyfcqvj`)

- 32 migrations appliquées (jusqu'à `20260503200001_public_shares`)
- 4 hotfixes RLS / UNIQUE / récursion fixés ce matin
- Tables clés ajoutées Wave 9.1 + 11 : `score_runs`, `public_shares`
- Fonctions SECURITY DEFINER : `is_app_admin()`, `list_org_members()`, `list_app_admins()`, `read_public_digest()`

### Edge functions (26 ACTIVES)

Toutes synchronisées. Dernières mises à jour critiques :

- `digest` v5+ — nouveau prompt PDB 5 sections + override langue per-brief + auto-inject footnotes
- `llm-score-batch` v6+ — multi-LLM consensus N modèles + fix OPTIONS preflight 500
- `scraper-x/reddit/arxiv` v3+ — dédup `external_id` avant upsert (fix bug duplicate batch)
- Nouveaux : `minio-init` (init bucket), `create-public-share` (lien public), `backtest-rubric`

### Coolify (app `jhg5pwiyul9r992k8qg2lkx6`)

- Suit branche `feat/topic-tracking-minio` (= main mergé)
- Dernier deploy : `2ab33df` finished (PDF italic fix)
- Auto-deploy au push fonctionne, mais peut nécessiter trigger manuel via API
- Token + URL admin dans `~/.claude/.../memory/coolify_infra.md`

### Quality gates dernier état

```bash
bun x tsc -b --noEmit              # 0 erreur
bun x eslint . --max-warnings 0    # 0 warning
bun x vitest run                   # 181/181 tests verts
```

---

## 2. Pivot conceptuel acté avec founder (à NE PAS oublier)

**AVANT** session :

> Kairos = outil de veille standalone. Brief = output final.

**APRÈS** session (acté avec founder) :

> Kairos = **brique d'enrichissement structuré du Second Cerveau** (méthodologie PARA / IPCRA / CMA).
> Le brief n'est qu'**une vue parmi d'autres** d'une matière structurée par enrichissement multi-axes.

**Conséquences** :

- Le moat principal n'est PLUS le scoring qualité. Wave 9.1+9.2 (consensus + backtest) restent utiles comme attributs d'enrichissement parmi d'autres.
- **Wave 9.3-9.5 freezées** (Negative propagation, Cross-source corroboration, Author Reputation) — leur logique migre vers Wave 10 Phase C (clustering + entities).
- **Wave 10 Second Cerveau** = nouveau plan stratégique (5 phases A→E, 37 stories) qui implémente :
  - Layer 2 : Taxonomie tenant + enrichissement multi-axes (topics, personas PARA, entities, signal_links)
  - Layer 3 : Graph Neo4j self-hosted Coolify (vue dérivée, fallback Postgres si timeout)
  - Layer 4 : Vues paramétrables + commandes /slash (`/brief @persona`, `/presentation`, `/recap`)
  - Layer 5 : Distribution premium (PDF brandé, lien public, share cards, email HTML, Slack)
- **Anti-fragile** : Postgres source vérité, Neo4j dérivée, feature flags par phase pour rollback.

**Doc PRD** : `docs/handoffs/2026-05-03-wave-10-second-cerveau-prd.md` (validé founder, prêt à dispatcher Phase A).

---

## 3. Bugs critiques résolus aujourd'hui (20 hotfixes)

Référence canonique dans `HANDOFF.md` section 4. Liste résumée :

| Catégorie          | Bugs                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **RLS récursion**  | `organization_members` (b8bf43d), `app_admins` (b999ae3)                                                                                   |
| **DB schema**      | UNIQUE constraint `(org_id, provider)` user_api_keys (b09637a)                                                                             |
| **Frontend hooks** | `useIsAppAdmin` this binding (8de9ef0), `useTeamMembers` view 403 (7c08922)                                                                |
| **i18n / FR**      | Currency picker /costs (b18ab09), accents Costs/Logs/Settings (f418c1b)                                                                    |
| **Edge fns**       | OPTIONS preflight 500 (8b71d5c), HTTP/2 stream error fetch (1a1b159), MinIO bucket inexistant (887a315)                                    |
| **Scrapers**       | 3 scrapers `21000 ON CONFLICT` duplicate (2b18e0f)                                                                                         |
| **Dashboard**      | limit 500 → 5000 (top ArXiv invisibles) (326bb21)                                                                                          |
| **Digest**         | LLM 2-3 insights paresseux (8b71d5c), badges WEP invisibles (326bb21), sélecteur langue manquant (d27d175), header brief enrichi (2b18e0f) |
| **Wave 11**        | PDF window.print → @react-pdf/renderer (dcd1e1a), lien public sans auth (dcd1e1a), font italic crash (2ab33df)                             |
| **Code mort**      | Plausible cleanup (00fd705)                                                                                                                |

---

## 4. Documents stratégiques produits

### Stratégie / moats

- `docs/strategy/2026-05-02-moats-and-value-capture.md` — 50 KB. Source vérité moats produit + pricing 12 SKUs + MRR cible 132 k€/mois.
- `docs/strategy/2026-05-03-digest-moats-and-shareability.md` — 26 KB. Moat-hunt /digest spécifique avec 15 analogies inter-industries.

### PRD ralph-loop

- `docs/handoffs/2026-05-03-wave-9-moats-prd.md` — 41 KB. 26 stories. Statut : 9.1+9.2 livrés, 9.3-9.5 freezés.
- `docs/handoffs/2026-05-03-wave-10-second-cerveau-prd.md` — 38 KB. 37 stories sur 5 phases A→E. Validé founder.

### Source canonique des stories

- `.ralph/prd.json` — 66 KB, 90 stories trackées (statut, dependencies, agentModel, acceptanceCriteria).

---

## 5. Memory files Claude Code (à conserver)

`C:\Users\amans\.claude\projects\C--Users-amans-OneDrive-Projets-claudia-zlatan-scrap-main\memory\`

### Reference (infrastructure)

- `coolify_infra.md` — admin URL `coolify.ai-mpower.com`, app UUID, token deploy API, branche déployée
- `supabase_infra.md` — project ref + service_role + anon + founder ids
- `worktree_setup.md` — pourquoi `/c/temp/kairos-hotfix` plutôt que OneDrive direct

### User profile

- `user_amine_cto.md` — profil founder, préférences communication

### Feedback (ne pas répéter les erreurs)

- `feedback_check_history_first.md` — toujours grep transcripts/passations avant de redemander
- `feedback_no_assumptions.md` — vérifier avant d'affirmer
- `feedback_autonomous_corrections.md` — fix direct, pas dicter
- `feedback_supabase_rpc_pattern.md` — `supabase.rpc()` jamais détaché en variable

Index : `MEMORY.md`.

**Toutes ces memories survivent au reboot** (fichiers disque local).

---

## 6. État découvertes investigations (à NE PAS reperdre)

### Modèle LLM réellement utilisé

- **Digest** : `deepseek-v4-flash` (DeepSeek V4 Flash) — vu via DB query digests
- **Settings explicites** : `model_scoring=NULL, model_digest=NULL, model_topic_classifier=NULL` → fallback default
- **Langue settings.language** : `en` (anglais) → c'est pour ça que les briefs sortaient en anglais avant
- Override per-brief possible via UI sélecteur langue (depuis cette session)

### Mystère X 0 signaux résolu

Timeline 2026-05-02 :

```
15:39 + 15:40 : 2 runs scraper-x OK → 148 signaux X insérés (org cbab1468)
15:41:41      : PURGE manuelle par founder → 913 signaux supprimés (TOUS, dont X)
15:42         : re-scrape X start
15:43:15      : ÉCHEC "21000 ON CONFLICT DO UPDATE command cannot affect row a second time"
                Cause : Apify retourne 2× le même tweet dans le batch
                Fix : dédup external_id avant upsert (commit 2b18e0f)
```

### Distribution scores corpus actuel (vu via service_role REST)

```
640 signaux Reddit
108 signaux ArXiv
0   signaux X (après purge, scraper fixé pour re-trigger)
748 total

Top 20 scores : 95, 95, 90, 90, 90, 85... 80
```

---

## 7. À faire (urgence décroissante)

### URGENT — à faire toi-même quand tu reprends

1. **Rotation 4 credentials leakés dans le chat** (sécurité) :
   - Service role Supabase + Anon key (régénérer dans dashboard Supabase)
   - Coolify API token (régénérer dans Coolify settings)
   - MinIO secrets (régénérer + update via `bunx supabase secrets set MINIO_*=...`)
2. **Configuration Stripe** (pour activer billing Wave 6.2) :
   ```bash
   bunx supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx
   bunx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
   STRIPE_SECRET_KEY=sk_live_xxx deno run -A scripts/stripe-bootstrap.ts
   bunx supabase secrets set STRIPE_PRICES_CATALOG="$(cat stripe-prices.live.json)"
   ```
3. **Re-trigger run-pipeline** sur `/dashboard` pour rétablir les 148 signaux X (scraper fixé)

### Mid-term — Wave 10 Phase A (à dispatcher quand prêt)

10 stories Foundation Postgres + Taxonomie PARA. Worktree dédié `/c/temp/kairos-w10A`. Branche `feat/wave-10A-foundation`. Sonnet 4.6 par défaut. Voir PRD Wave 10 doc complet.

### Non-bloquant

- Wave 11 TODO : OG meta tags dynamiques, Email HTML Resend, Slack webhook, Branding org PDF
- Plausible analytics (compte + uncomment) si tu veux tracker

---

## 8. Comment reprendre après reboot

```bash
# 1. Vérifier état worktree principal OneDrive
cd "/c/Users/amans/OneDrive/Projets/claudia-zlatan-scrap-main"
git status                    # devrait être clean
git log -1                    # devrait montrer 4f2a055 ou plus récent

# 2. Si OneDrive lock OU désynchronisé, basculer worktree de travail
cd /c/temp/kairos-hotfix
git pull origin main
bun install                   # au cas où package.json a changé

# 3. Lancer dev
bun dev                       # http://localhost:5173

# 4. Lire les 3 docs critiques
cat HANDOFF.md                                              # pour l état global
cat docs/handoffs/2026-05-03-wave-10-second-cerveau-prd.md  # PRD à dispatcher
cat ~/.claude/projects/C--*-claudia-zlatan*/memory/MEMORY.md  # index memories

# 5. Si nouveau Claude Code session : invoquer pour qu il lise les memories
# (les memories sont auto-chargées au mount via le système auto-memory)
```

---

## 9. Ce qui pourrait casser au reboot (et comment résoudre)

| Risque                                              | Mitigation                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Worktree OneDrive verrouillé SearchIndexer**      | Travailler dans `/c/temp/kairos-hotfix` qui survit au reboot (disque local C:\) |
| **Extension Chrome déconnectée** (claude-in-chrome) | Re-login claude.ai, redémarrer Chrome                                           |
| **Variables session Coolify token**                 | Dans `memory/coolify_infra.md`, persistées disque                               |
| **Supabase service_role / anon**                    | Dans `memory/supabase_infra.md` (à rotater de toute façon)                      |
| **Sessions Claude Code conversationnelles**         | Perdues au reboot. Ce HANDOFF nucléaire compense.                               |
| **Worktrees Wave 9.X transients**                   | Déjà cleanup avant cette passation, plus rien à perdre                          |
| **Bun install dépendances**                         | `bun install` dans `/c/temp/kairos-hotfix` regénère `node_modules/`             |

---

## 10. Signal de fin de session

```
✅ Tout commit + push GitHub                : main = 4f2a055
✅ OneDrive worktree synchronisé            : git pull effectué
✅ DB Supabase migrations all applied       : 32 migrations
✅ Edge functions deployed                  : 26 ACTIVE
✅ Coolify last deploy                       : 2ab33df finished
✅ Quality gates                             : 0/0/181/181
✅ Memory files persisted                    : 9 fichiers
✅ HANDOFF.md mis à jour                     : 19 KB
✅ Cette passation nucléaire                 : présente

READY TO REBOOT.
```

---

_Passation générée 2026-05-03 fin de session. Le reboot ne perd RIEN de critique._
