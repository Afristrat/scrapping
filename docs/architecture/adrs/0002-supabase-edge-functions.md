# ADR-0002 — Supabase Edge Functions Deno (vs Vercel/Cloudflare)

**Status** : Accepted
**Date** : 2026-04-30

## Contexte

Le pipeline de scraping + scoring nécessite du compute serveur :

- Appels HTTPS sortants vers Apify, ArXiv, OpenRouter
- Lecture/écriture DB privilégiée
- Orchestration (Promise.allSettled, batches, retry)
- Long-running (jusqu'à 2-3 min par run)

Options évaluées : Supabase Edge Functions Deno, Vercel Functions Node, Cloudflare Workers, Hono sur Cloudflare.

## Décision

**Supabase Edge Functions Deno** pour 100% du compute backend.

## Conséquences

### Positives

- **Single vendor** : Postgres + Auth + Functions + Storage + pg_cron au même endroit. Un seul `supabase` client à gérer, un seul JWT à propager. Moins de glue code.
- **JWT user automatique** : le client SDK propage le JWT, RLS s'applique sans config. Sécurité par défaut.
- **Variables d'env partagées** : un secret `OPENROUTER_API_KEY` accessible à toutes les fonctions sans setup.
- **Deno** : modules ESM, TypeScript natif, pas de `package.json`, imports directs depuis JSR/npm. Latence de cold start ~100-300ms.
- **Free tier généreux** : 500K invocations/mois.
- **Logs intégrés** : `npx supabase functions logs <name>` ou Dashboard.

### Négatives

- **Timeout 150s sur free tier** : limite pour les pipelines très longs. Mitigation : chunking (Reddit en batches de 6 subs, scoring en batches de 20 signaux).
- **Bundling JSR parfois flaky** : timeouts intermittents 10s sur `jsr.io/@supabase/...`. Mitigation : retry simple. Vu 2-3 fois pendant le développement, jamais en prod.
- **Pas de scheduled jobs intégrés** : pour exécuter le pipeline tous les X heures sans clic user, on doit utiliser `pg_cron` (déjà en place, viable) ou un cron externe (GitHub Actions, Vercel Cron) qui appelle l'Edge Function.
- **Lock-in Supabase** : migration vers un autre provider = réécriture des Edge Functions. Acceptable car le code est petit (200-300 lignes par fonction).

## Alternatives écartées

- **Vercel Functions** : excellent runtime mais split entre Vercel (compute) et Supabase (DB) = double config, double dashboard, JWT à propager manuellement.
- **Cloudflare Workers** : meilleure latence mais pas de PostgreSQL natif, devrait passer par PgBouncer + Hyperdrive, complexité réseau supplémentaire.
- **Hono + Cloudflare** : viable pour APIs HTTP custom, overkill pour un pipeline interne où Supabase suffit.

## Pattern code

Toute Edge Function suit le même squelette :

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: 'missing_authorization' }, 401)
  const supabase = createClient(URL, ANON_KEY, { global: { headers: { Authorization: auth } } })
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ error: 'invalid_token' }, 401)
  // ... business logic
})
```

Helper partagé `_shared/api-keys.ts` pour éviter la duplication entre fonctions.
