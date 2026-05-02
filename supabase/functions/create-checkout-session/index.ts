// =============================================================================
// Wave 6 — Sub-wave 6.2 — S6-CheckoutFlow
// Edge function `create-checkout-session` : crée une Stripe Checkout Session
// pour un (segment, billing_mode, seats, addons) donné. Le caller doit être
// owner de l'org cible.
//
// Flow :
//  1. Auth user (Authorization header)
//  2. Valider body { org_id, segment, seats, billing_mode, addons[] }
//  3. Vérifier que l'utilisateur est owner de l'org
//  4. Mapper (segment, billing_mode) → kairos_sku via buildSkuId
//     puis kairos_sku → stripe_price_id via getCatalogEntry
//  5. Récupérer/créer le Stripe customer (depuis subscription existante,
//     sinon stripe.customers.create avec billing_email de l'org)
//  6. Construire line_items (1 ligne SKU principal + N lignes add-ons)
//  7. Créer Checkout Session (mode subscription, trial 14 jours)
//  8. Retourner { url }
//
// Sécurité :
//  - Auth obligatoire (header Authorization)
//  - Caller doit être OWNER de l'org (pas admin, pas member)
//  - STRIPE_SECRET_KEY jamais lue côté client
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { audit, extractAuditContext } from '../_shared/audit.ts'
import { formatError } from '../_shared/errors.ts'
import {
  buildSkuId,
  getCatalogEntry,
  getStripe,
  type KairosBillingMode,
  type KairosSegment,
} from '../_shared/stripe.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TRIAL_PERIOD_DAYS = 14

const VALID_SEGMENTS: ReadonlySet<KairosSegment> = new Set([
  'solo',
  'cto_sme',
  'newsletter',
  'brand',
  'legal',
  'vc_pe',
])
const VALID_BILLING_MODES: ReadonlySet<KairosBillingMode> = new Set(['maison', 'byok'])

/** Add-on ids tels qu'utilisés côté frontend (cf. `src/lib/pricing.ts`). */
const VALID_ADDON_IDS: ReadonlySet<string> = new Set([
  'webhooks',
  'api_public',
  'custom_sources',
  'audit_log',
  'tenant_isolated',
  'selfhost',
  'csm_dedicated',
  'backtest_unlimited',
  'reputation_api',
])

/**
 * Convertit un add-on id frontend (`webhooks`) en kairos_sku catalogue
 * (`addon_webhooks`) — cf. `scripts/stripe-bootstrap.ts`.
 */
function addonSkuId(frontendId: string): string {
  return `addon_${frontendId}`
}

interface RequestBody {
  org_id?: string
  segment?: string
  seats?: number
  billing_mode?: string
  addons?: string[]
}

interface CheckoutResponse {
  url: string
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

function isKairosSegment(value: unknown): value is KairosSegment {
  return typeof value === 'string' && VALID_SEGMENTS.has(value as KairosSegment)
}

function isKairosBillingMode(value: unknown): value is KairosBillingMode {
  return typeof value === 'string' && VALID_BILLING_MODES.has(value as KairosBillingMode)
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  // 1. Authentication
  const auth = req.headers.get('Authorization')
  if (!auth) return jsonResponse({ error: 'missing_authorization' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) {
    return jsonResponse({ error: 'server_misconfigured' }, 500)
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
  })

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) return jsonResponse({ error: 'invalid_token' }, 401)

  // 2. Body validation
  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400)
  }

  const orgId = body.org_id
  const segment = body.segment
  const billingMode = body.billing_mode
  const seatsRaw = body.seats
  const addons = Array.isArray(body.addons) ? body.addons : []

  if (typeof orgId !== 'string' || orgId.length === 0) {
    return jsonResponse({ error: 'missing_org_id' }, 400)
  }
  if (!isKairosSegment(segment)) {
    return jsonResponse({ error: 'invalid_segment' }, 400)
  }
  if (!isKairosBillingMode(billingMode)) {
    return jsonResponse({ error: 'invalid_billing_mode' }, 400)
  }
  if (
    typeof seatsRaw !== 'number' ||
    !Number.isInteger(seatsRaw) ||
    seatsRaw < 1 ||
    seatsRaw > 100
  ) {
    return jsonResponse({ error: 'invalid_seats' }, 400)
  }
  for (const a of addons) {
    if (typeof a !== 'string' || !VALID_ADDON_IDS.has(a)) {
      return jsonResponse({ error: 'invalid_addon', detail: String(a) }, 400)
    }
  }
  const seats = seatsRaw

  // 3. Vérifier le rôle owner de l'org
  const { data: membership, error: membershipErr } = await supabase
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipErr) {
    return jsonResponse(
      { error: 'membership_lookup_failed', detail: formatError(membershipErr).message },
      500,
    )
  }
  if (!membership || membership.role !== 'owner') {
    return jsonResponse({ error: 'forbidden_owner_only' }, 403)
  }

  // 4. Mapping segment+mode → kairos_sku → stripe_price_id
  const kairosSku = buildSkuId(segment, billingMode)
  let mainEntry: { product_id: string; price_id: string }
  try {
    mainEntry = getCatalogEntry(kairosSku)
  } catch (err) {
    return jsonResponse(
      { error: 'sku_not_found', detail: formatError(err).message, kairos_sku: kairosSku },
      500,
    )
  }

  // Detect per-seat SKUs : tout sauf solo et newsletter (forfait flat).
  // Cf. `src/lib/pricing.ts` BASE_PRICES.per_seat.
  const isPerSeat = segment !== 'solo' && segment !== 'newsletter'
  const mainQuantity = isPerSeat ? seats : 1

  // Validation des add-ons : on récupère leur entrée catalogue avant de
  // créer la session pour échouer vite si un add-on manque.
  const addonEntries: Array<{ frontend_id: string; price_id: string }> = []
  for (const a of addons) {
    try {
      const entry = getCatalogEntry(addonSkuId(a))
      addonEntries.push({ frontend_id: a, price_id: entry.price_id })
    } catch (err) {
      return jsonResponse(
        { error: 'addon_sku_not_found', detail: formatError(err).message, addon: a },
        500,
      )
    }
  }

  // 5. Récupération / création du customer Stripe.
  // Le `stripe_customer_id` est stocké sur la table `subscriptions` (pas
  // `organizations`). On cherche d'abord une subscription existante pour
  // cette org, sinon on crée un nouveau customer Stripe.
  // Service-role pour pouvoir écrire dans subscriptions plus tard si besoin
  // (le webhook s'occupera du sync principal, mais on cache ici le customer
  // dès la création de la session pour les org sans subscription).
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const adminClient = serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null

  const { data: existingSub, error: subLookupErr } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('org_id', orgId)
    .not('stripe_customer_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (subLookupErr) {
    return jsonResponse(
      { error: 'subscription_lookup_failed', detail: formatError(subLookupErr).message },
      500,
    )
  }

  // On a aussi besoin du billing_email de l'org pour créer le customer.
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('billing_email, name, slug')
    .eq('id', orgId)
    .maybeSingle()

  if (orgErr || !org) {
    return jsonResponse(
      {
        error: 'org_lookup_failed',
        detail: formatError(orgErr ?? new Error('org_not_found')).message,
      },
      500,
    )
  }

  const stripe = getStripe()

  let stripeCustomerId: string
  if (existingSub?.stripe_customer_id) {
    stripeCustomerId = existingSub.stripe_customer_id
  } else {
    try {
      const customer = await stripe.customers.create({
        email: org.billing_email ?? user.email ?? undefined,
        name: org.name,
        metadata: { org_id: orgId, slug: org.slug },
      })
      stripeCustomerId = customer.id
    } catch (err) {
      return jsonResponse(
        { error: 'stripe_customer_create_failed', detail: formatError(err).message },
        500,
      )
    }
  }

  // 6. Construction des line_items.
  type LineItem = { price: string; quantity: number }
  const lineItems: LineItem[] = [{ price: mainEntry.price_id, quantity: mainQuantity }]
  for (const addon of addonEntries) {
    lineItems.push({ price: addon.price_id, quantity: 1 })
  }

  // 7. Création de la Checkout Session.
  const baseUrl = Deno.env.get('PUBLIC_BASE_URL') ?? 'https://scrap.ai-mpower.com'
  const successUrl = `${baseUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`
  const cancelUrl = `${baseUrl}/pricing?checkout=cancelled`

  let session
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: lineItems,
      metadata: {
        org_id: orgId,
        kairos_sku: kairosSku,
        seats: String(seats),
        billing_mode: billingMode,
        segment,
        addons: addons.join(','),
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        trial_period_days: TRIAL_PERIOD_DAYS,
        metadata: {
          org_id: orgId,
          kairos_sku: kairosSku,
          seats: String(seats),
          billing_mode: billingMode,
          segment,
        },
      },
      allow_promotion_codes: true,
    })
  } catch (err) {
    return jsonResponse(
      { error: 'stripe_checkout_create_failed', detail: formatError(err).message },
      500,
    )
  }

  if (!session.url) {
    return jsonResponse({ error: 'stripe_checkout_no_url' }, 500)
  }

  // 8. Audit log (best-effort) — utiliser le client RLS pour rester scope org
  await audit(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: 'org.billing_change',
    severity: 'info',
    entity_type: 'checkout_session',
    entity_id: session.id,
    description: `Création Checkout Session ${kairosSku} (${seats} sièges)`,
    metadata: {
      kairos_sku: kairosSku,
      segment,
      billing_mode: billingMode,
      seats,
      addons,
      stripe_customer_id: stripeCustomerId,
      stripe_session_id: session.id,
    },
    ...extractAuditContext(req),
  })

  // Si on vient de créer un customer et que l'admin client est dispo, on
  // peut pré-cacher le customer_id dans subscriptions pour éviter de re-créer
  // un customer si le user relance un checkout avant que le webhook ait
  // tourné. Best-effort — n'échoue pas.
  if (!existingSub?.stripe_customer_id && adminClient) {
    try {
      await adminClient.from('subscriptions').upsert(
        {
          org_id: orgId,
          stripe_customer_id: stripeCustomerId,
          plan: segment === 'solo' ? 'solo' : 'pro',
          billing_mode: billingMode,
          seats,
          status: 'incomplete',
        },
        { onConflict: 'stripe_subscription_id', ignoreDuplicates: true },
      )
    } catch (err) {
      console.error('subscriptions_precache_failed', formatError(err))
    }
  }

  const response: CheckoutResponse = { url: session.url }
  return jsonResponse(response, 200)
})
