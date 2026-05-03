#!/usr/bin/env python3
"""Étend .ralph/prd.json :
- Marque Wave 9.3/9.4/9.5 stories comme `frozen: true`
- Ajoute les 37 stories Wave 10 (Second Cerveau) sur 5 phases A→E
- Ajoute section wave_10_planned
"""
import json
from pathlib import Path

prd_path = Path('.ralph/prd.json')
data = json.loads(prd_path.read_text(encoding='utf-8'))

# Marquer Wave 9.3, 9.4, 9.5 frozen
frozen_waves = {'9.3', '9.4', '9.5'}
for s in data.get('stories', []):
    wave = s.get('wave', '')
    if isinstance(wave, str) and wave in frozen_waves and not s.get('passes', False):
        s['frozen'] = True
        s['frozen_reason'] = f"Pivot Second Cerveau 2026-05-03 — logique migree dans Wave 10 phase C"

wave_10 = [
    # ===== Phase A — Foundation Postgres =====
    {"id":"S-10A.1","wave":"10.A","title":"DB schema topics_taxonomy + RLS","passes":False,"agentModel":"sonnet","priority":1,"effort":"S","dependencies":[],"filesCreate":["supabase/migrations/20260504000001_topics_taxonomy.sql"],"filesModify":["src/types/database.ts"],"acceptanceCriteria":["topics_taxonomy hierarchique","UNIQUE (org_id, slug)","RLS org-scoped","Self-ref parent_id ON DELETE CASCADE","Types regen"]},
    {"id":"S-10A.2","wave":"10.A","title":"Seed taxonomie commune (40-60 topics IPCRA-aware)","passes":False,"agentModel":"sonnet","priority":2,"effort":"M","dependencies":["S-10A.1"],"filesCreate":["supabase/migrations/20260504000002_topics_seed.sql"],"filesModify":[],"acceptanceCriteria":["Hierarchie Tech IA / Business / Vertical / Meta","is_seeded=true","Inserees pour chaque org existante"]},
    {"id":"S-10A.3","wave":"10.A","title":"DB schema personas (PARA Projects+Hats+Resources)","passes":False,"agentModel":"sonnet","priority":3,"effort":"M","dependencies":[],"filesCreate":["supabase/migrations/20260504000003_personas.sql"],"filesModify":["src/types/database.ts"],"acceptanceCriteria":["personas avec kind enum project|hat|resource|inbox","RLS user-or-org-shared","UNIQUE (org_id, key)","Project a date_end Hat n en a pas"]},
    {"id":"S-10A.4","wave":"10.A","title":"DB schema signal_topics + signal_entities + signal_personas","passes":False,"agentModel":"sonnet","priority":4,"effort":"M","dependencies":["S-10A.1","S-10A.3"],"filesCreate":["supabase/migrations/20260504000004_signal_links.sql"],"filesModify":["src/types/database.ts"],"acceptanceCriteria":["3 tables M2M","PK composite","CHECK confidence [0,1]","Cascade delete depuis signals","Indexes","RLS org-scoped"]},
    {"id":"S-10A.5","wave":"10.A","title":"DB schema entities + dedup canonical names","passes":False,"agentModel":"sonnet","priority":5,"effort":"M","dependencies":[],"filesCreate":["supabase/migrations/20260504000005_entities.sql"],"filesModify":["src/types/database.ts"],"acceptanceCriteria":["entities kind enum + canonical_name + aliases[]","UNIQUE (org_id, kind, canonical_name)","Trigger increment signal_count","RLS"]},
    {"id":"S-10A.6","wave":"10.A","title":"Edge fn enrich-signal sync (topic + persona)","passes":False,"agentModel":"sonnet","priority":6,"effort":"L","dependencies":["S-10A.1","S-10A.3","S-10A.4"],"filesCreate":["supabase/functions/enrich-signal/index.ts","supabase/functions/enrich-signal/index.test.ts"],"filesModify":[],"acceptanceCriteria":["POST signal_ids","2 calls parallels Haiku (topic + persona)","Insert signal_topics + signal_personas","Update signals.enriched_at","Logs llm_costs task=enrich:topic","Triggered par llm-score-batch","Tests Deno 5 cas"]},
    {"id":"S-10A.7","wave":"10.A","title":"UI Settings editeur taxonomie (CRUD topics)","passes":False,"agentModel":"sonnet","priority":7,"effort":"L","dependencies":["S-10A.1"],"filesCreate":["src/components/features/TaxonomyEditor.tsx","src/hooks/useTopicsTaxonomy.ts","src/components/features/TaxonomyEditor.test.tsx"],"filesModify":["src/pages/Settings.tsx"],"acceptanceCriteria":["Onglet Topics dans Settings","Tree component expansible","CRUD topic","Distinction is_seeded badge","Hook useTopicsTaxonomy","Tests RTL"]},
    {"id":"S-10A.8","wave":"10.A","title":"UI Settings editeur personas PARA","passes":False,"agentModel":"sonnet","priority":8,"effort":"L","dependencies":["S-10A.3"],"filesCreate":["src/components/features/PersonasEditor.tsx","src/hooks/usePersonas.ts","src/components/features/PersonasEditor.test.tsx"],"filesModify":["src/pages/Settings.tsx"],"acceptanceCriteria":["Onglet PARA 4 sections","CRUD persona kind/name/key/context_md/dates","Toggle partagee org vs perso","Filter archivees","Validation key unique"]},
    {"id":"S-10A.9","wave":"10.A","title":"Edge fn suggest-personas (recommandations IA)","passes":False,"agentModel":"sonnet","priority":9,"effort":"M","dependencies":["S-10A.3","S-10A.6"],"filesCreate":["supabase/functions/suggest-personas/index.ts","supabase/functions/suggest-personas/index.test.ts"],"filesModify":["src/components/features/PersonasEditor.tsx"],"acceptanceCriteria":["Analyse 30j signaux + topics","Propose 3-5 Hats + 2-3 Projects","Pre-rempli nom+key+context_md","Accept/refuse individuel","Tests"]},
    {"id":"S-10A.10","wave":"10.A","title":"llm-score-batch trigger enrich-signal","passes":False,"agentModel":"haiku","priority":10,"effort":"S","dependencies":["S-10A.6"],"filesCreate":[],"filesModify":["supabase/functions/llm-score-batch/index.ts"],"acceptanceCriteria":["Apres scoring batch, call parallel /enrich-signal","Best-effort si fail","Logs timing","Tests Deno"]},

    # ===== Phase B — Vues exploitables =====
    {"id":"S-10B.1","wave":"10.B","title":"Hook useSignalsEnriched + filtres multi-axes","passes":False,"agentModel":"haiku","priority":1,"effort":"S","dependencies":["S-10A.4"],"filesCreate":["src/hooks/useSignalsEnriched.ts","src/hooks/useSignalsEnriched.test.ts"],"filesModify":[],"acceptanceCriteria":["Hook avec filtres dynamiques","Pagination cursor","staleTime 60s","Tests"]},
    {"id":"S-10B.2","wave":"10.B","title":"Dashboard filtres topic + persona + source","passes":False,"agentModel":"sonnet","priority":2,"effort":"L","dependencies":["S-10B.1","S-10A.7","S-10A.8"],"filesCreate":["src/components/features/SignalFilters.tsx"],"filesModify":["src/pages/Dashboard.tsx"],"acceptanceCriteria":["Sidebar Filtres","Multi-select topics + personas + sources","Score min slider","Window slider","URL params sync","Reset"]},
    {"id":"S-10B.3","wave":"10.B","title":"Page /explorer (vue tableau croise)","passes":False,"agentModel":"sonnet","priority":3,"effort":"L","dependencies":["S-10B.1"],"filesCreate":["src/pages/Explorer.tsx","src/pages/Explorer.test.tsx"],"filesModify":["src/App.tsx"],"acceptanceCriteria":["Pivot table axes choisis","Drill-down click","Export CSV"]},
    {"id":"S-10B.4","wave":"10.B","title":"/digest pre-ecran scope","passes":False,"agentModel":"sonnet","priority":4,"effort":"M","dependencies":["S-10A.7","S-10A.8"],"filesCreate":["src/components/features/DigestScopePanel.tsx"],"filesModify":["src/pages/Digest.tsx"],"acceptanceCriteria":["Modal pre-generation","Champs topics/personas/sources/langue/window/score","Champ Angle libre","Cost estimate","Bouton desactive si scope vide"]},
    {"id":"S-10B.5","wave":"10.B","title":"digest edge fn scope params","passes":False,"agentModel":"sonnet","priority":5,"effort":"L","dependencies":["S-10B.4"],"filesCreate":["supabase/migrations/20260504000010_digests_scope_params.sql"],"filesModify":["supabase/functions/digest/index.ts"],"acceptanceCriteria":["Body params etendus","Filtrage SQL via signal_topics + signal_personas","persona context_md dans prompt","custom_angle dans system","Persists scope_params jsonb","Tests"]},
    {"id":"S-10B.6","wave":"10.B","title":"Strategie selection score-first vs freshness","passes":False,"agentModel":"sonnet","priority":6,"effort":"M","dependencies":["S-10B.5"],"filesCreate":[],"filesModify":["supabase/functions/digest/index.ts","src/components/features/DigestScopePanel.tsx"],"acceptanceCriteria":["Mode score-first : top 30 by score, fenetre extensible 7j si <30","Mode freshness : strict window","Toggle UI","Tests"]},

    # ===== Phase C — Async enrichment =====
    {"id":"S-10C.1","wave":"10.C","title":"DB schema pending_enrichments + queue","passes":False,"agentModel":"sonnet","priority":1,"effort":"M","dependencies":[],"filesCreate":["supabase/migrations/20260504000020_pending_enrichments.sql"],"filesModify":["src/types/database.ts"],"acceptanceCriteria":["pending_enrichments avec status enum","Index partiel WHERE pending OR failed","RLS","Trigger insert signal append 4 rows queue"]},
    {"id":"S-10C.2","wave":"10.C","title":"Edge fn enrich-entities (NER async)","passes":False,"agentModel":"sonnet","priority":2,"effort":"L","dependencies":["S-10C.1","S-10A.5"],"filesCreate":["supabase/functions/enrich-entities/index.ts","supabase/functions/enrich-entities/index.test.ts","supabase/migrations/20260504000021_enrich_entities_cron.sql"],"filesModify":[],"acceptanceCriteria":["Batch 50 pending where pass_kind=entities","NER Haiku → entities + signal_entities","Dedup canonical_name","Update queue status","pg_cron 30min","Tests"]},
    {"id":"S-10C.3","wave":"10.C","title":"Edge fn compute-reputation hebdo","passes":False,"agentModel":"sonnet","priority":3,"effort":"L","dependencies":["S-10C.1","S-10A.5"],"filesCreate":["supabase/functions/compute-reputation/index.ts","supabase/functions/compute-reputation/index.test.ts","supabase/migrations/20260504000022_reputation_cron.sql"],"filesModify":[],"acceptanceCriteria":["Recalcul auteur reputation 90j","Update entity.metadata.reputation_score","pg_cron daily 3am UTC","Tests"]},
    {"id":"S-10C.4","wave":"10.C","title":"Edge fn cluster-signals (embeddings cross-source)","passes":False,"agentModel":"sonnet","priority":4,"effort":"L","dependencies":["S-10C.1"],"filesCreate":["supabase/functions/cluster-signals/index.ts","supabase/functions/cluster-signals/index.test.ts","supabase/migrations/20260504000023_signal_clusters.sql"],"filesModify":[],"acceptanceCriteria":["pg_vector + signal_embeddings","Embeddings text-embedding-3-small","Cosine > 0.80 fenetre 48h cross-source","signal_clusters","pg_cron hourly"]},
    {"id":"S-10C.5","wave":"10.C","title":"Compute weight composite signal","passes":False,"agentModel":"sonnet","priority":5,"effort":"M","dependencies":["S-10A.4","S-10C.3"],"filesCreate":["supabase/migrations/20260504000024_compute_weight.sql"],"filesModify":[],"acceptanceCriteria":["Function compute_signal_weight()","weight = importance*0.4 + frequency*0.2 + utility*0.3 + reputation*0.1","Trigger update on enrichment","Tests SQL"]},
    {"id":"S-10C.6","wave":"10.C","title":"Page /admin/queue monitoring","passes":False,"agentModel":"sonnet","priority":6,"effort":"M","dependencies":["S-10C.1"],"filesCreate":["src/pages/AdminQueue.tsx","src/pages/AdminQueue.test.tsx"],"filesModify":["src/App.tsx"],"acceptanceCriteria":["Route /admin/queue gated app_admin","Tableau status counts par pass_kind","Failed jobs avec last_error","Retry individuel + bulk"]},
    {"id":"S-10C.7","wave":"10.C","title":"Edge fn process-pending-enrichments orchestrateur","passes":False,"agentModel":"sonnet","priority":7,"effort":"M","dependencies":["S-10C.2","S-10C.3","S-10C.4"],"filesCreate":["supabase/functions/process-pending-enrichments/index.ts","supabase/functions/process-pending-enrichments/index.test.ts","supabase/migrations/20260504000025_process_pending_cron.sql"],"filesModify":[],"acceptanceCriteria":["Consume queue retries max 5 backoff","Dispatch sub-workers selon pass_kind","pg_cron 30min"]},

    # ===== Phase D — Neo4j shadow mode =====
    {"id":"S-10D.1","wave":"10.D","title":"Provisioning Neo4j Community sur Coolify","passes":False,"agentModel":"sonnet","priority":1,"effort":"M","dependencies":[],"filesCreate":["docs/ops/neo4j-setup.md"],"filesModify":[],"acceptanceCriteria":["Image neo4j:5-community","Volume persistent /data /logs","Ports 7474 + 7687","Backup S3 cron","Doc complete"]},
    {"id":"S-10D.2","wave":"10.D","title":"Edge fn neo4j-init (constraints + indexes)","passes":False,"agentModel":"sonnet","priority":2,"effort":"S","dependencies":["S-10D.1"],"filesCreate":["supabase/functions/neo4j-init/index.ts"],"filesModify":[],"acceptanceCriteria":["Constraints unique sur Signal, Topic, Entity, Persona, Author","Indexes proprietes frequentes","Idempotent","Auth admin"]},
    {"id":"S-10D.3","wave":"10.D","title":"Edge fn push-to-neo4j worker async","passes":False,"agentModel":"sonnet","priority":3,"effort":"L","dependencies":["S-10D.2","S-10C.1"],"filesCreate":["supabase/functions/push-to-neo4j/index.ts","supabase/functions/push-to-neo4j/index.test.ts"],"filesModify":[],"acceptanceCriteria":["Driver neo4j-driver-deno","MERGE signal/relationships","Mark failed retry si Neo4j down","Logs metrics nodes/relationships"]},
    {"id":"S-10D.4","wave":"10.D","title":"Backfill historique 90j vers Neo4j","passes":False,"agentModel":"sonnet","priority":4,"effort":"M","dependencies":["S-10D.3"],"filesCreate":["supabase/functions/backfill-neo4j/index.ts","supabase/functions/backfill-neo4j/index.test.ts"],"filesModify":[],"acceptanceCriteria":["One-shot admin trigger","Batch 100 signaux progress","Idempotent MERGE","Time estimate"]},
    {"id":"S-10D.5","wave":"10.D","title":"Health check Neo4j + dashboard","passes":False,"agentModel":"sonnet","priority":5,"effort":"S","dependencies":["S-10D.1"],"filesCreate":["supabase/functions/neo4j-health/index.ts"],"filesModify":["src/pages/AdminCockpit.tsx"],"acceptanceCriteria":["alive, latency, node_count, relationship_count","Display dans /admin","Alert orange/rouge"]},
    {"id":"S-10D.6","wave":"10.D","title":"Backup S3 quotidien Neo4j","passes":False,"agentModel":"sonnet","priority":6,"effort":"M","dependencies":["S-10D.1"],"filesCreate":["scripts/neo4j-backup.sh"],"filesModify":["docs/ops/neo4j-setup.md"],"acceptanceCriteria":["neo4j-admin database dump","Upload S3","Retention 30 derniers","Cron Coolify daily 4am UTC"]},

    # ===== Phase E — Neo4j active + commandes =====
    {"id":"S-10E.1","wave":"10.E","title":"Helper neo4jQuery() avec fallback Postgres","passes":False,"agentModel":"sonnet","priority":1,"effort":"M","dependencies":["S-10D.3"],"filesCreate":["supabase/functions/_shared/neo4j.ts","supabase/functions/_shared/neo4j.test.ts"],"filesModify":[],"acceptanceCriteria":["queryWithFallback(cypher, params, fallbackFn, options)","Timeout 500ms default","Logs metrics fallback"]},
    {"id":"S-10E.2","wave":"10.E","title":"Edge fn brief-by-persona (/brief @key)","passes":False,"agentModel":"sonnet","priority":2,"effort":"L","dependencies":["S-10E.1","S-10A.3"],"filesCreate":["supabase/functions/brief-by-persona/index.ts","supabase/functions/brief-by-persona/index.test.ts"],"filesModify":[],"acceptanceCriteria":["Body persona_key, window, score, custom_angle","Cypher signaux RELEVANT_TO persona","Fallback Postgres","persona.context_md dans prompt","Persists comme digest"]},
    {"id":"S-10E.3","wave":"10.E","title":"Edge fn presentation-for-persona (slidev)","passes":False,"agentModel":"sonnet","priority":3,"effort":"L","dependencies":["S-10E.2"],"filesCreate":["supabase/functions/presentation-for-persona/index.ts","supabase/functions/presentation-for-persona/index.test.ts"],"filesModify":[],"acceptanceCriteria":["10 slides Slidev format","Cover + TLDR + insights + next steps + sources","Sources cliquables","Telechargeable .md ou PDF"]},
    {"id":"S-10E.4","wave":"10.E","title":"Edge fn weekly-recap auto-push","passes":False,"agentModel":"sonnet","priority":4,"effort":"L","dependencies":["S-10E.2"],"filesCreate":["supabase/functions/weekly-recap/index.ts","supabase/functions/weekly-recap/index.test.ts","supabase/migrations/20260504000040_weekly_recap_cron.sql"],"filesModify":[],"acceptanceCriteria":["pg_cron lundi 9am UTC","Recap par persona si activite >=3 signaux 7j","Push Slack webhook si configure","Push email Resend si configure"]},
    {"id":"S-10E.5","wave":"10.E","title":"/explorer graph visualizer","passes":False,"agentModel":"sonnet","priority":5,"effort":"L","dependencies":["S-10D.3","S-10B.3"],"filesCreate":["src/components/features/GraphVisualizer.tsx"],"filesModify":["src/pages/Explorer.tsx"],"acceptanceCriteria":["Mode graph","Selection point entree","Render nodes + relationships (cytoscape)","Click drill panel","Filtres depth + edge type"]},
    {"id":"S-10E.6","wave":"10.E","title":"Annotations + commentaires team","passes":False,"agentModel":"sonnet","priority":6,"effort":"L","dependencies":[],"filesCreate":["supabase/migrations/20260504000050_annotations.sql","src/components/features/AnnotationsPanel.tsx","src/hooks/useAnnotations.ts","src/components/features/AnnotationsPanel.test.tsx"],"filesModify":[],"acceptanceCriteria":["annotations(id, target_kind, target_id, user_id, org_id, body_md)","Panel lateral","Thread + @mentions","Notifications","Tests"]},
    {"id":"S-10E.7","wave":"10.E","title":"API GraphQL minimale (pg_graphql)","passes":False,"agentModel":"sonnet","priority":7,"effort":"M","dependencies":["S-10A.4"],"filesCreate":["docs/api/graphql.md"],"filesModify":[],"acceptanceCriteria":["pg_graphql Supabase active","Schema signals/topics/personas/entities/links","Auth JWT","Rate limiting tenant","Doc usage"]},
    {"id":"S-10E.8","wave":"10.E","title":"Lien public partageable + landing","passes":False,"agentModel":"sonnet","priority":8,"effort":"L","dependencies":["S-10E.2"],"filesCreate":["supabase/migrations/20260504000060_public_shares.sql","supabase/functions/create-public-share/index.ts","src/pages/PublicShare.tsx"],"filesModify":["src/App.tsx"],"acceptanceCriteria":["Slug court 8 chars + auth-bypass token","Route publique /share/:slug","Branding org + brief + footer Kairos","Expire 30j","Track views + clicks"]},
]

data['stories'].extend(wave_10)

data['wave_10_planned'] = {
    "title": "Second Cerveau IA — Pivot conceptuel : Kairos = brique enrichissement, briefs = 1 vue parmi d autres",
    "source_doc": "docs/strategy/2026-05-02-moats-and-value-capture.md",
    "human_readable_prd": "docs/handoffs/2026-05-03-wave-10-second-cerveau-prd.md",
    "stories_count": len(wave_10),
    "estimate_weeks": "5-7 semaines-agent",
    "phases": [
        {"id": "10.A", "name": "Foundation Postgres + Taxonomie PARA", "branch": "feat/wave-10A-foundation", "stories": [s["id"] for s in wave_10 if s["wave"]=="10.A"]},
        {"id": "10.B", "name": "Vues filtrables + /digest contextualisé", "branch": "feat/wave-10B-views", "stories": [s["id"] for s in wave_10 if s["wave"]=="10.B"], "depends_on": "10.A"},
        {"id": "10.C", "name": "Async enrichment + queue résiliente", "branch": "feat/wave-10C-async", "stories": [s["id"] for s in wave_10 if s["wave"]=="10.C"], "depends_on": "10.A"},
        {"id": "10.D", "name": "Neo4j shadow mode (self-host Coolify)", "branch": "feat/wave-10D-neo4j-shadow", "stories": [s["id"] for s in wave_10 if s["wave"]=="10.D"], "depends_on": "10.C"},
        {"id": "10.E", "name": "Neo4j active + commandes /slash", "branch": "feat/wave-10E-neo4j-active", "stories": [s["id"] for s in wave_10 if s["wave"]=="10.E"], "depends_on": "10.D"},
    ],
    "loop_config": {
        "max_iterations": 25,
        "circuit_breaker_threshold": 3,
        "default_agent_model": "sonnet-4-6",
        "fallback_agent_model": "haiku-4-5",
        "forbidden_models": ["opus-4-7", "opus-4-6"],
        "worktree_strategy": "per-phase",
        "worktree_base": "/c/temp/kairos-w10",
        "base_branch": "main",
        "merge_strategy": "fast-forward-via-no-ff",
        "auto_deploy_after_merge": True,
        "deploy_target": "coolify"
    },
    "quality_gates": {
        "typecheck": "bun x tsc -b --noEmit",
        "lint": "bun x eslint . --max-warnings 0",
        "tests": "bun x vitest run"
    },
    "anti_fragility": {
        "postgres_source_of_truth": True,
        "neo4j_is_derived_view": True,
        "fallback_postgres_on_neo4j_timeout_ms": 500,
        "feature_flags_for_rollback": ["enable_enriched_views", "use_neo4j_for_queries"],
        "backup_neo4j_daily_to_s3": True
    },
    "exit_conditions": {
        "all_stories_pass": True,
        "typecheck_zero_errors": True,
        "lint_zero_warnings": True,
        "vitest_all_pass": True,
        "promised_signal": "<promise>COMPLETE</promise>"
    },
    "ralph_loop_ready": True,
    "ready_to_dispatch": "Attendre GO explicite utilisateur apres relecture PRD"
}

prd_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
total = len(data['stories'])
frozen_count = sum(1 for s in data['stories'] if s.get('frozen'))
print(f"OK total stories: {total}")
print(f"  Wave 9.3-9.5 frozen: {frozen_count}")
print(f"  Wave 10 added: {len(wave_10)}")
