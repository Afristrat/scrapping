# Spec — Edge Function `scraper-reddit`

**Task source** : `~/.claude/output/projects/zlatan-scrap/tasks/04-scraper-reddit.md`
**Estimation** : 2h · **Bloque** : 07 (orchestrator) · **Bloqué par** : 02 (DB+RLS, fait)
**Owner contexte** : Amine dans le plan d'origine — exécution locale par Xavier.

## Problème & Objectifs

Premier scraper opérationnel du pipeline. On veut une Edge Function Deno qui :

1. Reçoit un POST authentifié (JWT user dans `Authorization`).
2. Lit la liste de subreddits cibles depuis le body : `{ subs: string[] }` (max 5).
3. Pour chaque sub, fetch `https://www.reddit.com/r/<sub>/hot.json?limit=25` en respectant le rate-limit Reddit (User-Agent obligatoire + 1.2s entre fetchs).
4. Upserte chaque post dans `signals` avec `onConflict: user_id,source,external_id` (idempotence).
5. Loggue 1 ligne `start` au début, 1 ligne `ok|error` par sub, 1 ligne `ok` finale agrégée → table `logs` (purgée < 24h par pg_cron de Task 02).
6. Réponse JSON `{ fetched: N, inserted: M, errors: [...] }`.

Contrainte forte : **JAMAIS** utiliser `SUPABASE_SERVICE_ROLE_KEY` côté Edge Function. Le client Supabase est instancié avec l'anon key + JWT user en header → RLS user-scoped automatique (rule `supabase.md`).

### Pourquoi maintenant

Bloque Task 07 (`run-pipeline` orchestrator). Sans au moins un scraper opérationnel, le pipeline n'a rien à scorer → bloque Task 09 (dashboard).

## Non-Goals

- ❌ Scoring LLM — c'est Task 07 (`llm-score`), pas ici.
- ❌ Lecture de `settings.reddit_subs` côté Edge Function — pour V1, le caller (orchestrator Task 07 ou test manuel) passe les `subs` explicitement dans le body. Évite de coupler ce scraper aux `settings` et garde la fonction stateless.
- ❌ Scheduling auto — pas de `pg_cron` vers cette function en V1 (la spec archi le marque "optionnel V1", on ne l'active pas dans cette task).
- ❌ Helpers `_shared/cors.ts` ou `_shared/auth.ts` — sera factoré en Task 07 quand 3 scrapers existent. Ici on garde la function self-contained.
- ❌ Tests deno (`deno test`) avec mocks fetch — over-kill V1, smoke test via curl suffit. Tests unitaires frontend non concernés.
- ❌ Realtime / streaming de signaux — réponse one-shot.
- ❌ Pagination Reddit (after/before) — V1 = top 25 hot, point.

## Approche technique

### Structure fichiers

```
supabase/functions/scraper-reddit/
  index.ts          # Deno.serve + logique scraping
  deno.json         # imports map (optionnel, supabase CLI pose un default)
  README.md         # doc curl + secrets requis (court)
```

### Flow

```
POST /functions/v1/scraper-reddit
  body: { subs: string[] }
  headers: { Authorization: "Bearer <user JWT>" }

  1. Preflight OPTIONS → CORS headers + 204
  2. Parse JSON body, valider {subs: string[]} non vide, slice(0,5)
  3. Créer client Supabase scopé JWT user (RLS active)
  4. supabase.auth.getUser() → si null → 401
  5. Insert log start (user_id, action='scrape:reddit', status='start', payload={subs})
  6. Pour chaque sub :
       - fetch reddit avec User-Agent
       - parse json.data.children
       - map → row {user_id, source:'reddit', external_id, url, title, raw_payload}
       - upsert signals (onConflict, ignoreDuplicates: false → on veut le count)
       - sleep 1200ms
       - log ok|error par sub
  7. Insert log end agrégé
  8. Response { fetched, inserted, errors }
```

### Décisions clés (vs spec d'origine)

| #   | Décision                                                      | Justification                                                                                                                                                     |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Garder la spec ts du task source quasi-identique              | Code déjà revu par l'auteur PRD, simple, idiomatique Deno                                                                                                         |
| D2  | Ajouter handler OPTIONS + headers CORS                        | Frontend Vite dev (localhost:5173) appelle l'Edge Function en cross-origin (port 54321) → préflight obligatoire                                                   |
| D3  | CORS V1 = `Access-Control-Allow-Origin: *` (dev)              | Pas d'URL Vercel encore (Task 12). Resserrer en Task 12 avant prod                                                                                                |
| D4  | `ignoreDuplicates: false` au lieu de `true` (spec d'origine)  | Permet de distinguer `fetched` (lignes envoyées) vs `inserted` (vraies créations). Important pour acceptance "Re-run → upsert sans erreur" + monitoring lisible   |
| D5  | Renvoyer `{fetched, inserted, errors[]}` au lieu de `{count}` | Voir D4. `errors` est tableau de `{sub, reason}` pour debug rapide                                                                                                |
| D6  | Log `start` au début + log par sub + log `ok` final           | Aligné archi.md "1 ligne au début (status='start') et 1 à la fin". Spec d'origine ne loggait que la fin → on respecte l'archi                                     |
| D7  | User-Agent depuis env, fallback sécurisé                      | `Deno.env.get('REDDIT_USER_AGENT')` ; si absent → fallback `zlatan-scrap/0.1` mais log warning. Reddit 429 si UA manquant ou trop générique                       |
| D8  | `subs.slice(0, 5)` hard-cap                                   | Rate limit 60req/min Reddit. 5 subs × 1.2s = 6s, marge confortable. Si user envoie plus → silently truncate (V1) — log payload contiendra la liste réelle traitée |
| D9  | Pas de `_shared/` pour V1                                     | Factor en Task 07 quand 3 scrapers existeront. Évite refactor pré-maturé                                                                                          |
| D10 | `external_id` = `p.id` brut Reddit (ex: `1abc23`)             | Unique dans Reddit + scopé `(user_id, source)` → safe. Pas de sanitization nécessaire (charset Reddit ASCII)                                                      |

### Code complet (à écrire dans `supabase/functions/scraper-reddit/index.ts`)

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface RedditPost {
  id: string
  permalink: string
  title: string
  score: number
  subreddit: string
  selftext: string
  author: string
  created_utc: number
}

interface RequestBody {
  subs: string[]
}

Deno.serve(async (req) => {
  // Preflight
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  // Auth
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'missing_authorization' }, 401)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) return json({ error: 'invalid_token' }, 401)

  // Body
  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!Array.isArray(body.subs) || body.subs.length === 0) {
    return json({ error: 'subs_required', detail: 'body.subs must be a non-empty string[]' }, 400)
  }

  const subs = body.subs.slice(0, 5)
  const userAgent = Deno.env.get('REDDIT_USER_AGENT') ?? 'zlatan-scrap/0.1'

  let fetched = 0
  let inserted = 0
  const errors: Array<{ sub: string; reason: string }> = []

  // Log start
  await supabase.from('logs').insert({
    user_id: user.id,
    action: 'scrape:reddit',
    status: 'start',
    payload: { subs },
  })

  for (const sub of subs) {
    try {
      const resp = await fetch(
        `https://www.reddit.com/r/${encodeURIComponent(sub)}/hot.json?limit=25`,
        {
          headers: { 'User-Agent': userAgent },
        },
      )
      if (!resp.ok) {
        errors.push({ sub, reason: `http_${resp.status}` })
        await supabase.from('logs').insert({
          user_id: user.id,
          action: 'scrape:reddit',
          status: 'error',
          payload: { sub, http_status: resp.status },
        })
        continue
      }
      const json = (await resp.json()) as { data: { children: Array<{ data: RedditPost }> } }
      const posts = json.data.children.map((c) => c.data)
      const rows = posts.map((p) => ({
        user_id: user.id,
        source: 'reddit' as const,
        external_id: p.id,
        url: `https://reddit.com${p.permalink}`,
        title: p.title,
        raw_payload: {
          score: p.score,
          subreddit: p.subreddit,
          selftext: p.selftext,
          author: p.author,
          created_utc: p.created_utc,
        },
      }))
      fetched += rows.length

      const { data: upserted, error: upErr } = await supabase
        .from('signals')
        .upsert(rows, { onConflict: 'user_id,source,external_id', ignoreDuplicates: false })
        .select('id')
      if (upErr) throw upErr
      inserted += upserted?.length ?? 0

      await supabase.from('logs').insert({
        user_id: user.id,
        action: 'scrape:reddit',
        status: 'ok',
        payload: { sub, fetched: rows.length, returned: upserted?.length ?? 0 },
      })

      await new Promise((r) => setTimeout(r, 1200))
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      errors.push({ sub, reason })
      await supabase.from('logs').insert({
        user_id: user.id,
        action: 'scrape:reddit',
        status: 'error',
        payload: { sub, error: reason },
      })
    }
  }

  // Log end
  await supabase.from('logs').insert({
    user_id: user.id,
    action: 'scrape:reddit',
    status: 'ok',
    payload: { fetched, inserted, errors_count: errors.length, subs },
  })

  return json({ fetched, inserted, errors }, 200)
})

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
```

### Note sur `inserted` count

Avec `ignoreDuplicates: false` + `.select('id')`, supabase-js retourne **toutes** les lignes (insérées + déjà présentes mises à jour). Comportement exact :

- Si une row existe déjà (clash sur `user_id,source,external_id`), `upsert` la met à jour (réécrit `raw_payload`, etc.) et la retourne.
- Donc `inserted` = "lignes affectées" plutôt que "lignes créées".

V1 acceptable — c'est suffisant pour le monitoring. Si on veut le vrai delta de créations en V1.1, ajouter une colonne `created_at` séparée de `scraped_at` et comparer (out of scope V1).

## Implementation steps

### Phase 1 — Setup function (10 min)

1. `mkdir -p supabase/functions/scraper-reddit`
2. Créer `supabase/functions/scraper-reddit/index.ts` avec le code complet ci-dessus.
3. (Optionnel) `supabase/functions/scraper-reddit/README.md` — 1 paragraphe doc curl + secrets.
4. Vérifier que le folder `supabase/functions/` est bien dans `.gitignore` exception (PAS gitignored — il doit être versionné).

### Phase 2 — Secrets (5 min)

1. Créer un Reddit username technique si inexistant (ou utiliser le perso de Xavier).
2. Local : ajouter dans `supabase/.env.local` (NON committé, gitignore vérifié) :
   ```
   REDDIT_USER_AGENT=zlatan-scrap/0.1 by /u/xavieraisol
   ```
3. Pour le déploiement (V1 Task 12) : `bunx supabase secrets set REDDIT_USER_AGENT="zlatan-scrap/0.1 by /u/xavieraisol"`.
4. **Ne pas committer** le username Reddit perso dans le repo.

### Phase 3 — Lancer Supabase local + serve (10 min)

1. `bunx supabase start` (si pas déjà tourné) — démarre Postgres + Auth + Storage local.
2. `bunx supabase db reset` — applique migrations 01→04 + seed (idempotent).
3. Dans un autre terminal : `bunx supabase functions serve scraper-reddit --env-file supabase/.env.local --no-verify-jwt`
   - `--no-verify-jwt` car on veut tester avec un JWT user, pas le service role. La function appelle `auth.getUser()` qui valide le JWT côté Supabase de toute façon.
4. Vérifier : `curl http://localhost:54321/functions/v1/scraper-reddit` → 401 (sans auth header) attendu.

### Phase 4 — Smoke test manuel (15 min)

1. Créer un user test via l'UI locale Supabase Studio (`http://localhost:54323`) :
   - Auth → Add user → email magique simulé.
   - Récupérer le JWT user (ou via `supabase.auth.signInWithPassword` côté SQL/curl).
2. Alternative plus simple : passer par le frontend Vite (`bun dev`), s'auth, puis copier le `access_token` depuis `localStorage` (clé `sb-localhost-auth-token`).
3. Curl :
   ```bash
   USER_JWT="eyJ..."
   curl -X POST http://localhost:54321/functions/v1/scraper-reddit \
     -H "Authorization: Bearer $USER_JWT" \
     -H "Content-Type: application/json" \
     -d '{"subs":["LocalLLaMA"]}'
   ```
4. Attendu : `{"fetched":25,"inserted":25,"errors":[]}` (1er run).
5. Re-run identique → `{"fetched":25,"inserted":25,"errors":[]}` (idempotent — upsert update les lignes, pas d'erreur).
6. Vérifier dans Studio :
   - Table `signals` : 25 lignes avec `source='reddit'`, `user_id=<test user>`.
   - Table `logs` : ≥ 3 lignes (`start` + 1 par sub + `end`).

### Phase 5 — Vérifier RLS user-scoped (10 min)

1. Créer un 2e user test (`alice@test.local`) via Studio.
2. Avec son JWT à elle, requête : `SELECT * FROM signals` → 0 lignes (RLS bloque).
3. Run scraper-reddit avec son JWT sur sub `news` → ses propres signals créés.
4. Re-vérifier user 1 : ne voit que ses LocalLLaMA, pas les `news` d'Alice. ✅

### Phase 6 — Tests négatifs (10 min)

Acceptance grep-testable, à passer manuellement :

- ❌ Sans header `Authorization` → `{"error":"missing_authorization"}` 401.
- ❌ JWT invalide → `{"error":"invalid_token"}` 401.
- ❌ Body non-JSON (`-d 'plop'`) → `{"error":"invalid_json"}` 400.
- ❌ Body sans `subs` (`-d '{}'`) → `{"error":"subs_required",...}` 400.
- ❌ Body `{"subs":[]}` → 400 (vide rejeté).
- ✅ Body `{"subs":["LocalLLaMA","MachineLearning","singularity","existe_pas_xyz"]}` → 3 ok + 1 error 404 dans le tableau `errors`.

### Phase 7 — Cleanup + commit (10 min)

1. `bunx supabase functions stop` ou `Ctrl-C`.
2. `bunx supabase stop` si on s'arrête.
3. Vérifier `git status` :
   - **Ajouts attendus** : `supabase/functions/scraper-reddit/index.ts`, `supabase/functions/scraper-reddit/README.md`.
   - **PAS de `.env.local`** dans le diff (gitignore).
4. Run `/XD-validate` — typecheck + lint + tests + build du frontend, doit rester vert (Edge Functions Deno isolées du tsconfig front).
5. `/XD-commit` :

   ```
   feat(scraper): edge function scraper-reddit (task 04)

   - POST /functions/v1/scraper-reddit avec JWT user (RLS scoped)
   - fetch top 25 hot posts × N subs (max 5), 1.2s rate-limit
   - upsert signals (idempotent), logs start/per-sub/end
   - smoke test local OK : LocalLLaMA → 25 inserted, 2e run identique
   ```

6. Spec déplacée `specs/todo/04-scraper-reddit.md` → `specs/done/04-scraper-reddit.md`.

## Test strategy

| Niveau         | Quoi                                        | Comment                                                |
| -------------- | ------------------------------------------- | ------------------------------------------------------ |
| Compile        | tsconfig Deno (LSP VSCode)                  | Si Deno extension installée → 0 erreur dans `index.ts` |
| Lint           | rien (Edge Function isolée du eslint front) | OK                                                     |
| Smoke local    | Phase 4-6 manuelles                         | curl + Studio                                          |
| Idempotence    | Re-run même body, observer `signals` table  | count stable, pas d'erreur                             |
| RLS            | Phase 5                                     | 2 users, isolation totale                              |
| Erreurs Reddit | sub invalide, network down                  | `errors[]` peuplé, status 200 quand même               |

**Pas de tests automatisés Deno** pour V1 (cf. Non-Goals). Si Task 07 introduit `_shared/`, on factorisera + ajoutera tests à ce moment.

## Success criteria (acceptance grep-testable)

- [ ] `ls supabase/functions/scraper-reddit/index.ts` existe.
- [ ] `bunx supabase functions serve scraper-reddit --env-file supabase/.env.local --no-verify-jwt` démarre sans erreur.
- [ ] `curl -X POST http://localhost:54321/functions/v1/scraper-reddit -H "Authorization: Bearer $USER_JWT" -H "Content-Type: application/json" -d '{"subs":["LocalLLaMA"]}'` → réponse 200 avec `inserted >= 1`.
- [ ] Re-run identique → 200, `errors: []`, `signals` table count inchangé.
- [ ] `SELECT count(*) FROM signals WHERE source='reddit' AND user_id=$test_user` ≥ 1.
- [ ] `SELECT count(*) FROM logs WHERE action='scrape:reddit' AND user_id=$test_user` ≥ 3 (start + 1+ ok + end).
- [ ] User B (`auth.uid()` différent) requête `SELECT * FROM signals` → 0 ligne (RLS).
- [ ] `grep -r "SUPABASE_SERVICE_ROLE_KEY" supabase/functions/scraper-reddit/` → vide (jamais utilisée).
- [ ] `grep -r "console.log" supabase/functions/scraper-reddit/` → vide (logger via table `logs`, pas stdout en prod — la rule "pas de console.log en prod" s'applique aussi côté Deno).

## Risques & décisions

| Risque                                                                                  | Mitigation                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reddit 429 / blocage UA générique**                                                   | `REDDIT_USER_AGENT` configuré avec username Reddit réel. Si rate-limit en série → la sleep 1.2s + max 5 subs limite à ~250 req/h, bien sous le seuil 60/min.                                                                            |
| **Reddit retourne HTML au lieu de JSON** (Cloudflare challenge)                         | `resp.json()` throw → catch global → log error, sub skipped. La function reste 200 globalement, frontend voit `errors: [...]`.                                                                                                          |
| **JWT user expiré** (15 min Supabase default)                                           | `auth.getUser()` retourne null → 401 propre. Frontend (Task 09) doit refresh le token avant appel.                                                                                                                                      |
| **`signals.raw_payload` JSONB grossit**                                                 | 25 posts × selftext peut faire ~50KB / sub. 5 subs / run = 250KB / run. Acceptable V1. À monitorer en V2 (truncate selftext > 10KB).                                                                                                    |
| **`logs` non purgés si pg_cron pas actif local**                                        | Local : pg_cron pas actif par défaut (cf. Task 02). Acceptable en dev, prod l'a (vérifié Task 02).                                                                                                                                      |
| **Décision idempotence** : `ignoreDuplicates: false` modifie `raw_payload` à chaque run | Comportement souhaité V1 — un post Reddit peut voir son `score` évoluer, on capture la dernière valeur. Si on voulait préserver la 1ère ingestion, mettre `ignoreDuplicates: true` mais on perd le count. **Tradeoff accepté pour V1**. |
| **CORS `*`**                                                                            | OK V1 dev. Task 12 doit resserrer à l'URL Vercel finale avant prod.                                                                                                                                                                     |
| **Pas de `_shared/`**                                                                   | Code dupliqué attendu en Tasks 05/06. Refactor en Task 07 (orchestrator) quand pattern stabilisé.                                                                                                                                       |

**RISK V1.1 — Sentry / observability** : pas de remontée d'erreur autre que `logs` table. Si une erreur Deno crash la function avant tout `INSERT INTO logs`, elle est silencieuse (visible uniquement via `bunx supabase functions logs`). Acceptable V1 sur 1 user/instance ; envisager Sentry Edge Function en V2.

## Fichiers modifiés / créés

| Path                                                                  | Action                                            |
| --------------------------------------------------------------------- | ------------------------------------------------- |
| `supabase/functions/scraper-reddit/index.ts`                          | **CREATE**                                        |
| `supabase/functions/scraper-reddit/README.md`                         | **CREATE** (court : curl + secrets)               |
| `supabase/.env.local`                                                 | **EDIT** (ajout `REDDIT_USER_AGENT`) — gitignored |
| `specs/todo/04-scraper-reddit.md` → `specs/done/04-scraper-reddit.md` | **MOVE** post-validate                            |

## Estimation détaillée

| Phase                           | Durée  |
| ------------------------------- | ------ |
| 1. Setup files                  | 10 min |
| 2. Secrets                      | 5 min  |
| 3. Supabase local + serve       | 10 min |
| 4. Smoke test manuel            | 15 min |
| 5. RLS verify (2 users)         | 10 min |
| 6. Tests négatifs               | 10 min |
| 7. Cleanup + commit + move spec | 10 min |
| **Tampon debug**                | 50 min |
| **Total**                       | **2h** |

Cohérent avec l'estimation source (2h). Tampon généreux car 1ères Edge Functions du projet → friction Supabase CLI + premier coup de feu Reddit possible.
