# Spec — Edge Function `scraper-x` (RSSHub upstream)

**Task source** : `~/.claude/output/projects/zlatan-scrap/tasks/06-scraper-x.md`
**Estimation** : 1h30 · **Bloque** : (07 déjà livré sans ; améliore le pipeline) · **Bloqué par** : 02 ✅
**Mode** : best-effort V1 (RSSHub public instable, fallback log + 0)

## Objectif

Edge Function Deno qui ingère X via RSSHub : pour chaque query du body, fetch RSS XML, parse `<item>`, upsert dans `signals` avec `source='x'`. Reste 200 même si RSSHub est down (log error, count 0).

## Symétrie scrapers existants

**Copie le pattern de `supabase/functions/scraper-arxiv/index.ts`** (CORS, OPTIONS preflight, JWT auth, body validation, log start/per-item/end, `ignoreDuplicates: false` + `.select('id')`, JSON helper, tests négatifs).

## Décisions clés

1. Parsing RSS via `jsr:@b-fuze/deno-dom` `parseFromString(xml, 'text/html')` (idem Atom Task 05). RSS `<item>` contient `<title>`, `<link>`, `<description>`, `<guid>`, `<pubDate>`, `<author>` — sélecteurs CSS-like marchent.
2. `external_id` = tweet ID extrait du `guid` ou `link`. Pattern : `https://twitter.com/<user>/status/<id>` → regex `/status/(\d+)`. Si pas de match → skip la row (`.filter(r => r.external_id)`).
3. RSSHub base URL via `Deno.env.get('RSSHUB_BASE_URL') ?? 'https://rsshub.app'`. Path : `/twitter/keyword/<encodeURIComponent(query)>`.
4. **Timeout strict 15s par fetch** via `AbortSignal.timeout(15000)` (RSSHub public souvent lent).
5. Hard-cap 5 queries (cohérent avec Reddit/Arxiv).
6. Sleep 2000ms entre fetchs (RSSHub aggressive si abusé).
7. **Status `'degraded'`** dans le log final si `count === 0` (vs `'ok'` si > 0). Permet au monitoring V1.1 de différencier "RSSHub down" vs "pas de query".
8. Pas de `_shared/` (cohérence Tasks 04/05).
9. Body : `{ queries: string[] }` (≥ 1 string). Validation idem Task 05 sur `categories`.

## Code utilitaire

```ts
function extractTweetId(urlOrGuid: string | null | undefined): string | null {
  if (!urlOrGuid) return null
  const m = urlOrGuid.match(/\/status\/(\d+)/)
  return m ? m[1] : null
}

function parseRssItems(xml: string): Array<{
  title: string
  link: string | null
  description: string
  guid: string | null
  pubDate: string | null
  author: string | null
}> {
  const doc = new DOMParser().parseFromString(xml, 'text/html')
  if (!doc) return []
  return Array.from(doc.querySelectorAll('item')).map((item) => ({
    title: item.querySelector('title')?.textContent?.trim() ?? '',
    link: item.querySelector('link')?.textContent?.trim() ?? null,
    description: item.querySelector('description')?.textContent?.trim().slice(0, 4000) ?? '',
    guid: item.querySelector('guid')?.textContent?.trim() ?? null,
    pubDate: item.querySelector('pubDate')?.textContent?.trim() ?? null,
    author: item.querySelector('author')?.textContent?.trim() ?? null,
  }))
}
```

## Steps

1. `mkdir -p supabase/functions/scraper-x` → créer `index.ts` (~150 lignes, structure miroir scraper-arxiv) + `README.md` (court, doc curl + warning RSSHub instable + V2 self-host).
2. Optionnel : ajouter `RSSHUB_BASE_URL=https://rsshub.app` dans `supabase/.env.local` (sinon fallback hardcoded).
3. **Pas de smoke test runtime obligatoire** (RSSHub peut être down, l'agent ne peut pas garantir le test). Validation statique uniquement :
   - `bun run typecheck`, `bun run lint`, `bun run test` (12 passed), `bun run build`
   - `grep -r "SUPABASE_SERVICE_ROLE_KEY" supabase/functions/scraper-x/` → vide
   - `grep -r "console.log" supabase/functions/scraper-x/` → vide
4. Move spec `specs/todo/06-scraper-x.md` → `specs/done/`.

## Non-Goals

- ❌ Self-host RSSHub Fly.io / Vercel — V2.
- ❌ Multi-strategy fallback (`/twitter/user` + `/twitter/keyword` chained) — V1 = keyword only.
- ❌ twscrape (besoin compte X) — out of scope.
- ❌ Tests Deno automatisés.

## Risques

- RSSHub 503 / timeout / Cloudflare challenge → catch global, log error, response 200 avec `errors[]` peuplé. Comportement testé par construction (try/catch + `AbortSignal.timeout`).
- Tweet IDs non extractibles depuis certains guid (rare) → row filtré, pas de crash.

## Acceptance grep-testable

- [ ] `ls supabase/functions/scraper-x/index.ts` existe.
- [ ] Validation 4/4 verte.
- [ ] Grep négatifs vides.
- [ ] Code utilise `AbortSignal.timeout(15000)` (1+ match).
- [ ] Code utilise `'degraded'` (1+ match dans le statut log final).

## Fichiers

- CREATE `supabase/functions/scraper-x/index.ts`
- CREATE `supabase/functions/scraper-x/README.md`
- MOVE `specs/todo/06-scraper-x.md` → `specs/done/`
