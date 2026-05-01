# llm-score

Edge Function Deno — Score un signal via OpenRouter.

## Usage

```bash
POST /functions/v1/llm-score
Authorization: Bearer <user JWT>
Content-Type: application/json

{ "signal_id": "<uuid>" }
```

## Response

```json
{ "signal_id": "...", "score": 72, "reasoning": "Signal pertinent car...", "cost": 0.00012 }
```

## Secrets requis

- `OPENROUTER_API_KEY` — clé API OpenRouter (jamais committée)

## Setup local

```bash
echo 'OPENROUTER_API_KEY=sk-or-v1-...' >> supabase/.env.local
bunx supabase functions serve llm-score --env-file supabase/.env.local --no-verify-jwt
```
