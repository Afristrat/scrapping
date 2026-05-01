# Handoff - theresa-scrap

> Dernier handoff : `docs/handoffs/2026-05-01-session-ralph-complete.md` (récap complet de la session Ralph + Wave 4)

## Résumé express

- Dashboard de veille IA fonctionnel : X (Apify) + Reddit (Apify) + ArXiv (API) → scoring LLM batch (OpenRouter) → brief 80/20 multi-langue.
- Stack : Vite + React 19 + Supabase (Postgres + Auth + 7 Edge Functions Deno + pg_cron) + OpenRouter + Apify.
- Projet Supabase : ref `rratnmtiescwdvtnjbeq`. Repo GitHub : https://github.com/meydeey/theresa-scrap
- Dernière session : fix 2 bugs critiques (X posts non insérés à cause d'unpaired UTF-16 surrogates ; scoring 401 à cause d'une clé OpenRouter révoquée stockée en DB). Logs verbeux propagés via helper `formatError` partagé. Bouton "Copier" par log dans la page Logs.

## Pour reprendre

- `npm run dev` (port 5173 ou suivant si occupé)
- Lire `CLAUDE.md` pour les conventions projet
- Lire `docs/README.md` pour l'index complet
- Lire `docs/handoffs/2026-04-30-bug-fixes-and-verbose-logging.md` pour les détails du dernier travail (incluant les pièges du repo désynchronisé du déployé)

## État connu (au 2026-04-30, fin de session bug-fix)

**Fonctionne** :

- Pipeline complet sans crash silencieux : scraper-x v4 (avec `safeIsoDate` + sanitize Unicode), llm-score-batch v2 (logs verbeux par étape), tous les autres scrapers OK
- Logs DB lisibles : chaque erreur expose `code`, `message`, `details`, `hint`, `status`, `stack` au lieu de `[object Object]`
- Page Logs : bouton "Copier" par ligne, "Copier les N logs" en bulk, preview 1-ligne du message d'erreur

**Pièges connus** :

- Repo local désynchronisé du déployé (`digest`, `purge`, `llm-score-batch` étaient en prod sans source locale avant cette session). Toujours déployer ET update le local.
- `user_api_keys.encrypted_key` stocke la clé EN CLAIR malgré le nom (legacy)
- Sandbox Claude Code bloque `npm run dev` (EPERM listen) et `open URL` (procNotFound) → flag `dangerouslyDisableSandbox` requis pour ces commandes

**Reste à faire (pas urgent)** :

- Dédup sémantique (pgvector ou fuzzy titre) — actuellement juste exact match `(user_id, source, external_id)`
- Scheduled pipeline via `pg_cron` qui appelle `run-pipeline`
- Propager `formatError` dans `scraper-reddit` et `scraper-arxiv` (sources non rapatriées en local)
- Régénérer `src/types/database.ts` post-migrations
