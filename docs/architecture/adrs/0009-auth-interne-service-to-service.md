# ADR 0009 — Auth interne service-to-service (pipeline K06)

- **Statut** : Accepté (2026-07-07)
- **Contexte** : session d'optimisation post-audit blindage. Remplace les branches abandonnées `feat/k09-proxy-user-jwt`, `feat/k09bis-proxy-signinwithpassword`, `feat/k09c-service-role-proxy-header`.

## Problème

Le pipeline K06 (`research-from-seed`) appelle des fonctions Deno aval (`dispatch-llm`, `llm-score-batch`, `rubric-architect`, `signal-synthesizer`, `quality-auditor`) via HTTP. Il envoyait `Authorization: Bearer <SERVICE_ROLE_KEY>`, mais les fonctions aval font `supabase.auth.getUser()`, qui **rejette** un JWT service_role (pas de claim `sub`) → 401 dès le premier saut. Le livrable K06 ne peut produire aucun run réel. Un client externe (Bassira) n'a par ailleurs jamais de JWT user Kairos à présenter.

## Options écartées (avec preuve)

1. **JWT user auto-signé HS256** (`sign-user-jwt.ts`, branche A) — **matériellement impossible** : le projet Supabase est en _JWT Signing Keys_ ECC P-256. Aucun secret HS256 (`SUPABASE_JWT_SECRET`) n'est exposable ; la clé privée ECC n'est jamais accessible depuis une edge function. On ne peut pas forger de JWT valide.
2. **`signInWithPassword` d'un compte machine** (branche A bis) — **refusé** (mot de passe machine = surface d'attaque email+password activable de partout, rotation non gérée, setup manuel).
3. **`service_role` comparé comme secret applicatif + `x-proxy-user-id`** (branche C) — bonne forme, mais trois défauts : (a) propagation multi-hop oubliée (le contexte n'était pas re-transmis de `llm-score-batch` vers `dispatch-llm` → pipeline cassé au 2ᵉ saut) ; (b) le `service_role` servait à la fois de laissez-passer gateway ET de secret applicatif (couplage de rotation, et toute détentrice du service_role peut usurper n'importe quel user) ; (c) dépendance au fait que le Bearer service_role passe le gateway `verify_jwt` (fragile avec les nouvelles clés de signature).

## Décision

**Option C corrigée** : secret interne **dédié** + `proxy_user_id`, avec un **constructeur d'en-têtes unique**.

- Un secret applicatif dédié `INTERNAL_FN_SECRET` (jamais le service_role) porté par l'en-tête `x-internal-secret`, comparé en constant-time.
- L'identité interne = `x-proxy-user-id` (UUID), autoritatif depuis `public_api_keys.proxy_user_id` (mapping géré côté admin Kairos, jamais par le client externe).
- Le contexte interne ne porte **que `user_id`** : provider, modèle, clé BYOK et `org_id` se dérivent tous de ce user (settings + user_api_keys + org du signal). Rien d'autre ne transite.
- **`buildInternalHeaders(userId)` est le SEUL constructeur d'appel interne autorisé.** Tout call-site interne l'utilise → le bug de propagation multi-hop de la branche C devient structurellement impossible.
- En mode interne, les queries DB utilisent un client **service_role recréé depuis env** (pas le header entrant) → indépendant du fait que le Bearer passe le gateway.
- Gateway : les 6 fonctions aval + `research-from-seed` sont déclarées `verify_jwt = false` dans `config.toml`. La sécurité est alors assurée au handler par `resolveCaller` (mode interne = secret dédié valide ; mode user = `getUser()` valide). Choix **déclaratif** (config.toml) plutôt que le flag `--no-verify-jwt` volatile.

Précédent réutilisé : le pattern `x-cron-secret` de `record-usage` (déjà en prod) — secret applicatif dédié + Bearer service_role pour le gateway. On généralise ce contrat.

## Conséquences

- Nouveau helper `_shared/internal-auth.ts` : `resolveCaller(supabase, req)` (dual-mode) + `buildInternalHeaders(userId)` + `isUuid`. Testé unitairement (deno) sans runtime.
- Migration `public_api_keys.proxy_user_id` (recommittée — appliquée en DB des branches mais absente du repo → dette de désync corrigée pour la reprovision .11).
- Secret à poser : `INTERNAL_FN_SECRET` (`npx supabase secrets set`).
- **Validation runtime obligatoire post-provision .11** : (1) un run `research-from-seed` via `x-api-key` produit un run réel non mocké ; (2) test de contrat du 2ᵉ saut `llm-score-batch → dispatch-llm` en mode interne — c'est exactement le test qui manquait aux « 203/203 verts » de la branche C.
- Couplage avec le péage argent (ADR/tâche coût) : `llm_costs.user_id = proxy_user_id` → cost-per-tenant natif.
