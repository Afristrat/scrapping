# Handoff - 2026-04-30 - Bug fixes scraper-x, scoring 401, logs verbeux

## État du projet

- App lancée en local sur `http://localhost:5174` (le `:5173` était occupé). Auth magic link OK, 1 user actif `meydeey@gmail.com`.
- Pipeline complet fonctionnel : scraper-x v4, scraper-reddit v3, scraper-arxiv v2, llm-score-batch v2 redéployées.
- DB Supabase `rratnmtiescwdvtnjbeq` opérationnelle, RLS partout, clés API en table `user_api_keys` (en clair, le nom `encrypted_key` est trompeur — voir contexte).

## Changements de cette session

### Edge functions déployées via MCP Supabase

- `scraper-x` v3 puis v4 (cumul des fixes)
- `llm-score-batch` v2

### Fichiers créés

- `supabase/functions/_shared/errors.ts` — `formatError()` + `summarizeError()` qui extraient `message`, `code`, `details`, `hint`, `status`, `stack` de n'importe quel throwable (Error, PostgrestError, plain object). Sans ça, `String(err)` sur un PostgrestError donne `"[object Object]"`.
- `supabase/functions/_shared/unicode.ts` — `sanitizeUnicodeString()` (remplace les unpaired UTF-16 surrogates par U+FFFD), `safeSliceString()` (tronque sans casser une paire), `deepSanitizeJson()` (récursif sur objets/arrays + compteur de fixes).
- `supabase/functions/llm-score-batch/index.ts` — code rapatrié depuis le déployé (avant cette session il existait en prod mais pas en local).
- `docs/handoffs/2026-04-30-bug-fixes-and-verbose-logging.md` (ce fichier).

### Fichiers modifiés

- `supabase/functions/scraper-x/index.ts` — réintroduction de `safeIsoDate()` (perdu en v2 prod), application de `formatError`, `safeSliceString`, `sanitizeUnicodeString`, `deepSanitizeJson` sur `title`/`url`/`raw_payload`. Ajout de logs `info` intermédiaires (`stage: after_filter`, `stage: final`).
- `src/components/features/LogsTable.tsx` — bouton "Copier" par log (texte formaté avec timestamp/action/status/payload), bouton "Copier les N logs" en haut, preview 1-ligne du message d'erreur en rouge avant le payload caché, ligne entière sur fond rouge léger pour les erreurs.
- `src/pages/Logs.tsx` — filtres ajoutés : actions `llm:score-batch`, `purge` ; statut `info`.
- `.env.local` (créé) — `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.

### Données mutées en DB

- `user_api_keys.encrypted_key` (provider=openrouter) mis à jour avec la clé valide `sk-or-v1-c7031e...lq4k`. L'ancienne `sk-or-v1-921da...0de9` était révoquée → causait tous les 401 "User not found" du scoring.

## Bugs résolus

### Bug 1 — X posts non insérés (était silencieux)

Cause root : v2 du `scraper-x` injectait `signal_date: createdAtRaw` non normalisé. Apify peut renvoyer le format Twitter legacy `"Sat Apr 30 14:00:00 +0000 2026"` que Postgres `timestamptz` rejette. PostgrestError jeté, catch faisait `String(err)` = `"[object Object]"` (PostgrestError ne `instanceof Error`). Tous les tweets perdus.

Fix v3 : réintroduit `safeIsoDate()` (parse via `new Date()` qui accepte les deux formats, retourne `null` si invalide → la colonne accepte NULL).

### Bug 1bis — `22P02 invalid input syntax for type json` après le fix de v3

Cause root : Postgres JSONB rejette les unpaired UTF-16 surrogates (`"Unicode low surrogate must follow a high surrogate"`). Apify tronque parfois un tweet en plein milieu d'un emoji 4-byte. JS tolère, Postgres non. L'upsert atomique fait que 1 tweet pourri = 0 inséré sur 100.

Fix v4 : `sanitizeUnicodeString()` sur `title` et `url`, `deepSanitizeJson()` sur `raw_payload`. `safeSliceString()` tronque sans casser de paire (l'emoji entier saute, pas de moitié).

### Bug 2 — Scoring 401 "User not found"

Cause root : la clé OpenRouter en DB pour ce user était l'ancienne révoquée. Validée par `curl https://openrouter.ai/api/v1/key` qui a confirmé que la nouvelle clé fournie par l'user était valide (HTTP 200).

Fix : `UPDATE user_api_keys SET encrypted_key=...` en SQL.

### Bug 3 — Logs incompréhensibles

Helper `formatError` propagé dans `scraper-x` v3+v4 et `llm-score-batch` v2. UI `LogsTable.tsx` enrichi avec bouton copier par log + bouton "Copier tous".

## Architecture rapide

- React 19 + Vite 8 + TS strict + Tailwind v4 + shadcn/ui (Radix)
- Supabase : Postgres 17 + Auth magic link + Edge Functions Deno
- Scraping : Apify (X via `apidojo/twitter-list-scraper`, Reddit via `automation-lab/reddit-scraper`) + ArXiv API directe
- LLM : OpenRouter (multi-provider proxy), modèle scoring par défaut `anthropic/claude-haiku-4.5`
- TanStack Query, Zustand auth store, react-hook-form + zod, sonner toasts, lucide-react

### Fichiers critiques

- `supabase/functions/scraper-x/index.ts` — pipeline X (v4)
- `supabase/functions/llm-score-batch/index.ts` — scoring batch (v2)
- `supabase/functions/_shared/errors.ts` — `formatError` / `summarizeError`
- `supabase/functions/_shared/unicode.ts` — sanitize UTF-16 pour JSONB
- `supabase/functions/_shared/api-keys.ts` — lookup user_api_keys + fallback env
- `src/hooks/useApiKeys.ts` — stocke `encrypted_key: rawKey` en clair (le nom est legacy)
- `src/hooks/useSignals.ts` — query signals + scores, tri actuel : date DESC primaire, score DESC secondaire
- `src/components/features/LogsTable.tsx` — table logs avec bouton copier
- `src/components/features/Filters.tsx` — filtres source/période/minScore (slider 0-100)

## Prochaines étapes

L'utilisateur a demandé en fin de session :

1. **Tri par scoring par défaut** sur le dashboard signals (changer `useSignals.ts` pour mettre score DESC primaire, date secondaire).
2. **Filtres scoring + date** plus expressifs sur le dashboard (les filtres existent déjà — voir si l'user veut un toggle Score/Date pour le sort).
3. **Score=0** : investigation faite — 33 sont des vrais zéros (LLM a réellement scoré 0 selon la rubrique active), 1 est un batch miss (`reasoning = '(LLM batch missed this signal)'`). Différencier visuellement dans `SignalTable.tsx` ; envisager un bouton "re-scorer les missed".

## Contexte perdu si non documenté

- **Le repo local est désynchronisé du déployé.** Avant cette session, ces edge functions existaient en prod mais pas dans le repo local : `digest`, `purge`, `llm-score-batch`. Et les versions étaient désynchronisées : `scraper-x` v2 prod ≠ v1 local (la v2 avait perdu `safeIsoDate`, ce qui a causé le bug 1). À chaque modif, déployer ET update le local pour rester en sync.
- **`user_api_keys.encrypted_key` est en clair**, malgré le nom. `useApiKeys.ts:32` fait `encrypted_key: rawKey` sans chiffrer. Ne pas refactor le nom sans plan de migration de la table — pour l'instant c'est juste un nom legacy.
- **Sandbox Claude Code bloque `npm run dev`** (EPERM listen ::1:5173) et `open URL` (procNotFound). Il faut le flag `dangerouslyDisableSandbox: true` pour ces commandes spécifiques. Pas un bug projet, c'est une contrainte d'environnement.
- **Le `purge` edge fn supprime tout** (signals, scores, logs, llm_costs). Pendant cette session, l'user en a déclenché un et a perdu les 503 signals + 43 logs initiaux. À ne lancer que si on veut vraiment repartir de zéro.
- **Apify actor format Twitter** : `apidojo~twitter-list-scraper` peut renvoyer `createdAt` en ISO ou en format legacy (`"Sat Apr 30 14:00:00 +0000 2026"`). Toujours passer par `safeIsoDate()` avant insert dans `signals.signal_date`.
- **Rotation clés sensibles à faire** : OpenRouter `sk-or-v1-c7031e...lq4k` et Apify `apify_api_dryMl...vO4oSfL9` ont transité dans le chat lors du setup. Hygiène standard = rotater côté providers et re-update via UI Settings.
- **Bug `[object Object]` peut revenir** dans les autres scrapers (`scraper-reddit`, `scraper-arxiv`) qui n'ont pas le helper `formatError`. Sources non rapatriées en local, donc à regarder si une erreur similaire apparaît côté Reddit/ArXiv.
