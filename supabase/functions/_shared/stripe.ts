/**
 * Helper Stripe partagé pour les edge functions Wave 6.2 (webhook,
 * checkout, metered-usage). Centralise :
 *  - L'instanciation singleton du SDK Stripe (clé lue depuis env).
 *  - Le chargement du catalogue `kairos_sku → stripe_price_id` depuis
 *    la variable `STRIPE_PRICES_CATALOG` (JSON stringifié, généré par
 *    `scripts/stripe-bootstrap.ts`).
 *  - Les helpers pour mapper `(segment, billing_mode) → kairos_sku`.
 *
 * Sécurité : la clé `STRIPE_SECRET_KEY` n'est JAMAIS lue côté client.
 * Elle est stockée comme secret Supabase via `bunx supabase secrets set`.
 */

import Stripe from 'npm:stripe@17'

export type KairosSegment = 'solo' | 'cto_sme' | 'newsletter' | 'brand' | 'legal' | 'vc_pe'
export type KairosBillingMode = 'maison' | 'byok'

export interface CatalogEntry {
  product_id: string
  price_id: string
}

export type StripePricesCatalog = Record<string, CatalogEntry>

let _stripe: Stripe | null = null
let _catalog: StripePricesCatalog | null = null

/**
 * Singleton Stripe client. Initialisé à la première lecture, partagé pour
 * toute la durée de vie de l'isolate edge function (warm reuse).
 *
 * @throws si `STRIPE_SECRET_KEY` n'est pas défini (les edge fns Stripe ne
 *   doivent JAMAIS tourner sans).
 */
export function getStripe(): Stripe {
  if (_stripe) return _stripe
  const key = Deno.env.get('STRIPE_SECRET_KEY')
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY missing in edge fn env (set via `bunx supabase secrets set`)',
    )
  }
  _stripe = new Stripe(key, {
    apiVersion: '2026-04-22.dahlia' as Stripe.LatestApiVersion,
  })
  return _stripe
}

/**
 * Charge le catalogue des prix Kairos depuis la variable d'env
 * `STRIPE_PRICES_CATALOG` (JSON stringifié, valeur copiée depuis le fichier
 * `stripe-prices.{env}.json` généré par `scripts/stripe-bootstrap.ts`).
 *
 * Permet aux edge fns de mapper `kairos_sku → stripe_price_id` sans
 * appeler l'API Stripe à chaque requête (économise latence + quota).
 *
 * @throws si la variable d'env est manquante ou JSON invalide.
 */
export function getPricesCatalog(): StripePricesCatalog {
  if (_catalog) return _catalog
  const raw = Deno.env.get('STRIPE_PRICES_CATALOG')
  if (!raw) {
    throw new Error(
      'STRIPE_PRICES_CATALOG missing — run `scripts/stripe-bootstrap.ts` and copy the JSON via `bunx supabase secrets set`',
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`STRIPE_PRICES_CATALOG is not valid JSON : ${message}`)
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('STRIPE_PRICES_CATALOG must be a JSON object')
  }
  _catalog = parsed as StripePricesCatalog
  return _catalog
}

/**
 * Récupère l'entrée catalogue pour un `kairos_sku` donné.
 *
 * @throws si le SKU n'existe pas dans le catalogue (signal qu'il faut
 *   relancer le bootstrap après ajout d'un nouveau SKU).
 */
export function getCatalogEntry(skuId: string): CatalogEntry {
  const catalog = getPricesCatalog()
  const entry = catalog[skuId]
  if (!entry) {
    throw new Error(`kairos_sku '${skuId}' not in STRIPE_PRICES_CATALOG — re-run stripe-bootstrap`)
  }
  return entry
}

/**
 * Construit un `kairos_sku` à partir d'un segment + mode de billing.
 *
 * Convention : `<segment>_<billing_mode>` (ex. `vc_pe` + `byok` → `vc_byok`).
 * Le segment `cto_sme` est aliasé en `cto`, `vc_pe` en `vc` pour matcher
 * les IDs Stripe (cf. liste dans `scripts/stripe-bootstrap.ts`).
 */
export function buildSkuId(segment: KairosSegment, billingMode: KairosBillingMode): string {
  const segmentAlias: Record<KairosSegment, string> = {
    solo: 'solo',
    cto_sme: 'cto',
    newsletter: 'newsletter',
    brand: 'brand',
    legal: 'legal',
    vc_pe: 'vc',
  }
  return `${segmentAlias[segment]}_${billingMode}`
}

/**
 * Inverse de `buildSkuId` : décompose un `kairos_sku` (`<segment_alias>_<billing_mode>`)
 * en `{ segment, billing_mode }` typés (KairosSegment + KairosBillingMode).
 *
 * Utile pour les edge functions consommatrices du webhook Stripe : la
 * subscription Stripe transporte uniquement `metadata.kairos_sku` ; on doit
 * en re-extraire le segment/billing pour synchroniser la table
 * `subscriptions` (colonnes `plan`, `billing_mode`, etc.).
 *
 * @throws si le SKU ne matche aucune combinaison connue (signal d'un SKU
 *   ajouté côté Stripe sans mise à jour du catalogue local).
 */
export function splitSku(skuId: string): {
  segment: KairosSegment
  billing_mode: KairosBillingMode
} {
  // Reverse map : alias Stripe → segment Kairos
  const aliasToSegment: Record<string, KairosSegment> = {
    solo: 'solo',
    cto: 'cto_sme',
    newsletter: 'newsletter',
    brand: 'brand',
    legal: 'legal',
    vc: 'vc_pe',
  }
  // On extrait le suffix billing_mode (dernier underscore) pour gérer
  // proprement les segments multi-mots (aucun aujourd'hui mais sûr pour le
  // futur).
  const lastUnderscore = skuId.lastIndexOf('_')
  if (lastUnderscore < 1 || lastUnderscore === skuId.length - 1) {
    throw new Error(`splitSku : invalid kairos_sku format '${skuId}'`)
  }
  const aliasPart = skuId.slice(0, lastUnderscore)
  const billingPart = skuId.slice(lastUnderscore + 1)

  const segment = aliasToSegment[aliasPart]
  if (!segment) {
    throw new Error(`splitSku : unknown segment alias '${aliasPart}' in sku '${skuId}'`)
  }
  if (billingPart !== 'maison' && billingPart !== 'byok') {
    throw new Error(`splitSku : invalid billing_mode '${billingPart}' in sku '${skuId}'`)
  }
  return { segment, billing_mode: billingPart }
}

/**
 * Mappe un segment Kairos → plan d'organisation (`org_plan`).
 *
 * Convention :
 *  - `solo`              → plan `solo`
 *  - `cto_sme`           → plan `pro`
 *  - `newsletter`/`brand`/`legal`/`vc_pe` → plan `enterprise`
 *
 * Utilisé par le webhook Stripe pour pré-remplir `subscriptions.plan` lors
 * d'un sync `customer.subscription.{created,updated}`.
 */
export function planForSegment(segment: KairosSegment): 'solo' | 'pro' | 'enterprise' {
  if (segment === 'solo') return 'solo'
  if (segment === 'cto_sme') return 'pro'
  return 'enterprise'
}

/**
 * Vérifie une signature webhook Stripe et parse l'event. Helper de base
 * pour la future edge fn `stripe-webhook` (story S6-StripeWebhook).
 *
 * @param payload Corps brut de la requête (string, PAS objet parsé).
 * @param signature Header `stripe-signature` reçu.
 * @param secret Secret de webhook (`STRIPE_WEBHOOK_SECRET`).
 * @returns Event Stripe vérifié.
 * @throws si la signature est invalide.
 */
export async function verifyWebhookEvent(
  payload: string,
  signature: string,
  secret: string,
): Promise<Stripe.Event> {
  const stripe = getStripe()
  // Deno : crypto.subtle est async → on utilise constructEventAsync.
  return await stripe.webhooks.constructEventAsync(payload, signature, secret)
}
