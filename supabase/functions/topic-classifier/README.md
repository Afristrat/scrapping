# topic-classifier

Classifie les signaux scorés en topics, met à jour topics/topic_runs/topic_signals
en Postgres avec mise à jour Welford, puis archive l'entrée dans MinIO (ou queue
pending_minio_writes si MinIO indisponible).

Appelée en fire-and-forget depuis run-pipeline.

## Body

```json
{ "signal_ids": ["uuid", "..."], "run_at": "2026-05-01T09:34:22Z" }
```

## Variables d'env requises

- `OPENROUTER_API_KEY` (fallback si pas de user key)
- `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`
