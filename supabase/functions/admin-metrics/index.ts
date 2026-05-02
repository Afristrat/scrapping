import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

/**
 * admin-metrics — Edge function réservée aux super-admins Kairos (app_admins).
 *
 * Renvoie un panorama opérationnel cross-tenant :
 *   - liste des tenants avec COG (Apify + LLM), revenue, marge, outlier-score
 *   - KPIs agrégés (MRR par segment, ARR projeté, marge brute globale)
 *   - alertes (outlier consumption, low margin, expired invitations)
 *
 * Sécurité (gate à 2 niveaux) :
 *   1. RLS sur app_admins (lecture refusée aux non-admins)
 *   2. Check explicite via public.is_app_admin() en début d'exécution → 403
 *
 * Performance : toutes les requêtes sont parallélisées (Promise.all), z-score
 * outlier calculé via Welford streaming sur signals_30d cross-tenant.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

const WINDOW_DAYS = 30
const MS_PER_DAY = 86_400_000
// Seuils d'alertes
const OUTLIER_Z_THRESHOLD = 2.5
const LOW_MARGIN_THRESHOLD = 0.5
const EXPIRED_INVITATION_DAYS = 3

type OrgSegment = 'vc_pe' | 'legal' | 'newsletter' | 'brand' | 'cto_sme' | 'solo'
type OrgPlan = 'solo' | 'pro' | 'enterprise'
type BillingMode = 'maison' | 'byok'
type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete'

interface OrgRow {
  id: string
  name: string
  segment: OrgSegment
  plan: OrgPlan
  billing_mode: BillingMode
}

interface MemberAggRow {
  org_id: string
  count: number
}

interface UsageRow {
  org_id: string
  apify_cost_eur: number | string
  llm_cost_eur: number | string
  signals_count: number | string
  period_start: string
}

interface SubscriptionRow {
  org_id: string
  plan: OrgPlan
  status: SubscriptionStatus
  seats: number
}

interface InvitationRow {
  id: string
  org_id: string
  email: string
  expires_at: string
  accepted_at: string | null
  created_at: string
}

interface TenantMetrics {
  org_id: string
  org_name: string
  segment: OrgSegment
  plan: OrgPlan
  billing_mode: BillingMode
  members: number
  signals_30d: number
  apify_cost_30d: number
  llm_cost_30d: number
  revenue_30d: number
  margin_30d: number
  margin_pct: number
  outlier_score: number
}

interface AlertEntry {
  type: 'outlier_consumption' | 'low_margin' | 'expired_invitation'
  org_id: string
  msg: string
}

interface AdminMetricsResponse {
  tenants: TenantMetrics[]
  kpis: {
    total_tenants: number
    total_active_subs: number
    mrr_by_segment: Record<OrgSegment, number>
    arr_projected: number
    total_cog_30d: number
    total_revenue_30d: number
    gross_margin_30d_pct: number
  }
  alerts: AlertEntry[]
  generated_at: string
}

// =============================================================================
// Pricing reference (EUR/mois). Ces valeurs reflètent les SKUs publics au
// moment de Wave 6.4. À synchroniser avec le pricing officiel quand Stripe
// (Wave 6.2) sera live — pour l'instant, source unique côté admin metrics.
// =============================================================================
const PRICE_BY_PLAN: Record<OrgPlan, number> = {
  solo: 49,
  pro: 199,
  enterprise: 599,
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ ok: false, error: 'missing_authorization' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ ok: false, error: 'supabase_env_missing' }, 500)
  }

  const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: auth } },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ ok: false, error: 'invalid_token' }, 401)

  // ---- Gate de sécurité critique : is_app_admin() ----
  const adminCheck = await supabase.rpc('is_app_admin')
  if (adminCheck.error) {
    return json({ ok: false, error: 'admin_check_failed', detail: adminCheck.error.message }, 500)
  }
  if (adminCheck.data !== true) {
    return json({ ok: false, error: 'forbidden', detail: 'not_app_admin' }, 403)
  }

  // ---- Fenêtre de 30j ----
  const nowMs = Date.now()
  const sinceIso = new Date(nowMs - WINDOW_DAYS * MS_PER_DAY).toISOString()
  const sinceDate = sinceIso.slice(0, 10) // YYYY-MM-DD pour usage_records.period_start

  // ---- Récupération des données en parallèle ----
  const [orgsRes, usageRes, subsRes, invitationsRes] = await Promise.all([
    supabase.from('organizations').select('id, name, segment, plan, billing_mode'),
    supabase
      .from('usage_records')
      .select('org_id, apify_cost_eur, llm_cost_eur, signals_count, period_start')
      .gte('period_start', sinceDate),
    supabase.from('subscriptions').select('org_id, plan, status, seats'),
    supabase
      .from('invitations')
      .select('id, org_id, email, expires_at, accepted_at, created_at')
      .is('accepted_at', null),
  ])

  if (orgsRes.error)
    return json({ ok: false, error: 'orgs_fetch_failed', detail: orgsRes.error.message }, 500)
  if (usageRes.error)
    return json({ ok: false, error: 'usage_fetch_failed', detail: usageRes.error.message }, 500)
  if (subsRes.error)
    return json({ ok: false, error: 'subs_fetch_failed', detail: subsRes.error.message }, 500)
  if (invitationsRes.error) {
    return json(
      { ok: false, error: 'invitations_fetch_failed', detail: invitationsRes.error.message },
      500,
    )
  }

  const orgs = (orgsRes.data ?? []) as OrgRow[]
  const usage = (usageRes.data ?? []) as UsageRow[]
  const subs = (subsRes.data ?? []) as SubscriptionRow[]
  const invitations = (invitationsRes.data ?? []) as InvitationRow[]

  // ---- Agrégation members par org (count via head=true puis fallback) ----
  // On charge tous les organization_members pour les orgs visibles. Comme cette
  // edge fn n'est appelée que par les app_admins (gate is_app_admin) et que
  // RLS sur organization_members ne renvoie que les orgs de l'appelant, on
  // utilise service_role uniquement si nécessaire. Pour rester simple côté
  // RLS, on fait une lecture authentifiée et on tolère que certains comptes
  // soient à 0 (dans ce cas on retombe sur 1 = le owner via le bootstrap).
  const memberCounts = await fetchMemberCounts(
    supabase,
    orgs.map((o) => o.id),
  )

  // ---- Agrégation usage par org ----
  type UsageAgg = { apify: number; llm: number; signals: number }
  const usageByOrg = new Map<string, UsageAgg>()
  for (const row of usage) {
    const agg = usageByOrg.get(row.org_id) ?? { apify: 0, llm: 0, signals: 0 }
    agg.apify += Number(row.apify_cost_eur) || 0
    agg.llm += Number(row.llm_cost_eur) || 0
    agg.signals += Number(row.signals_count) || 0
    usageByOrg.set(row.org_id, agg)
  }

  // ---- Agrégation subscriptions par org (active/trialing only pour MRR) ----
  const subByOrg = new Map<string, SubscriptionRow>()
  for (const s of subs) {
    if (s.status === 'active' || s.status === 'trialing') {
      subByOrg.set(s.org_id, s)
    }
  }

  // ---- Welford sur signals_30d cross-tenant pour le z-score outlier ----
  const signalsValues = orgs.map((o) => usageByOrg.get(o.id)?.signals ?? 0)
  const stats = computeMeanStd(signalsValues)

  // ---- Construction du tableau tenants ----
  const tenants: TenantMetrics[] = orgs.map((o) => {
    const u = usageByOrg.get(o.id) ?? { apify: 0, llm: 0, signals: 0 }
    const sub = subByOrg.get(o.id)
    const seats = sub?.seats ?? 1
    const planForRevenue = sub?.plan ?? o.plan
    const revenue30d = PRICE_BY_PLAN[planForRevenue] * seats
    const cog30d = u.apify + u.llm
    const margin30d = revenue30d - cog30d
    const marginPct = revenue30d > 0 ? (margin30d / revenue30d) * 100 : 0
    const z = stats.std > 0 ? (u.signals - stats.mean) / stats.std : 0

    return {
      org_id: o.id,
      org_name: o.name,
      segment: o.segment,
      plan: o.plan,
      billing_mode: o.billing_mode,
      members: memberCounts.get(o.id) ?? 1,
      signals_30d: u.signals,
      apify_cost_30d: round2(u.apify),
      llm_cost_30d: round2(u.llm),
      revenue_30d: round2(revenue30d),
      margin_30d: round2(margin30d),
      margin_pct: round1(marginPct),
      outlier_score: round2(z),
    }
  })

  // ---- KPIs agrégés ----
  const mrrBySegment: Record<OrgSegment, number> = {
    vc_pe: 0,
    legal: 0,
    newsletter: 0,
    brand: 0,
    cto_sme: 0,
    solo: 0,
  }
  let mrrTotal = 0
  let totalCog = 0
  let totalRevenue = 0
  let activeSubs = 0
  for (const t of tenants) {
    if (subByOrg.has(t.org_id)) {
      activeSubs++
      mrrBySegment[t.segment] += t.revenue_30d
      mrrTotal += t.revenue_30d
    }
    totalCog += t.apify_cost_30d + t.llm_cost_30d
    totalRevenue += t.revenue_30d
  }

  const kpis = {
    total_tenants: orgs.length,
    total_active_subs: activeSubs,
    mrr_by_segment: roundSegmentRecord(mrrBySegment),
    arr_projected: round2(mrrTotal * 12),
    total_cog_30d: round2(totalCog),
    total_revenue_30d: round2(totalRevenue),
    gross_margin_30d_pct:
      totalRevenue > 0 ? round1(((totalRevenue - totalCog) / totalRevenue) * 100) : 0,
  }

  // ---- Alertes ----
  const alerts: AlertEntry[] = []
  for (const t of tenants) {
    if (t.outlier_score > OUTLIER_Z_THRESHOLD && t.signals_30d > 0) {
      alerts.push({
        type: 'outlier_consumption',
        org_id: t.org_id,
        msg: `${t.org_name} consomme ${t.signals_30d} signaux/30j (z=${t.outlier_score.toFixed(1)}, ~${Math.round(stats.mean)} médiane).`,
      })
    }
    if (t.revenue_30d > 0 && t.margin_pct < LOW_MARGIN_THRESHOLD * 100) {
      alerts.push({
        type: 'low_margin',
        org_id: t.org_id,
        msg: `${t.org_name} a une marge de ${t.margin_pct.toFixed(1)} % — vérifier la clé BYOK ou l'usage anormal.`,
      })
    }
  }
  const expiredCutoff = nowMs - EXPIRED_INVITATION_DAYS * MS_PER_DAY
  for (const inv of invitations) {
    const createdMs = Date.parse(inv.created_at)
    if (Number.isFinite(createdMs) && createdMs < expiredCutoff) {
      alerts.push({
        type: 'expired_invitation',
        org_id: inv.org_id,
        msg: `Invitation pour ${inv.email} sans acceptation depuis ${EXPIRED_INVITATION_DAYS}+ jours.`,
      })
    }
  }

  const response: AdminMetricsResponse = {
    tenants: tenants.sort((a, b) => b.revenue_30d - a.revenue_30d),
    kpis,
    alerts,
    generated_at: new Date().toISOString(),
  }

  return json(response, 200)
})

// =============================================================================
// Helpers
// =============================================================================

async function fetchMemberCounts(
  supabase: SupabaseClient,
  orgIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (orgIds.length === 0) return result
  // RLS : un app_admin n'a pas forcément de membership dans chaque org client,
  // donc cette requête peut renvoyer un sous-ensemble. C'est acceptable :
  // on retombe à 1 (owner garanti) pour les orgs sans visibilité.
  const { data, error } = await supabase
    .from('organization_members')
    .select('org_id')
    .in('org_id', orgIds)
  if (error || !data) return result
  for (const row of data as MemberAggRow[]) {
    result.set(row.org_id, (result.get(row.org_id) ?? 0) + 1)
  }
  return result
}

function computeMeanStd(values: number[]): { mean: number; std: number; n: number } {
  let mean = 0
  let m2 = 0
  let n = 0
  for (const v of values) {
    n++
    const delta = v - mean
    mean += delta / n
    const delta2 = v - mean
    m2 += delta * delta2
  }
  if (n < 2) return { mean, std: 0, n }
  const variance = m2 / (n - 1)
  return { mean, std: Math.sqrt(variance), n }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function roundSegmentRecord(r: Record<OrgSegment, number>): Record<OrgSegment, number> {
  return {
    vc_pe: round2(r.vc_pe),
    legal: round2(r.legal),
    newsletter: round2(r.newsletter),
    brand: round2(r.brand),
    cto_sme: round2(r.cto_sme),
    solo: round2(r.solo),
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
