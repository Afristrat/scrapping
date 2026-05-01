# scraper-reddit

Edge Function Deno qui scrape les top 25 hot posts d'une liste de subreddits et upserte dans `signals` (RLS user-scoped via JWT).

## Secrets requis

- `REDDIT_USER_AGENT` (ex: `zlatan-scrap/0.1 by /u/<your_handle>`)
- `SUPABASE_URL` + `SUPABASE_ANON_KEY` (auto-injectés par Supabase Edge runtime)

```bash
# Local : supabase/.env.local (gitignored)
REDDIT_USER_AGENT=zlatan-scrap/0.1 by /u/<your_handle>

# Prod
bunx supabase secrets set REDDIT_USER_AGENT="zlatan-scrap/0.1 by /u/<your_handle>"
```

## Lancer en local

```bash
bunx supabase start
bunx supabase functions serve scraper-reddit --env-file supabase/.env.local --no-verify-jwt
```

## Curl

```bash
USER_JWT="eyJ..."  # access_token user (depuis frontend ou Studio)

curl -X POST http://localhost:54321/functions/v1/scraper-reddit \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"subs":["LocalLLaMA","MachineLearning"]}'
```

## Réponse

```json
{
  "fetched": 50,
  "inserted": 50,
  "errors": []
}
```

`errors[]` contient `{ sub, reason }` pour chaque sub en échec (HTTP non-200 ou exception).

## Contraintes

- Body : `{ subs: string[] }` non-vide, hard-cap à 5 subs (slice silencieux).
- Rate-limit Reddit : 1.2s entre fetchs, User-Agent obligatoire.
- JWT user requis (RLS user-scoped). Pas de service-role.
- Idempotent : `upsert onConflict (user_id, source, external_id)`.
