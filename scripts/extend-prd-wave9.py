#!/usr/bin/env python3
"""Étend .ralph/prd.json avec Wave 9 (26 stories) + Sprint 0 (6 stories distribution)."""
import json
import sys
from pathlib import Path

prd_path = Path('.ralph/prd.json')
data = json.loads(prd_path.read_text(encoding='utf-8'))

sprint_0 = [
    {"id":"S-S0.1","wave":"sprint-0","title":"Bouton Copier markdown","passes":False,"agentModel":"haiku","priority":1,"dependencies":[],"effort":"XS","filesCreate":[],"filesModify":["src/pages/Digest.tsx","src/pages/Digest.test.tsx"],"acceptanceCriteria":["Bouton Copier markdown dans footer","navigator.clipboard.writeText","Toast confirmation","Fallback execCommand","Tests RTL"]},
    {"id":"S-S0.2","wave":"sprint-0","title":"Bouton Email mailto","passes":False,"agentModel":"haiku","priority":2,"dependencies":[],"effort":"S","filesCreate":[],"filesModify":["src/pages/Digest.tsx","src/pages/Digest.test.tsx"],"acceptanceCriteria":["Bouton Email","mailto: avec subject + body url-encoded","Body tronqué 1500 chars + lien si overflow","Tests encoding chars spéciaux"]},
    {"id":"S-S0.3","wave":"sprint-0","title":"Boutons Tweet + LinkedIn","passes":False,"agentModel":"sonnet","priority":3,"dependencies":[],"effort":"S","filesCreate":[],"filesModify":["src/pages/Digest.tsx","src/pages/Digest.test.tsx"],"acceptanceCriteria":["Tweet : twitter.com/intent/tweet?text=&url=","LinkedIn : linkedin.com/sharing/share-offsite/?url=","Headline = h1 markdown ou date fallback","ShareUrl /digest?id= avec auto-load via searchParams","Tests"]},
    {"id":"S-S0.4","wave":"sprint-0","title":"Bouton Télécharger .md","passes":False,"agentModel":"haiku","priority":4,"dependencies":[],"effort":"XS","filesCreate":["src/lib/download-utils.ts"],"filesModify":["src/pages/Digest.tsx","src/pages/Digest.test.tsx"],"acceptanceCriteria":["Bouton Download","Blob + ancre + click prog","Filename kairos-brief-YYYY-MM-DD-HH-mm.md","Helper réutilisable","Tests"]},
    {"id":"S-S0.5","wave":"sprint-0","title":"Cleanup footer Digest actions groupées","passes":False,"agentModel":"sonnet","priority":5,"dependencies":["S-S0.1","S-S0.2","S-S0.3","S-S0.4"],"effort":"S","filesCreate":[],"filesModify":["src/pages/Digest.tsx","src/pages/Digest.test.tsx"],"acceptanceCriteria":["Footer 2 zones : Actions (gauche, 6 boutons) + Métadonnées (droite)","Boutons compacts icônes lucide","Responsive wrap mobile","Hover/active Material You","Tests RTL 6 boutons + responsive"]},
    {"id":"S-S0.6","wave":"sprint-0","title":"Bouton Exporter PDF basique (window.print)","passes":False,"agentModel":"sonnet","priority":6,"dependencies":["S-S0.5"],"effort":"S","filesCreate":["src/styles/print.css"],"filesModify":["src/pages/Digest.tsx","src/index.css"],"acceptanceCriteria":["Bouton Exporter PDF","window.print() + @media print CSS","Cache sidebar/header/autres briefs","En-tête simple Kairos · date · N signaux","A4 margins raisonnables","Note Wave 11 = branded edge fn","Tests CSS print rules"]},
]

wave_9 = [
    # Wave 9.1 — Multi-LLM consensus
    {"id":"S-9.1.1","wave":"9.1","title":"DB schema score_runs + RLS","passes":False,"agentModel":"sonnet","priority":1,"dependencies":[],"filesCreate":["supabase/migrations/20260503000001_score_runs.sql"],"filesModify":["src/types/database.ts"],"acceptanceCriteria":["Table score_runs PK uuid + FK signal_id/org_id/user_id","Indexes (signal_id, org_id)","RLS org-scoped","scores étendu : score_consensus, score_variance, models_used","Backfill 1 row par scores existant","Types regen"]},
    {"id":"S-9.1.2","wave":"9.1","title":"Settings UI consensus_models picker","passes":False,"agentModel":"sonnet","priority":2,"dependencies":["S-9.1.1"],"filesCreate":["supabase/migrations/20260503000002_settings_consensus_models.sql","src/hooks/useUpdateConsensusModels.ts","src/pages/Settings.test.tsx"],"filesModify":["src/pages/Settings.tsx"],"acceptanceCriteria":["settings.consensus_models text[] default ARRAY[]","Multi-select 2-3 modèles","Validation len 2-3 distincts","Mention Coût × N","Hook mutation"]},
    {"id":"S-9.1.3","wave":"9.1","title":"Edge fn llm-score-batch extension N modèles","passes":False,"agentModel":"sonnet","priority":3,"dependencies":["S-9.1.1","S-9.1.2"],"filesCreate":["supabase/functions/llm-score-batch/index.test.ts"],"filesModify":["supabase/functions/llm-score-batch/index.ts"],"acceptanceCriteria":["N appels Promise.all à dispatch-llm","Insert N rows score_runs","Calcul moyenne+variance update scores","Best-effort 1 fail = continue","Logs verbeux","Tests Deno"]},
    {"id":"S-9.1.4","wave":"9.1","title":"Hook useScoreConsensus + types","passes":False,"agentModel":"haiku","priority":4,"dependencies":["S-9.1.1"],"filesCreate":["src/hooks/useScoreConsensus.ts","src/types/scoring.ts","src/hooks/useScoreConsensus.test.ts"],"filesModify":[],"acceptanceCriteria":["Retourne consensus, variance, models, agreement high|medium|low","variance <10 high, 10-25 medium, >25 low","React Query staleTime 5min","Tests 3 cas"]},
    {"id":"S-9.1.5","wave":"9.1","title":"Dashboard ConsensusBadge","passes":False,"agentModel":"sonnet","priority":5,"dependencies":["S-9.1.4"],"filesCreate":["src/components/features/ConsensusBadge.tsx"],"filesModify":["src/components/features/SignalTable.tsx","src/components/features/SignalTable.test.tsx"],"acceptanceCriteria":["Badge vert/jaune/rouge selon agreement","Tooltip models + scores + variance","Hidden si null no breaking","Tests RTL 4 cas","Smoke browser"]},

    # Wave 9.2 — Backtest
    {"id":"S-9.2.1","wave":"9.2","title":"Edge fn backtest-rubric dry-run","passes":False,"agentModel":"sonnet","priority":1,"dependencies":[],"filesCreate":["supabase/functions/backtest-rubric/index.ts","supabase/functions/backtest-rubric/index.test.ts"],"filesModify":[],"acceptanceCriteria":["POST avec rubric_id, prompt, criteria, max_signals","Cap 100 signaux","Cap 1 simultané pg_advisory_lock","Lit signaux 30j org","Pas de persist","Retourne array delta","Logs","Tests"]},
    {"id":"S-9.2.2","wave":"9.2","title":"Hooks useBacktestRubric + cost","passes":False,"agentModel":"haiku","priority":2,"dependencies":["S-9.2.1"],"filesCreate":["src/hooks/useBacktestRubric.ts","src/hooks/useBacktestCostEstimate.ts","src/hooks/useBacktestRubric.test.ts"],"filesModify":[],"acceptanceCriteria":["Mutation POST","Cost estimate via provider_models pricing","Cost displayed pré-run","Confirm dialog si > 5€","Tests"]},
    {"id":"S-9.2.3","wave":"9.2","title":"Page /settings/rubrics/backtest","passes":False,"agentModel":"sonnet","priority":3,"dependencies":["S-9.2.2"],"filesCreate":["src/pages/RubricBacktest.tsx","src/pages/RubricBacktest.test.tsx"],"filesModify":["src/App.tsx"],"acceptanceCriteria":["Route /settings/rubrics/backtest","Form prompt + critères JSON","Bouton avec cost","Loader + stream signaux","Bouton Adopter upsert"]},
    {"id":"S-9.2.4","wave":"9.2","title":"Composant BacktestComparator","passes":False,"agentModel":"sonnet","priority":4,"dependencies":["S-9.2.3"],"filesCreate":["src/components/features/BacktestComparator.tsx","src/components/features/BacktestComparator.test.tsx"],"filesModify":[],"acceptanceCriteria":["Tableau 2 cols current/backtested trié |delta|","Histogramme Recharts","Top 20 promus + rétrogradés","KPIs"]},
    {"id":"S-9.2.5","wave":"9.2","title":"Cap simultané + queueing UI","passes":False,"agentModel":"haiku","priority":5,"dependencies":["S-9.2.1","S-9.2.2"],"filesCreate":[],"filesModify":["src/hooks/useBacktestRubric.ts"],"acceptanceCriteria":["2e backtest = toast warning + bouton désactivé","Status En cours ETA","Annuler via cancel mutation","Lock release garanti"]},

    # Wave 9.3 — Negative propagation
    {"id":"S-9.3.1","wave":"9.3","title":"DB schema signal_flags + signal_relations","passes":False,"agentModel":"sonnet","priority":1,"dependencies":[],"filesCreate":["supabase/migrations/20260503000003_signal_flags_relations.sql"],"filesModify":["src/types/database.ts"],"acceptanceCriteria":["signal_flags + signal_relations","UNIQUE (parent, child)","Indexes","RLS org-scoped","Types regen"]},
    {"id":"S-9.3.2","wave":"9.3","title":"Edge fn flag-signal","passes":False,"agentModel":"haiku","priority":2,"dependencies":["S-9.3.1"],"filesCreate":["supabase/functions/flag-signal/index.ts","supabase/functions/flag-signal/index.test.ts"],"filesModify":[],"acceptanceCriteria":["POST signal_id, reason","Insert + audit_log signal.flag","Réponse ok flag_id","Tests Deno"]},
    {"id":"S-9.3.3","wave":"9.3","title":"Edge fn compute-embeddings + pg_vector","passes":False,"agentModel":"sonnet","priority":3,"dependencies":["S-9.3.1"],"filesCreate":["supabase/migrations/20260503000004_signal_embeddings.sql","supabase/functions/compute-embeddings/index.ts","supabase/functions/compute-embeddings/index.test.ts"],"filesModify":[],"acceptanceCriteria":["CREATE EXTENSION vector","signal_embeddings vector(1536)","OpenAI text-embedding-3-small","Idempotent","Cost tracking llm_costs embeddings","Fallback Voyage","IVFFlat index"]},
    {"id":"S-9.3.4","wave":"9.3","title":"Edge fn propagate-flags + pg_cron","passes":False,"agentModel":"sonnet","priority":4,"dependencies":["S-9.3.1","S-9.3.3"],"filesCreate":["supabase/functions/propagate-flags/index.ts","supabase/migrations/20260503000005_propagate_flags_cron.sql"],"filesModify":[],"acceptanceCriteria":["Trouve signal_flags ts < 14j","Signaux fenêtre 14j URL identique OU cosine > 0.85","Insert signal_relations","pg_cron daily 4am","Logs"]},
    {"id":"S-9.3.5","wave":"9.3","title":"Frontend bouton thumbs-down + FlagDialog","passes":False,"agentModel":"sonnet","priority":5,"dependencies":["S-9.3.2"],"filesCreate":["src/components/features/FlagDialog.tsx","src/hooks/useFlagSignal.ts","src/hooks/useFlagSignal.test.ts"],"filesModify":["src/components/features/SignalTable.tsx"],"acceptanceCriteria":["Bouton 👎","Dialog 4 raisons + textarea","Mutation","Toast confirm","Tests"]},
    {"id":"S-9.3.6","wave":"9.3","title":"Dashboard badge contested + score minoré","passes":False,"agentModel":"sonnet","priority":6,"dependencies":["S-9.3.4","S-9.3.5"],"filesCreate":["src/hooks/useContestedSignals.ts","src/hooks/useContestedSignals.test.ts","supabase/migrations/20260503000007_contested_penalty_setting.sql"],"filesModify":["src/components/features/SignalTable.tsx"],"acceptanceCriteria":["Hook signal_id set flagged direct OU relation","Badge orange contesté","Score - settings.contested_penalty default 30 + strikethrough","Setting","Filter Masquer contestés","Tests"]},

    # Wave 9.4 — Cross-source corroboration
    {"id":"S-9.4.1","wave":"9.4","title":"DB schema signal_clusters","passes":False,"agentModel":"sonnet","priority":1,"dependencies":["S-9.3.1"],"filesCreate":["supabase/migrations/20260503000006_signal_clusters.sql"],"filesModify":["src/types/database.ts"],"acceptanceCriteria":["signal_clusters + signal_cluster_members","PK composite","Indexes","RLS org-scoped","Types regen"]},
    {"id":"S-9.4.2","wave":"9.4","title":"Edge fn compute-corroboration","passes":False,"agentModel":"sonnet","priority":2,"dependencies":["S-9.4.1","S-9.3.3"],"filesCreate":["supabase/functions/compute-corroboration/index.ts","supabase/functions/compute-corroboration/index.test.ts"],"filesModify":["supabase/functions/llm-score-batch/index.ts"],"acceptanceCriteria":["Signal score>=70 sans cluster fenêtre 24-48h","Embedding cosine > 0.80 ET source différente","Crée ou ajoute cluster","Triggered par scoring batch","Logs","Tests"]},
    {"id":"S-9.4.3","wave":"9.4","title":"RPC find_corroborated_cluster","passes":False,"agentModel":"haiku","priority":3,"dependencies":["S-9.4.1"],"filesCreate":["supabase/migrations/20260503000008_rpc_find_corroborated.sql"],"filesModify":[],"acceptanceCriteria":["RPC retourne cluster_id, member_count, sources[]","SECURITY INVOKER","Tests SQL"]},
    {"id":"S-9.4.4","wave":"9.4","title":"Hook useSignalCorroboration + score boost","passes":False,"agentModel":"haiku","priority":4,"dependencies":["S-9.4.3"],"filesCreate":["src/hooks/useSignalCorroboration.ts","src/hooks/useSignalCorroboration.test.ts"],"filesModify":[],"acceptanceCriteria":["Retourne corroborated, sourceCount, sources, scoreBoost","scoreBoost = 10 si sourceCount >=3","React Query staleTime 5min","Tests"]},
    {"id":"S-9.4.5","wave":"9.4","title":"Dashboard CorroborationBadge","passes":False,"agentModel":"sonnet","priority":5,"dependencies":["S-9.4.4"],"filesCreate":["src/components/features/CorroborationBadge.tsx","src/components/features/CorroborationBadge.test.tsx"],"filesModify":["src/components/features/SignalTable.tsx"],"acceptanceCriteria":["Badge vert ✓ 3 sources","Badge gris 1 source unique","Tooltip cluster autres signaux","Smoke browser"]},

    # Wave 9.5 — Author Reputation
    {"id":"S-9.5.1","wave":"9.5","title":"DB schema authors","passes":False,"agentModel":"sonnet","priority":1,"dependencies":[],"filesCreate":["supabase/migrations/20260503000009_authors.sql"],"filesModify":["src/types/database.ts"],"acceptanceCriteria":["authors handle, source CHECK x|reddit|arxiv, org_id, reputation_score, sample_size","UNIQUE (handle, source, org_id)","RLS org-scoped","signals.author_id FK","Backfill author depuis raw_payload","Types regen"]},
    {"id":"S-9.5.2","wave":"9.5","title":"Edge fn recompute-author-reputation + pg_cron","passes":False,"agentModel":"sonnet","priority":2,"dependencies":["S-9.5.1","S-9.3.4","S-9.4.2"],"filesCreate":["supabase/functions/recompute-author-reputation/index.ts","supabase/migrations/20260503000011_author_reputation_cron.sql","supabase/functions/recompute-author-reputation/index.test.ts"],"filesModify":[],"acceptanceCriteria":["authors sample_size >=5 dans 90j","n_top + 0.5*n_corroborated - 0.7*n_flagged / n_total clampé [0,1]","Update authors","pg_cron daily 3am UTC","Logs"]},
    {"id":"S-9.5.3","wave":"9.5","title":"Backfill initial 90j authors","passes":False,"agentModel":"sonnet","priority":3,"dependencies":["S-9.5.1","S-9.5.2"],"filesCreate":["supabase/migrations/20260503000010_authors_backfill.sql"],"filesModify":[],"acceptanceCriteria":["Extract authors raw_payload rétroactif","Insert idempotent UNIQUE","Update signals.author_id JOIN","Lance recompute 1×","Re-runable"]},
    {"id":"S-9.5.4","wave":"9.5","title":"Score formula integration reputation","passes":False,"agentModel":"sonnet","priority":4,"dependencies":["S-9.5.1","S-9.5.2"],"filesCreate":[],"filesModify":["supabase/functions/llm-score-batch/index.ts","supabase/functions/llm-score-batch/index.test.ts"],"acceptanceCriteria":["Lookup author_id reputation","Si exist : score × √(0.5 + 0.5×reputation)","Si pas reputation : no-op","Logs score_raw, factor, final dans score_runs","Tests Deno 3 cas"]},
    {"id":"S-9.5.5","wave":"9.5","title":"Frontend tooltip + filter author reputation","passes":False,"agentModel":"sonnet","priority":5,"dependencies":["S-9.5.1"],"filesCreate":["src/hooks/useAuthorReputation.ts","src/components/features/AuthorTooltip.tsx","src/hooks/useAuthorReputation.test.ts"],"filesModify":["src/components/features/SignalTable.tsx"],"acceptanceCriteria":["Hover handle = tooltip étoile + sample size","Hook","Filter reputation min slider","Trier par reputation","Tests"]},
]

new_stories = sprint_0 + wave_9
data['stories'].extend(new_stories)

data['sprint_0_planned'] = {
    "title": "Distribution table stakes — 6 boutons partage sur footer Digest",
    "stories_count": 6,
    "estimate_hours": 3,
    "rationale": "Réponse immédiate au feedback founder « brief pas exploitable, ni partageable ». Aucune dépendance Wave 9. Peut sortir en parallèle dès le go.",
    "stories": ["S-S0.1","S-S0.2","S-S0.3","S-S0.4","S-S0.5","S-S0.6"]
}

data['wave_9_planned'] = {
    "title": "Layer 1 — Signal qualification : 5 features moat (Multi-LLM consensus, Backtest, Negative propag, Cross-source, Author reputation)",
    "source_doc": "docs/strategy/2026-05-02-moats-and-value-capture.md",
    "human_readable_prd": "docs/handoffs/2026-05-03-wave-9-moats-prd.md",
    "stories_count": 26,
    "estimate_days": "17-25 jours-agent",
    "loop_config": {
        "max_iterations": 25,
        "circuit_breaker_threshold": 3,
        "default_agent_model": "sonnet-4-6",
        "fallback_agent_model": "haiku-4-5",
        "forbidden_models": ["opus-4-7", "opus-4-6"],
        "worktree_strategy": "per-story",
        "worktree_base": "/c/temp/kairos-w9",
        "base_branch": "main",
        "merge_strategy": "fast-forward-only",
        "auto_deploy_after_merge": True,
        "deploy_target": "coolify"
    },
    "quality_gates": {
        "typecheck": "bun x tsc -b --noEmit",
        "lint": "bun x eslint . --max-warnings 0",
        "tests": "bun x vitest run"
    },
    "parallel_groups": [
        ["S-S0.1","S-S0.2","S-S0.3","S-S0.4","S-S0.5","S-S0.6"],
        ["S-9.1.1","S-9.1.2","S-9.1.3","S-9.1.4","S-9.1.5"],
        ["S-9.2.1","S-9.2.2","S-9.2.3","S-9.2.4","S-9.2.5"],
        ["S-9.3.1","S-9.3.2","S-9.3.3","S-9.3.4","S-9.3.5","S-9.3.6"],
        ["S-9.4.1","S-9.4.2","S-9.4.3","S-9.4.4","S-9.4.5"],
        ["S-9.5.1","S-9.5.2","S-9.5.3","S-9.5.4","S-9.5.5"]
    ],
    "exit_conditions": {
        "all_stories_pass": True,
        "typecheck_zero_errors": True,
        "lint_zero_warnings": True,
        "vitest_all_pass": True,
        "promised_signal": "<promise>COMPLETE</promise>"
    },
    "ralph_loop_ready": True,
    "ready_to_dispatch": "Attendre GO explicite utilisateur avant dispatch"
}

prd_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
print(f"OK total stories: {len(data['stories'])}")
print(f"  Sprint 0 added: {len(sprint_0)}")
print(f"  Wave 9 added: {len(wave_9)}")
