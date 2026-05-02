/**
 * Bootstrap Stripe products + prices for Kairos.
 *
 * Wave 6.2 — Story S6-StripeSetup. Idempotent : si un produit avec le
 * même `metadata.kairos_sku` existe déjà, il est mis à jour plutôt que
 * recréé. Relance ce script après chaque modification du catalogue pour
 * resync les produits/prix Stripe.
 *
 * Usage :
 *   STRIPE_SECRET_KEY=sk_test_xxx deno run -A scripts/stripe-bootstrap.ts
 *
 * Output : écrit `stripe-prices.{env}.json` (env = `test` | `live` selon
 * le préfixe de la clé) avec la map `kairos_sku → { product_id, price_id }`.
 * Ce fichier est consommé ensuite par les edge functions via la variable
 * d'environnement `STRIPE_PRICES_CATALOG` (cf. `supabase/functions/_shared/stripe.ts`).
 *
 * Le script tourne sous Deno (déjà utilisé pour les edge fns) — pas besoin
 * d'ajouter `tsx` ou `stripe` aux dépendances npm.
 */

import Stripe from 'npm:stripe@17'

interface SKU {
  /** Identifiant interne stable, sert de clé d'idempotence (`metadata.kairos_sku`). */
  id: string
  segment: 'solo' | 'cto_sme' | 'newsletter' | 'brand' | 'legal' | 'vc_pe'
  billing_mode: 'maison' | 'byok'
  display_name: string
  /** Prix unitaire mensuel en euros (entier — pas de centimes pour les SKUs catalogue). */
  price_eur: number
  /** Si `true`, prix par siège ; sinon prix flat (cas Newsletter avec `default_seats`). */
  per_seat: boolean
  /** Nombre de sièges inclus pour les SKUs flat (Newsletter). */
  default_seats?: number
  description: string
}

interface AddOn {
  id: string
  display_name: string
  price_eur: number
  recurring: 'month' | 'year'
  description: string
}

const SKUS: ReadonlyArray<SKU> = [
  {
    id: 'solo_maison',
    segment: 'solo',
    billing_mode: 'maison',
    display_name: 'Kairos Solo (LLM Maison)',
    price_eur: 49,
    per_seat: false,
    description: '1 utilisateur, 100 signaux/jour, mémoire 30 jours.',
  },
  {
    id: 'solo_byok',
    segment: 'solo',
    billing_mode: 'byok',
    display_name: 'Kairos Solo (BYOK)',
    price_eur: 99,
    per_seat: false,
    description: 'Solo avec vos propres clés LLM (BYOK).',
  },
  {
    id: 'cto_maison',
    segment: 'cto_sme',
    billing_mode: 'maison',
    display_name: 'Kairos CTO PME (LLM Maison)',
    price_eur: 149,
    per_seat: true,
    description: 'Veille techno équipe (5 sièges minimum), LLM Maison.',
  },
  {
    id: 'cto_byok',
    segment: 'cto_sme',
    billing_mode: 'byok',
    display_name: 'Kairos CTO PME (BYOK)',
    price_eur: 249,
    per_seat: true,
    description: 'Veille techno équipe avec vos clés LLM (5 sièges minimum).',
  },
  {
    id: 'newsletter_maison',
    segment: 'newsletter',
    billing_mode: 'maison',
    display_name: 'Kairos Newsletter (LLM Maison)',
    price_eur: 499,
    per_seat: false,
    default_seats: 3,
    description: '3 éditeurs inclus, backtest illimité, API + webhooks.',
  },
  {
    id: 'newsletter_byok',
    segment: 'newsletter',
    billing_mode: 'byok',
    display_name: 'Kairos Newsletter (BYOK)',
    price_eur: 799,
    per_seat: false,
    default_seats: 3,
    description: '3 éditeurs + branding white-label + custom domain.',
  },
  {
    id: 'brand_maison',
    segment: 'brand',
    billing_mode: 'maison',
    display_name: 'Kairos Brand (LLM Maison)',
    price_eur: 499,
    per_seat: true,
    description: 'Brand monitoring + sentiment + author reputation.',
  },
  {
    id: 'brand_byok',
    segment: 'brand',
    billing_mode: 'byok',
    display_name: 'Kairos Brand (BYOK)',
    price_eur: 799,
    per_seat: true,
    description: 'Brand monitoring avec tenant isolé.',
  },
  {
    id: 'legal_maison',
    segment: 'legal',
    billing_mode: 'maison',
    display_name: 'Kairos Legal IA Act (LLM Maison)',
    price_eur: 399,
    per_seat: true,
    description: 'Sources EU AI Office + cross-source corroboration.',
  },
  {
    id: 'legal_byok',
    segment: 'legal',
    billing_mode: 'byok',
    display_name: 'Kairos Legal IA Act (BYOK)',
    price_eur: 699,
    per_seat: true,
    description: 'Tenant isolé + audit log compliance.',
  },
  {
    id: 'vc_maison',
    segment: 'vc_pe',
    billing_mode: 'maison',
    display_name: 'Kairos VC / PE (LLM Maison)',
    price_eur: 599,
    per_seat: true,
    description: 'Sources tier 1 IA + alertes lifecycle + author reputation.',
  },
  {
    id: 'vc_byok',
    segment: 'vc_pe',
    billing_mode: 'byok',
    display_name: 'Kairos VC / PE (BYOK)',
    price_eur: 999,
    per_seat: true,
    description: 'BYOK Opus + tenant dédié + SLA 99,9 %.',
  },
]

const ADDONS: ReadonlyArray<AddOn> = [
  {
    id: 'addon_webhooks',
    display_name: 'Webhooks Slack/Teams illimités',
    price_eur: 49,
    recurring: 'month',
    description: 'Push des signaux ≥ score X dans vos canaux Slack/Teams.',
  },
  {
    id: 'addon_api_public',
    display_name: 'API publique read+write',
    price_eur: 99,
    recurring: 'month',
    description: 'Accès programmatique aux signaux scorés.',
  },
  {
    id: 'addon_custom_sources',
    display_name: 'Custom sources (RSS, listes privées)',
    price_eur: 199,
    recurring: 'month',
    description: 'Ajoutez vos propres flux au scraping.',
  },
  {
    id: 'addon_audit_log',
    display_name: 'Audit log + export Compliance',
    price_eur: 149,
    recurring: 'month',
    description: 'Traçabilité complète des actions + export CSV.',
  },
  {
    id: 'addon_tenant_isolated',
    display_name: 'Tenant isolé',
    price_eur: 299,
    recurring: 'month',
    description: 'Schéma Postgres dédié pour vos données.',
  },
  {
    id: 'addon_selfhost',
    display_name: 'Self-host Docker bundle',
    price_eur: 499,
    recurring: 'year',
    description: 'Hébergez Kairos dans votre infra (bundle Docker + support).',
  },
  {
    id: 'addon_csm_dedicated',
    display_name: 'CSM dédié + onboarding',
    price_eur: 999,
    recurring: 'year',
    description: 'Customer Success Manager attribué + sessions de formation.',
  },
  {
    id: 'addon_backtest_unlimited',
    display_name: 'Backtest grilles illimité',
    price_eur: 149,
    recurring: 'month',
    description: 'Backtest des rubriques sur 30 jours sans cap.',
  },
  {
    id: 'addon_reputation_api',
    display_name: 'Author Reputation API',
    price_eur: 199,
    recurring: 'month',
    description: 'API trust score auteurs (à venir Wave 8).',
  },
]

interface CatalogEntry {
  product_id: string
  price_id: string
}

type Catalog = Record<string, CatalogEntry>

/**
 * Récupère un produit Stripe par `metadata.kairos_sku` (clé d'idempotence).
 * Retourne `null` si aucun produit ne correspond.
 */
async function findProductBySkuId(stripe: Stripe, skuId: string): Promise<Stripe.Product | null> {
  const result = await stripe.products.search({
    query: `metadata['kairos_sku']:'${skuId}'`,
    limit: 1,
  })
  return result.data[0] ?? null
}

/**
 * Crée ou met à jour un produit Stripe pour un SKU donné.
 */
async function upsertSkuProduct(stripe: Stripe, sku: SKU): Promise<Stripe.Product> {
  const metadata: Record<string, string> = {
    kairos_sku: sku.id,
    segment: sku.segment,
    billing_mode: sku.billing_mode,
    per_seat: String(sku.per_seat),
  }
  if (sku.default_seats !== undefined) {
    metadata.default_seats = String(sku.default_seats)
  }

  const existing = await findProductBySkuId(stripe, sku.id)
  if (existing) {
    return await stripe.products.update(existing.id, {
      name: sku.display_name,
      description: sku.description,
      metadata,
    })
  }
  return await stripe.products.create({
    name: sku.display_name,
    description: sku.description,
    metadata,
  })
}

/**
 * Crée ou met à jour un produit add-on Stripe.
 */
async function upsertAddonProduct(stripe: Stripe, addon: AddOn): Promise<Stripe.Product> {
  const metadata: Record<string, string> = {
    kairos_sku: addon.id,
    type: 'addon',
    recurring: addon.recurring,
  }
  const existing = await findProductBySkuId(stripe, addon.id)
  if (existing) {
    return await stripe.products.update(existing.id, {
      name: addon.display_name,
      description: addon.description,
      metadata,
    })
  }
  return await stripe.products.create({
    name: addon.display_name,
    description: addon.description,
    metadata,
  })
}

/**
 * Trouve un prix actif récurrent existant qui matche `interval` + `unit_amount`.
 * Retourne `null` si aucun match. On ne supprime jamais les anciens prix
 * (Stripe les déprécie automatiquement quand on en attache un nouveau au produit).
 */
async function findMatchingPrice(
  stripe: Stripe,
  productId: string,
  interval: 'month' | 'year',
  unitAmount: number,
): Promise<Stripe.Price | null> {
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 })
  return (
    prices.data.find(
      (p) =>
        p.recurring?.interval === interval && p.unit_amount === unitAmount && p.currency === 'eur',
    ) ?? null
  )
}

async function upsertSkuPrice(stripe: Stripe, sku: SKU, productId: string): Promise<Stripe.Price> {
  const unitAmount = sku.price_eur * 100
  const existing = await findMatchingPrice(stripe, productId, 'month', unitAmount)
  if (existing) return existing
  return await stripe.prices.create({
    product: productId,
    currency: 'eur',
    unit_amount: unitAmount,
    recurring: { interval: 'month' },
    metadata: { kairos_sku: sku.id },
  })
}

async function upsertAddonPrice(
  stripe: Stripe,
  addon: AddOn,
  productId: string,
): Promise<Stripe.Price> {
  const unitAmount = addon.price_eur * 100
  const existing = await findMatchingPrice(stripe, productId, addon.recurring, unitAmount)
  if (existing) return existing
  return await stripe.prices.create({
    product: productId,
    currency: 'eur',
    unit_amount: unitAmount,
    recurring: { interval: addon.recurring },
    metadata: { kairos_sku: addon.id },
  })
}

async function main(): Promise<void> {
  const apiKey = Deno.env.get('STRIPE_SECRET_KEY')
  if (!apiKey) {
    console.error('STRIPE_SECRET_KEY env required')
    Deno.exit(1)
  }
  if (!apiKey.startsWith('sk_test_') && !apiKey.startsWith('sk_live_')) {
    console.error('STRIPE_SECRET_KEY must start with sk_test_ or sk_live_')
    Deno.exit(1)
  }

  const env: 'test' | 'live' = apiKey.startsWith('sk_test_') ? 'test' : 'live'
  const stripe = new Stripe(apiKey, {
    // Latest API version pinned ; à bumper via skill stripe:upgrade-stripe.
    apiVersion: '2026-04-22.dahlia' as Stripe.LatestApiVersion,
  })

  console.log(`Bootstrap Stripe (${env} mode)`)
  console.log(`  ${SKUS.length} SKUs + ${ADDONS.length} add-ons à synchroniser\n`)

  const result: Catalog = {}
  const errors: Array<{ id: string; error: string }> = []

  for (const sku of SKUS) {
    try {
      const product = await upsertSkuProduct(stripe, sku)
      const price = await upsertSkuPrice(stripe, sku, product.id)
      result[sku.id] = { product_id: product.id, price_id: price.id }
      console.log(`  OK  ${sku.id.padEnd(22)} ${product.id} / ${price.id}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push({ id: sku.id, error: message })
      console.error(`  ERR ${sku.id.padEnd(22)} ${message}`)
    }
  }

  for (const addon of ADDONS) {
    try {
      const product = await upsertAddonProduct(stripe, addon)
      const price = await upsertAddonPrice(stripe, addon, product.id)
      result[addon.id] = { product_id: product.id, price_id: price.id }
      console.log(`  OK  ${addon.id.padEnd(22)} ${product.id} / ${price.id}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push({ id: addon.id, error: message })
      console.error(`  ERR ${addon.id.padEnd(22)} ${message}`)
    }
  }

  const outFile = `stripe-prices.${env}.json`
  await Deno.writeTextFile(outFile, JSON.stringify(result, null, 2) + '\n')
  console.log(
    `\n${Object.keys(result).length}/${SKUS.length + ADDONS.length} entrées écrites dans ${outFile}`,
  )

  if (errors.length > 0) {
    console.error(`\n${errors.length} erreur(s) :`)
    for (const e of errors) console.error(`  - ${e.id} : ${e.error}`)
    Deno.exit(1)
  }

  console.log('\nProchaine étape : copier le contenu du JSON dans le secret Supabase :')
  console.log(`  bunx supabase secrets set STRIPE_PRICES_CATALOG="$(cat ${outFile})"`)
  console.log(`  bunx supabase secrets set STRIPE_SECRET_KEY=${apiKey.slice(0, 12)}...`)
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error('Bootstrap failed :', message)
  Deno.exit(1)
})
