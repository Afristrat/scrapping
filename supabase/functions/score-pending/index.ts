// score-pending — porté de Saqr (P1, doc portage
// docs/bridges/prompt-portage-saqr-vers-kairos.md), adapté multi-tenant Kairos.
//
// Worker de rattrapage du backlog de scoring, découplé de run-pipeline (qui
// plafonne à SCORE_LIMIT=50/run — cf. run-pipeline/index.ts : au-delà, le
// backlog n'est jamais rattrapé). Score les signaux non scorés par lots
// auto-enchaînés (chain) : chaque invocation prend <= PICK_LIMIT signaux d'UN
// utilisateur, les score via llm-score (même endpoint que run-pipeline,
// concurrency SCORE_CONCURRENCY), puis se ré-invoque en fire-and-forget tant
// qu'il reste du backlog ET qu'elle a progressé. Chaque maillon = invocation
// fraîche = budget wall-clock neuf (Deno Edge Runtime).
//
// Déclencheur : cron pg_cron score-pending-tick (toutes les 2 min). Sans
// user_id dans le body, l'invocation est un "fan-out" : elle POST une
// invocation par utilisateur connu (table settings), chaîne suivante incluse.
// Avec user_id, l'invocation traite CE seul utilisateur (appel initial du
// fan-out, ou maillon suivant d'une chaîne).
//
// IMPORTANT : verify_jwt = false. Protection = header x-cron-secret (env
// CRON_SECRET, même contrat que cron-pipeline-trigger). Les appels AVAL vers
// llm-score/topic-classifier utilisent buildInternalHeaders (ADR 0009) — seul
// constructeur d'appel interne autorisé.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { buildInternalHeaders, constantTimeEquals, resolveOrgId } from '../_shared/internal-auth.ts'
import { budgetExceeded } from '../_shared/budget-check.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PICK_LIMIT = 60 // signaux non scorés pris par invocation
const SCORE_CONCURRENCY = 8 // même cap que run-pipeline/scoreInBackground
const MAX_CHAIN_DEPTH = 30 // garde-fou anti-runaway (30 x 60 = 1800 signaux/user)
const REMAINING_PROBE_LIMIT = 2000 // sonde le backlog restant pour un compteur honnête

interface Body {
  user_id?: string
  chain_depth?: number
}

interface ChainContext {
  chainDepth: number
  userId: string
  orgId: string | null
  supabaseUrl: string
  cronSecret: string
  admin: SupabaseClient
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

  // Auth : x-cron-secret, même contrat que cron-pipeline-trigger (env CRON_SECRET).
  const cronSecret = Deno.env.get('CRON_SECRET')?.trim() ?? ''
  if (!cronSecret) return json({ error: 'cron_secret_not_configured' }, 500)
  const provided = req.headers.get('x-cron-secret')?.trim() ?? ''
  if (!provided || !constantTimeEquals(provided, cronSecret)) {
    return json({ error: 'unauthorized' }, 401)
  }

  let body: Body = {}
  try {
    body = (await req.json()) as Body
  } catch {
    body = {}
  }
  const chainDepth = typeof body.chain_depth === 'number' ? body.chain_depth : 0

  // Sans user_id : fan-out, une invocation par utilisateur connu.
  if (body.user_id === undefined) {
    const { data, error } = await admin.from('settings').select('user_id')
    if (error) return json({ error: 'settings_query_failed', detail: error.message }, 500)
    const userIds = ((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)

    const fanOut = async () => {
      for (const userId of userIds) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/score-pending`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSecret },
            body: JSON.stringify({ user_id: userId, chain_depth: 0 }),
          })
        } catch {
          // Un utilisateur en échec ne doit pas bloquer les suivants ; le tick
          // suivant (2 min) retentera.
        }
      }
    }
    const er = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } })
      .EdgeRuntime
    if (er?.waitUntil) er.waitUntil(fanOut())
    else await fanOut()

    return json({ accepted: true, fan_out: userIds.length }, 202)
  }

  const userId = body.user_id.trim()
  if (!isUuid(userId)) return json({ error: 'user_id_invalid' }, 400)

  const orgId = await resolveOrgId(admin, userId)

  // Log `start` SYNCHRONE, avant le 202 : dès que score-pending est invoquée
  // pour cet utilisateur, un log score:pending existe (gate anti-chevauchement
  // côté monitoring/cron).
  await logRow(admin, userId, orgId, 'start', { chain_depth: chainDepth })

  const { data: settingsRow, error: settingsErr } = await admin
    .from('settings')
    .select('daily_budget_usd')
    .eq('user_id', userId)
    .maybeSingle()
  if (settingsErr || !settingsRow) {
    await logRow(admin, userId, orgId, 'error', {
      stage: 'settings_lookup',
      chain_depth: chainDepth,
      error: settingsErr?.message ?? 'no_settings_row',
    })
    return json({ error: 'no_settings_row' }, 404)
  }

  // Budget guard : si la dépense LLM du jour atteint daily_budget_usd, on
  // n'engage PAS de nouveau scoring. Fail-open (cf. _shared/budget-check.ts).
  // Pas de ré-invocation : le tick suivant reprendra (budget réinitialisé J+1).
  if (
    await budgetExceeded(
      admin,
      userId,
      (settingsRow as { daily_budget_usd?: number | null }).daily_budget_usd ?? null,
    )
  ) {
    await logRow(admin, userId, orgId, 'skipped', {
      reason: 'budget_exceeded',
      chain_depth: chainDepth,
    })
    return json({ accepted: false, reason: 'budget_exceeded' }, 200)
  }

  const ctx: ChainContext = { chainDepth, userId, orgId, supabaseUrl, cronSecret, admin }
  const er = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } })
    .EdgeRuntime
  if (er?.waitUntil) er.waitUntil(processChain(ctx))
  else await processChain(ctx)

  return json({ accepted: true, chain_depth: chainDepth }, 202)
})

async function processChain(ctx: ChainContext): Promise<void> {
  const { chainDepth, userId, orgId, supabaseUrl, cronSecret, admin } = ctx
  try {
    // 1. Lot de signaux non scorés, via service_role + user_id explicite
    // (unscored_signals_for, SECURITY DEFINER, posée par la migration
    // 20260512000002 pour cron-pipeline-trigger).
    const { data: unscored, error: rpcErr } = await admin.rpc('unscored_signals_for', {
      p_user_id: userId,
      lim: PICK_LIMIT,
    })
    if (rpcErr) {
      await logRow(admin, userId, orgId, 'error', {
        stage: 'unscored_query',
        chain_depth: chainDepth,
        error: rpcErr.message,
      })
      return
    }
    const ids = ((unscored ?? []) as { id: string }[]).map((r) => r.id)

    if (ids.length === 0) {
      await logRow(admin, userId, orgId, 'ok', {
        chain_depth: chainDepth,
        picked: 0,
        scored: 0,
        failed: 0,
        remaining: 0,
      })
      return
    }

    // 2. Scoring : même endpoint et même cap de concurrence que
    // run-pipeline/scoreInBackground, pour rester sur UN SEUL chemin de
    // scoring (llm-score, pas llm-score-batch qui n'est pas dual-mode ADR 0009).
    const headers = buildInternalHeaders(userId)
    let scored = 0
    for (let i = 0; i < ids.length; i += SCORE_CONCURRENCY) {
      const chunk = ids.slice(i, i + SCORE_CONCURRENCY)
      const results = await Promise.allSettled(
        chunk.map((id) =>
          fetch(`${supabaseUrl}/functions/v1/llm-score`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ signal_id: id }),
          }).then((r) => {
            if (!r.ok) throw new Error(`http_${r.status}`)
          }),
        ),
      )
      scored += results.filter((r) => r.status === 'fulfilled').length
    }
    const failed = ids.length - scored

    // 2.5 Topic classification (fire-and-forget, best-effort) : topic-classifier
    // lit lui-même les scores fraîchement écrits. On passe tout le lot `ids`, y
    // compris les signaux dont le scoring aurait échoué (fallback score=0 côté
    // topic-classifier).
    fetch(`${supabaseUrl}/functions/v1/topic-classifier`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ signal_ids: ids, run_at: new Date().toISOString() }),
    }).catch(() => {
      // Non bloquant : topic-classifier logue déjà ses propres erreurs internes.
    })

    // 3. Backlog restant : sondé à REMAINING_PROBE_LIMIT pour un compteur
    // honnête dans les logs (sinon plafonné à PICK_LIMIT, monitoring trompeur).
    const { data: rest } = await admin.rpc('unscored_signals_for', {
      p_user_id: userId,
      lim: REMAINING_PROBE_LIMIT,
    })
    const remaining = ((rest ?? []) as { id: string }[]).length

    await logRow(admin, userId, orgId, 'ok', {
      chain_depth: chainDepth,
      picked: ids.length,
      scored,
      failed,
      remaining,
    })

    // 4. Maillon suivant : uniquement si progrès (scored>0), backlog restant et
    // sous le garde-fou. Sinon le tick score-pending suivant (2 min) reprend.
    const shouldChain = scored > 0 && remaining > 0 && chainDepth + 1 < MAX_CHAIN_DEPTH
    if (shouldChain) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/score-pending`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSecret },
          body: JSON.stringify({ user_id: userId, chain_depth: chainDepth + 1 }),
        })
      } catch {
        // Maillon non lancé : le tick score-pending suivant prendra le relais.
      }
    }
  } catch (err) {
    await logRow(admin, userId, orgId, 'error', {
      stage: 'process_chain',
      chain_depth: chainDepth,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function logRow(
  admin: SupabaseClient,
  userId: string,
  orgId: string | null,
  status: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!orgId) return // pas d'org résolue -> pas de log (logs.org_id NOT NULL)
  await admin
    .from('logs')
    .insert({ user_id: userId, org_id: orgId, action: 'score:pending', status, payload })
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
