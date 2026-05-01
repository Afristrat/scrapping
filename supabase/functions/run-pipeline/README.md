# run-pipeline

Edge Function Deno — Orchestrateur du pipeline complet (scrape + score).

## Usage

```bash
POST /functions/v1/run-pipeline
Authorization: Bearer <user JWT>
Content-Type: application/json

{}
```

## Response

```json
{
  "scrape": [
    { "name": "reddit", "status": "fulfilled", "value": { "inserted": 42 }, "reason": null },
    { "name": "arxiv", "status": "fulfilled", "value": { "inserted": 18 }, "reason": null },
    { "name": "x", "status": "rejected", "value": null, "reason": "scraper-x_http_404" }
  ],
  "scored": 50,
  "failed": 0,
  "total": 50,
  "duration_ms": 28000
}
```

## Comportement

1. Scrape Reddit + Arxiv + X en parallèle (`Promise.allSettled` — X best-effort, absence tolérée)
2. Requête RPC `unscored_signals` pour les 100 derniers signaux sans score
3. Score par batch de 5 en appelant `llm-score` pour chaque signal

## Secrets requis

- `OPENROUTER_API_KEY` — requis par `llm-score` (pas directement par run-pipeline)

## Setup local

```bash
bunx supabase functions serve --env-file supabase/.env.local --no-verify-jwt
```
