# scraper-x

Edge Function Deno — ingère des signaux X (tweets) via RSSHub pour les mots-clés donnés.

## Invoke

```bash
curl -X POST https://<project>.supabase.co/functions/v1/scraper-x \
  -H "Authorization: Bearer <user_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"queries": ["AI safety", "llm inference"]}'
```

Réponse :

```json
{ "fetched": 12, "inserted": 10, "errors": [] }
```

## Variables d'environnement

| Variable            | Défaut               | Description                        |
| ------------------- | -------------------- | ---------------------------------- |
| `RSSHUB_BASE_URL`   | `https://rsshub.app` | Instance RSSHub à interroger       |
| `SUPABASE_URL`      | auto-injecté         | URL du projet Supabase             |
| `SUPABASE_ANON_KEY` | auto-injecté         | Clé anon (RLS user-scoped via JWT) |

## Warning — RSSHub public instable

L'instance publique `rsshub.app` est soumise à des limitations de débit, des 503 intermittents et des Cloudflare challenges. En cas d'erreur RSSHub, la fonction retourne `200` avec `errors[]` peuplé et `fetched: 0` (status log `'degraded'`). Le pipeline continue normalement.

**V2 recommandé** : self-host RSSHub sur Fly.io ou Vercel pour une disponibilité garantie. Voir [RSSHub self-hosting docs](https://docs.rsshub.app/deploy/).

## Limites V1

- Max 5 queries par appel (hard-cap)
- Timeout 15s par fetch RSSHub
- Sleep 2s entre chaque query (rate-limit)
- Source `keyword` uniquement (`/twitter/keyword/<q>`) — pas de timeline user
