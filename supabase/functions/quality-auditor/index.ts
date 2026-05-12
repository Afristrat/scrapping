// BYOK strict — no model imposed.
//
// quality-auditor — Edge function that audits the combined output of the
// 3 previous research-pipeline steps (research_strategy + rubric +
// signal-synthesizer topics) on 7 axes and returns a verdict
// pass/warn/fail/deepen with deepening_targets when applicable.
//
// POST /functions/v1/quality-auditor
// Body : {
//   research_strategy: ResearchStrategy,
//   rubric: object,
//   topics_output: { topics, coverage_map, cultural_warnings,
//                    devil_advocate_topic_id },
//   lang: 'fr'|'en'|'ar',
//   signals_input: SignalRef[]   // signals fed to K05, used to detect
//                                 // hallucinated signal_ids.
// }
//
// Returns 200 {
//   verdict: 'pass'|'warn'|'fail'|'deepen',
//   issues: AuditIssue[],
//   auto_corrections_applied: Record<string, string>,
//   deepening_targets: DeepeningTarget[],
//   telemetry: { llm_cost, llm_latency_ms, deterministic_issue_count,
//                llm_issue_count }
// }

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { resolveAuthOrProxy } from '../_shared/service-role-auth.ts'
import {
  AuditIssue,
  checkBriefFormat,
  checkCoverage,
  checkDevilAdvocate,
  checkHallucination,
  checkLinguistic,
  computeVerdict,
  mergeIssues,
  parseLlmIssues,
  ResearchStrategy,
  SignalRef,
  TopicsOutput,
} from './auditor.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface RequestBody {
  research_strategy: ResearchStrategy
  rubric: Record<string, unknown>
  topics_output: TopicsOutput
  lang: 'fr' | 'en' | 'ar'
  signals_input: SignalRef[]
}

interface DispatchResponse {
  ok: boolean
  error?: string
  content?: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    cost?: number
  }
  model_used?: string
  provider_used?: string
}

const VALID_LANGS = new Set(['fr', 'en', 'ar'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: 'missing_authorization' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ error: 'supabase_env_missing' }, 500)
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: auth } },
  })

  const authResolved = await resolveAuthOrProxy(supabase, req)
  if (!authResolved.ok) {
    const status = authResolved.error === 'internal_missing_proxy_header' ? 400 : 401
    return json({ error: authResolved.error }, status)
  }
  const callerUserId = authResolved.userId

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  // Body validation
  if (!body.research_strategy || typeof body.research_strategy !== 'object') {
    return json({ error: 'research_strategy_required' }, 400)
  }
  if (!body.rubric || typeof body.rubric !== 'object') {
    return json({ error: 'rubric_required' }, 400)
  }
  if (!body.topics_output || typeof body.topics_output !== 'object') {
    return json({ error: 'topics_output_required' }, 400)
  }
  if (!Array.isArray(body.topics_output.topics)) {
    return json({ error: 'topics_output_topics_required' }, 400)
  }
  if (!body.topics_output.coverage_map || typeof body.topics_output.coverage_map !== 'object') {
    return json({ error: 'coverage_map_required' }, 400)
  }
  if (!body.lang || !VALID_LANGS.has(body.lang)) {
    return json({ error: 'lang_required' }, 400)
  }
  if (!Array.isArray(body.signals_input)) {
    return json({ error: 'signals_input_required' }, 400)
  }

  const t0 = Date.now()

  // ─── Phase 1 : deterministic checks (no LLM cost) ────────────────────
  const hallucinationIssues = checkHallucination(body.topics_output.topics, body.signals_input)
  const coverage = checkCoverage(body.topics_output.coverage_map)
  const linguistic = checkLinguistic(body.research_strategy, body.topics_output.topics)
  const devilAdvocateIssues = checkDevilAdvocate(
    body.topics_output.topics,
    body.topics_output.devil_advocate_topic_id,
  )
  const briefFormat = checkBriefFormat(body.topics_output.topics)

  const deterministicIssues: AuditIssue[] = [
    ...hallucinationIssues,
    ...coverage.issues,
    ...linguistic.issues,
    ...devilAdvocateIssues,
    ...briefFormat.issues,
  ]

  // ─── Phase 2 : LLM audit (subjective axes : novelty / actionability /
  //              bias) — BYOK strict, task=enrichment, no model imposed.
  const dispatchUrl = `${supabaseUrl}/functions/v1/dispatch-llm`
  const llmStart = Date.now()
  let llmIssues: AuditIssue[] = []
  let llmCost = 0
  let llmLatency = 0
  let llmError: string | null = null

  try {
    const proxyId = req.headers.get('x-proxy-user-id')?.trim()
    const internalAuth = req.headers.get('x-internal-auth')?.trim()
    const extraHeaders: Record<string, string> = {}
    if (proxyId) extraHeaders['x-proxy-user-id'] = proxyId
    if (internalAuth) extraHeaders['x-internal-auth'] = internalAuth
    const llmResp = await callLlmAudit(
      dispatchUrl,
      auth,
      body.research_strategy,
      body.rubric,
      body.topics_output,
      body.lang,
      extraHeaders,
    )
    llmLatency = Date.now() - llmStart
    if (llmResp.ok) {
      llmIssues = parseLlmIssues(llmResp.content ?? '')
      llmCost = llmResp.usage?.cost ?? 0
    } else {
      llmError = llmResp.error ?? 'dispatch_failed'
    }
  } catch (err) {
    llmError = err instanceof Error ? err.message : String(err)
    llmLatency = Date.now() - llmStart
  }

  // ─── Phase 3 : merge + verdict ────────────────────────────────────────
  const allIssues = mergeIssues(deterministicIssues, llmIssues)
  const verdictResult = computeVerdict(
    allIssues,
    body.research_strategy,
    coverage.uncoveredSubjects,
  )

  const totalLatency = Date.now() - t0

  // ─── Phase 4 : log + persist cost ────────────────────────────────────
  try {
    await supabase.from('logs').insert({
      user_id: callerUserId,
      action: 'quality-auditor:run',
      status: 'ok',
      payload: {
        verdict: verdictResult.verdict,
        deterministic_issues: deterministicIssues.length,
        llm_issues: llmIssues.length,
        total_issues: allIssues.length,
        deepening_targets: verdictResult.deepening_targets.length,
        auto_corrections: Object.keys(briefFormat.corrections).length,
        coverage_ratio: coverage.ratio,
        linguistic_dominance_ratio: linguistic.ratio,
        llm_latency_ms: llmLatency,
        llm_error: llmError,
        total_latency_ms: totalLatency,
      },
    })
  } catch {
    // Logging failure should not break the audit response.
  }

  if (llmCost > 0) {
    try {
      await supabase.from('llm_costs').insert({
        user_id: callerUserId,
        task: 'quality-auditor',
        cost: llmCost,
        latency_ms: llmLatency,
      })
    } catch {
      // Silent — telemetry only.
    }
  }

  return json(
    {
      verdict: verdictResult.verdict,
      issues: allIssues,
      auto_corrections_applied: briefFormat.corrections,
      deepening_targets: verdictResult.deepening_targets,
      telemetry: {
        llm_cost: llmCost,
        llm_latency_ms: llmLatency,
        llm_error: llmError,
        total_latency_ms: totalLatency,
        deterministic_issue_count: deterministicIssues.length,
        llm_issue_count: llmIssues.length,
        coverage_ratio: coverage.ratio,
        linguistic_dominance_ratio: linguistic.ratio,
      },
    },
    200,
  )
})

/**
 * Call dispatch-llm with task=enrichment to ask the model to audit the
 * three subjective axes : novelty, actionability, bias/tone.
 *
 * BYOK strict — no model imposed. The user's settings.model_config.enrichment
 * resolves the provider / model.
 */
async function callLlmAudit(
  dispatchUrl: string,
  auth: string,
  strategy: ResearchStrategy,
  rubric: Record<string, unknown>,
  topicsOutput: TopicsOutput,
  lang: 'fr' | 'en' | 'ar',
  extraHeaders: Record<string, string> = {},
): Promise<DispatchResponse> {
  const systemPrompt = buildSystemPrompt(lang)
  const userPayload = buildUserPayload(strategy, rubric, topicsOutput)

  const res = await fetch(dispatchUrl, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify({
      task: 'enrichment',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPayload },
      ],
      options: {
        max_tokens: 1200,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      },
    }),
  })
  return (await res.json()) as DispatchResponse
}

function buildSystemPrompt(lang: 'fr' | 'en' | 'ar'): string {
  const langLabel =
    lang === 'fr'
      ? 'français (accents majuscules obligatoires : É È À Ç Ê Ô Î Ù Û)'
      : lang === 'ar'
        ? 'arabe (RTL respecté)'
        : 'english'

  return `Tu es un auditeur de chaîne de recherche prospective Bassira/Kairos.
Tu reçois 3 outputs combinés : research_strategy + rubric + topics
(avec brief_variants, coverage_map, devil_advocate_topic_id).

Tu N'EFFECTUES PAS les checks déterministes suivants — ils sont déjà
faits côté Kairos (hallucination des signal_id, % coverage, ratio
linguistique, présence devil's advocate, longueur des briefs).

Tu te concentres UNIQUEMENT sur 3 axes subjectifs :
1. NOVELTY — les topics paraphrasent-ils la graine, ou apportent-ils
   un angle non-évident ? Un topic novel a un label qui ne reprend pas
   les mots-clés littéraux de la graine.
2. ACTIONABILITY — les briefs sont-ils simulables (acteurs nommés,
   horizon temporel explicite, seuil chiffrable) ou trop vagues
   ("étudions les conséquences", "analysons l'impact") ?
3. BIAS / TONE — un brief ou un topic charge-t-il un acteur sans
   contre-équilibre ? Un brief contient-il un jugement de valeur
   ("scandaleux", "irresponsable", "courageux", "exemplaire") ?

LANGUE : ${langLabel}.

INTERDICTIONS :
- Pas de balise <thinking>, <tool_call>, <scratchpad>, pas de markdown,
  pas de préambule. JSON strict UNIQUEMENT.
- Pas d'invention de location qui n'existe pas dans l'input.
- Pas de severity "high" sur novelty/actionability/bias sauf si la
  faute est flagrante (ex: 100 % des briefs contiennent un jugement
  de valeur).

SCHEMA OUTPUT STRICT :
{
  "issues": [
    {
      "axis": "novelty|actionability|bias",
      "severity": "high|medium|low",
      "location": "topic.t_001|topic.t_001.brief_variants[0]|...",
      "description": "string 15-40 mots",
      "fix_action": "auto_correct|trigger_deepening|warn_user|none",
      "auto_correction": "string ou null"
    }
  ]
}

Si aucun défaut détecté sur ces 3 axes : retourne {"issues": []}.`
}

function buildUserPayload(
  strategy: ResearchStrategy,
  rubric: Record<string, unknown>,
  topicsOutput: TopicsOutput,
): string {
  // Compact representation : we strip signal arrays from topics to
  // keep the payload small (the LLM does not need to verify signal
  // ids — the deterministic check did it).
  const compactTopics = (topicsOutput.topics ?? []).map((t) => ({
    id: t.id,
    label: t.label,
    type: t.type,
    internal_tension: t.internal_tension ?? null,
    brief_variants: (t.brief_variants ?? []).map((bv) => ({
      framework_hint: bv.framework_hint,
      brief: bv.brief,
    })),
  }))

  const payload = {
    research_strategy: {
      domain: (strategy as Record<string, unknown>).domain,
      subjects: (strategy.subjects ?? []).map((s) => ({
        id: s.id,
        title: s.title,
      })),
      language_mix: strategy.language_mix,
    },
    rubric_summary: {
      criteria: (rubric as Record<string, unknown>).criteria,
      disqualifiers: Array.isArray((rubric as Record<string, unknown>).disqualifiers)
        ? (rubric as { disqualifiers: unknown[] }).disqualifiers.length
        : 0,
    },
    topics: compactTopics,
    devil_advocate_topic_id: topicsOutput.devil_advocate_topic_id,
  }
  return JSON.stringify(payload)
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
