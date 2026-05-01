# scraper-arxiv

Edge Function Deno qui scrape les 25 derniers papiers d'une liste de catégories Arxiv (triés par date de soumission, ordre descendant) et upserte dans `signals` (RLS user-scoped via JWT).

## Secrets requis

Aucun. Pas de clé API Arxiv, User-Agent en dur (`zlatan-scrap/0.1`).

`SUPABASE_URL` + `SUPABASE_ANON_KEY` sont auto-injectés par le Supabase Edge runtime.

## Lancer en local

```bash
bunx supabase start
bunx supabase functions serve scraper-arxiv --env-file supabase/.env.local --no-verify-jwt
```

## Curl

```bash
USER_JWT="eyJ..."  # access_token user (depuis frontend ou Studio)

curl -X POST http://localhost:54321/functions/v1/scraper-arxiv \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"categories":["cs.AI","cs.CL"]}'
```

## Réponse

```json
{
  "fetched": 50,
  "inserted": 50,
  "errors": []
}
```

`errors[]` contient `{ category, reason }` pour chaque catégorie en échec (HTTP non-200 ou exception parsing).

## Contraintes

- Body : `{ categories: string[] }` non-vide, hard-cap à 5 catégories (slice silencieux).
- Rate-limit Arxiv : 3000ms entre fetchs (Arxiv API user manual recommande ≥ 1 req / 3s).
- JWT user requis (RLS user-scoped). Pas de service-role.
- Idempotent : `upsert onConflict (user_id, source, external_id)`.
- `external_id` = URL canonique Arxiv (ex `http://arxiv.org/abs/2604.12345v1`).

## Format Atom Arxiv

L'API renvoie un feed Atom XML avec des `<entry>` contenant `id`, `title`, `summary`, `published`, `<author><name>` (multiple), `<category term="...">` (multiple). Parsing via `jsr:@b-fuze/deno-dom` (HTML mode, tags lowercased — sélecteurs CSS suffisent).

## Doc Arxiv API

- API user manual : https://info.arxiv.org/help/api/user-manual.html
- Liste catégories : https://arxiv.org/category_taxonomy
- Endpoint : `https://export.arxiv.org/api/query?search_query=cat:<category>&sortBy=submittedDate&sortOrder=descending&max_results=25`
