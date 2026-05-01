# Deployment

## Architecture deploy

```
┌────────────────────┐         ┌─────────────────────┐
│  Vercel / Netlify  │         │  Supabase Cloud     │
│                    │  HTTPS  │                     │
│  Static SPA        │ ──────► │  - Postgres + RLS   │
│  (dist/ from Vite) │         │  - Auth (magic link)│
│                    │         │  - Edge Functions   │
│                    │         │  - pg_cron          │
│                    │         │  - Storage branding │
└────────────────────┘         └─────────────────────┘
        ▲                              ▲
        │                              │
        └─── User browser ─────────────┘
                  │
                  ▼
          ┌──────────────────┐
          │  External APIs   │
          │  - OpenRouter    │
          │  - Apify         │
          │  - ArXiv         │
          └──────────────────┘
```

## Déploiement frontend (Vercel recommandé)

```bash
# Une fois
npm install -g vercel
vercel login
vercel link

# À chaque deploy
vercel deploy --prod
```

Vercel détecte Vite automatiquement. Configurer dans le dashboard Vercel :

| Variable                 | Source              | Valeur                     |
| ------------------------ | ------------------- | -------------------------- |
| `VITE_SUPABASE_URL`      | Settings → Env Vars | URL de ton projet Supabase |
| `VITE_SUPABASE_ANON_KEY` | Settings → Env Vars | clé anon publique          |

Build settings :

- Framework : Vite
- Build command : `npm run build`
- Output dir : `dist`
- Install command : `npm install` (ou `bun install` si tu installes Bun via Vercel)

### Alternative : Netlify

`netlify.toml` minimal :

```toml
[build]
  command = "npm run build"
  publish = "dist"
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

Le redirect SPA est obligatoire (sinon 404 sur les routes profondes type `/settings`).

## Déploiement backend (Supabase)

### Migrations

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push
```

Toute migration dans `supabase/migrations/` est appliquée dans l'ordre alphabétique. Convention : timestamp UTC `YYYYMMDDHHMMSS_description.sql`.

### Edge Functions

```bash
npx supabase functions deploy
```

Déploie toutes les fonctions dans `supabase/functions/`. Pour une fonction spécifique :

```bash
npx supabase functions deploy <name>
```

### Secrets fallback

```bash
npx supabase secrets set OPENROUTER_API_KEY=sk-or-v1-...
npx supabase secrets set APIFY_TOKEN=apify_api_...
```

Ces secrets servent de fallback **uniquement si l'utilisateur n'a pas configuré ses propres clés via UI**. Pour une instance personnelle, on peut tout passer par UI et ne rien définir ici.

### Storage bucket `branding`

Créé automatiquement par la migration 2 (`rls.sql`). Public read, owner-only write (path `<user_id>/...`).

## Pipeline complet de release

```
1. Modifier code (frontend OU backend OU migration)
2. Tests : npm run test
3. Build local : npm run build (CI gate, 0 erreurs TS)
4. Commit : git commit -m "feat/fix: ..."
5. Push : git push
6. Si migration : npx supabase db push
7. Si edge fn : npx supabase functions deploy <name>
8. Si frontend : vercel deploy --prod (ou auto via GitHub integration)
9. Smoke test prod : login + Run pipeline + check logs
```

## Rollback

### Frontend

Vercel garde les déploiements précédents. Dashboard → Deployments → "Promote to Production" sur un commit antérieur.

### Edge Functions

Pas de rollback automatique. Garder le code de la version précédente en branche, redeployer manuellement :

```bash
git checkout <previous-commit> -- supabase/functions/<name>/index.ts
npx supabase functions deploy <name>
```

### Migrations

**Pas de rollback automatique** dans Supabase. Si une migration prod casse :

1. Créer une migration corrective inverse (ex `20260430000099_revert_xyz.sql`)
2. `npx supabase db push`

C'est pour ça que les migrations doivent être testées sur un projet de staging avant prod.

## Coûts mensuels estimés

Pour 1 user actif (1 run pipeline/jour, ~200 signaux scorés) :

| Poste                                          | Coût                                                       |
| ---------------------------------------------- | ---------------------------------------------------------- |
| Supabase free tier                             | $0 (500 MB DB, 2GB egress, 500K Edge Function invocations) |
| OpenRouter (Claude Haiku 4.5 scoring + digest) | ~$3-5                                                      |
| Apify X                                        | ~$1.5                                                      |
| Apify Reddit                                   | ~$13.5                                                     |
| Vercel Hobby                                   | $0                                                         |
| **Total**                                      | **~$18-20**                                                |

Tout est trackable dans la page Costs.

## Monitoring

- **Erreurs frontend** : pas de Sentry V1. Errors visibles dans la console browser.
- **Erreurs backend** : `npx supabase functions logs <name>` ou Supabase Dashboard → Edge Functions → Logs.
- **Coûts** : page `/costs` agrège par jour/modèle/tâche, alert si overshoot budget.
- **Activité** : page `/logs` montre tous les events pipeline avec auto-refresh 30s.
