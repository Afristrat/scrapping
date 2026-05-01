== PASSATION zlatan-scrap 2026-05-01T17:00Z ==

[ETAT]
branch=feat/topic-tracking-minio (~50 commits, ahead origin 0) | live=https://scrap.ai-mpower.com ✓ HTTP 200 | bundle splitté (5 chunks max ~350KB) | typecheck ✓ | build ✓ | lint 1 warning préexistant Settings.tsx:65 (react-hook-form watch) | tests 14/33 pass + 19 préexistants cassés (jest-dom matchers infra) — non bloquant
backend=Supabase project crplceoptyeslqyfcqvj ~ 17 migrations appliquées | 9 edge functions déployées (run-pipeline, scraper-x/reddit/arxiv, llm-score, llm-score-batch, topic-classifier, dispatch-llm, refresh-models, digest, run-admin-prompt, purge)
infra=Coolify app jhg5pwiyul9r992k8qg2lkx6 | tunnel CF nahda-tunnel (id 7156c3f9-...) → ingress scrap.ai-mpower.com → localhost:80 | MinIO bucket zlatan-scrap-topics sur cloud-station.io

[ENCOURS]
RAS — toutes stories session sont passes=true | wave restante facultative : Wave 4 PRD admin (S-AdminTests + S-AdminCompose) à dispatcher si besoin

[FAIT]
✓ git init + push GitHub Afristrat/scrapping (2 branches)
✓ Feature topic-tracking-minio complète (4 tables + RLS + Welford z-score + MinIO 90j rolling + queue eventual consistency + UI widget Dashboard + page /topics) — 20 stories
✓ BYOK multi-provider (10 providers : OpenRouter, Moonshot, Anthropic, OpenAI, Google, Mistral, Groq, Together, DeepSeek, Ollama) en 4 phases : auth → schema → UI providers → cascade modèles par tâche → refresh-models edge fn → auto-refresh à la save
✓ Auth multi-méthode : magic link + password + Google OAuth + page /signup
✓ Setup Supabase live (migrations + types regen) | Setup Coolify deploy via Dockerfile multi-stage + nginx SPA + 3 commits fix (tsconfig exclude tests, vite chunkSizeWarningLimit, react-is dep manquante)
✓ Setup Cloudflare Tunnel via config.yml nahda + DNS CNAME automatique via cloudflared CLI sur serveur user
✓ Refactor Wave 1 (Ralph mode + 6 agents parallèles) : dispatch-llm fn unique (kills duplication 3 LLM clients) | llm_providers DB table (single source of truth, drop dup TS) | lint fixes ModelSelectField+Costs | husky skip sans .git | Vite manualChunks (1.2MB→5 chunks max 350KB) | GitHub Actions CI workflow
✓ Refactor Wave 2 : digest impl complète (table + edge fn + UI markdown) | drop legacy model_* columns | dead code purge (no-op, S-A avait nettoyé)
✓ Feature Admin prompts éditables (PRD US-001 à US-004) : table admin_prompts + admin_prompt_runs + RLS + trigger seed auto + 4 prompts seed (Reddit/arXiv/X/Synthesis) + edge fn run-admin-prompt avec template engine ({{signals}}, {{signals_block}}, {{language}}, {{date}}, {{topics_emerging}}, {{rubric}}, {{run:<task_kind>}}) + onglet Settings → Admin avec list/edit/run/history + hooks useAdminPrompts*
✓ Wave parallèle fixes : digest configurable (slider min_score + select fenêtre + erreur actionnable) | /topics redesigné en 4 sections trend (Émergents/En déclin/Stables/Calibrage) + help dialog + actions suggérées + tooltips z-score | pricing dynamique via provider_models + tableau "Tarifs par modèle" dans /costs (fallback usage.cost → DB pricing → 0) | admin prompts amélioré : History button visible avec compteur + Live Preview vars dans Edit modal + Cost Guard avant Run + BudgetGuardDialog
✓ Bug fixes critiques : settings_not_found (backfill missing rows + dispatch-llm défensif maybeSingle) | cascade modèles inactive (read form watch au lieu de settings DB) | terme "Moat" purgé partout (task_kind enum + badges + seeds + descriptions + variables {{run:reddit}})

[ALERTE]
!! CREDENTIALS LEAKED IN CHAT — à rotater impérativement : DB password Supabase wt2giXPxCYEMVhit | anon key Supabase | Coolify token mZV3t49u058ar3Gaq8POCHzjZ2LU7x3lJlRIPCXW5700c32d | MinIO root user fadbf15390f9465e + password bff19156b48a422583215a2a7f03e056
! 19 tests vitest cassés préexistants (jest-dom matchers `toBeInTheDocument`/`toHaveTextContent` non chargés) — incompatibilité vitest@4.1.5 ↔ @testing-library/jest-dom@6.9.1 — story dédiée nécessaire pour upgrade
! Anthropic/OpenAI/Groq/Together/DeepSeek : pricing pas exposé dans /models endpoint → cost tracking dépend de usage.cost retourné par l'API (OpenRouter only le retourne actuellement)
! Provider tunnel scrap-frontend créé inutilement dans Cloudflare au début de session — à supprimer dans dashboard CF Networks → Connectors

[BLOQUE]
RAS

[NEXT]
Priorité 1 : rotater les credentials leakés ci-dessus (action user)
Priorité 2 : si Wave 4 PRD admin souhaitée → dispatch S-AdminTests (tests Vitest+Deno template engine) + S-AdminCompose ({{run:reddit}} chain pour vraie synthèse)
Priorité 3 : fix infra tests vitest (upgrade jest-dom ou downgrade vitest) — débloque 19 tests
Priorité 4 : configurer Coolify webhook GitHub auto-deploy (élimine deploy manuel via API)
Priorité 5 : pg_cron daily refresh-models pour auto-actualiser les listes de modèles providers

[CTX]
session ~10h | nb commits ~50 | nb agents Ralph dispatchés ~15 | $ inconnu (bun/sonnet) | ~10 deploys Coolify | ~25 deploys edge functions Supabase | conversation très longue

[MEMO]
- Project ref Supabase live = crplceoptyeslqyfcqvj (créé fresh cette session, pas l'ancien rratnmtiescwdvtnjbeq)
- Pattern BYOK : settings.model_config[task] (jsonb) → fallback DEFAULT_PROVIDER='openrouter' + DEFAULT_MODEL='openrouter/auto' dans dispatch-llm
- 4 tasks supportées : scoring | scraping | monitoring | digest
- 5 task_kind admin : reddit | arxiv | x | synthesis | custom
- Trigger seed_admin_prompts_on_user_creation se déclenche AFTER INSERT auth.users → seed les 4 prompts auto
- MinIO endpoint = MINIO_SERVER_URL (cst-minio-a255a4be-16637b8b...) — PAS le BROWSER_REDIRECT_URL
- cloudflared tunnel config = /home/serveurai/.cloudflared/config-nahda.yml (PID variable, kill -HUP pour reload)
- Coolify build = Dockerfile multi-stage (node:20-alpine build → nginx:alpine serve dist + nginx.conf SPA fallback)
- npm install --legacy-peer-deps requis (React 19 peer deps strict) — .npmrc le force
- Husky prepare = "husky || true" (skip si .git absent dans container)
- Vite v8 + rolldown : manualChunks DOIT être une fonction (Rollup-style objet refusé)
- Test infra : vitest exclude supabase/functions/** (Deno tests via `deno test --node-modules-dir=auto`)
- Repo GitHub : Afristrat/scrapping (privé/public ?), branche prod future = main, dev courant = feat/topic-tracking-minio
- Domain : ai-mpower.com via Cloudflare, app sur scrap.ai-mpower.com
