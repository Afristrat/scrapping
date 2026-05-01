# Sécurité

## Modèle de menace

Multi-user partageant la même instance Supabase. Chaque user doit voir/modifier UNIQUEMENT ses propres données. Aucune fuite cross-user, aucun privilège élevé exposé au client.

## Lignes de défense

### 1. RLS Postgres (ligne principale)

Toutes les tables ont `ROW LEVEL SECURITY` enabled avec policies `own_*` qui filtrent par `user_id = auth.uid()`. Même en cas de bug applicatif côté frontend, la DB refuse les accès cross-user.

**Convention non-négociable** : toute nouvelle table créée DOIT activer RLS dans la même migration et avoir une policy explicite.

### 2. JWT user-scoped

Le frontend stocke le JWT Supabase dans le storage du browser. Toute requête vers les Edge Functions inclut `Authorization: Bearer <jwt>`. Les Edge Functions créent un `supabase` client avec ce JWT, ce qui propage l'identité au RLS.

```ts
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: authHeader } },
})
```

### 3. Clés API user-side stockées dans `user_api_keys`

Les clés OpenRouter et Apify sont stockées **par user**, pas en variable d'env globale. Les Edge Functions lisent la clé via le helper `_shared/api-keys.ts` :

```ts
const key = await getUserApiKey(supabase, user.id, 'openrouter')
```

Si l'user n'a pas configuré sa clé, fallback sur l'env var serveur (utile pour démo). Si ni l'un ni l'autre, retour `degraded` (pas d'erreur fatale).

**Frontend ne lit jamais `encrypted_key`** : seulement `masked_key` (`sk-or-...abcd`). Pour modifier une clé, l'user re-saisit la valeur complète (la précédente est UPSERT-écrasée).

### 4. Anon key vs service_role key

- `VITE_SUPABASE_ANON_KEY` : clé publique côté client. Inutile sans RLS car elle n'a aucun privilège élevé.
- `SUPABASE_SERVICE_ROLE_KEY` : bypasse RLS. **Jamais** dans le bundle client. Utilisée uniquement par Supabase lui-même pour les Edge Functions privilégiées (aucune dans ce projet).

### 5. CORS

Toutes les Edge Functions répondent au preflight `OPTIONS` avec headers ouverts (`Access-Control-Allow-Origin: *`). Les actions destructives sont protégées par JWT, pas par origin.

### 6. Validation input

- Frontend : validation Zod (`src/lib/schemas/`) avant envoi
- Backend : Edge Functions valident shape (`Array.isArray`, `typeof`, length checks) et capent les inputs (max 30 signaux par batch, max 8 catégories ArXiv, max 100 score_concurrency)
- DB : `CHECK constraints` sur enums et ranges (`score 0-100`, `language fr/en/es`, etc.)

## Risques connus

### V1 (acceptés)

- **Clés API en clair** dans `user_api_keys.encrypted_key`. Mitigation : RLS empêche l'accès cross-user. Plan V2 : migrer vers Supabase Vault (`vault.create_secret`) pour chiffrement at-rest.
- **Pas de rate limiting applicatif** côté Edge Functions. Mitigation : retry avec backoff exponentiel sur 429 dans `run-pipeline`. Plan V2 : ajouter rate-limit per-user via pg fonction.
- **Pas de CSRF protection** : SPA pas affecté (pas de cookie session, JWT en header). Si cookies réintroduits → ajouter SameSite + CSRF token.
- **Logs gardent payloads JSON** qui peuvent contenir des extraits sources potentiellement sensibles (textes de tweets/posts privés). Mitigation : purge auto via pg_cron < 24h.

### Surveillance recommandée

- Alerter si `daily_budget_usd` dépassé (déjà en place dans page Costs avec alert visuel)
- Vérifier les logs `purge` (action sensible) : pourrait indiquer un compromis si fréquence anormale
- Monitorer les rate limits 429 récurrents : signal d'un solde OpenRouter trop bas

## Checklist avant deployment

- [ ] Toutes les nouvelles tables ont RLS enabled + policy `own_*`
- [ ] Aucune clé hardcodée dans le code (grep `sk-or-`, `apify_api_`)
- [ ] `.env.local` jamais committé (vérifier `.gitignore`)
- [ ] `npm run build` passe 0 erreurs
- [ ] Edge Functions déployées sans secret loggé
- [ ] Lancer `mcp__plugin_supabase_supabase__get_advisors` pour vérifier les advisors Supabase (RLS missing, public exposure)
