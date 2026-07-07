== PASSATION NUCLÉAIRE Kairos/Saqr — 2026-07-07 (session déterminisme L99 + CI ressuscitée) ==

[ETAT]
Branche `ralph/k06-orchestrator`, head `0a7cb48` poussé (PR #11 https://github.com/Afristrat/scrapping/pull/11). Gates locales VERTES : deno test **468/468** · tsc 0 · lint 0 · build OK. **CI GitHub RESSUSCITÉE et verte** (runs success sur 7177567/1cf756f/a34974a — vitest Linux + suite Deno complète). Base .11 (`db.saqr.ma`, stack Coolify `supabase-db-r11yqnmzzgv5qn8138xddwzt`) : migrations `20260511000001` + `20260512000001` APPLIQUÉES et prouvées live. `main` (b51841f) = ligne divergente Bassira NON mergée — décision Amine, ne pas auto-merger (checkout dans le worktree `claudia-zlatan-scrap-main`).

[FAIT] (tout prouvé par commande, 5 commits : 7177567, 1cf756f, a34974a, 9f76152, 0a7cb48 — détail complet dans `.ralph/progress.md`)

1. **CI morte → cause racine + fix** : PR #11 `CONFLICTING` vs main → GitHub ne construit pas la ref de merge → triggers `pull_request` ne partent JAMAIS (83 runs historiques, tous `push` main). Fix : trigger `push` sur `ralph/**` + gate Deno élargie (minio seul → suite complète). Prouvé vert 3 fois.
2. **A#2 Topics par embeddings** : `_shared/embeddings.ts` (fetchEmbeddingsBatch+chunking, cosineSimilarity, rankBySimilarity +6t, resolveEmbeddingKeys). enrich-signal (source='embedding', fallback LLM sans clé) + topic-classifier (LLM réservé aux signaux sans correspondance = nouveaux topics). ⚠ seuil 0.4 = knob NON calibré (ponytail annoté ×2) — à mesurer sur données réelles .11.
3. **A#3 Entités person en code + canonicalisation** : migration `20260512000001` (trigger DB `normalized_name` = autorité unique lower+unaccent+[a-z0-9], fusion doublons, index UNIQUE) — prouvée live (« Öpen AÏ »→openai, « open ai » absorbé). enrich-entities : person = auteur raw_payload en code (extractAuthor factorisé \_shared/signal-text.ts, digest délègue), LLM restreint org/tech/paper/product. Types DB patchés main (normalized_name).
4. **A#4 Pré-filtre mécanique disqualifiers** : les règles réelles sont SÉMANTIQUES → pas de regex-NLP (disqualification à tort = DÉFCON 1) ; champ structuré optionnel `mechanical` (source_in|text_matches|older_than_days vs signal_date transporté). Matche → zéro appel LLM (criteria compris, coût 0) ; inévaluable → reversé au LLM. +8 tests. rubric-architect peut l'émettre.
5. **C#3 signal-synthesizer** : `freshness_median_days` LLM = hallucination pure (aucune date dans son input) → computeTopicProvenance + computeCulturalWarnings + mono_source réel EN CODE (+5 tests), prompt allégé (« NE CALCULE AUCUNE MÉTRIQUE »).
6. Préexistants corrigés (règle n°3) : cluster-signals typait ses helpers `ReturnType<typeof createClient>` (10 erreurs deno check) → `SupabaseClient` (3e occurrence du pattern) ; const morte HAIKU_MODEL purgée ; 2 extractSignalText locaux divergents purgés (enrich-signal, enrich-entities) → canonique \_shared.

[ALERTE]

- Seuil similarité topics **0.4 non calibré** (2 sites, annotés ponytail) — calibrer dès que le pipeline tourne sur .11 avec vraies données.
- Coûts embeddings NON tracés dans llm_costs (hors péage dispatch-llm — précédent cluster-signals assumé, ~50-100× moins cher que le génératif remplacé).
- freshness_median_days désormais null tant que signal_date n'est pas threadé dans research-from-seed→synthesizer (chaîne topSignals sans dates — honnête, plus d'invention).
- Vitest local pathologique (OneDrive) : ne jamais conclure d'un run pleine-suite local — la CI Linux est redevenue LA gate.
- Piège hook pre-commit : timeout 10 min sur `git commit` (tsc du hook lent).
- 7 stacks Supabase sur .11 — ne toucher QUE `r11y`. Anti-leak : clés dans l'env Coolify, jamais affichées.
- `CLAUDE.md` du repo pointe toujours le ref cloud MORT (`crplceoptyeslqyfcqvj`) + repo `meydeey/theresa-scrap` → à repointer (item Runtime).

[BLOQUE]

- Rien. Mandat runtime PLEIN (deploy edge fns, secrets, tests sur .11 en autonomie). Git = commit+push+PR ; merge main = décision Amine.

[NEXT] (ordre L99 — déterminisme et synthesizer FAITS)

1. **Portage P1 Saqr** : `cron-pipeline-trigger` (pipeline 100 % manuel !), `score-pending` (chaîne de batchs auto-ré-invoquée), `slack-digest` (zéro LLM), chaînon RSS Google News (~30 l, rss_keywords jamais exploités). + pépites : backoff 429 arXiv, welford.test.ts. Repo Saqr lecture seule : `C:\projets\Saqr` ; doc portage `docs/bridges/prompt-portage-saqr-vers-kairos.md`. Règles : callLiteLLM→dispatch-llm, bassira-auth→internal-auth.ts, mono-user→org_id.
2. **Runtime** : deploy edge fns sur .11 + `INTERNAL_FN_SECRET` + mapper `public_api_keys.proxy_user_id` + test e2e 2ᵉ saut (llm-score-batch→dispatch-llm interne) + repointer CLAUDE.md + gen types --db-url propre + calibrer le seuil embeddings.
3. Reste audit : P1-007 sièges bornés, P1-008 Error Boundary (flag tâche #11 « completed » à re-vérifier — prd-blindage 008 encore passes=false), P2 (SSRF validate-api-key, run-pipeline lock, record-usage idempotent, workers atomiques, cascade non plafonnée), lockfiles, npm audit.

[CTX]
Accès .11 : `ssh -i ~/.ssh/serveurai_mnemo serveuria@192.168.100.11`. Base : `docker exec supabase-db-r11yqnmzzgv5qn8138xddwzt psql -U postgres`. Migrations serveur : `/home/serveuria/kairos-migrations/` (scp puis `psql -v ON_ERROR_STOP=1 --single-transaction < fichier`). Tests : `deno test --allow-env --node-modules-dir=auto supabase/functions/` (468) ; après deno → `bun install` avant tsc. CI : `gh api "repos/Afristrat/scrapping/actions/runs?branch=ralph/k06-orchestrator&per_page=3"`. Backup associé : `/home/serveuria/kairos-r11y-BEFORE-RESET.sql`. Docs L99 : `docs/audit/2026-07-07-l99-optimisation.md`.

[MEMO]
Déterministe ≠ LLM (fil rouge L99). Purger, ne pas overrider. « Fait » = re-vérifié à l'instant. Jamais afficher un secret. **Pin `claude-fable-5` = DERNIER JOUR — demain 2026-07-08 bascule opusplan via `switch-to-opusplan.ps1` (le rappeler à Amine en fin de session).**

---

== PASSATION NUCLÉAIRE Kairos/Saqr — 2026-07-07 (session péage ADR 0010 + anti-injection LLM01) ==

[ETAT]
Branche `ralph/k06-orchestrator`, head `8e66780` poussé (PR #11 https://github.com/Afristrat/scrapping/pull/11). Gates locales VERTES : deno test **441/441** · deno check 14/14 fns touchées · tsc 0 · lint 0 · build OK · vitest ciblé 56/56. Base .11 (`db.saqr.ma`, stack Coolify `supabase-db-r11yqnmzzgv5qn8138xddwzt`) : migration `20260511000001` APPLIQUÉE et prouvée live. `main` (b51841f) = ligne divergente Bassira NON mergée — décision Amine, ne pas auto-merger (main est checkout dans le worktree `claudia-zlatan-scrap-main`).

[FAIT] (tout prouvé par commande, 4 commits : af1a45a, c270f97, 7259111, 8e66780)

1. **Péage argent unique dispatch-llm (ADR 0010** — `docs/architecture/adrs/0010-peage-argent-unique-dispatch-llm.md`) :
   - Cause racine P1-010 TROUVÉE : `llm_costs.task` = ENUM 3 valeurs → tous les inserts 'digest'/'enrich:_'/'admin_prompt:_' violaient l'enum EN SILENCE → 0 ligne live (prouvé avant fix). Migration task ENUM→TEXT + CHECK 1-64 + DROP TYPE llm_task + costs_by_day recréée — appliquée sur .11, insert label libre prouvé.
   - dispatch-llm écrit seul `llm_costs` (org_id résolu explicitement — NOT NULL en service_role ; label fin `cost_task`) ; 9 inserts callers supprimés, 5 fns qui ne traçaient rien couvertes d'office. `cost_recorded` en réponse.
   - Overrides `provider_override`/`model_override` honorés (validation couple, `resolve.ts` pur +16 tests) → le consensus multi-modèles redevient RÉEL (avant : N appels = même modèle, variance = bruit).
   - Budget guard `_shared/budget-check.ts` (repêché du repo Saqr `C:\projets\Saqr`, fail-open, +10 tests) → 402 `budget_exceeded` AVANT l'appel payant.
   - `resolveCaller` dual-mode câblé (ADR 0009) : le 2ᵉ saut interne K06 peut passer.
   - `src/types/database.ts` patché à la MAIN (llm_task purgé, task string) — précédent Wave 6.1.
2. **Anti-injection LLM01 + factorisation** (`7259111`) :
   - `_shared/llm-json.ts` (+16 tests) : parse tolérant consolidé (CoT <thinking>, BOM/zero-width, fences, 1er bloc {} ou [] équilibré, LlmJsonError typées) — remplace 7 copies. enrich.ts/ner.ts/suggest.ts/auditor.ts migrés ; research-strategist/lib.ts et rubric-architect délèguent (APIs + tests conservés).
   - `_shared/signal-text.ts` (+11 tests) : extraction canonique du texte signal (1 SEUL ordre de clés summary→selftext→text→description→abstract→body, avant 6 ordres divergents), sanitizeForPrompt anti-breakout (<<</>>> cassés), renderSignalBlock délimité (titre malveillant ne peut pas fermer le bloc — testé).
   - `_shared/llm-guards.ts` : DATA_GUARD_FR / JSON_STRICT_GUARD_FR / FRENCH_ACCENTS_GUARD_FR.
   - Câblage : llm-score-batch system/user scindés + signaux délimités + temperature 0 (3 sites) ; gates rubric-override → builders {system,user} + gardes, `parse_ok` exposé, `gate_parse_failed` loggé (status warning + compteur) ; scoring-engine temp 0.
3. Préexistants corrigés (règle n°3) : providers.ts (2 TS never[]), typage client enrich-signal/enrich-entities (`SupabaseClient` au lieu de `ReturnType<typeof createClient>`), run-admin-prompt detail null, fixture scope.test.ts digest (filtre >=60 vs scores 70-i).
4. Statuts à jour : `.ralph/prd-blindage.json` (P0-004 ✓, P1-010 ✓, 006/009/018 flags périmés corrigés, 005 partiel annoté) + `.ralph/progress.md` (2 entrées détaillées).

[ALERTE]

- **CI GitHub ne tourne PAS sur la PR #11** (0 checks malgré triggers pull_request main) → la gate vitest Linux est MORTE pour toutes les branches ; gates locales = seule preuve. À réparer en priorité transverse.
- **Vitest local pathologique** (OneDrive) : collecte parfois 0 ou 1 fichier (timeouts pool). Ne JAMAIS conclure d'un run pleine-suite local — cibler des fichiers explicites.
- Piège outil Write : les séquences d'échappement type backslash-x peuvent arriver en octets RÉELS dans les fichiers → pour les tests avec caractères de contrôle, utiliser `String.fromCharCode(...)`.
- Le hook pre-commit (lint-staged) reformate via prettier (y compris PASSATION.md — les chaînes exactes changent !) et le tsc du hook dépasse les 2 min par défaut → prévoir timeout 10 min sur `git commit`.
- 7 stacks Supabase sur .11 — ne toucher QUE `r11y` (=saqr/kairos). Anti-leak : clés dans l'env Coolify, jamais affichées.
- `CLAUDE.md` du repo pointe toujours le ref cloud MORT (`crplceoptyeslqyfcqvj`) + repo `meydeey/theresa-scrap` → à repointer (item Runtime).

[BLOQUE]

- Rien. Mandat runtime PLEIN (deploy edge fns, secrets, tests sur .11 en autonomie). Git = commit+push+PR ; merge main = décision Amine.

[NEXT] (ordre L99 — péage et anti-injection FAITS)

1. **Déterminisme** : classification topics par embeddings (`fetchEmbeddingsBatch`+`cosineSimilarity` déjà dans cluster-signals, ~50-100× moins cher, unifie topic-classifier/enrich-signal/cluster-signals) ; entités `person` en code depuis raw_payload + canonicalisation (unaccent/lower — sinon « OpenAI »/« Open AI » = 2 entités) ; pré-filtre mécanique des disqualifiers (scoring-engine.ts:121-152).
2. signal-synthesizer : sortir les calculs déterministes du prompt (longueur brief, lang_distribution — `computeLangDistribution` existe et n'est pas utilisé).
3. Portage P1 Saqr : `cron-pipeline-trigger` (pipeline 100 % manuel !), `score-pending`, `slack-digest`, chaînon RSS Google News (~30 l). + backoff 429 arXiv, welford.test.ts.
4. Runtime : deploy edge fns sur .11 + `INTERNAL_FN_SECRET` + mapper `public_api_keys.proxy_user_id` + test e2e 2ᵉ saut + repointer CLAUDE.md + gen types --db-url propre.
5. Reste audit : P1-007 sièges bornés, P2 (SSRF validate-api-key, run-pipeline lock, record-usage idempotent, workers atomiques), lockfiles, npm audit.

- Transverse : réparer le déclenchement CI sur les PR.

[CTX]
Accès .11 : `ssh -i ~/.ssh/serveurai_mnemo serveuria@192.168.100.11`. Base : `docker exec supabase-db-r11yqnmzzgv5qn8138xddwzt psql -U postgres`. Migrations serveur : `/home/serveuria/kairos-migrations/` (nouvelle migration : scp puis `psql --single-transaction < fichier`). Repo Saqr lecture seule : `C:\projets\Saqr`. Tests : `deno test --allow-env --node-modules-dir=auto supabase/functions/` (441) ; `deno check --node-modules-dir=auto supabase/functions/<fn>/index.ts` ; après deno → `bun install` avant tsc. Backup associé : `/home/serveuria/kairos-r11y-BEFORE-RESET.sql` (youtube-ideas, slack-digest à repêcher). Docs L99 : `docs/audit/2026-07-07-l99-optimisation.md`.

[MEMO]
Déterministe ≠ LLM (fil rouge L99). Purger, ne pas overrider. « Fait » = re-vérifié à l'instant. Jamais afficher un secret. **Pin `claude-fable-5` = DERNIER JOUR — demain 2026-07-08 bascule opusplan via `switch-to-opusplan.ps1`.**

---

== PASSATION NUCLÉAIRE Kairos/Saqr — 2026-07-07 (session blindage + reset base .11 + deep-explore L99) ==

[IDENTITE] (corrige les entrées plus anciennes de ce fichier)
Kairos = **nom de code** ; Saqr = **nom de marque** → MÊME projet. Domaine base = `db.saqr.ma`. Repo GitHub = `Afristrat/scrapping` (remote origin). Le `CLAUDE.md` du repo pointe encore un mauvais ref cloud MORT (`crplceoptyeslqyfcqvj`) + mauvais repo (`meydeey/theresa-scrap`) → À REPOINTER sur le stack self-hosted .11 (cf. [NEXT]). L'ancienne base cloud est morte ; la base vit maintenant sur le serveur .11.

[ETAT]
Branche de travail = `ralph/k06-orchestrator` (22 commits devant `main`=b51841f, ligne divergente « Bassira/devil-advocate » NON mergée — décision produit à trancher par Amine, NE PAS auto-merger). PR ouverte = **#11** (https://github.com/Afristrat/scrapping/pull/11) où Amine suit tout en remote. 4 commits poussés cette session (b927069, 584e0e2, fdb3ef0 + le head courant). Build/lint/typecheck VERTS. Base .11 reconstruite et saine.

[FAIT] (tout prouvé par commande)

- Audit blindage full 5 dimensions → `docs/audit/2026-07-07-rapport-blindage-full.md` + `.ralph/prd-blindage.json` (5 P0, 5 P1, ~10 P2, ~12 P3).
- 3 P0 corrigés : IDOR RPC `enriched_signals` (garde org + search_path), vue `signals_enriched` (security_invoker), build cassé `command.tsx` (import radix).
- 2 P1 : régression score=0 (`llm-score/parse-single.ts` + 7 tests, skip write) ; gate tests verte (exclude e2e + MemoryRouter, 7/7).
- Pilier auth interne (ADR 0009) : `_shared/internal-auth.ts` (resolveCaller + buildInternalHeaders) + 12 tests ; migration `public_api_keys.proxy_user_id`.
- Pilier isolation : migration `20260510000001_harden_definer_functions` (search_path + REVOKE PUBLIC sur 5 DEFINER) — appliqué live, 0 DEFINER sans search_path.
- Fix `backtest-rubric` : format JSON imposé + parse-score + skip sur illisible + 3 `.catch()` cassés sur builders Supabase réparés. Fix `suggest-personas` : « (2026) » hardcodé → date runtime + cast unknown.
- **BASE .11 (`db.saqr.ma`, stack Coolify `supabase-db-r11yqnmzzgv5qn8138xddwzt`) RESET + reconstruite** : DROP schema public de l'ancienne version (régression d'un associé) → rejeu des 62 migrations CORRIGÉES → RLS 43/43, 2 P0 absents (vérifié live), REST 200/401 OK, seeds 10 providers/37 topics. Bug de rejouabilité corrigé (migration `compute_signal_weight` avait un bloc de test mutant retiré). **Backup de l'ancienne version associé** : `/home/serveuria/kairos-r11y-BEFORE-RESET.sql` (contient son travail : youtube-ideas, slack-digest, etc. — à repêcher).
- Deep-explore des 2 versions (3 agents) → `docs/audit/2026-07-07-l99-optimisation.md` (axes déterminisme / prompts / portage Saqr).

[ALERTE]

- `main` (b51841f) et cette branche = 2 LIGNES DIVERGENTES (34 vs 1 commits). Intégration = décision produit d'Amine. `main` est checkout dans un AUTRE worktree (`C:\Users\amans\OneDrive\Projets\claudia-zlatan-scrap-main`) → ne pas forcer main d'ici.
- 7 stacks Supabase sur .11 (rami/saqr/nahda/taqwim/ania/miroshark/sawt). NE TOUCHER QUE `r11y` (=saqr/kairos). Les autres sont d'autres projets.
- Env de test vitest pathologiquement lent (OneDrive + node_modules/.deno). `deno test` casse `tsc -b` → `bun install` restaure. Le poste dev est lent, la CI Linux est saine.
- Anti-leak : les clés (ANON/SERVICE_ROLE/JWT/INTERNAL_FN_SECRET) restent dans l'env Coolify du stack — jamais affichées.

[BLOQUE]

- Rien de bloquant. Mandat runtime PLEIN accordé par Amine (déployer edge fns, poser secrets, tester en runtime sur .11 en autonomie). Objectif = excellence structurelle d'abord PUIS runtime. Git = commit+push+PR (merge main = décision Amine).

[NEXT] (ordre L99 retenu — détail dans `docs/audit/2026-07-07-l99-optimisation.md`)

1. **Refactor `dispatch-llm` en péage unique** (LE nœud) : accepter provider/model overrides (fixe le CONSENSUS FACTICE — overrides ignorés, variance bidon, N× coût), écrire `llm_costs` (péage unique), budget guard EN REPÊCHANT `_shared/budget-check.ts` de l'associé (dans le backup .11), câbler `resolveCaller`, transmettre `temperature`. Runtime-testable maintenant.
2. Gardes anti-injection + délimiteurs sur scoring/gates ; factoriser `_shared/{signal-text,llm-json,llm-guards}.ts` (duplication massive).
3. Déterminisme : classification topics par embeddings (infra `cluster-signals` déjà là, 50-100× moins cher) ; entités `person` en code (déjà dans raw_payload) + canonicalisation ; pré-filtre disqualifiers mécaniques.
4. `signal-synthesizer` : sortir les calculs déterministes du prompt (longueur brief, provenance).
5. Portage P1 depuis Saqr : `cron-pipeline-trigger` (pipeline 100% manuel aujourd'hui !), `score-pending` (scoring cappé 50/run), `slack-digest`, chaînon RSS Google News (~30 l, rss_keywords jamais exploités). + pépites : backoff 429 arXiv, welford.test.ts.
6. Runtime : deploy des edge functions de CE repo sur le stack + poser `INTERNAL_FN_SECRET` + mapper `public_api_keys.proxy_user_id` + câbler pipeline K06 + test end-to-end (le 2ᵉ saut llm-score-batch→dispatch-llm en mode interne = le test qui manquait). + repointer `CLAUDE.md` sur .11 + skills à mobiliser (prompt-engineer-pro sur prompts, moat-hunter run réel, SOP de déploiement).
7. Reste audit : P1-007 sièges bornés, P1-010 coûts, P2 (SSRF validate-api-key, run-pipeline lock, record-usage idempotent, workers atomiques), lockfiles, npm audit.

[CTX] Accès .11 : `ssh -i ~/.ssh/serveurai_mnemo serveuria@192.168.100.11`. Base = `docker exec supabase-db-r11yqnmzzgv5qn8138xddwzt psql -U postgres`. Migrations serveur = `/home/serveuria/kairos-migrations/`, script reset = `/home/serveuria/kairos-reset-apply.sh`. Repo Saqr (lecture seule) = `C:\projets\Saqr` + doc portage `docs/bridges/prompt-portage-saqr-vers-kairos.md`. Tests Deno : `deno test --allow-env <file>`. deno check par fonction : `deno check supabase/functions/<fn>/index.ts`.

[MEMO] Règle CTO n°1 : déterministe ≠ LLM (fil rouge L99). Purger, ne pas overrider. « Fait » = re-vérifié à l'instant par commande. Ne jamais afficher un secret. Pin `claude-fable-5` = dernier jour ; demain bascule opusplan (`switch-to-opusplan.ps1`).

---

== PASSATION Kairos (ex-zlatan-scrap / theresa-scrap) 2026-05-02T01:30Z ==

[REBRAND]
Nom marque officiel = **Kairos** (du grec ancien καιρός, « le moment opportun »). Repo Git toujours `zlatan-scrap`/`Afristrat/scrapping` en interne. Tout le frontend public utilise « Kairos » via hook `useAppName()` (`src/hooks/useAppName.ts`) qui lit `settings.branding.name` si user loggé sinon retourne `DEFAULT_APP_NAME = 'Kairos'`. Domaine cible `scrap.ai-mpower.com` toujours actif → migrer vers `kairos.ai-mpower.com` quand DNS prêt.

[ETAT]
branch=feat/topic-tracking-minio (synchro avec origin/Afristrat/scrapping) | last commit=3940d09 docs(design): collection Stitch | working tree clean
live=https://scrap.ai-mpower.com (actuel) → renommage à venir
bundle Vite=5 chunks max ~500KB (recharts 350KB, react-vendor 272KB, supabase 230KB, radix 114KB, index 504KB) — à splitter encore Wave 7 si besoin
typecheck ✓ 0 err | lint 0 err / 1 warning préexistant Settings.tsx:65 (RHF watch — toléré, hors scope) | vitest 48/48 ✓ | deno tests 28/28 parse-score + 24/24 template = 52/52 ✓ | build ✓ 712-918 ms
backend=Supabase project crplceoptyeslqyfcqvj | 17 migrations appliquées + 4 NOUVELLES Wave 6.1 NON POUSSÉES en prod (cf. [BLOQUE]) | 11 edge functions déployées : run-pipeline, scraper-x/reddit/arxiv, llm-score, llm-score-batch (modifiée non redéployée), topic-classifier, dispatch-llm, refresh-models, digest, run-admin-prompt (Wave 4), purge
infra=Coolify app jhg5pwiyul9r992k8qg2lkx6 | tunnel CF nahda-tunnel → ingress scrap.ai-mpower.com → localhost:80 | MinIO bucket zlatan-scrap-topics sur cloud-station.io

[WAVE_5_FERMEE] (commits 0f16b2e .. 3940d09)
✓ S-MoatHunter (b92c4b9) : brief stratégique 600 l. dans `docs/strategy/2026-05-02-moats-and-value-capture.md` — 15 analogies inter-industries scorées (Top 5 moats à 13-14/15) + analyse conjointe v2 (8 attributs × 4 niveaux × 6 segments) + 12 SKUs Maison/BYOK + MRR cible 132k€/mois = 1,58 M€ ARR
✓ S-DashDelete (d898c66 + 01319ff) : delete inline + checkbox + bulk delete dans SignalTable, AlertDialog confirmations, sticky bar `top-0 z-10`, hooks useDeleteSignal/useDeleteSignalsBulk, primitives shadcn checkbox + alert-dialog, 4 tests Vitest
✓ S-ScoreZero (e2ed173 + 01319ff + cba1b80) : root cause = JSON.parse silent catch + Number()||0 + placeholder DB | fix = parse-score.ts (28 tests Deno) avec stripMarkdownFence + extractFirstJsonObject bracket-aware + coerceScore retourne null (jamais 0) | UX = ScoreCell HoverCard reasoning/modèle/rubric/distance temporelle FR + bouton ↻ inline + bulk + flash bg-emerald-100 1.5s pattern React 19 store-previous-prop
✓ S-Landing (1a31b4b) : routing / publique (MarketingLayout) + /dashboard auth-protected ProtectedRoute, sanitizeNext open-redirect protection, Login redirect via ?next=, logout → /, GITHUB_URL → Afristrat/scrapping
✓ S-LandingContent (ed140be) : 7 composants modulaires `src/components/features/landing/` (Hero, Problem, Solution, Moats, Personas, PricingTable, FAQ), PricingTable avec toggle Tabs Maison/BYOK + slider seats Pro 5-25 dégressif (-15% Maison / -10% BYOK)

[WAVE_5_BONUS] (post-fermeture)
✓ Rebrand Kairos (22d53ae) : hook `useAppName.ts` + DEFAULT_BRANDING.name='Kairos', MarketingLayout/Login/FAQ/PricingTable/index.html mis à jour, GITHUB_URL → Afristrat/scrapping, CONTACT_EMAIL → hello@kairos.ai-mpower.com
✓ Fix bug re-scoring (cba1b80) : 3 causes — (1) hook ne lisait pas error.context.body sur 5xx (toast affichait « non-2xx status code » générique) → ajout helper `extractFunctionsError` qui clone Response et lit body.json() pour récupérer error+detail+hint | (2) parse_failed retournait 502 alors qu'erreur métier (call LLM eu lieu, coût à tracer) → return 200 avec parse_failed=true + insert llm_costs | (3) bulk stoppait à la 1re batch fail → try/catch par chunk + abandon après 3 échecs consécutifs sans succès (évite gaspiller tokens) | useRescoreSignalsBulk type étendu BulkRescoreResult avec batches_total, batches_failed, errors[], toast différencié success/partial/failure
✓ Collection Stitch prompts (3940d09) : 13 prompts copy-paste-ready dans `docs/design/kairos-stitch-prompts.md` (1 156 l) — 7 landing + 5 pages auth + 1 onboarding flow, format optimisé Stitch Gemini 2.5 avec préambule design system commun + variantes/états/a11y

[WAVE_6.1_LIVREE_NON_POUSSEE_PROD] (commit 4b2bda5)
4 migrations SQL prêtes pour `npx supabase db push` :

- 20260502000001_orgs.sql (325 l) : 6 nouvelles tables (organizations, organization_members, subscriptions, subscription_seats, invitations, usage_records) + 5 ENUMs (org_segment, org_plan, billing_mode, org_role, subscription_status) + RLS policies + trigger updated_at
- 20260502000002_org_id_columns.sql (54 l) : ajout colonne `org_id uuid REFERENCES organizations(id)` sur **15 tables** (l'agent a découvert provider_models en plus des 14 listées dans le PRD initial) + 15 indexes
- 20260502000003_backfill_orgs.sql (149 l) : DO block créant 1 org/user existant + organization_members.role=owner + populate org_id partout + trigger `create_default_org_for_user` AFTER INSERT auth.users
- 20260502000004*rls_org_rewrite.sql (541 l) : drop 39 policies own*\_, create 57 policies org\_\_ qui filtrent via `organization_members`, helper `user_default_org_id()` (STABLE, SECURITY INVOKER) posé en DEFAULT sur org_id pour rétrocompat frontend Wave 6.3 pas encore livrée, SET DEFAULT puis SET NOT NULL sur 15 tables
- src/types/database.ts étendu manuellement (pas accès Supabase live) : 6 nouvelles tables Row/Insert/Update + org_id ajouté dans Row+Update de chaque table tenant + 5 nouveaux ENUMs (Types + Constants)

[WAVE_6_PRD_PLANIFIE] (`.ralph/wave-6-prd.md`)
22 stories en 5 sous-vagues, dispatch attend GO utilisateur après push migrations 6.1 :

- 🟦 6.1 Foundation (4) : LIVRÉE, attend push prod
- 🟨 6.2 Stripe Billing (4) : S6-StripeSetup (script bootstrap + 12 SKUs prods+prices), S6-StripeWebhook (sync subscriptions table), S6-MeteredUsage (cron pg_cron quotidien), S6-CheckoutFlow (edge fn create-checkout-session)
- 🟩 6.3 UI Multi-tenant (5) : S6-OrgSelector (dropdown header + Zustand useOrgStore), S6-OrgQueries (refacto ~10 hooks pour filter org_id), S6-TeamPage (/settings/team), S6-InvitationFlow (edge fn invite-member + accept-invitation + page /accept-invitation/:token), S6-Configurator (page /pricing publique 4 questions)
- 🟧 6.4 BYOK & Compliance (4) : S6-BYOKProvisioning (UI validation auto clés providers), S6-AuditLog (table + middleware + page /settings/audit + export CSV), S6-TenantIsolated (provisioning schéma Postgres séparé), S6-AdminCockpit (page /admin avec COG/MRR/ARR projeté)
- 🟥 6.5 Enterprise (5) : S6-SelfHostDocker (compose + doc + script setup), S6-CSMOnboarding, S6-SLAMonitoring (/health + /status), S6-LegalPack (RGPD DPA + EU AI Act compliance matrix), S6-MarketingSite (refonte landing avec PricingConfigurator + blog + analytics)
  Estimation : 8-15 jours dev humain ; 2-4 sessions Ralph en agents parallèles (post 6.1)

[ENCOURS]
RAS bloquant code | seul reste à dispatcher : Wave 6.2/6.3/6.4/6.5 sur GO utilisateur après push migrations 6.1 prod

[ALERTE]
!! 4 migrations Wave 6.1 NON POUSSÉES en prod — l'utilisateur doit valider en lisant les ~1 070 l. SQL puis exécuter `bunx supabase link --project-ref crplceoptyeslqyfcqvj && bunx supabase db push`. Le helper `user_default_org_id()` posé en DEFAULT garantit la rétrocompat frontend Wave 6.3 pas encore livrée — push safe sans casser dashboard actuel
!! Edge function llm-score-batch MODIFIÉE en local mais NON REDÉPLOYÉE — le bug re-scoring + le câblage parse-score.ts ne sont actifs qu'après `bunx supabase functions deploy llm-score-batch`. Action utilisateur requise
!! CREDENTIALS LEAKÉS dans chats antérieurs (déjà signalés PASSATION précédente) à rotater impérativement : DB password Supabase wt2giXPxCYEMVhit | anon key Supabase | Coolify token mZV3t49u058ar3Gaq8POCHzjZ2LU7x3lJlRIPCXW5700c32d | MinIO root user fadbf15390f9465e + password bff19156b48a422583215a2a7f03e056
! 19 tests Vitest préexistants cassés AVANT cette session sont REPARÉS automatiquement par `bun install` post-Wave 4 (vitest 14/33 → 48/48). À surveiller : si jest-dom matchers redeviennent cassés au prochain bun install, faire upgrade jest-dom ou downgrade vitest
! Provider tunnel scrap-frontend créé inutilement Cloudflare début Wave 5 — toujours à supprimer dans dashboard CF Networks → Connectors

[BLOQUE]

- Stitch via extension Chrome MCP : iframe cross-origin app-companion-430619.appspot.com bloque toute interaction (read_page/screenshot/find timeout 45s sur document_idle, click/type passent mais aveugle). Workaround = utilisateur copie-colle 13 prompts manuellement depuis `docs/design/kairos-stitch-prompts.md` OU pivot vers `frontend-design` skill (codage React direct sans passer par Stitch)
- Wave 6.2 Stripe : nécessite STRIPE_SECRET_KEY en mode test minimum + skill `stripe:stripe-best-practices` pour cadrer les products/prices

[NEXT_PRIORITES]

1. PUSH MIGRATIONS WAVE 6.1 EN PROD (action user) :
   bunx supabase link --project-ref crplceoptyeslqyfcqvj
   bunx supabase db push
   bunx supabase functions deploy llm-score-batch
   → vérifier en dashboard que les 4 migrations passent et que le bug score=0 disparaît
2. ROTATER LES CREDENTIALS LEAKÉS (action user)
3. DISPATCH WAVE 6.2/6.3/6.4 EN PARALLÈLE après GO :
   - 6.2 Stripe (1 ou 2 agents) — nécessite test mode Stripe
   - 6.3 UI Multi-tenant (3-4 agents en parallèle)
   - 6.4 BYOK & Compliance (3 agents en parallèle)
4. DISPATCH WAVE 6.5 ENTERPRISE après 6.1+6.2 stables (5 agents)
5. STITCH DESIGNS — 2 options : (a) utilisateur copie-colle les 13 prompts manuellement, (b) pivoter vers frontend-design skill pour coder direct en React + Tailwind + shadcn
6. ROADMAP WAVE 7+ (post Wave 6 stable) : Top 5 features moat de l'analyse conjointe — Multi-LLM consensus (#1, score 14) puis Backtest grilles (#2, score 14) puis Negative propagation (#3) + Cross-source corroboration (#4) + Author Reputation Layer (#5)

[CTX_SESSION]
session totale Wave 5+6.1 ~6h | nb commits ajoutés cette session = 11 (4d763ce..3940d09 +commits Wave 4 ; 22d53ae cba1b80 4b2bda5 3940d09 = derniers 4) | nb agents Ralph dispatchés = 8 (S-AdminTests, S-AdminCompose, S-DashDelete, S-ScoreZero, S-Landing, S-LandingContent v1+v2, Wave-6.1) | $ inconnu | 0 deploys Coolify (uniquement push GitHub) | 0 deploys edge fns Supabase (à faire pour llm-score-batch !)

[REPO_LAYOUT]
Code:
src/ → Vite + React 19 + TS strict + Tailwind v4 + shadcn
pages/Home.tsx → 51 l. orchestrateur landing publique
pages/Login.tsx Signup.tsx → auth multi-méthodes (magic link + password + Google)
pages/Dashboard.tsx → table signaux scorés + bulk actions + re-score
pages/Digest.tsx Costs.tsx Logs.tsx Topics.tsx Settings.tsx
components/layout/ → AppLayout (sidebar + BrandedHeader) + MarketingLayout (public)
components/auth/ → ProtectedRoute (sanitizeNext) + AuthListener
components/features/landing/ → 7 composants modulaires Wave 5
components/features/ → SignalTable, ScoreCell, AdminPromptsConfig, BrandingForm, etc.
components/ui/ → primitives shadcn (button, card, dialog, alert-dialog, checkbox, hover-card, slider, tabs, etc.)
hooks/ → useSignals, useDeleteSignal, useRescoreSignals (bulk robuste), useAdminPrompts, useAppName, useSettings, useDigest, useTopics, useCosts, useLogs, etc.
stores/auth.ts → Zustand session + user + signOut redirect /
lib/supabase.ts → client typé Database
lib/promptPreview.ts → live preview des variables admin prompts
lib/schemas/ → schemas zod
types/database.ts → généré + étendu manuellement Wave 6.1
supabase/
migrations/ → 17 anciennes + 4 NOUVELLES Wave 6.1 (NON POUSSÉES)
functions/ → 11 edge fns Deno
run-admin-prompt/ → index.ts + compose.ts + template.ts + template.test.ts (24 tests)
llm-score-batch/ → index.ts + parse-score.test.ts (28 tests)
\_shared/ → api-keys, errors, retry, providers, welford, minio (+ minio.test.ts), unicode, filter, parse-score (NEW)
Docs:
HANDOFF.md → pointe vers récap session + brief stratégique
docs/handoffs/2026-05-01-session-ralph-complete.md → récap Wave 1-4
docs/strategy/2026-05-02-moats-and-value-capture.md → moat-hunter + analyse conjointe v2 (12 SKUs)
docs/design/kairos-stitch-prompts.md → 13 prompts Stitch copy-paste-ready
.ralph/prd.json → state machine stories Wave 1-5 (TRONQUÉE par linter à plusieurs reprises, à reconstruire si besoin)
.ralph/wave-6-prd.md → PRD Wave 6 complet 22 stories en 5 sous-vagues
.ralph/progress.md → run history Wave 4-5

[MEMO_TECH]

- Project ref Supabase live = crplceoptyeslqyfcqvj | repo GitHub Afristrat/scrapping branche feat/topic-tracking-minio (~57 commits ahead origin main qui n'existe pas encore)
- Pattern BYOK : settings.model_config[task] (jsonb) → fallback DEFAULT_PROVIDER='openrouter' + DEFAULT_MODEL='openrouter/auto' dans dispatch-llm
- 4 tasks supportées : scoring | scraping | monitoring | digest
- 5 task_kind admin prompts : reddit | arxiv | x | synthesis | custom
- Trigger seed_admin_prompts_on_user_creation seed les 4 prompts auto AFTER INSERT auth.users
- Wave 6.1 : ajout trigger create_default_org_for_user qui s'exécute APRÈS les 2 autres dans l'ordre alphabétique (sécurité : on_auth_user_created* est lexico avant trg_seed_admin_prompts*) — au signup d'un nouveau user, settings + admin_prompts sont créés AVANT que org_id soit résolu via DEFAULT user_default_org_id() — DEFAULT en RLS context via auth.uid() retourne NULL si pas encore d'org → vérifier en E2E que le rebuild est bien dans l'ordre attendu
- llm-score-batch sur parse_failed retourne maintenant 200 (pas 502) pour que le frontend distingue erreur métier de panne réseau, et insert llm_costs même si parse_failed (le call LLM a eu lieu)
- Pattern test Deno : `deno test --allow-env --node-modules-dir=auto supabase/functions/<fn>/<file>.test.ts` ; side-effect = crée node_modules/.deno/ qui pollue tsc -b → `bun install` réintègre
- Husky prepare = "husky || true" (skip si .git absent dans container Coolify)
- Vite v8 + rolldown : manualChunks DOIT être une fonction (Rollup-style objet refusé)
- Test infra Vitest exclut supabase/functions/\*\* (Deno tests via deno test)
- Domain : ai-mpower.com via Cloudflare, app sur scrap.ai-mpower.com → futur kairos.ai-mpower.com
- 12 SKUs Stripe à créer Wave 6.2 : prod*{solo,cto,newsletter,brand,legal,vc}*{maison,byok} | 9 add-ons : webhooks +49 / api_public +99 / custom_sources +199 / audit_log +149 / tenant_isolated +299 / selfhost +499/an / csm_dedicated +999/an / backtest_unlimited +149 / reputation_api +199
- COG mensuel approximatif : Solo Maison Haiku 4€/Sonnet 18€ | Team 5 users Maison Haiku 41€/Sonnet 181€ | Business 25 users Maison Haiku 205€/Sonnet 905€ | Enterprise 100+ users Maison Haiku 725€/Sonnet 3525€ | règle pricing prix ≥ 4× COG (marge brute ≥ 75%)
- Logique BYOK > Maison en prix : signal de marché enterprise/souverain (WTP supérieure), pas COG. Comparable Vercel AI SDK Cloud / LangChain Enterprise 50-200$/seat
- Solo segment utility 280/800 = mauvais business, à traiter UNIQUEMENT comme funnel SEO, jamais marketé en hero

[STITCH_BYPASS]
Si on persiste avec Stitch après push prod : tester si extension Claude Chrome arrive à computer.left_click + computer.type en aveugle même quand screenshot timeout — le seul moyen est events natifs OS qui passent par-dessus le sandbox cross-origin. Coordonnées probables champ input : (956, ~870) bottom-center du viewport 1912×951. À tester avec un seul prompt court avant d'enchaîner les 13.

[FIN_PASSATION]
