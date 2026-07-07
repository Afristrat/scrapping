// slack-digest — porté de Saqr (P1, doc portage
// docs/bridges/prompt-portage-saqr-vers-kairos.md), adapté multi-tenant Kairos.
//
// Poste le digest "Veille IA" sur le webhook Slack de l'utilisateur : top 10
// des signaux scorés >= MIN_SCORE des dernières 24h, en liste dense (pastille
// couleur), liens cliquables. Aucun appel LLM : sélection par RPC bornée
// (live_report_candidates), instantané et gratuit.
//
// verify_jwt = false : déclenché par la fonction pg_cron
// trigger_slack_digest_fanout (migration 20260513000002), qui gate déjà
// l'heure (Paris 19h-22h, DST-proof) et l'anti-doublon (23h) AVANT d'appeler
// cette fonction avec { user_id }. Cette fonction reste défensive (elle
// revérifie enabled + webhook + fraîcheur) au cas où elle serait invoquée
// manuellement (smoke test, `force`).
//
// Idempotence : re-vérifiée ici aussi (aucun log 'slack:digest' status='ok'
// dans les ~23h) — filet si jamais invoquée hors du wrapper cron.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { constantTimeEquals, resolveOrgId } from '../_shared/internal-auth.ts'
import { type VeilleItem, buildVeilleBlocks, postToSlack } from '../_shared/slack.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SINCE_HOURS = 24
const MIN_SCORE = 60
const TOP_N = 10

interface Candidate {
  id: string
  source: string
  url: string
  title: string
  score: number
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json({ error: 'supabase_env_missing' }, 500)

  const admin = createClient(supabaseUrl, serviceKey)

  // Auth : x-cron-secret, même contrat que cron-pipeline-trigger/score-pending.
  const cronSecret = Deno.env.get('CRON_SECRET')?.trim() ?? ''
  if (!cronSecret) return json({ error: 'cron_secret_not_configured' }, 500)
  const provided = req.headers.get('x-cron-secret')?.trim() ?? ''
  if (!provided || !constantTimeEquals(provided, cronSecret)) {
    return json({ error: 'unauthorized' }, 401)
  }

  let userId = ''
  let force = false
  try {
    const body = (await req.json()) as { user_id?: string; force?: boolean }
    userId = (body?.user_id ?? '').trim()
    force = body?.force === true
  } catch {
    userId = ''
  }
  if (!isUuid(userId)) return json({ error: 'user_id_required' }, 400)

  const orgId = await resolveOrgId(admin, userId)

  const { data: s, error: settingsErr } = await admin
    .from('settings')
    .select('slack_webhook_url, slack_digest_enabled')
    .eq('user_id', userId)
    .maybeSingle()
  if (settingsErr || !s) return json({ error: 'no_settings_row' }, 404)
  const settingsRow = s as { slack_webhook_url: string | null; slack_digest_enabled: boolean }

  if (!settingsRow.slack_digest_enabled) {
    await logSlack(admin, userId, orgId, 'skipped', { reason: 'disabled_by_user' })
    return json({ ok: false, skipped: true, reason: 'disabled_by_user' }, 200)
  }
  const webhook = settingsRow.slack_webhook_url?.trim()
  if (!webhook) {
    await logSlack(admin, userId, orgId, 'skipped', { reason: 'webhook_not_configured' })
    return json({ ok: false, error: 'webhook_not_configured' }, 200)
  }

  // Anti-doublon défensif (le wrapper cron le fait déjà, ce garde couvre un
  // appel manuel/hors-cron).
  if (!force) {
    const { data: lastOk } = await admin
      .from('logs')
      .select('ts')
      .eq('user_id', userId)
      .eq('action', 'slack:digest')
      .eq('status', 'ok')
      .gte('ts', new Date(Date.now() - 23 * 3600_000).toISOString())
      .limit(1)
      .maybeSingle()
    if (lastOk) {
      return json({ ok: true, posted: false, reason: 'already_posted_today' }, 200)
    }
  }

  // Garde fraîcheur : ne jamais poster une "Veille du jour" sur de vieux signaux.
  // `force` (smoke test manuel) bypasse ce garde.
  if (!force) {
    const { data: lastRow } = await admin
      .from('signals')
      .select('scraped_at')
      .eq('user_id', userId)
      .order('scraped_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const lastMs = lastRow?.scraped_at ? new Date(lastRow.scraped_at as string).getTime() : 0
    if (Date.now() - lastMs > 8 * 3600_000) {
      await logSlack(admin, userId, orgId, 'skipped', {
        reason: 'no_fresh_scrape',
        last_scrape: (lastRow?.scraped_at as string) ?? null,
      })
      return json({ ok: true, posted: false, reason: 'no_fresh_scrape' }, 200)
    }
  }

  const sinceIso = new Date(Date.now() - SINCE_HOURS * 3600_000).toISOString()

  const { data: candRows, error: candErr } = await admin.rpc('live_report_candidates', {
    p_user_id: userId,
    p_since: sinceIso,
    p_min_score: MIN_SCORE,
    p_limit: TOP_N,
  })
  if (candErr) {
    await logSlack(admin, userId, orgId, 'error', { stage: 'candidates', error: candErr.message })
    return json({ ok: false, error: 'candidates_failed', detail: candErr.message }, 500)
  }
  const candidates = (candRows ?? []) as Candidate[]
  if (candidates.length === 0) {
    await logSlack(admin, userId, orgId, 'empty', {
      since_hours: SINCE_HOURS,
      min_score: MIN_SCORE,
    })
    return json({ ok: true, posted: false, reason: 'no_candidates' }, 200)
  }

  const { count: analysedCount } = await admin
    .from('signals')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('scraped_at', sinceIso)

  const items: VeilleItem[] = candidates.map((c) => ({
    titre: c.title,
    score: c.score,
    url: c.url,
    source: c.source,
  }))

  const blocks = buildVeilleBlocks(items, new Date(), analysedCount ?? items.length)
  const slackRes = await postToSlack(webhook, blocks)

  await logSlack(admin, userId, orgId, slackRes.ok ? 'ok' : 'error', {
    posted: slackRes.ok,
    slack_status: slackRes.status,
    count: items.length,
    detail: slackRes.ok ? undefined : slackRes.detail,
  })

  return json(
    { ok: slackRes.ok, posted: slackRes.ok, count: items.length },
    slackRes.ok ? 200 : 502,
  )
})

async function logSlack(
  admin: SupabaseClient,
  userId: string,
  orgId: string | null,
  status: 'ok' | 'error' | 'empty' | 'skipped',
  payload: Record<string, unknown>,
): Promise<void> {
  if (!orgId) return // pas d'org résolue -> pas de log (logs.org_id NOT NULL)
  await admin
    .from('logs')
    .insert({ user_id: userId, org_id: orgId, action: 'slack:digest', status, payload })
}
