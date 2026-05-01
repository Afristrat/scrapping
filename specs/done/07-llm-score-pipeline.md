# Spec — Edge Functions `llm-score` + `run-pipeline`

**Task source** : `~/.claude/output/projects/zlatan-scrap/tasks/07-llm-score-pipeline.md`
**Estimation** : 3h · **Bloque** : 09 (Dashboard) · **Bloqué par** : 04 ✅, 05 ✅, 06 (X scraper) → **dérogation : 06 sera best-effort, non bloquant**.

## Problème & Objectifs

Cœur du pipeline. Deux Edge Functions Deno :

1. **`llm-score`** : score 1 signal via OpenRouter. Lit `settings` (modèle + prompt user), construit le prompt, appelle l'API en mode `response_format: json_object`, parse `{score: 0-100, reasoning: "..."}`, écrit `scores` (upsert) + `llm_costs` (insert).
2. **`run-pipeline`** : orchestrateur. Appelle les scrapers existants (`scraper-reddit`, `scraper-arxiv`, `scraper-x` si présent) en `Promise.allSettled`, récupère les signaux non scorés (`signals LEFT JOIN scores`), score par batch concurrency 5, retourne `{scored, scrape: [statuses]}`.

Le dashboard (Task 09) appelle uniquement `run-pipeline` ; toute la complexité reste backend.

### Dérogation Task 06 (X scraper)

Le plan d'origine bloque 07 par 04+05+06. Décision : **on découple 06**. `run-pipeline` appelle `scraper-x` mais le wrap dans `Promise.allSettled` → si la function n'existe pas (404), branche rejetée silencieusement, log marqué `'rejected'`, pipeline continue avec Reddit + Arxiv. Donc **Task 07 livrable sans Task 06**, X arrive plus tard (best-effort V1 conformément à `archi.md`).

## Non-Goals

- ❌ Re-score d'un signal déjà scoré — `scores` est upsert mais le pipeline ne re-cible que les signaux **sans** entrée `scores` (LEFT JOIN). Pour forcer un re-score : delete dans `scores` puis re-run (V1.1 si besoin).
- ❌ Streaming / SSE — réponse one-shot après tout terminé. Pour V2, streamer chaque score scoré.
- ❌ Soft-budget enforcement (`settings.daily_budget_usd`) — la colonne existe (Task 02) mais l'enforcement runtime est V1.1. V1 : on logue le coût, on ne block pas.
- ❌ Retry / backoff sur OpenRouter — V1 = single attempt par signal, échec = `Promise.allSettled` rejette, signal reste non scoré pour le prochain run. Backoff = V1.1.
- ❌ Settings `model_scraping` / `model_monitoring` — V1 utilise uniquement `model_scoring` côté llm-score. Les deux autres sont des slots futurs.
- ❌ Helpers `_shared/` factorés — toujours pas, on copie le pattern. Si Task 06 arrive plus tard avec une 5ème Edge Function, on factorisera (V1.1).
- ❌ Limite hard de tokens par signal autre que `max_tokens: 200` — pas de truncation custom du payload au-delà du `slice(0, 4000)` actuel.
- ❌ Tests unitaires Deno — smoke tests via curl + assertion DB.

## Approche technique

### Structure fichiers

```
supabase/functions/llm-score/
  index.ts
  README.md
supabase/functions/run-pipeline/
  index.ts
  README.md
```

### Flow `llm-score`

```
POST /functions/v1/llm-score
  body: { signal_id: uuid }
  headers: { Authorization: "Bearer <user JWT>" }

  1. Auth user via JWT (RLS scope)
  2. Parallel : fetch signal (RLS check via user_id) + fetch settings
  3. Build prompt (settings.prompt_scoring + signal title/payload truncated)
  4. OpenRouter chat.completions.create({
       model: settings.model_scoring,
       response_format: { type: 'json_object' },
       max_tokens: 200,
     })
  5. Parse content → { score, reasoning } avec validation Zod-like inline
  6. Cost = completion.usage?.cost ?? estimate via tokens
  7. Parallel : upsert scores (PK signal_id+user_id) + insert llm_costs
  8. Log ok/error dans logs
  9. Response { signal_id, score, reasoning, cost }
```

### Flow `run-pipeline`

```
POST /functions/v1/run-pipeline
  body: {} (settings du user lus en DB)
  headers: { Authorization: "Bearer <user JWT>" }

  1. Auth + load settings du user
  2. Log start
  3. Phase scrape : Promise.allSettled([
       scraper-reddit({ subs: settings.reddit_subs }),
       scraper-arxiv({ categories: settings.arxiv_categories }),
       scraper-x({ queries: settings.x_queries }),  // best-effort
     ])
  4. Phase score :
       - Query signals user_id=$user
         WHERE NOT EXISTS (SELECT 1 FROM scores
                           WHERE scores.signal_id=signals.id
                             AND scores.user_id=signals.user_id)
         ORDER BY scraped_at DESC LIMIT 100
       - Loop batch concurrency 5 → fetch llm-score per signal
       - Compteur scored / failed
  5. Log end agrégé
  6. Response { scrape: [statuses+counts], scored, failed, duration_ms }
```

### Décisions clés (vs spec d'origine)

| #   | Décision                                                                             | Justification                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Dérogation Task 06 : `Promise.allSettled` tolère absence de `scraper-x`              | Permet livraison 07 sans bloquer sur X. Conforme archi.md "X best-effort V1"                                                                                                                                                                                       |
| D2  | Wrapper CORS + OPTIONS dans les 2 functions                                          | Cohérence Tasks 04/05. `run-pipeline` sera appelée depuis le frontend (Task 09 RunButton)                                                                                                                                                                          |
| D3  | Logs `start` / per-step / `end` symétriques aux scrapers                             | Aligné archi.md, debug du pipeline lisible dans table `logs`                                                                                                                                                                                                       |
| D4  | Validation Zod-like inline du JSON LLM (`score: number 0-100`, `reasoning: string`)  | OpenRouter `response_format: json_object` ne garantit que la syntaxe JSON, pas le schéma. Si le LLM renvoie `{"score":"high"}` → notre parsing crash sans validation. On clamp + fallback `reasoning: "(invalid LLM output)"` au lieu de throw                     |
| D5  | Cost fallback : si `usage.cost` absent, estimer via tokens                           | OpenRouter peut omettre `cost` selon le modèle/route. Tableau hard-coded de prix par modèle pour les modèles default (`anthropic/claude-haiku-4.5`). Sinon `cost: 0` + log warning                                                                                 |
| D6  | Query "signaux non scorés" en SQL Postgres explicit (pas `not('id','in',...)`)       | La syntaxe `not('id','in',...)` du SDK supabase-js est fragile (sub-query string injection-like). Solution : RPC Postgres `unscored_signals(user_id uuid, lim int)` ou requête `NOT EXISTS` via `.rpc()`. Décision V1 : RPC dédiée pour clarté + performance index |
| D7  | Max 100 signaux scorés par run                                                       | Spec d'origine dit `LIMIT 100`. Conservé. À 0.005 €/signal Haiku, 100 signals = 0.5 €/run, sous le budget V1 (1 €/jour)                                                                                                                                            |
| D8  | Concurrency 5 sur llm-score                                                          | OpenRouter limite ~10 req/s par account selon plan. 5 concurrent en parallèle = ~5 req/s sustained, marge de sécurité                                                                                                                                              |
| D9  | Pas de retry sur llm-score (V1)                                                      | Si OpenRouter timeout / erreur / rate-limit → signal reste unscored, prochain run le rattrape. Évite le retry storm                                                                                                                                                |
| D10 | `max_tokens: 200` (du spec d'origine)                                                | 200 tokens = ~150 mots, suffisant pour `{score, reasoning}` court. Si LLM produit plus → JSON peut être tronqué → catch parse error                                                                                                                                |
| D11 | Truncate `raw_payload` à 4000 chars dans le prompt (du spec d'origine)               | Évite de blow up le contexte sur des selftexts Reddit massifs. Suffit pour le scoring                                                                                                                                                                              |
| D12 | `OPENROUTER_API_KEY` en secret obligatoire — fail fast au démarrage si absent        | Sans clé, la function 500 tout le temps. Mieux vaut 500 explicite "missing OPENROUTER_API_KEY" que échec opaque dans le SDK                                                                                                                                        |
| D13 | Frontend (Task 09) appelle uniquement `run-pipeline`, jamais `llm-score` directement | `llm-score` est interne pipeline. Garde l'API simple côté frontend. CORS de `llm-score` peut donc être `same-origin` strict en V1.1                                                                                                                                |

### Secret OpenRouter

Setup local :

```bash
echo 'OPENROUTER_API_KEY=sk-or-v1-...' >> supabase/.env.local
```

Setup prod (Task 12) :

```bash
bunx supabase secrets set OPENROUTER_API_KEY="sk-or-v1-..."
```

Pour valider Task 07 en local, **Xavier doit fournir une clé OpenRouter valide** (la sienne perso, pas committée). Coût max validation : ~50 signaux × Haiku = ~0.10 € pour les smoke tests.

### RPC Postgres pour signaux non scorés

Migration additionnelle `20260430000005_unscored_signals_rpc.sql` :

```sql
CREATE OR REPLACE FUNCTION public.unscored_signals(lim INT DEFAULT 100)
RETURNS TABLE (id UUID)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT s.id
  FROM signals s
  WHERE s.user_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM scores sc
      WHERE sc.signal_id = s.id AND sc.user_id = auth.uid()
    )
  ORDER BY s.scraped_at DESC
  LIMIT lim;
$$;
```

`SECURITY INVOKER` + `auth.uid()` → respecte RLS du caller, pas besoin de `SECURITY DEFINER`. Appel côté Edge Function : `supabase.rpc('unscored_signals', { lim: 100 })`.

### Code `supabase/functions/llm-score/index.ts`

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
const PRICE_FALLBACK_PER_1K: Record<string, { in: number; out: number }> = {
  'anthropic/claude-haiku-4.5': { in: 0.001, out: 0.005 },
  'openrouter/auto': { in: 0.002, out: 0.006 },
}

interface RequestBody {
  signal_id: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) return json({ error: 'missing_openrouter_key' }, 500)

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: 'missing_authorization' }, 401)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ error: 'invalid_token' }, 401)

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!body.signal_id || typeof body.signal_id !== 'string') {
    return json({ error: 'signal_id_required' }, 400)
  }

  const [signalRes, settingsRes] = await Promise.all([
    supabase.from('signals').select('*').eq('id', body.signal_id).single(),
    supabase.from('settings').select('*').eq('user_id', user.id).single(),
  ])
  if (signalRes.error || !signalRes.data) return json({ error: 'signal_not_found' }, 404)
  if (settingsRes.error || !settingsRes.data) return json({ error: 'settings_not_found' }, 404)

  const signal = signalRes.data
  const settings = settingsRes.data

  const prompt = `${settings.prompt_scoring}

Signal:
Source: ${signal.source}
Title: ${signal.title ?? '(no title)'}
Payload: ${JSON.stringify(signal.raw_payload).slice(0, 4000)}

Réponds en JSON strict : {"score": <0-100>, "reasoning": "<1 phrase>"}`

  const client = new OpenAI({
    baseURL: OPENROUTER_BASE,
    apiKey,
    defaultHeaders: {
      'HTTP-Referer': 'https://zlatan-scrap.local',
      'X-Title': 'zlatan-scrap',
    },
  })

  let completion
  try {
    completion = await client.chat.completions.create({
      model: settings.model_scoring,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 200,
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await supabase.from('logs').insert({
      user_id: user.id,
      action: 'llm:score',
      status: 'error',
      payload: { signal_id: body.signal_id, error: reason },
    })
    return json({ error: 'openrouter_failed', detail: reason }, 502)
  }

  const raw = completion.choices[0]?.message?.content ?? '{}'
  const { score, reasoning } = parseScoreResponse(raw)

  const usage = completion.usage as
    | { prompt_tokens?: number; completion_tokens?: number; cost?: number }
    | undefined
  const promptTokens = usage?.prompt_tokens ?? 0
  const completionTokens = usage?.completion_tokens ?? 0
  const cost = usage?.cost ?? estimateCost(settings.model_scoring, promptTokens, completionTokens)

  const [scoreInsert, costInsert] = await Promise.all([
    supabase.from('scores').upsert(
      {
        signal_id: body.signal_id,
        user_id: user.id,
        score,
        reasoning,
        model_used: settings.model_scoring,
        cost,
      },
      { onConflict: 'signal_id,user_id' },
    ),
    supabase.from('llm_costs').insert({
      user_id: user.id,
      task: 'scoring',
      model: settings.model_scoring,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost,
    }),
  ])
  if (scoreInsert.error || costInsert.error) {
    await supabase.from('logs').insert({
      user_id: user.id,
      action: 'llm:score',
      status: 'error',
      payload: {
        signal_id: body.signal_id,
        score_err: scoreInsert.error?.message,
        cost_err: costInsert.error?.message,
      },
    })
    return json({ error: 'db_write_failed' }, 500)
  }

  return json({ signal_id: body.signal_id, score, reasoning, cost }, 200)
})

function parseScoreResponse(raw: string): { score: number; reasoning: string } {
  try {
    const parsed = JSON.parse(raw)
    const rawScore = Number(parsed.score)
    const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, rawScore)) : 0
    const reasoning =
      typeof parsed.reasoning === 'string' ? parsed.reasoning.slice(0, 1000) : '(no reasoning)'
    return { score, reasoning }
  } catch {
    return { score: 0, reasoning: '(invalid LLM output)' }
  }
}

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const price = PRICE_FALLBACK_PER_1K[model]
  if (!price) return 0
  return (promptTokens * price.in + completionTokens * price.out) / 1000
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
```

### Code `supabase/functions/run-pipeline/index.ts`

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SCORE_LIMIT = 100
const SCORE_CONCURRENCY = 5

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const startedAt = Date.now()

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: 'missing_authorization' }, 401)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ error: 'invalid_token' }, 401)

  const { data: settings, error: settingsErr } = await supabase
    .from('settings')
    .select('*')
    .eq('user_id', user.id)
    .single()
  if (settingsErr || !settings) return json({ error: 'settings_not_found' }, 404)

  const base = Deno.env.get('SUPABASE_URL')!
  const headers = { Authorization: auth, 'Content-Type': 'application/json' }

  await supabase.from('logs').insert({
    user_id: user.id,
    action: 'pipeline:run',
    status: 'start',
    payload: {},
  })

  // Phase 1 — scrape parallèle (X best-effort)
  const scrapePromises = [
    callScraper('scraper-reddit', { subs: settings.reddit_subs ?? [] }, base, headers),
    callScraper('scraper-arxiv', { categories: settings.arxiv_categories ?? [] }, base, headers),
    callScraper('scraper-x', { queries: settings.x_queries ?? [] }, base, headers),
  ]
  const scrapeResults = await Promise.allSettled(scrapePromises)
  const scrapeSummary = scrapeResults.map((r, i) => ({
    name: ['reddit', 'arxiv', 'x'][i],
    status: r.status,
    value: r.status === 'fulfilled' ? r.value : null,
    reason: r.status === 'rejected' ? String(r.reason) : null,
  }))

  // Phase 2 — signaux non scorés (RPC)
  const { data: unscored, error: rpcErr } = await supabase.rpc('unscored_signals', {
    lim: SCORE_LIMIT,
  })
  if (rpcErr) {
    await supabase.from('logs').insert({
      user_id: user.id,
      action: 'pipeline:run',
      status: 'error',
      payload: { phase: 'unscored_query', error: rpcErr.message },
    })
    return json({ error: 'unscored_query_failed', detail: rpcErr.message }, 500)
  }

  const ids = (unscored ?? []).map((r: { id: string }) => r.id)

  // Phase 3 — score concurrency 5
  let scored = 0
  let failed = 0
  for (let i = 0; i < ids.length; i += SCORE_CONCURRENCY) {
    const batch = ids.slice(i, i + SCORE_CONCURRENCY)
    const results = await Promise.allSettled(
      batch.map((id) =>
        fetch(`${base}/functions/v1/llm-score`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ signal_id: id }),
        }).then(async (r) => {
          if (!r.ok) throw new Error(`http_${r.status}`)
          return r.json()
        }),
      ),
    )
    scored += results.filter((r) => r.status === 'fulfilled').length
    failed += results.filter((r) => r.status === 'rejected').length
  }

  const durationMs = Date.now() - startedAt

  await supabase.from('logs').insert({
    user_id: user.id,
    action: 'pipeline:run',
    status: 'ok',
    payload: { scrape: scrapeSummary, scored, failed, total: ids.length, duration_ms: durationMs },
  })

  return json(
    { scrape: scrapeSummary, scored, failed, total: ids.length, duration_ms: durationMs },
    200,
  )
})

async function callScraper(
  name: string,
  body: unknown,
  base: string,
  headers: Record<string, string>,
): Promise<unknown> {
  const r = await fetch(`${base}/functions/v1/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${name}_http_${r.status}`)
  return await r.json()
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
```

## Implementation steps

### Phase 1 — Migration RPC unscored_signals (10 min)

1. Créer `supabase/migrations/20260430000005_unscored_signals_rpc.sql` avec la fonction PG ci-dessus.
2. `bunx supabase db reset` (idempotent — applique toutes les migrations from scratch).
3. Vérifier dans Studio : Database → Functions → `unscored_signals` listée.

### Phase 2 — Edge Function llm-score (40 min)

1. `mkdir -p supabase/functions/llm-score`
2. Créer `index.ts` + `README.md`.
3. Ajouter `OPENROUTER_API_KEY=sk-or-v1-...` dans `supabase/.env.local` (gitignored, fourni par Xavier).
4. `bunx supabase functions serve llm-score --env-file supabase/.env.local --no-verify-jwt`

### Phase 3 — Smoke test llm-score (20 min)

1. Récup JWT Alice (depuis tests Tasks 04/05 — réutiliser via signin).
2. Récup un `signal_id` Alice via PostgREST.
3. Curl :
   ```bash
   curl -X POST http://127.0.0.1:54321/functions/v1/llm-score \
     -H "Authorization: Bearer $JWT" \
     -H "Content-Type: application/json" \
     -d "{\"signal_id\":\"$SID\"}"
   ```
4. Attendu : `{signal_id, score: 0-100, reasoning: "...", cost: 0.000xxx}`.
5. Vérifier table `scores` (1 ligne) + `llm_costs` (1 ligne).
6. Re-run même `signal_id` → upsert (pas d'erreur).

### Phase 4 — Edge Function run-pipeline (40 min)

1. `mkdir -p supabase/functions/run-pipeline`
2. Créer `index.ts` + `README.md`.
3. Stop le serve précédent + relancer en mode `--all` ou serve toutes les functions :
   ```bash
   bunx supabase functions serve --env-file supabase/.env.local --no-verify-jwt
   ```
   (sans nom de function = serve toutes celles présentes dans `supabase/functions/*/`)

### Phase 5 — Smoke test run-pipeline (30 min)

1. Curl `run-pipeline` avec JWT Alice :
   ```bash
   curl -X POST http://127.0.0.1:54321/functions/v1/run-pipeline \
     -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" -d '{}'
   ```
2. Attendu (réponse) :
   ```json
   {
     "scrape": [
       {"name":"reddit","status":"fulfilled","value":{...}},
       {"name":"arxiv","status":"fulfilled","value":{...}},
       {"name":"x","status":"rejected","reason":"scraper-x_http_404"}
     ],
     "scored": 50,
     "failed": 0,
     "total": 50,
     "duration_ms": 60000-90000
   }
   ```
3. Vérifier dans Studio :
   - `scores` table : ≥ 50 lignes pour Alice
   - `llm_costs` table : ≥ 50 lignes (1 par scoring)
   - `logs` table : entrées `pipeline:run` start + end
4. Vérifier coût total : `SELECT SUM(cost) FROM llm_costs WHERE user_id=$alice` — doit être < 0.20 €.

### Phase 6 — Tests négatifs + edge cases (20 min)

- ❌ `llm-score` sans Authorization → 401
- ❌ `llm-score` avec `signal_id` d'un autre user → 404 (RLS bloque la lecture)
- ❌ `llm-score` avec `signal_id` invalide UUID → 404
- ❌ `OPENROUTER_API_KEY` absent (env vide) → 500 `missing_openrouter_key`
- ❌ `run-pipeline` sans Authorization → 401
- ✅ `run-pipeline` quand 0 signaux non scorés → `scored: 0, total: 0`

### Phase 7 — Vérif RLS isolation 2 users (10 min)

1. Bob run pipeline → score uniquement ses signaux (cs.LG depuis Task 05).
2. Alice ne voit pas les scores de Bob :
   ```bash
   curl "http://127.0.0.1:54321/rest/v1/scores?select=count" -H "apikey: $PUBKEY" -H "Authorization: Bearer $JWT_ALICE"
   # → uniquement les siens
   ```

### Phase 8 — Cleanup + commit (10 min)

1. Stop functions serve.
2. `git status` — attendu :
   - `supabase/functions/llm-score/` (CREATE)
   - `supabase/functions/run-pipeline/` (CREATE)
   - `supabase/migrations/20260430000005_unscored_signals_rpc.sql` (CREATE)
   - `specs/done/07-llm-score-pipeline.md` (MOVE)
3. `/XD-validate` — typecheck/lint/tests/build verts.
4. `/XD-commit --split` :
   - Commit 1 : `chore(db): add unscored_signals RPC for pipeline`
   - Commit 2 : `feat(scraper): edge functions llm-score + run-pipeline (task 07)`

## Test strategy

| Niveau             | Quoi                | Comment                                               |
| ------------------ | ------------------- | ----------------------------------------------------- |
| Compile            | tsconfig Deno (LSP) | OK si VSCode Deno extension                           |
| Lint               | eslint front isolé  | OK (warning attendu sur `supabase/functions/**`)      |
| Smoke llm-score    | Phase 3             | curl + DB checks                                      |
| Smoke run-pipeline | Phase 5             | curl + DB checks                                      |
| RLS                | Phase 7             | 2 users, isolation totale                             |
| Budget             | Phase 5             | `SUM(cost) < 0.20€` sur 50 signaux Haiku              |
| Failure modes      | Phase 6             | OpenRouter absent, signal cross-user, settings absent |

## Success criteria (acceptance grep-testable)

- [ ] `ls supabase/functions/llm-score/index.ts supabase/functions/run-pipeline/index.ts` existent.
- [ ] `bunx supabase functions serve --env-file supabase/.env.local --no-verify-jwt` démarre les 4 functions sans erreur.
- [ ] `psql -c "SELECT proname FROM pg_proc WHERE proname='unscored_signals'"` retourne 1 ligne (RPC créée).
- [ ] `curl llm-score -d '{"signal_id":"$SID"}'` → 200 avec `score >= 0 && score <= 100`, `reasoning` non vide, `cost > 0`.
- [ ] `SELECT count(*) FROM scores WHERE user_id=$alice` ≥ 1 après smoke test.
- [ ] `SELECT count(*) FROM llm_costs WHERE user_id=$alice AND task='scoring'` ≥ 1.
- [ ] `curl run-pipeline -d '{}'` → 200, `duration_ms < 120000` (sub-2min).
- [ ] `SELECT SUM(cost) FROM llm_costs WHERE user_id=$alice` < 0.20 € sur 50 signaux Haiku.
- [ ] `scrape[2].status === 'rejected'` (X scraper absent → géré gracieusement, dérogation D1).
- [ ] `grep -r "SUPABASE_SERVICE_ROLE_KEY" supabase/functions/llm-score/ supabase/functions/run-pipeline/` → vide.
- [ ] `grep -r "console.log" supabase/functions/llm-score/ supabase/functions/run-pipeline/` → vide.
- [ ] User Bob : `curl /rest/v1/scores -H "Authorization: Bearer $JWT_BOB"` ne retourne aucun score d'Alice.

## Risques & décisions

| Risque                                                         | Mitigation                                                                                                                                                                                    |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenRouter timeout / 5xx**                                   | Try/catch bloc autour de `chat.completions.create` → 502 propre + log error. Signal reste non scoré, prochain run retente                                                                     |
| **LLM renvoie JSON malformé**                                  | `parseScoreResponse` catch JSON.parse + clamp score 0-100 + fallback `reasoning: "(invalid LLM output)"`. Pas de crash                                                                        |
| **Coût explose** (modèle premium par erreur)                   | Pas d'enforcement V1 (D5 Non-Goal). Mitigation passive : `max_tokens: 200` cap la réponse. Surveiller `SUM(llm_costs.cost) WHERE day=today`                                                   |
| **Pipeline timeout > 150s (Edge Function default)**            | 100 signaux × 5 concurrency × ~1s/signal = ~20s + scrape ~10s = ~30s. Marge confortable. Si > 100 signaux, prochain run vide la queue                                                         |
| **RPC `unscored_signals` non IMMUTABLE**                       | Marquée `STABLE` (lecture seule, dépendance auth.uid()). Pas d'index dessus, pas de problème                                                                                                  |
| **Concurrency 5 dépasse OpenRouter rate-limit free tier**      | Free tier OpenRouter = 20 req/min. 5 concurrent en boucle séquentielle batch ≈ 5-10 req/s burst → peut tripper 429. V1 : si ça arrive, descendre `SCORE_CONCURRENCY` à 3. À monitorer Phase 5 |
| **Settings vide pour user (init_user_settings trigger raté)**  | Spec Task 02 a un `INSERT ... ON CONFLICT DO NOTHING` au signup. Si raté → run-pipeline retourne 404 `settings_not_found` proprement                                                          |
| **`scraper-x` exists but always fails** (Task 06 future bugué) | `Promise.allSettled` isole. La rejection est loggée, pipeline continue Reddit + Arxiv                                                                                                         |
| **Cost = 0 sur certains modèles OpenRouter**                   | `estimateCost` fallback table. Si modèle inconnu → cost: 0 + `llm_costs` ligne quand même créée pour tracker tokens. Risque V1 : faux 0 € en monitoring si modèle hors table                  |
| **Re-score involontaire**                                      | Query `unscored_signals` filtre `NOT EXISTS scores` → un signal déjà scoré n'est jamais re-soumis. Idempotent au sens "rien ne se passe au 2ème run"                                          |

**RISK V1.1 — Sentry** : si le pipeline crash entre `scrape` ok et `score` start, le `pipeline:run end` log n'est jamais écrit. Visible uniquement via `bunx supabase functions logs run-pipeline`. À monitorer.

## Fichiers modifiés / créés

| Path                                                                          | Action                                             |
| ----------------------------------------------------------------------------- | -------------------------------------------------- |
| `supabase/migrations/20260430000005_unscored_signals_rpc.sql`                 | **CREATE**                                         |
| `supabase/functions/llm-score/index.ts`                                       | **CREATE**                                         |
| `supabase/functions/llm-score/README.md`                                      | **CREATE**                                         |
| `supabase/functions/run-pipeline/index.ts`                                    | **CREATE**                                         |
| `supabase/functions/run-pipeline/README.md`                                   | **CREATE**                                         |
| `supabase/.env.local`                                                         | **EDIT** (ajout `OPENROUTER_API_KEY`) — gitignored |
| `specs/todo/07-llm-score-pipeline.md` → `specs/done/07-llm-score-pipeline.md` | **MOVE**                                           |

## Estimation détaillée

| Phase                         | Durée  |
| ----------------------------- | ------ |
| 1. Migration RPC              | 10 min |
| 2. Edge Function llm-score    | 40 min |
| 3. Smoke test llm-score       | 20 min |
| 4. Edge Function run-pipeline | 40 min |
| 5. Smoke test run-pipeline    | 30 min |
| 6. Tests négatifs             | 20 min |
| 7. RLS verify 2 users         | 10 min |
| 8. Cleanup + commit split     | 10 min |
| **Tampon debug OpenRouter**   | 20 min |
| **Total**                     | **3h** |

Cohérent estimation source (3h). Tampon orienté OpenRouter (1ère intégration LLM réelle dans le projet, friction probable sur réponse `usage.cost` selon modèle).

## Note pour parallélisation Task 08

Tâche 08 (Layout + Sidebar + BrandedHeader) peut tourner en parallèle dans un worktree séparé :

- Task 07 touche : `supabase/functions/{llm-score,run-pipeline}/`, `supabase/migrations/20260430000005_*.sql`, `supabase/.env.local`.
- Task 08 touchera : `src/components/layout/`, `src/App.tsx`, possiblement `src/routes.tsx` pour intégration.

**Aucun chevauchement de fichier**. Merge propre garanti tant que Task 08 ne modifie pas `supabase/`.
