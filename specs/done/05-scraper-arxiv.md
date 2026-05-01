# Spec — Edge Function `scraper-arxiv`

**Task source** : `~/.claude/output/projects/zlatan-scrap/tasks/05-scraper-arxiv.md`
**Estimation** : 1h30 · **Bloque** : 07 (orchestrator) · **Bloqué par** : 02 (DB+RLS, fait)
**Owner contexte** : Meydeey dans le plan d'origine — exécution locale par Xavier.

## Problème & Objectifs

Deuxième scraper du pipeline. Edge Function Deno qui :

1. Reçoit un POST authentifié (JWT user dans `Authorization`).
2. Lit la liste de catégories Arxiv depuis le body : `{ categories: string[] }` (max 5).
3. Pour chaque catégorie, fetch `https://export.arxiv.org/api/query?search_query=cat:<cat>&sortBy=submittedDate&sortOrder=descending&max_results=25` en respectant le rate-limit Arxiv (1 req / 3s par leur API guide).
4. Parse l'Atom XML → extrait `id`, `title`, `summary`, `published`, `authors[]`, `categories[]`.
5. Upserte dans `signals` avec `onConflict: user_id,source,external_id` (idempotence). `external_id` = URL canonique Arxiv (ex `http://arxiv.org/abs/2604.12345v1`).
6. Loggue `start` / per-cat / `end` dans table `logs`.
7. Réponse JSON `{ fetched, inserted, errors }`.

Symétrie totale avec `scraper-reddit` (Task 04) : même contrat I/O, mêmes décisions architecturales (CORS, idempotence, logs). Ce qui change : la source de données + le parsing XML au lieu de JSON.

### Pourquoi maintenant

Bloque Task 07 (`run-pipeline` orchestrator) avec Tasks 04+06. Arxiv est la source la plus stable des trois (pas de rate-limit hostile, pas de Cloudflare challenge), donc gros enjeu de fiabilité du pipeline.

## Non-Goals

- ❌ Scoring LLM — Task 07 (`llm-score`).
- ❌ Lecture de `settings.arxiv_categories` côté Edge Function — caller passe `categories` explicitement (cohérence avec Task 04).
- ❌ Scheduling auto — pas de `pg_cron` vers cette function en V1.
- ❌ Helpers `_shared/cors.ts` ou `_shared/auth.ts` — sera factoré en Task 07 quand 3 scrapers existeront. Ici on reste self-contained (assumé duplicate code vs Task 04, factor pré-maturé évité).
- ❌ Recherche full-text Arxiv (`search_query=ti:foo`, `au:bar`) — V1 = filtrage par catégorie uniquement.
- ❌ Pagination Arxiv (`start` param) — V1 = top 25 derniers, point.
- ❌ Tests deno (`deno test`) avec mocks fetch — over-kill V1, smoke test via curl suffit.

## Approche technique

### Structure fichiers

```
supabase/functions/scraper-arxiv/
  index.ts          # Deno.serve + parsing Atom
  README.md         # doc curl + secrets
```

### Flow

```
POST /functions/v1/scraper-arxiv
  body: { categories: string[] }
  headers: { Authorization: "Bearer <user JWT>" }

  1. Preflight OPTIONS → CORS headers + 204
  2. Parse JSON body, valider {categories: string[]} non vide, slice(0,5)
  3. Créer client Supabase scopé JWT user (RLS active)
  4. supabase.auth.getUser() → si null → 401
  5. Insert log start
  6. Pour chaque cat :
       - fetch Arxiv (Atom XML)
       - parse XML (deno-dom)
       - map entries → row {user_id, source:'arxiv', external_id, url, title, raw_payload}
       - upsert signals (onConflict, ignoreDuplicates: false)
       - sleep 3000ms (Arxiv rate-limit recommandé)
       - log ok|error par cat
  7. Insert log end agrégé
  8. Response { fetched, inserted, errors }
```

### Décisions clés

| #   | Décision                                                                       | Justification                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Symétrie complète avec `scraper-reddit` (CORS, idempotence, logs, contrat I/O) | Cohérence pour Task 07 orchestrator + futur factoring `_shared/`                                                                                                           |
| D2  | XML parser : `jsr:@b-fuze/deno-dom` (`DOMParser` natif via WASM)               | Atom XML peut contenir CDATA, namespaces, multi-line — regex fragile. deno-dom est le standard JSR pour Deno Deploy + supabase functions. Léger (~200KB WASM, lazy-loaded) |
| D3  | URL Arxiv en `https://` (vs `http://` du spec d'origine)                       | Évite downgrade attaque, Arxiv supporte les deux mais la doc officielle redirige vers https                                                                                |
| D4  | Sleep 3000ms entre fetchs (vs 1.2s pour Reddit)                                | Arxiv API user manual : "limit your queries to no more than one every three seconds" — respect strict                                                                      |
| D5  | Hard-cap 5 categories (cohérence avec Task 04 max 5 subs)                      | 5 × (fetch + 3s) ~= 15-20s par run, sous le timeout Edge Function (150s default)                                                                                           |
| D6  | `ignoreDuplicates: false` + `.select('id')`                                    | Cohérence Task 04 (D4). Distinguer fetched vs inserted, monitoring lisible                                                                                                 |
| D7  | Logs `start` + per-cat + `end` (cohérence Task 04 D6)                          | Aligné archi.md                                                                                                                                                            |
| D8  | `external_id = entry.id` brut Arxiv (ex `http://arxiv.org/abs/2604.12345v1`)   | C'est l'URL canonique, garantie unique par Arxiv. Pas de transformation = pas de risque de mismatch lors d'un re-scrape                                                    |
| D9  | `url = external_id` (même valeur)                                              | Arxiv `id` est déjà l'URL canonique. Pas de duplication conceptuelle                                                                                                       |
| D10 | `User-Agent` : `zlatan-scrap/0.1` en dur (pas d'env)                           | Arxiv ne pénalise pas les UA génériques (contrairement à Reddit). Pas de secret à sortir de l'env                                                                          |
| D11 | Pas de `_shared/` (cohérence Task 04 D9)                                       | Factor en Task 07. Code volontairement copié/adapté de Task 04                                                                                                             |

### Code complet (à écrire dans `supabase/functions/scraper-arxiv/index.ts`)

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { DOMParser, type Element } from 'jsr:@b-fuze/deno-dom'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ARXIV_API = 'https://export.arxiv.org/api/query'
const USER_AGENT = 'zlatan-scrap/0.1'
const RATE_LIMIT_MS = 3000

interface ArxivEntry {
  id: string
  title: string
  summary: string
  published: string
  authors: string[]
  categories: string[]
}

interface RequestBody {
  categories: string[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

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

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!Array.isArray(body.categories) || body.categories.length === 0) {
    return json(
      { error: 'categories_required', detail: 'body.categories must be a non-empty string[]' },
      400,
    )
  }

  const categories = body.categories.slice(0, 5)

  let fetched = 0
  let inserted = 0
  const errors: Array<{ category: string; reason: string }> = []

  await supabase.from('logs').insert({
    user_id: user.id,
    action: 'scrape:arxiv',
    status: 'start',
    payload: { categories },
  })

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i]
    try {
      const url = `${ARXIV_API}?search_query=cat:${encodeURIComponent(cat)}&sortBy=submittedDate&sortOrder=descending&max_results=25`
      const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
      if (!resp.ok) {
        errors.push({ category: cat, reason: `http_${resp.status}` })
        await supabase.from('logs').insert({
          user_id: user.id,
          action: 'scrape:arxiv',
          status: 'error',
          payload: { category: cat, http_status: resp.status },
        })
        continue
      }
      const xml = await resp.text()
      const entries = parseAtomEntries(xml)
      const rows = entries.map((e) => ({
        user_id: user.id,
        source: 'arxiv' as const,
        external_id: e.id,
        url: e.id,
        title: e.title,
        raw_payload: {
          summary: e.summary,
          published: e.published,
          authors: e.authors,
          categories: e.categories,
        },
      }))
      fetched += rows.length

      if (rows.length > 0) {
        const { data: upserted, error: upErr } = await supabase
          .from('signals')
          .upsert(rows, { onConflict: 'user_id,source,external_id', ignoreDuplicates: false })
          .select('id')
        if (upErr) throw upErr
        inserted += upserted?.length ?? 0
      }

      await supabase.from('logs').insert({
        user_id: user.id,
        action: 'scrape:arxiv',
        status: 'ok',
        payload: { category: cat, fetched: rows.length, returned: rows.length },
      })

      // Rate-limit Arxiv (sauf après le dernier)
      if (i < categories.length - 1) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_MS))
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      errors.push({ category: cat, reason })
      await supabase.from('logs').insert({
        user_id: user.id,
        action: 'scrape:arxiv',
        status: 'error',
        payload: { category: cat, error: reason },
      })
    }
  }

  await supabase.from('logs').insert({
    user_id: user.id,
    action: 'scrape:arxiv',
    status: 'ok',
    payload: { fetched, inserted, errors_count: errors.length, categories },
  })

  return json({ fetched, inserted, errors }, 200)
})

function parseAtomEntries(xml: string): ArxivEntry[] {
  const doc = new DOMParser().parseFromString(xml, 'text/html')
  if (!doc) return []
  // Atom <entry> elements (deno-dom parses as HTML so tag names are lowercased)
  const entries = Array.from(doc.querySelectorAll('entry')) as Element[]
  return entries
    .map((entry) => {
      const id = entry.querySelector('id')?.textContent?.trim() ?? ''
      const title = entry.querySelector('title')?.textContent?.trim().replace(/\s+/g, ' ') ?? ''
      const summary = entry.querySelector('summary')?.textContent?.trim().replace(/\s+/g, ' ') ?? ''
      const published = entry.querySelector('published')?.textContent?.trim() ?? ''
      const authors = Array.from(entry.querySelectorAll('author > name'))
        .map((n) => n.textContent?.trim() ?? '')
        .filter(Boolean)
      const categories = Array.from(entry.querySelectorAll('category'))
        .map((c) => (c as Element).getAttribute('term') ?? '')
        .filter(Boolean)
      return { id, title, summary, published, authors, categories }
    })
    .filter((e) => e.id)
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
```

### Note sur le parsing Atom

Arxiv Atom feed structure :

```xml
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2604.12345v1</id>
    <updated>2026-04-30T12:00:00Z</updated>
    <published>2026-04-30T11:00:00Z</published>
    <title>Some paper title</title>
    <summary>Abstract text...</summary>
    <author><name>Alice Smith</name></author>
    <author><name>Bob Jones</name></author>
    <category term="cs.AI" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
    <link href="http://arxiv.org/abs/2604.12345v1" rel="alternate" type="text/html"/>
  </entry>
  ...
</feed>
```

`DOMParser().parseFromString(xml, 'text/html')` traite le XML comme du HTML (tags lowercased, attributes preserved). C'est suffisant pour nos extractions car on utilise des sélecteurs simples (`entry`, `id`, `title`, `summary`, `published`, `author > name`, `category[term]`).

**Alternative XML-strict** : `parseFromString(xml, 'text/xml')` est supporté par deno-dom mais conserve la casse et les namespaces. Pas nécessaire ici (sélecteurs CSS marchent en HTML mode).

## Implementation steps

### Phase 1 — Setup function (5 min)

1. `mkdir -p supabase/functions/scraper-arxiv`
2. Créer `supabase/functions/scraper-arxiv/index.ts` avec le code complet ci-dessus.
3. Créer `supabase/functions/scraper-arxiv/README.md` — court : curl + format Atom + lien doc Arxiv.

### Phase 2 — Pas de secrets (5 min)

1. Aucun secret nécessaire (User-Agent en dur, pas de clé API Arxiv).
2. Vérifier que `supabase/.env.local` n'a pas besoin d'ajout pour cette function.
3. Le smoke test devra passer `--env-file supabase/.env.local` quand même (cohérence avec Task 04 + supabase functions serve s'attend au fichier).

### Phase 3 — Lancer Supabase local + serve (10 min)

1. `bunx supabase start` (si pas déjà tourné).
2. `bunx supabase db reset` si DB pas en état attendu (tables vides ou stale).
3. `bunx supabase functions serve scraper-arxiv --env-file supabase/.env.local --no-verify-jwt`
4. Vérifier : `curl http://localhost:54321/functions/v1/scraper-arxiv` → 401 (sans auth).

### Phase 4 — Smoke test manuel (15 min)

1. Récupérer un JWT user (réutiliser celui de Task 04 si tjs valide).
2. Curl :
   ```bash
   USER_JWT="eyJ..."
   curl -X POST http://localhost:54321/functions/v1/scraper-arxiv \
     -H "Authorization: Bearer $USER_JWT" \
     -H "Content-Type: application/json" \
     -d '{"categories":["cs.AI"]}'
   ```
3. Attendu : `{"fetched":25,"inserted":25,"errors":[]}` (1er run).
4. Re-run identique → `{"fetched":25,"inserted":25,"errors":[]}` (idempotent).
5. Test multi-cat : `{"categories":["cs.AI","cs.CL"]}` → `fetched: 50` minimum (durée ~6s avec sleep 3s).
6. Vérifier dans Studio :
   - `signals` table : 50 lignes `source='arxiv'`.
   - `signals.external_id` matche `http://arxiv.org/abs/...`.
   - `signals.raw_payload` contient `summary`, `authors[]`, `categories[]`, `published`.
   - `logs` table : ≥ 4 lignes (`start` + 2 ok + `end`).

### Phase 5 — Vérifier RLS user-scoped (5 min)

1. Avec un user B (créé Task 04 phase 5), POST `{"categories":["cs.LG"]}`.
2. Vérifier que user A ne voit que ses signals cs.AI/cs.CL, pas les cs.LG d'user B.
3. `SELECT count(*) FROM signals WHERE user_id=$user_b AND source='arxiv'` ≥ 25.

### Phase 6 — Tests négatifs (10 min)

- ❌ Sans `Authorization` → 401 `missing_authorization`.
- ❌ JWT invalide → 401 `invalid_token`.
- ❌ Body non-JSON → 400 `invalid_json`.
- ❌ `{}` → 400 `categories_required`.
- ❌ `{"categories":[]}` → 400.
- ✅ Catégorie inexistante (`{"categories":["foo.BAR"]}`) → 200 avec `fetched: 0`, pas d'erreur (Arxiv retourne feed vide, pas 404).

### Phase 7 — Cleanup + commit (10 min)

1. `Ctrl-C` sur `functions serve`.
2. `git status` → attendu : 2 nouveaux fichiers + déplacement spec.
3. `/XD-validate` — typecheck/lint/tests/build doivent rester verts (Edge Function isolée du tsconfig front).
4. `/XD-commit` :
   ```
   feat(scraper): edge function scraper-arxiv (task 05)
   ```
5. Spec `specs/todo/05-scraper-arxiv.md` → `specs/done/05-scraper-arxiv.md`.

## Test strategy

| Niveau             | Quoi                                    | Comment                            |
| ------------------ | --------------------------------------- | ---------------------------------- |
| Compile            | tsconfig Deno (LSP)                     | 0 erreur dans `index.ts`           |
| Lint               | rien (Deno isolé eslint front)          | OK                                 |
| Smoke local        | Phase 4-6                               | curl + Studio                      |
| Idempotence        | Re-run même body                        | count signals stable, pas d'erreur |
| RLS                | 2 users, isolation totale               | Phase 5                            |
| Parsing edge cases | Catégorie vide, multi-cat, cat invalide | Phase 6                            |

**Pas de tests automatisés Deno** pour V1 (cf. Non-Goals).

## Success criteria (acceptance grep-testable)

- [ ] `ls supabase/functions/scraper-arxiv/index.ts` existe.
- [ ] `bunx supabase functions serve scraper-arxiv --env-file supabase/.env.local --no-verify-jwt` démarre sans erreur.
- [ ] `curl -X POST http://localhost:54321/functions/v1/scraper-arxiv -H "Authorization: Bearer $USER_JWT" -H "Content-Type: application/json" -d '{"categories":["cs.AI"]}'` → 200 avec `inserted >= 1`.
- [ ] Re-run identique → 200, `errors: []`, count `signals` inchangé.
- [ ] `SELECT count(*) FROM signals WHERE source='arxiv' AND user_id=$test_user` ≥ 1.
- [ ] `SELECT count(*) FROM logs WHERE action='scrape:arxiv' AND user_id=$test_user` ≥ 3 (start + ok + end).
- [ ] `SELECT external_id FROM signals WHERE source='arxiv' LIMIT 1` matche regex `^https?://arxiv\.org/abs/.+`.
- [ ] `SELECT raw_payload->'authors' FROM signals WHERE source='arxiv' LIMIT 1` est un JSON array non vide.
- [ ] User B ne voit aucun signal arxiv d'user A (RLS).
- [ ] `grep -r "SUPABASE_SERVICE_ROLE_KEY" supabase/functions/scraper-arxiv/` → vide.
- [ ] `grep -r "console.log" supabase/functions/scraper-arxiv/` → vide.

## Risques & décisions

| Risque                                                       | Mitigation                                                                                                                                                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Arxiv 503 (downtime occasionnel)**                         | Try/catch global → log error, cat skipped, function reste 200. Frontend voit `errors[]`                                                                                                                                   |
| **Parsing XML cassé** (Arxiv change format Atom)             | `parseAtomEntries` filtre les entries sans `id` (`.filter((e) => e.id)`), évite d'insérer des rows partielles                                                                                                             |
| **deno-dom WASM cold start**                                 | ~150-300ms au 1er parse, négligeable côté Supabase Edge Function (timeout 150s)                                                                                                                                           |
| **`title` ou `summary` avec entités HTML (`&amp;`, `&lt;`)** | deno-dom les décode automatiquement via `textContent`. Test à valider en Phase 4 sur un title complexe                                                                                                                    |
| **Multi-line title/summary**                                 | Normalize via `.replace(/\s+/g, ' ')` après `textContent`. Préserve la lisibilité, n'altère pas le sens                                                                                                                   |
| **Categories list large (Arxiv `cs.*` a 30+ subcats)**       | Hard cap 5 dans le body slice → max 5 catégories par run. Si user veut plus, plusieurs runs                                                                                                                               |
| **Rate-limit Arxiv (1/3s)**                                  | Sleep 3000ms entre fetchs respecté. 5 cats = ~15s minimum + parsing → toujours sous timeout                                                                                                                               |
| **`external_id` collision avec une autre source**            | UNIQUE `(user_id, source, external_id)` — `source='arxiv'` empêche tout overlap avec Reddit/X. Safe                                                                                                                       |
| **`http://` vs `https://` dans l'`id` Arxiv**                | Arxiv retourne `http://arxiv.org/abs/...` dans l'Atom — on garde tel quel pour `external_id`. Si Arxiv change vers https, les anciens et nouveaux seront 2 lignes distinctes (acceptable V1, pas de migration nécessaire) |

**RISK V1.1 — Sentry / observability** : même status que Task 04. Si Deno crash avant `INSERT INTO logs`, silencieux. Acceptable V1, à revoir V2.

## Fichiers modifiés / créés

| Path                                                                | Action                 |
| ------------------------------------------------------------------- | ---------------------- |
| `supabase/functions/scraper-arxiv/index.ts`                         | **CREATE**             |
| `supabase/functions/scraper-arxiv/README.md`                        | **CREATE**             |
| `specs/todo/05-scraper-arxiv.md` → `specs/done/05-scraper-arxiv.md` | **MOVE** post-validate |

Aucun changement DB, aucun changement secrets.

## Estimation détaillée

| Phase                        | Durée    |
| ---------------------------- | -------- |
| 1. Setup files               | 5 min    |
| 2. Pas de secrets            | 5 min    |
| 3. Supabase local + serve    | 10 min   |
| 4. Smoke test manuel         | 15 min   |
| 5. RLS verify                | 5 min    |
| 6. Tests négatifs            | 10 min   |
| 7. Cleanup + commit          | 10 min   |
| **Tampon debug XML parsing** | 30 min   |
| **Total**                    | **1h30** |

Cohérent avec l'estimation source (1h30). Tampon plus large que Task 04 sur le parsing XML (1ère utilisation de deno-dom dans le projet, friction possible sur l'import JSR + comportement DOMParser).
