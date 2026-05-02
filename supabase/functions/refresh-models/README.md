# refresh-models

Refresh la liste des modèles disponibles pour un provider donné. Appelle l'endpoint
`/models` du provider (OpenAI-compat pour la plupart), normalise, puis upsert dans
`provider_models`.

Utilisé par la page Settings → bouton "Refresh models" par provider.

## Body

```json
{ "provider": "moonshot", "base_url": "http://my-ollama:11434/v1" }
```

`base_url` optionnel : utilisé seulement pour les providers self-hosted (Ollama).

## Réponse

- 200 OK : `{ ok: true, count: 42, provider: "moonshot" }`
- 400 : `{ error: "api_key_missing" | "unknown_provider" | "provider_required" }`
- 502 : `{ error: "provider_request_failed", status, detail }`

## Variables d'env

Aucune. Les credentials user sont lus depuis `user_api_keys`.
