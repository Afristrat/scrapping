# Rapport d'audit blindage — Kairos (`kairos-ralph-k06`)

- **Date** : 2026-07-07
- **Mode** : `/blindage full` (full obligatoire — `state.json` absent au départ)
- **Branche** : `ralph/k06-orchestrator` (22 commits devant `main`, 0 derrière — ligne de dev active K01–K09)
- **HEAD** : `030a021 [K06 research-from-seed]`
- **Phase 4 (runtime)** : **dégradée** — Supabase du projet déconnecté (base en cours de recréation sur serveur .11). Preuves runtime HTTP impossibles → surfaces critiques marquées `COUVERTE (statique uniquement)`.
- **Méthode** : phase 0 déterministe (typecheck/lint/build/test/audit + greps) → fan-out 5 dimensions (sécurité, RLS/DB, crash, métier, dette+cache+frontend) → vérification adverse des P0 par lecture directe des sources.

## Verdict d'ensemble

Le socle est **sérieux** (RLS activée sur toutes les tables, pas de secret hardcodé, pas d'injection SQL, webhook Stripe signé, hash de clé API constant-time, parseur de score durci dans `_shared/parse-score.ts`). Mais l'audit a remonté **des trous cross-tenant réels** et un **pipeline K06 structurellement non fonctionnel**, plus un build au rouge. Le centre de gravité n'est pas une faille isolée mais **l'absence de points de passage uniques** : pour l'argent (coûts LLM écrits par 6 fonctions sur 13, budget jamais lu), pour l'auth interne (chaîne K01→K07), et pour l'isolation (fonctions/vues SECURITY DEFINER qui bypass la RLS sans garde d'org).

## Décompte

| Sévérité | Confirmés | Dont corrigés dans cette session |
| -------- | --------- | -------------------------------- |
| P0       | 5         | 3 (2 RLS + build)                |
| P1       | 5         | 0                                |
| P2       | ~10       | 0                                |
| P3       | ~12       | 0                                |

---

## P0 — à traiter avant / pendant la reprovision

### BLD-2026-07-07-001 — [CORRIGÉ] IDOR cross-tenant total via RPC `enriched_signals`

`supabase/migrations/20260504130000_rpc_signals_enriched.sql` — RPC `SECURITY DEFINER`, `GRANT ... authenticated`, filtrait `WHERE s.org_id = p_org_id` avec `p_org_id` **fourni par le client**, sans vérifier l'appartenance de `auth.uid()` à cette org, et sans `SET search_path`. N'importe quel utilisateur authentifié pouvait lire signaux + scores + `reasoning` + entités/personas **de toutes les organisations**.
**Correctif appliqué** : ajout d'un garde `EXISTS (SELECT 1 FROM organization_members WHERE org_id = p_org_id AND user_id = auth.uid())` dans le `WHERE` + `SET search_path = public, pg_temp`.

### BLD-2026-07-07-002 — [CORRIGÉ] Vue `signals_enriched` bypass RLS (pas de `security_invoker`)

`supabase/migrations/20260503210004_signal_enrichment_links.sql` + recréation dans `20260504155000_compute_signal_weight.sql`. Vue `GRANT SELECT ... authenticated`, créée sans `WITH (security_invoker = on)` → exécutée avec les droits du propriétaire → `GET /rest/v1/signals_enriched` dumpait les signaux de tous les tenants.
**Correctif appliqué** : `CREATE ... VIEW signals_enriched WITH (security_invoker = on) AS` dans les deux migrations (comme `organization_members_view` qui était déjà correcte).

### BLD-2026-07-07-003 — [CORRIGÉ] Build + typecheck cassés (`command.tsx`)

`src/components/ui/command.tsx:2` importait `@radix-ui/react-dialog`, paquet **non déclaré** dans `package.json` (seul le paquet unifié `radix-ui` l'est). `tsc -b` et `vite build` échouaient → **CI rouge sur chaque push**, déploiement bloqué. Seul import cassé (les 10 autres composants UI utilisent `from 'radix-ui'`).
**Correctif appliqué** : suppression de l'import individuel, `type CommandDialogProps = React.ComponentProps<typeof Dialog>`. Build vérifié vert (9,12 s).

### BLD-2026-07-07-004 — [OUVERT] Budget `daily_budget_usd` jamais appliqué (org ET clés publiques)

Le champ existe (`settings.daily_budget_usd`, `public_api_keys.daily_budget_usd`), est vendu dans l'UI et sélectionné en base, mais **aucune edge function ne le lit** avant un appel LLM. `dispatch-llm` part sans cost guard ; `research-from-seed` calcule `total_cost_usd` a posteriori sans jamais le comparer. Garde-fou purement décoratif → une org (ou une clé Bassira compromise) peut brûler un multiple de son budget, y compris l'argent-plateforme via le fallback `OPENROUTER_API_KEY`.
**Correctif recommandé** : faire de `dispatch-llm` le péage unique — avant l'appel, `SUM(cost)` du jour par `org_id` (et par `api_key_id`) et rejeter en 402/429 si ≥ budget. Voir aussi BLD-...-010 (coûts non écrits).

### BLD-2026-07-07-005 — [OUVERT] Pipeline K06 `research-from-seed` mort-né (auth interne incompatible)

Triple-confirmé (dimensions métier + crash + les 3 branches `feat/k09-proxy-*`). `research-from-seed/lib.ts` appelle les fonctions aval avec `Authorization: Bearer <SERVICE_ROLE_KEY>` ; or `dispatch-llm`, `llm-score-batch`, `rubric-architect`, `signal-synthesizer`, `quality-auditor` font tous `supabase.auth.getUser()` → un JWT service_role n'a pas de `sub` → `user = null` → 401. De plus `dispatch-llm` résout la clé BYOK par `user.id` (inexistant en contexte service). `config.toml` ne déclare aucun `verify_jwt = false` → un appel `x-api-key` sans JWT user est rejeté au gateway. Les 15 tests K06 passent car `callInternal`/`fetch` sont mockés. **Le livrable K06 ne peut produire aucun run réel en prod.**
**Correctif recommandé** : décider un modèle d'appel interne unique (secret partagé `x-internal-secret` OU association `public_api_key → user/org technique` avec forge explicite du contexte BYOK), déployer `research-from-seed` en `--no-verify-jwt`, et ajouter un test d'intégration non mocké. **C'est la décision derrière les 3 pivots k09 — à trancher une fois, pas un 4ᵉ essai.**

---

## P1

- **BLD-2026-07-07-006 — Régression « score=0 vs null » dans `llm-score`** (`supabase/functions/llm-score/index.ts:196-198`). La voie principale `run-pipeline` utilise encore l'ancien fallback `catch → { score: 0 }` + `Number.isFinite ? : 0`, alors que le fix vit dans `_shared/parse-score.ts` (utilisé seulement par `llm-score-batch`). Un LLM qui renvoie du JSON entouré de prose → 30 faux `score=0` permanents, sortis de `unscored_signals`, jamais re-scorés. **Correctif** : router `llm-score` via `parseScoringResponse`/`coerceScore` et ne rien écrire en parse fail.
- **BLD-2026-07-07-007 — Sièges jamais bornés par le plan** (`invite-member`, `accept-invitation`). Aucun comptage de `organization_members` vs `subscriptions.seats` → une org `solo` (1 siège payé) peut activer N membres, tous avec accès RLS org. Revenue leak. **Correctif** : refuser dans `accept-invitation` si `count >= seats`.
- **BLD-2026-07-07-008 — Aucun Error Boundary React / `errorElement`** (`src/App.tsx`, `src/routes.tsx`). Un `signal.source` hors `{reddit,arxiv,x,rss}` → `SOURCE_META[source].badgeClass` undefined → écran blanc total. **Correctif** : `errorElement` racine + ErrorBoundary autour d'`AppLayout` + garde `SOURCE_META[source] ?? FALLBACK`.
- **BLD-2026-07-07-009 — Gate tests en permanence rouge** (3 causes racines) : `vitest.config.ts:16` n'exclut pas `e2e/**` (4 specs Playwright happées par Vitest) ; `RubricBacktest.test.tsx` rend sans `<MemoryRouter>` (7 tests rouges via `useLocation`) ; environnement à ~1000 s car `node_modules` peuplé par Deno (`.deno/`) sur OneDrive. **Correctif** : compléter l'`exclude`, wrapper `MemoryRouter`, réinstaller avec un seul gestionnaire hors OneDrive.
- **BLD-2026-07-07-010 — Coûts LLM non écrits sur ≥ 7 chemins** (`llm-score-batch` consensus + `rubric_override`, `backtest-rubric`, `research-strategist`, `rubric-architect`, `signal-synthesizer`, `cluster-signals`, `compute-reputation`, `topic-classifier`). `record-usage` ne facture rien de ces chemins ; page Costs fausse ; le futur budget-guard (004) serait aveugle. **Correctif racine** : écrire `llm_costs` dans `dispatch-llm` (péage unique) au lieu de dupliquer dans chaque appelant.

## P2 (extraits)

- **BLD-...-011 — `record-usage` non idempotent** : `reportOverageToStripe` avec `action:'increment'` + fenêtre glissante vs replay minuit-minuit → **double facturation Stripe** si le cron et un replay admin tombent le même jour. Lire `reported_to_stripe` avant de reporter.
- **BLD-...-012 — SSRF authentifié** dans `validate-api-key` (`pingOllama`) : `base_url` du body passé à `fetch()` sans validation d'hôte → port-scan interne / oracle. Allowlist d'hôtes.
- **BLD-...-013 — `run-pipeline` sans verrou** : double-clic ou bouton+cron → double scoring/coût. `pg_try_advisory_lock`.
- **BLD-...-014 — `backtest-rubric` : verrou fictif** (RPC `backtest_try_lock` inexistant dans les migrations → toujours le fallback TOCTOU) **+ parsing regex-avant-JSON** qui lit `score: 20` dans le _reasoning_ → scores backtestés faux.
- **BLD-...-015 — Timeouts d'étape K06 < timeouts internes** (`score: 15_000` vs 30 signaux × appels retry ×5) → 504 garanti sous charge, coût LLM déjà engagé et non annulé.
- **BLD-...-016 — Fan-out cascade `{{run:<kind>}}` non plafonné** (`run-admin-prompt`) : profondeur/cycles bornés, mais K^depth possible (jusqu'à 125 exécutions LLM par requête). Compteur global.
- **BLD-...-017 — Workers d'enrichissement : claim non atomique + double cron** (`enrich-entities` + `process-pending-enrichments`, tous deux `*/30`) → double extraction d'entités (double coût). `FOR UPDATE SKIP LOCKED`.
- **BLD-...-018 — SECURITY DEFINER sans `SET search_path`** sur `compute_signal_weight` (exécutable par PUBLIC), `increment_entity_signal_count`, `enqueue_signal_enrichments`, triggers de poids. Hijacking de résolution d'objet. Ajouter `SET search_path` + `REVOKE EXECUTE FROM PUBLIC`.
- **BLD-...-019 — 3 lockfiles divergents versionnés** (`bun.lock` + `deno.lock` + `package-lock.json`) : `package-lock.json` a 4 jours de retard, `@react-pdf/renderer` présent dans l'un, absent de l'autre. Builds non reproductibles. Choisir un gestionnaire, `git rm` les autres.
- **BLD-...-020 — Identité incohérente + mauvais pointeurs** : `package.json name = theresa-scrap`, bucket `zlatan-scrap`, produit `Kairos` ; **le `CLAUDE.md` projet pointe un mauvais project ref Supabase (`rratnmtiescwdvtnjbeq`) et un mauvais repo (`meydeey/theresa-scrap`)** vs `HANDOFF.md` (`crplceoptyeslqyfcqvj`) et le remote réel `Afristrat/scrapping`. Risque de déployer sur le mauvais projet. À aligner — **critique avant la reprovision**.

## P3 (extraits)

- Messages d'erreur trop verbeux renvoyés au client (`detail: formatError().message`) — plusieurs fonctions.
- `CRON_SECRET` comparé en non-constant-time (`record-usage`).
- `formatError` absent de 21/38 edge functions (dont `scraper-reddit`, `scraper-arxiv`, `scraper-rss`, `run-pipeline`).
- `llm_costs.org_id` par DEFAULT `user_default_org_id()` → misattribution multi-org + trous service_role.
- `stripe-webhook` sans garde d'ordre d'événements (`event.created`) → un `updated` retardé peut réactiver un abonnement annulé.
- `signals_session` sans UNIQUE + sélection des 30 signaux non déterministe (`.limit(200)` sans ORDER BY).
- `pending_enrichments` : `ON CONFLICT DO NOTHING` sans contrainte unique (clause morte) + file `neo4j_push` jamais traitée (croissance infinie).
- Rate-limit `public_api_rate_hits` sans purge (croissance infinie → latence).
- Cache client TanStack : `queryKey` incluent bien `orgId` (pas de fuite cross-org) ; manque `queryClient.clear()` au `signOut` (hygiène).
- `useAuditLog.ts:52` : `any` dont la justification est périmée (`audit_log` est désormais typé) — retypa­ble.
- 8 edge functions d'enrichissement (Wave 10C) sans appel client — à confirmer cron-câblées vs mortes avant tout nettoyage.
- 37 blocs CORS dupliqués (pas de `_shared/cors.ts`).

---

## Couverture & complétude

- **5 dimensions** couvertes (sécurité, RLS/DB, crash, métier, dette+cache+frontend). Conformité RGPD non activée (`config.json`).
- **Cache serveur/edge** : non applicable (SPA Vite pure, pas de SSR/CDN de données) — seul le cache client TanStack a été instruit (sain).
- **Rappel canari** : non chiffré formellement (phase 4 runtime indisponible), mais les classes de vulnérabilités canoniques ont toutes été surfacées par des findings réels — bypass SECURITY DEFINER (RLS), vue non-invoker, budget/coût non appliqué (métier/cache), comparaison non-constant-time (sécurité), parse-to-0 (crash), verrou non atomique (métier). Confiance qualitative élevée ; à re-mesurer en incrémental une fois la base .11 en ligne.
- **Angle mort assumé** : tout ce qui dépend du runtime réel (répro HTTP des IDOR, comportement effectif du pipeline K06, réconciliation des coûts) reste `statique uniquement` tant que la base .11 n'est pas provisionnée.

## Note reprovision serveur .11

Les migrations `supabase/migrations/` seront rejouées telles quelles. Les 2 P0 RLS **et** leur correctif vivent dans ces fichiers : la base .11 sera **saine dès `db push`** avec les correctifs de cette session. Vérifier après provision : (1) `enriched_signals` renvoie vide pour un non-membre ; (2) `GET /rest/v1/signals_enriched` filtre par org ; (3) aligner `CLAUDE.md` sur le bon project ref avant de lier le CLI (BLD-...-020).
