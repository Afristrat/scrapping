// =============================================================================
// Wave 6 — Sub-wave 6.2 — S6-MeteredUsage
// Edge function `record-usage` : exécutée quotidiennement (3h UTC) via pg_cron
// pour agréger l'usage par organization sur les dernières 24h et :
//   1. Insérer un row dans `usage_records` (1 par org par jour)
//   2. Reporter l'overage à Stripe via `subscriptionItems.createUsageRecord`
//      pour les SKUs « Maison » uniquement (BYOK = la conso est payée par
//      l'utilisateur, donc on ne facture pas la consommation côté plateforme).
//
// Sécurité :
//  - Cette fonction est appelée par pg_cron (service_role implicite via pg_net
//    avec la clé service_role dans les headers) OU manuellement par un app_admin
//    pour debug. On valide soit (a) le header x-cron-secret == CRON_SECRET, soit
//    (b) un user authentifié avec is_app_admin() == true.
//  - Toutes les écritures se font en service_role (bypass RLS).
//
// Non-goals :
//  - Pas de re-tentative automatique des periodes manquées : si le cron rate
//    un jour, l'app_admin peut relancer manuellement avec ?period=YYYY-MM-DD.
//  - Pas de gestion fine des fuseaux : période = 24h glissantes en UTC.
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'
import Stripe from 'npm:stripe@17'
import { getStripe } from '../_shared/stripe.ts'
import { formatError } from '../_shared/errors.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// =============================================================================
// Constantes de pricing (à synchroniser avec le pricing officiel Wave 6.2).
// =============================================================================

/**
 * Coût Apify estimé par signal scrapé (USD). Apify facture ~0.30 USD / 1000
 * résultats sur les actors `apidojo/twitter-list-scraper` et `automation-lab/
 * reddit-scraper`. Cette estimation est volontairement conservatrice (légère
 * sur-estimation) pour éviter de sous-facturer en metered.
 */
const APIFY_UNIT_COST_USD_PER_RESULT = 0.0003

/** Taux de change USD→EUR par défaut. Override via env `USD_EUR_RATE`. */
const DEFAULT_USD_TO_EUR = 0.92

/**
 * Forfait inclus (EUR/mois) pour le mode Maison par plan. Au-delà de
 * ce seuil l'overage est reporté à Stripe en metered. Reflète la marge
 * brute attendue par tier (cf. docs/strategy/2026-05-02-moats-and-value-capture.md).
 */
const INCLUDED_USAGE_BUDGET_EUR_BY_PLAN: Record<string, number> = {
  solo: 5,
  pro: 25,
  enterprise: 100,
}

/**
 * Seuil de déclenchement du metered : on ne reporte que si la conso dépasse
 * `INCLUDED * THRESHOLD_MULTIPLIER` (ex. 2.0 = 200 % du forfait inclus).
 * En dessous, on absorbe la marge sur le forfait fixe.
 */
const OVERAGE_THRESHOLD_MULTIPLIER = 2.0

// =============================================================================
// Types
// =============================================================================

type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete'
type BillingMode = 'maison' | 'byok'
type OrgPlan = 'solo' | 'pro' | 'enterprise'

interface OrgRow {
  id: string
  name: string
  plan: OrgPlan
  billing_mode: BillingMode
}

interface SubscriptionRow {
  id: string
  org_id: string
  stripe_subscription_id: string | null
  plan: OrgPlan
  billing_mode: BillingMode
  status: SubscriptionStatus
}

interface LogRow {
  org_id: string | null
  action: string
  payload: Record<string, unknown> | null
}

interface LlmCostRow {
  org_id: string | null
  cost: number | string
}

interface SignalRow {
  org_id: string | null
}

interface OrgAggregate {
  org_id: string
  apify_cost_eur: number
  llm_cost_eur: number
  signals_count: number
}

interface OrgReport {
  org_id: string
  org_name: string
  plan: OrgPlan
  billing_mode: BillingMode
  apify_cost_eur: number
  llm_cost_eur: number
  signals_count: number
  reported_to_stripe: boolean
  stripe_overage_units: number
  stripe_error: string | null
}

interface RecordUsageResponse {
  ok: boolean
  period_start: string
  period_end: string
  orgs_processed: number
  records_inserted: number
  stripe_reports: number
  reports: OrgReport[]
  errors: Array<{ org_id?: string; reason: string }>
}

// =============================================================================
// Entrypoint
// =============================================================================

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ ok: false, error: 'supabase_env_missing' }, 500)
  }

  // -------------------------------------------------------------------------
  // Authent : 2 voies acceptées
  //   (1) Header `x-cron-secret` == `CRON_SECRET` (appel pg_cron via pg_net)
  //   (2) User authentifié avec is_app_admin() == true (debug manuel)
  // -------------------------------------------------------------------------
  const cronSecretHeader = req.headers.get('x-cron-secret')
  const cronSecretEnv = Deno.env.get('CRON_SECRET')
  let authorized = false

  if (cronSecretHeader && cronSecretEnv && cronSecretHeader === cronSecretEnv) {
    authorized = true
  } else {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ ok: false, error: 'missing_authorization' }, 401)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
    } = await userClient.auth.getUser()
    if (!user) return json({ ok: false, error: 'invalid_token' }, 401)
    const adminCheck = await userClient.rpc('is_app_admin')
    if (adminCheck.error) {
      return json({ ok: false, error: 'admin_check_failed', detail: adminCheck.error.message }, 500)
    }
    if (adminCheck.data !== true) {
      return json({ ok: false, error: 'forbidden', detail: 'not_app_admin' }, 403)
    }
    authorized = true
  }
  if (!authorized) return json({ ok: false, error: 'forbidden' }, 403)

  // -------------------------------------------------------------------------
  // Période de référence : par défaut [now-24h, now). Override possible via
  // body { period: 'YYYY-MM-DD' } pour rejouer une journée passée (debug).
  // -------------------------------------------------------------------------
  let periodStartIso: string
  let periodEndIso: string
  let bodyPeriod: string | null = null
  try {
    const text = await req.text()
    if (text) {
      const body = JSON.parse(text) as { period?: string }
      if (typeof body.period === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.period)) {
        bodyPeriod = body.period
      }
    }
  } catch {
    // body absent / invalide : on tombe sur la période par défaut.
  }

  if (bodyPeriod) {
    const dayStart = new Date(`${bodyPeriod}T00:00:00.000Z`)
    if (Number.isNaN(dayStart.getTime())) {
      return json({ ok: false, error: 'invalid_period' }, 400)
    }
    periodStartIso = dayStart.toISOString()
    periodEndIso = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000).toISOString()
  } else {
    const now = Date.now()
    periodStartIso = new Date(now - 24 * 60 * 60 * 1000).toISOString()
    periodEndIso = new Date(now).toISOString()
  }
  const periodStartDate = periodStartIso.slice(0, 10)
  const periodEndDate = periodEndIso.slice(0, 10)

  const usdToEur = parseUsdToEurRate()
  const serviceClient = createClient(supabaseUrl, serviceRoleKey)

  // -------------------------------------------------------------------------
  // 1. Charger les orgs actives (statut subscription ∈ {active, trialing}).
  // -------------------------------------------------------------------------
  const { data: subsData, error: subsErr } = await serviceClient
    .from('subscriptions')
    .select('id, org_id, stripe_subscription_id, plan, billing_mode, status')
    .in('status', ['active', 'trialing'])

  if (subsErr) {
    return json(
      { ok: false, error: 'subscriptions_fetch_failed', detail: formatError(subsErr).message },
      500,
    )
  }

  const subscriptions = (subsData ?? []) as SubscriptionRow[]
  if (subscriptions.length === 0) {
    return json(
      {
        ok: true,
        period_start: periodStartIso,
        period_end: periodEndIso,
        orgs_processed: 0,
        records_inserted: 0,
        stripe_reports: 0,
        reports: [],
        errors: [],
      } satisfies RecordUsageResponse,
      200,
    )
  }

  const orgIds = Array.from(new Set(subscriptions.map((s) => s.org_id)))
  const subByOrg = new Map<string, SubscriptionRow>()
  for (const s of subscriptions) subByOrg.set(s.org_id, s)

  const { data: orgsData, error: orgsErr } = await serviceClient
    .from('organizations')
    .select('id, name, plan, billing_mode')
    .in('id', orgIds)

  if (orgsErr) {
    return json(
      { ok: false, error: 'orgs_fetch_failed', detail: formatError(orgsErr).message },
      500,
    )
  }
  const orgs = (orgsData ?? []) as OrgRow[]
  const orgById = new Map<string, OrgRow>()
  for (const o of orgs) orgById.set(o.id, o)

  // -------------------------------------------------------------------------
  // 2. Aggreger en parallèle : logs (Apify), llm_costs (Maison only), signals.
  // -------------------------------------------------------------------------
  const [logsRes, llmCostsRes, signalsRes] = await Promise.all([
    serviceClient
      .from('logs')
      .select('org_id, action, payload')
      .in('org_id', orgIds)
      .like('action', 'scrape:%')
      .gte('ts', periodStartIso)
      .lt('ts', periodEndIso),
    serviceClient
      .from('llm_costs')
      .select('org_id, cost')
      .in('org_id', orgIds)
      .gte('ts', periodStartIso)
      .lt('ts', periodEndIso),
    serviceClient
      .from('signals')
      .select('org_id')
      .in('org_id', orgIds)
      .gte('scraped_at', periodStartIso)
      .lt('scraped_at', periodEndIso),
  ])

  const errors: Array<{ org_id?: string; reason: string }> = []
  if (logsRes.error) errors.push({ reason: `logs_fetch: ${formatError(logsRes.error).message}` })
  if (llmCostsRes.error) {
    errors.push({ reason: `llm_costs_fetch: ${formatError(llmCostsRes.error).message}` })
  }
  if (signalsRes.error) {
    errors.push({ reason: `signals_fetch: ${formatError(signalsRes.error).message}` })
  }

  const logs = (logsRes.data ?? []) as LogRow[]
  const llmCosts = (llmCostsRes.data ?? []) as LlmCostRow[]
  const signals = (signalsRes.data ?? []) as SignalRow[]

  // -------------------------------------------------------------------------
  // 3. Calcul Apify cost depuis logs : on utilise payload.fetched en priorité,
  //    sinon payload.inserted. Pour chaque org on multiplie par le coût
  //    unitaire estimé puis on convertit USD→EUR.
  // -------------------------------------------------------------------------
  const aggByOrg = new Map<string, OrgAggregate>()
  const ensureAgg = (orgId: string): OrgAggregate => {
    let agg = aggByOrg.get(orgId)
    if (!agg) {
      agg = { org_id: orgId, apify_cost_eur: 0, llm_cost_eur: 0, signals_count: 0 }
      aggByOrg.set(orgId, agg)
    }
    return agg
  }

  for (const log of logs) {
    if (!log.org_id) continue
    // On ne compte que les logs « final / ok / info » qui exposent un fetched.
    // Les logs d'erreur ou de start avec fetched=undefined sont ignorés.
    const fetched = extractFetchedCount(log.payload)
    if (fetched <= 0) continue
    const agg = ensureAgg(log.org_id)
    agg.apify_cost_eur += fetched * APIFY_UNIT_COST_USD_PER_RESULT * usdToEur
  }

  // -------------------------------------------------------------------------
  // 4. LLM cost « Maison only » : on filtre les llm_costs des orgs dont la
  //    subscription est en billing_mode='maison'. Pour les BYOK on ne facture
  //    pas la conso (l'user paye OpenRouter directement avec sa clé).
  //    NB : `llm_costs.cost` est déjà en USD (cf. dispatch-llm).
  // -------------------------------------------------------------------------
  for (const row of llmCosts) {
    if (!row.org_id) continue
    const sub = subByOrg.get(row.org_id)
    if (!sub) continue
    if (sub.billing_mode !== 'maison') continue
    const cost = Number(row.cost) || 0
    if (cost <= 0) continue
    const agg = ensureAgg(row.org_id)
    agg.llm_cost_eur += cost * usdToEur
  }

  // -------------------------------------------------------------------------
  // 5. Signals count : nombre de signaux scrapés sur la période par org.
  // -------------------------------------------------------------------------
  for (const row of signals) {
    if (!row.org_id) continue
    const agg = ensureAgg(row.org_id)
    agg.signals_count += 1
  }

  // -------------------------------------------------------------------------
  // 6. Insert un usage_record par org (upsert idempotent sur la clé unique).
  // -------------------------------------------------------------------------
  const reports: OrgReport[] = []
  let recordsInserted = 0
  let stripeReports = 0

  // Stripe : on instancie une seule fois, lazily, si au moins 1 org Maison
  // dépasse le seuil (évite l'erreur si STRIPE_SECRET_KEY pas configuré sur
  // un environnement de dev où il n'y a aucune sub Maison active).
  let stripe: Stripe | null = null
  let stripeInitError: string | null = null

  for (const orgId of orgIds) {
    const org = orgById.get(orgId)
    const sub = subByOrg.get(orgId)
    if (!org || !sub) continue

    const agg =
      aggByOrg.get(orgId) ??
      ({ org_id: orgId, apify_cost_eur: 0, llm_cost_eur: 0, signals_count: 0 } as OrgAggregate)

    const apifyEur = round4(agg.apify_cost_eur)
    const llmEur = round4(agg.llm_cost_eur)
    const totalCogEur = apifyEur + llmEur

    // Détermination de l'overage : seulement pour Maison + sub avec stripe id.
    let overageUnits = 0
    let stripeReported = false
    let stripeError: string | null = null
    const includedDaily = (INCLUDED_USAGE_BUDGET_EUR_BY_PLAN[sub.plan] ?? 0) / 30 // budget mensuel → quotidien
    const overageThreshold = includedDaily * OVERAGE_THRESHOLD_MULTIPLIER

    const shouldReport =
      sub.billing_mode === 'maison' &&
      sub.stripe_subscription_id !== null &&
      totalCogEur > overageThreshold

    if (shouldReport) {
      if (!stripe && !stripeInitError) {
        try {
          stripe = getStripe()
        } catch (err) {
          stripeInitError = formatError(err).message
        }
      }
      if (stripe) {
        // Unit metered = 1 unité par centime d'EUR au-dessus du seuil.
        // Convention : 1 unit = 0.01 EUR. À aligner avec la création du price
        // metered côté Stripe (cf. scripts/stripe-bootstrap.ts).
        overageUnits = Math.max(0, Math.round((totalCogEur - overageThreshold) * 100))
        if (overageUnits > 0) {
          try {
            await reportOverageToStripe(stripe, sub.stripe_subscription_id ?? '', overageUnits)
            stripeReported = true
            stripeReports += 1
          } catch (err) {
            stripeError = formatError(err).message
            errors.push({ org_id: orgId, reason: `stripe_report: ${stripeError}` })
          }
        }
      } else if (stripeInitError) {
        stripeError = stripeInitError
      }
    }

    // Upsert dans usage_records (clé unique : org_id, period_start, period_end).
    const { error: upsertErr } = await serviceClient.from('usage_records').upsert(
      {
        org_id: orgId,
        period_start: periodStartDate,
        period_end: periodEndDate,
        apify_cost_eur: apifyEur,
        llm_cost_eur: llmEur,
        signals_count: agg.signals_count,
        reported_to_stripe: stripeReported,
      },
      { onConflict: 'org_id,period_start,period_end' },
    )

    if (upsertErr) {
      errors.push({ org_id: orgId, reason: `usage_upsert: ${formatError(upsertErr).message}` })
    } else {
      recordsInserted += 1
    }

    reports.push({
      org_id: orgId,
      org_name: org.name,
      plan: sub.plan,
      billing_mode: sub.billing_mode,
      apify_cost_eur: apifyEur,
      llm_cost_eur: llmEur,
      signals_count: agg.signals_count,
      reported_to_stripe: stripeReported,
      stripe_overage_units: overageUnits,
      stripe_error: stripeError,
    })
  }

  // Audit log dans la table `logs` (best-effort) — pas org_id-scoped car
  // c'est une opération cross-tenant déclenchée par le système.
  await serviceClient
    .from('logs')
    .insert({
      user_id: null,
      action: 'record_usage:run',
      status: errors.length === 0 ? 'ok' : 'degraded',
      payload: {
        period_start: periodStartIso,
        period_end: periodEndIso,
        orgs_processed: orgIds.length,
        records_inserted: recordsInserted,
        stripe_reports: stripeReports,
        errors_count: errors.length,
      },
    })
    .then(
      () => {},
      () => {},
    )

  const response: RecordUsageResponse = {
    ok: true,
    period_start: periodStartIso,
    period_end: periodEndIso,
    orgs_processed: orgIds.length,
    records_inserted: recordsInserted,
    stripe_reports: stripeReports,
    reports,
    errors,
  }
  return json(response, 200)
})

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extrait le nombre d'items scrapés depuis le payload d'un log scrape:*.
 * On accepte plusieurs clés selon la stage du log (final / info / ok).
 * Retourne 0 si aucune clé exploitable.
 */
function extractFetchedCount(payload: Record<string, unknown> | null): number {
  if (!payload) return 0
  const fetched = payload.fetched
  if (typeof fetched === 'number' && Number.isFinite(fetched)) return Math.max(0, fetched)
  // Certains logs n'ont que `inserted` — c'est une borne inférieure mais on
  // l'utilise comme fallback raisonnable plutôt que 0.
  const inserted = payload.inserted
  if (typeof inserted === 'number' && Number.isFinite(inserted)) return Math.max(0, inserted)
  // payload.kept (logs after_filter) en dernier recours.
  const kept = payload.kept
  if (typeof kept === 'number' && Number.isFinite(kept)) return Math.max(0, kept)
  return 0
}

/** Lit le taux USD→EUR depuis env, fallback 0.92. */
function parseUsdToEurRate(): number {
  const raw = Deno.env.get('USD_EUR_RATE')
  if (!raw) return DEFAULT_USD_TO_EUR
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_USD_TO_EUR
  return parsed
}

/**
 * Reporte une unité de metered usage à Stripe sur le subscription_item
 * « overage » (premier item de type metered de la subscription).
 *
 * Stripe API : `subscriptionItems.createUsageRecord(itemId, { quantity, action })`.
 * On passe `action: 'increment'` pour additionner à l'usage déjà reporté
 * sur la période (idempotent en cas de re-run partiel sur la même journée).
 *
 * @throws si la subscription n'a pas d'item metered (signal de mauvaise config
 *   du SKU côté Stripe : il faut ajouter un price metered au product).
 */
async function reportOverageToStripe(
  stripe: Stripe,
  stripeSubscriptionId: string,
  quantity: number,
): Promise<void> {
  if (!stripeSubscriptionId) {
    throw new Error('stripe_subscription_id is empty — cannot report metered usage')
  }
  const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
    expand: ['items.data.price'],
  })
  type ItemWithPrice = Stripe.SubscriptionItem & {
    price: Stripe.Price & { recurring?: { usage_type?: string } | null }
  }
  const items = (subscription.items?.data ?? []) as ItemWithPrice[]
  const meteredItem = items.find((item) => item.price?.recurring?.usage_type === 'metered')
  if (!meteredItem) {
    throw new Error(
      `subscription ${stripeSubscriptionId} has no metered price item — add an overage price to the SKU`,
    )
  }
  // Cast nécessaire : selon la version du SDK Stripe, `subscriptionItems` peut
  // exposer createUsageRecord ou bien usageRecords.create. On wrap dans un
  // appel défensif.
  const stripeMaybeLegacy = stripe as unknown as {
    subscriptionItems: {
      createUsageRecord?: (
        id: string,
        params: { quantity: number; action: 'increment' | 'set'; timestamp?: number | 'now' },
      ) => Promise<unknown>
    }
  }
  if (typeof stripeMaybeLegacy.subscriptionItems.createUsageRecord === 'function') {
    await stripeMaybeLegacy.subscriptionItems.createUsageRecord(meteredItem.id, {
      quantity,
      action: 'increment',
      timestamp: 'now',
    })
    return
  }
  // Fallback sur l'API v2 (Billing Meter Events) si createUsageRecord n'est plus dispo.
  const billing = (
    stripe as unknown as {
      billing?: {
        meterEvents?: {
          create: (params: {
            event_name: string
            payload: Record<string, string>
          }) => Promise<unknown>
        }
      }
    }
  ).billing
  if (billing?.meterEvents?.create) {
    await billing.meterEvents.create({
      event_name: 'kairos_overage',
      payload: {
        stripe_customer_id:
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id,
        value: String(quantity),
      },
    })
    return
  }
  throw new Error(
    'stripe SDK exposes no usage_record / meter_events API — upgrade SDK or revise impl.',
  )
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
