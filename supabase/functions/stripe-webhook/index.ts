// =============================================================================
// Wave 6 — Sub-wave 6.2 — Story S6-StripeWebhook
// Edge function `stripe-webhook` : récepteur des events Stripe pour synchroniser
// la table `subscriptions` et logguer les changements dans `audit_log`.
//
// Events traités :
//   - customer.subscription.created  → upsert subscriptions (status active/trialing)
//   - customer.subscription.updated  → upsert subscriptions (sync seats, dates, status)
//   - customer.subscription.deleted  → status='canceled' + audit
//   - invoice.paid                   → status='active' + audit org.billing_change
//   - invoice.payment_failed         → status='past_due' + audit org.billing_change (warning)
//
// Sécurité critique :
//   1. Body lu en RAW via `req.text()` (signature Stripe = HMAC du body brut).
//      JAMAIS via `req.json()` — l'instance JSON.parse + restringify casserait
//      la signature.
//   2. Header `stripe-signature` requis. Refus 401 si absent ou invalide.
//   3. Le webhook est public (Stripe ne peut pas envoyer de JWT Supabase) — la
//      protection repose ENTIÈREMENT sur la signature HMAC + STRIPE_WEBHOOK_SECRET.
//      → Déployer avec `--no-verify-jwt` :
//        `bunx supabase functions deploy stripe-webhook --no-verify-jwt`
//   4. Toutes les écritures DB se font via `service_role` (bypass RLS) — c'est
//      un webhook server-to-server, pas un appel user.
//
// Idempotence :
//   Stripe peut retry les webhooks. Tous les writes utilisent `upsert` sur
//   `stripe_subscription_id` (UNIQUE), donc replay safe. Les audit logs ne sont
//   pas dédupliqués (volontaire — on garde la trace de chaque retry).
// =============================================================================
// Depends on:
//   _shared/stripe.ts  (verifyWebhookEvent, splitSku, planForSegment)
//   _shared/audit.ts   (audit, AuditAction='org.billing_change')
//   _shared/errors.ts  (formatError)
// =============================================================================

import Stripe from 'npm:stripe@17'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { planForSegment, splitSku, verifyWebhookEvent } from '../_shared/stripe.ts'
import { audit, extractAuditContext } from '../_shared/audit.ts'
import { formatError } from '../_shared/errors.ts'

// CORS minimal : seul Stripe doit appeler cet endpoint, mais on garde
// l'OPTIONS preflight pour cohérence avec les autres edge fns. Le header
// `stripe-signature` doit être autorisé pour que la verif passe en POST.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

// -------------------------------------------------------------------------
// Types pour le row `subscriptions` qu'on upsert. Conforme au schema défini
// dans 20260502000001_orgs.sql.
// -------------------------------------------------------------------------

type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete'

interface SubscriptionRow {
  org_id: string
  stripe_subscription_id: string
  stripe_customer_id: string | null
  plan: 'solo' | 'pro' | 'enterprise'
  billing_mode: 'maison' | 'byok'
  seats: number
  status: SubscriptionStatus
  current_period_start: string | null
  current_period_end: string | null
  trial_ends_at: string | null
}

/**
 * Mappe un statut Stripe (`Stripe.Subscription.Status`) vers notre ENUM
 * `subscription_status` (active|past_due|canceled|trialing|incomplete).
 *
 * Stripe expose plus de statuts (`unpaid`, `paused`, `incomplete_expired`,
 * etc.) qu'on collapse vers nos 5 valeurs canoniques.
 */
function mapStripeStatus(s: Stripe.Subscription.Status): SubscriptionStatus {
  switch (s) {
    case 'active':
      return 'active'
    case 'trialing':
      return 'trialing'
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled'
    case 'past_due':
    case 'unpaid':
      return 'past_due'
    case 'incomplete':
    case 'paused':
      return 'incomplete'
    default:
      // exhaustive check : si Stripe ajoute un statut, on le traite comme
      // `incomplete` par défaut pour éviter un crash, et on logue côté
      // appelant.
      return 'incomplete'
  }
}

/**
 * Convertit un timestamp Unix (secondes) Stripe en ISO 8601 pour Postgres
 * `TIMESTAMPTZ`. Retourne null si la valeur Stripe est manquante.
 */
function unixToIso(ts: number | null | undefined): string | null {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null
  return new Date(ts * 1000).toISOString()
}

/**
 * Extrait `org_id` + `kairos_sku` depuis la metadata d'une subscription
 * Stripe. La convention Wave 6.2 :
 *   - `metadata.kairos_org_id` : UUID de l'organization Kairos (REQUIS)
 *   - `metadata.kairos_sku`    : id catalogue (`solo_maison`, `vc_byok`, ...) (REQUIS)
 *
 * La `metadata` est posée par `create-checkout-session` (S6-CheckoutFlow).
 * On lit aussi `subscription.items.data[0].price.metadata.kairos_sku` en
 * fallback (le bootstrap pose la metadata sur le price ET sur le product).
 */
function extractMetadata(sub: Stripe.Subscription): {
  org_id: string | null
  kairos_sku: string | null
} {
  const orgId = sub.metadata?.kairos_org_id ?? null
  let sku = sub.metadata?.kairos_sku ?? null

  if (!sku) {
    // Fallback : lire le sku depuis le premier price item (le bootstrap
    // injecte `metadata.kairos_sku` sur le price ET sur le product).
    const firstItem = sub.items?.data?.[0]
    sku = firstItem?.price?.metadata?.kairos_sku ?? null
  }

  return { org_id: orgId, kairos_sku: sku }
}

/**
 * Construit le row à upsert dans `subscriptions` à partir d'un objet
 * `Stripe.Subscription`.
 *
 * @returns Row prêt à l'upsert OU null si la metadata requise est absente
 *   (cas pathologique : abonnement Stripe créé sans passer par notre
 *   Checkout flow → on logue + ignore plutôt que de planter).
 */
function buildSubscriptionRow(sub: Stripe.Subscription): SubscriptionRow | null {
  const { org_id, kairos_sku } = extractMetadata(sub)
  if (!org_id || !kairos_sku) {
    console.error('stripe-webhook missing metadata', {
      subscription_id: sub.id,
      has_org_id: !!org_id,
      has_kairos_sku: !!kairos_sku,
    })
    return null
  }

  let split: ReturnType<typeof splitSku>
  try {
    split = splitSku(kairos_sku)
  } catch (err) {
    console.error('stripe-webhook splitSku failed', {
      subscription_id: sub.id,
      kairos_sku,
      error: formatError(err),
    })
    return null
  }

  // Total seats = somme des `quantity` des line_items (per-seat SKUs) ou 1
  // (flat SKUs comme Newsletter). Min 1.
  const totalSeats = sub.items.data.reduce((acc, item) => acc + (item.quantity ?? 0), 0)
  const seats = Math.max(1, totalSeats)

  // Stripe customer peut être string (id) ou objet expandé. On veut juste
  // l'id ; les objets expandés exposent .id, les deletedCustomers aussi.
  const customerId = typeof sub.customer === 'string' ? sub.customer : (sub.customer?.id ?? null)

  return {
    org_id,
    stripe_subscription_id: sub.id,
    stripe_customer_id: customerId,
    plan: planForSegment(split.segment),
    billing_mode: split.billing_mode,
    seats,
    status: mapStripeStatus(sub.status),
    current_period_start: unixToIso(sub.current_period_start),
    current_period_end: unixToIso(sub.current_period_end),
    trial_ends_at: unixToIso(sub.trial_end),
  }
}

// -------------------------------------------------------------------------
// Handler
// -------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  // 1. Récupérer la signature ET le body BRUT (avant tout JSON parsing).
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return jsonResponse({ error: 'missing_stripe_signature' }, 401)
  }

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET missing in edge fn env')
    return jsonResponse({ error: 'server_misconfigured' }, 500)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Supabase env missing in stripe-webhook')
    return jsonResponse({ error: 'server_misconfigured' }, 500)
  }

  // Body brut. Stripe signe le payload byte-for-byte → JAMAIS req.json().
  let rawBody: string
  try {
    rawBody = await req.text()
  } catch (err) {
    console.error('stripe-webhook body read failed', formatError(err))
    return jsonResponse({ error: 'invalid_body' }, 400)
  }

  // 2. Verify signature — refus si invalide. C'est notre seule barrière
  //    d'authentification (le endpoint est public).
  let event: Stripe.Event
  try {
    event = await verifyWebhookEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    console.error('stripe-webhook signature verification failed', formatError(err))
    return jsonResponse({ error: 'invalid_signature' }, 401)
  }

  // 3. Service role client : bypass RLS pour upsert subscriptions + audit_log.
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const auditCtx = extractAuditContext(req)

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const row = buildSubscriptionRow(sub)
        if (!row) {
          // Metadata manquante : on accuse réception (200) pour éviter que
          // Stripe retry indéfiniment. La cause racine doit être corrigée
          // côté create-checkout-session.
          return jsonResponse({ ok: true, ignored: 'missing_metadata' }, 200)
        }

        // Snapshot avant pour le diff audit
        const { data: before } = await supabase
          .from('subscriptions')
          .select('plan, billing_mode, seats, status, current_period_end')
          .eq('stripe_subscription_id', sub.id)
          .maybeSingle()

        const { error: upsertErr } = await supabase
          .from('subscriptions')
          .upsert(row, { onConflict: 'stripe_subscription_id' })

        if (upsertErr) {
          console.error('subscriptions upsert failed', formatError(upsertErr))
          return jsonResponse({ error: 'db_write_failed' }, 500)
        }

        await audit(supabase, {
          org_id: row.org_id,
          user_id: null,
          action: 'org.billing_change',
          severity: 'info',
          entity_type: 'subscription',
          entity_id: sub.id,
          description:
            event.type === 'customer.subscription.created'
              ? `Abonnement Stripe créé (plan ${row.plan}, ${row.seats} sièges)`
              : `Abonnement Stripe mis à jour (statut ${row.status})`,
          diff: {
            before: before ?? null,
            after: {
              plan: row.plan,
              billing_mode: row.billing_mode,
              seats: row.seats,
              status: row.status,
              current_period_end: row.current_period_end,
            },
          },
          metadata: {
            stripe_event_id: event.id,
            stripe_event_type: event.type,
          },
          ...auditCtx,
        })

        return jsonResponse({ ok: true, action: 'upserted' }, 200)
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const { org_id } = extractMetadata(sub)

        const { data: existing } = await supabase
          .from('subscriptions')
          .select('org_id, plan, status')
          .eq('stripe_subscription_id', sub.id)
          .maybeSingle()

        const targetOrgId = org_id ?? existing?.org_id ?? null

        const { error: updateErr } = await supabase
          .from('subscriptions')
          .update({
            status: 'canceled',
            current_period_end: unixToIso(sub.current_period_end),
          })
          .eq('stripe_subscription_id', sub.id)

        if (updateErr) {
          console.error('subscription cancel failed', formatError(updateErr))
          return jsonResponse({ error: 'db_write_failed' }, 500)
        }

        if (targetOrgId) {
          await audit(supabase, {
            org_id: targetOrgId,
            user_id: null,
            action: 'org.billing_change',
            severity: 'warning',
            entity_type: 'subscription',
            entity_id: sub.id,
            description: 'Abonnement Stripe annulé',
            diff: {
              before: existing ?? null,
              after: { status: 'canceled' },
            },
            metadata: {
              stripe_event_id: event.id,
              stripe_event_type: event.type,
            },
            ...auditCtx,
          })
        }

        return jsonResponse({ ok: true, action: 'canceled' }, 200)
      }

      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        // Stripe.Invoice expose subscription en string|Subscription|null. On
        // veut juste l'id pour matcher notre row.
        // Pour la nouvelle API Stripe (2026-04-22.dahlia), parent contient
        // subscription_details ; en fallback on lit le champ legacy.
        const legacySub = (invoice as unknown as { subscription?: string | { id: string } | null })
          .subscription
        const subscriptionId =
          typeof legacySub === 'string'
            ? legacySub
            : (legacySub?.id ?? invoice.parent?.subscription_details?.subscription ?? null)

        if (!subscriptionId || typeof subscriptionId !== 'string') {
          // Invoice non liée à une subscription (one-shot) → ignoré.
          return jsonResponse({ ok: true, ignored: 'no_subscription' }, 200)
        }

        const newStatus: SubscriptionStatus = event.type === 'invoice.paid' ? 'active' : 'past_due'

        const { data: existing } = await supabase
          .from('subscriptions')
          .select('org_id, status')
          .eq('stripe_subscription_id', subscriptionId)
          .maybeSingle()

        if (!existing) {
          // Webhook reçu avant le sync `customer.subscription.created` (rare
          // mais possible). On accuse réception sans erreur — la prochaine
          // edition de la subscription le fixera.
          return jsonResponse({ ok: true, ignored: 'subscription_not_synced_yet' }, 200)
        }

        const { error: updateErr } = await supabase
          .from('subscriptions')
          .update({ status: newStatus })
          .eq('stripe_subscription_id', subscriptionId)

        if (updateErr) {
          console.error('subscription status update failed', formatError(updateErr))
          return jsonResponse({ error: 'db_write_failed' }, 500)
        }

        await audit(supabase, {
          org_id: existing.org_id,
          user_id: null,
          action: 'org.billing_change',
          severity: event.type === 'invoice.payment_failed' ? 'warning' : 'info',
          entity_type: 'invoice',
          entity_id: invoice.id ?? null,
          description:
            event.type === 'invoice.paid'
              ? 'Paiement de facture reçu — abonnement actif'
              : `Échec de paiement — abonnement passé en past_due`,
          diff: {
            before: { status: existing.status },
            after: { status: newStatus },
          },
          metadata: {
            stripe_event_id: event.id,
            stripe_event_type: event.type,
            invoice_id: invoice.id,
            amount_due: invoice.amount_due,
            amount_paid: invoice.amount_paid,
            currency: invoice.currency,
          },
          ...auditCtx,
        })

        return jsonResponse({ ok: true, action: 'status_updated', status: newStatus }, 200)
      }

      default:
        // Event non traité : on retourne 200 pour qu'il ne soit pas retried.
        // Stripe envoie beaucoup d'events qu'on ignore (charge.*, customer.*,
        // etc.) — pas une erreur.
        return jsonResponse({ ok: true, ignored: event.type }, 200)
    }
  } catch (err) {
    // Garde-fou : tout throw inattendu ne doit pas exposer la stack à Stripe.
    console.error('stripe-webhook unhandled error', formatError(err))
    return jsonResponse({ error: 'internal_error' }, 500)
  }
})
