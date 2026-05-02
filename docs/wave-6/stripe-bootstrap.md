# Stripe bootstrap — Wave 6.2

> **Story** : `S6-StripeSetup`
> **Objectif** : créer les 12 SKUs Kairos + 9 add-ons dans Stripe via un
> script idempotent, puis injecter le catalogue dans les secrets Supabase
> pour que les edge functions de billing puissent l'utiliser.

Le script `scripts/stripe-bootstrap.ts` est **idempotent** : il utilise
`metadata.kairos_sku` comme clé d'unicité côté Stripe. Tu peux le relancer
autant de fois que tu veux, il met à jour les produits/prix existants au
lieu d'en créer des doublons.

## Pré-requis

- Compte Stripe activé sur [dashboard.stripe.com](https://dashboard.stripe.com).
- Deno installé (déjà utilisé par les edge functions, voir `deno.lock`).
- Accès au projet Supabase Kairos (`crplceoptyeslqyfcqvj`) avec la CLI
  `bunx supabase` linkée.

## Étape 1 — Mode test (à faire en premier)

### 1.1. Récupérer la clé secrète test

1. Aller sur [dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys).
2. Bascule en haut à droite **« Test mode »** (toggle).
3. Copier la **« Secret key »** : `sk_test_...`.

> **Ne JAMAIS commiter cette clé.** Elle se balade en local le temps du
> bootstrap, puis est stockée comme secret Supabase (cf. étape 1.4).

### 1.2. Lancer le bootstrap

Depuis la racine du repo :

```bash
STRIPE_SECRET_KEY=sk_test_REPLACE_WITH_YOUR_TEST_KEY \
  npm run stripe:bootstrap
```

Ou directement avec Deno :

```bash
STRIPE_SECRET_KEY=sk_test_REPLACE_WITH_YOUR_TEST_KEY \
  deno run -A scripts/stripe-bootstrap.ts
```

Le script va :

- Créer (ou mettre à jour) les **12 produits SKU** (Solo Maison/BYOK,
  CTO Maison/BYOK, Newsletter, Brand, Legal, VC/PE — chacun en
  Maison + BYOK).
- Créer (ou mettre à jour) les **9 add-ons** (Webhooks, API publique,
  Custom sources, Audit log, Tenant isolé, Self-host, CSM dédié,
  Backtest illimité, Reputation API).
- Pour chaque produit, créer un prix récurrent en EUR (mensuel pour les
  SKUs et la plupart des add-ons, annuel pour `addon_selfhost` et
  `addon_csm_dedicated`).
- Écrire `stripe-prices.test.json` avec la map
  `kairos_sku → { product_id, price_id }`.

Output attendu :

```text
Bootstrap Stripe (test mode)
  12 SKUs + 9 add-ons à synchroniser

  OK  solo_maison           prod_xxx / price_yyy
  OK  solo_byok             prod_xxx / price_yyy
  ...
  OK  addon_reputation_api  prod_xxx / price_yyy

21/21 entrées écrites dans stripe-prices.test.json
```

### 1.3. Vérifier l'output

```bash
cat stripe-prices.test.json | grep -c '"price_id"'
# doit afficher : 21
```

Tu dois avoir exactement **21 entrées** (12 SKUs + 9 add-ons). Le fichier
est gitignoré (cf. `.gitignore`).

### 1.4. Pousser le catalogue + la clé dans les secrets Supabase

```bash
# Catalogue (JSON stringifié)
bunx supabase secrets set STRIPE_PRICES_CATALOG="$(cat stripe-prices.test.json)"

# Clé secrète Stripe (mode test)
bunx supabase secrets set STRIPE_SECRET_KEY=sk_test_REPLACE_WITH_YOUR_TEST_KEY
```

Vérifier :

```bash
bunx supabase secrets list | grep STRIPE
```

> Le secret `STRIPE_WEBHOOK_SECRET` sera ajouté plus tard, dans la story
> `S6-StripeWebhook` (création de l'endpoint webhook côté Stripe puis
> récupération du secret `whsec_...`).

## Étape 2 — Mode live (au moment du go-marketing)

Refaire **exactement** les étapes 1.1 → 1.4, mais avec la clé live :

```bash
STRIPE_SECRET_KEY=sk_live_REPLACE_WITH_YOUR_LIVE_KEY \
  npm run stripe:bootstrap
```

Le script détecte le préfixe `sk_live_` et écrit `stripe-prices.live.json`
au lieu de `stripe-prices.test.json`.

Pousser le catalogue + la clé live :

```bash
bunx supabase secrets set STRIPE_PRICES_CATALOG="$(cat stripe-prices.live.json)"
bunx supabase secrets set STRIPE_SECRET_KEY=sk_live_REPLACE_WITH_YOUR_LIVE_KEY
```

> **Attention** : les secrets Supabase sont par projet et écrasent la
> précédente valeur. Ne jamais avoir un mix `STRIPE_SECRET_KEY` test +
> `STRIPE_PRICES_CATALOG` live (ou inversement) en prod — les `price_id`
> ne matchent pas entre les deux environnements Stripe.

## Modifier le catalogue plus tard

Si tu ajoutes un nouveau SKU ou changes un prix dans
`scripts/stripe-bootstrap.ts` :

1. Relance `npm run stripe:bootstrap` avec la même clé que le bootstrap initial.
2. Le script met à jour les produits existants (idempotent) et crée les
   nouveaux. Les anciens prix restent **actifs** dans Stripe (Stripe ne
   permet pas de supprimer un prix attaché à un abonnement) — mais ils ne
   sont plus référencés dans `stripe-prices.{env}.json`.
3. Re-pousse le catalogue avec
   `bunx supabase secrets set STRIPE_PRICES_CATALOG="$(cat stripe-prices.test.json)"`.

## Ressources

- [Stripe Best Practices skill (Anthropic)](https://docs.stripe.com/billing/subscriptions/design-an-integration.md)
- [Stripe API — Products](https://docs.stripe.com/api/products.md)
- [Stripe API — Prices](https://docs.stripe.com/api/prices.md)
- Helper edge fn : `supabase/functions/_shared/stripe.ts` (consomme
  `STRIPE_PRICES_CATALOG`).
