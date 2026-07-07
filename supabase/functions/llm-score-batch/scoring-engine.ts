/**
 * scoring-engine.ts — Pipeline 3-couches pour scoring rubric ad-hoc (Story Ralph K04).
 *
 * Orchestrateur entre les helpers purs (rubric-override.ts) et dispatch-llm.
 * BYOK strict — aucun modèle hardcodé. dispatch-llm sélectionne via task.
 *
 * Pipeline pour CHAQUE signal :
 *   1. Si shouldCombineGates(rubric) → 1 appel LLM combiné (disqualifier+boost)
 *      en parallèle avec l'appel criteria. Sinon split disqualifier-then-boost.
 *   2. Si disqualified → score=0 et on retourne (criteria result ignoré).
 *   3. Sinon : score raw = parseLLMScoreResponse(criteria) ; final = applyBoosts.
 *
 * Pour chaque appel LLM : task adapté (scoring | enrichment), réponse JSON
 * obligatoire, max_tokens prudents.
 */

import {
  applyBoosts,
  buildCombinedGatePrompt,
  buildCriteriaPrompt,
  buildDisqualifierPrompt,
  buildSoftBoostPrompt,
  evaluateMechanicalDisqualifiers,
  parseGateResponse,
  parseLLMScoreResponse,
  type RubricOverride,
  type ScoredSignalInput,
  type ScoredSignalOutput,
  shouldCombineGates,
} from './rubric-override.ts'

// =============================================================================
// Dispatch contract
// =============================================================================

export interface DispatchResponse {
  ok: boolean
  error?: string
  detail?: string
  content?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
  model_used?: string
  provider_used?: string
}

/** Fonction injectable pour appeler dispatch-llm — facilite les tests. */
export type DispatchCaller = (args: {
  task: 'scoring' | 'enrichment'
  prompt: string
  /** System prompt (consignes + gardes) — le prompt user ne porte que les données. */
  system?: string
  maxTokens: number
  /** Label fin llm_costs.task écrit par le péage dispatch-llm (défaut : task). */
  costTask?: string
}) => Promise<DispatchResponse>

/**
 * Crée un caller dispatch-llm standard (production).
 */
export function makeFetchDispatchCaller(args: {
  supabaseUrl: string
  auth: string
}): DispatchCaller {
  return async ({ task, prompt, system, maxTokens, costTask }) => {
    try {
      const res = await fetch(`${args.supabaseUrl}/functions/v1/dispatch-llm`, {
        method: 'POST',
        headers: { Authorization: args.auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task,
          ...(costTask ? { cost_task: costTask } : {}),
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            { role: 'user', content: prompt },
          ],
          options: {
            max_tokens: maxTokens,
            response_format: { type: 'json_object' },
            // Scoring et gates = tâches déterministes (classification/notation).
            temperature: 0,
          },
        }),
      })
      return (await res.json()) as DispatchResponse
    } catch (err) {
      return {
        ok: false,
        error: 'dispatch_unreachable',
        detail: err instanceof Error ? err.message : 'unknown',
      }
    }
  }
}

// =============================================================================
// Score un signal (3-couches)
// =============================================================================

export async function scoreSignalWithRubric(args: {
  signal: ScoredSignalInput
  rubric: RubricOverride
  dispatch: DispatchCaller
}): Promise<ScoredSignalOutput> {
  const { signal, rubric, dispatch } = args

  // ─── Pré-filtre mécanique (L99 A#4) : zéro appel LLM si une condition
  // déclarée disqualifie. Les règles mécaniques non matchées sont consommées
  // en code ; seules les règles sémantiques (residual) vont au LLM.
  const mech = evaluateMechanicalDisqualifiers(rubric.disqualifiers, signal)
  if (mech.fired_id !== null) {
    return {
      signal_id: signal.id,
      score: 0,
      raw_score: 0,
      reasoning: `Signal disqualifié par règle ${mech.fired_id} (pré-filtre mécanique, sans LLM).`,
      disqualified: true,
      applied_disqualifier: mech.fired_id,
      applied_boosts: [],
      cost: 0,
      model_used: 'mechanical-prefilter',
    }
  }
  const disqualifiers = mech.residual
  const combined = shouldCombineGates(disqualifiers, rubric.soft_boosts)

  let totalCost = 0
  let lastModel = 'unknown'

  // ─── Lance les appels LLM en parallèle ───────────────────────────────────
  const criteriaPrompt = buildCriteriaPrompt({
    scoringPrompt: rubric.scoring_prompt,
    criteria: rubric.criteria,
    signal,
  })
  const criteriaPromise = dispatch({
    task: 'scoring',
    system: criteriaPrompt.system,
    prompt: criteriaPrompt.user,
    maxTokens: 600,
  })

  let disqualifiedId: string | null = null
  let appliedBoostIds: string[] = []

  if (combined) {
    // 1 appel pour disqualifier + boost simultanément
    const gatePrompt = buildCombinedGatePrompt({
      disqualifiers,
      softBoosts: rubric.soft_boosts,
      signal,
    })
    const gatePromise = dispatch({
      task: 'enrichment',
      costTask: 'scoring:gates',
      system: gatePrompt.system,
      prompt: gatePrompt.user,
      maxTokens: 200,
    })

    const [criteriaRes, gateRes] = await Promise.all([criteriaPromise, gatePromise])

    let gateParseFailed = false
    if (gateRes.ok && gateRes.content) {
      const parsed = parseGateResponse(gateRes.content)
      disqualifiedId = parsed.disqualified_id
      appliedBoostIds = parsed.applied_boosts
      if (parsed.parse_ok === false) gateParseFailed = true
    }
    if (gateRes.usage?.cost) totalCost += gateRes.usage.cost
    if (gateRes.model_used) lastModel = gateRes.model_used

    return finalize({
      signal,
      rubric,
      criteriaRes,
      disqualifiedId,
      appliedBoostIds,
      costSoFar: totalCost,
      modelSoFar: lastModel,
      gateParseFailed,
    })
  }

  // ─── Mode split : 2 appels gates séparés ─────────────────────────────────
  let dqPromise: Promise<DispatchResponse> | null = null
  if (disqualifiers.length > 0) {
    const dqPrompt = buildDisqualifierPrompt({
      disqualifiers,
      signal,
    })
    dqPromise = dispatch({
      task: 'enrichment',
      costTask: 'scoring:gates',
      system: dqPrompt.system,
      prompt: dqPrompt.user,
      maxTokens: 100,
    })
  }

  let sbPromise: Promise<DispatchResponse> | null = null
  if (rubric.soft_boosts.length > 0) {
    const sbPrompt = buildSoftBoostPrompt({
      softBoosts: rubric.soft_boosts,
      signal,
    })
    sbPromise = dispatch({
      task: 'enrichment',
      costTask: 'scoring:gates',
      system: sbPrompt.system,
      prompt: sbPrompt.user,
      maxTokens: 150,
    })
  }

  const [criteriaRes, dqRes, sbRes] = await Promise.all([
    criteriaPromise,
    dqPromise ??
      Promise.resolve<DispatchResponse>({ ok: true, content: '{"disqualified_id": null}' }),
    sbPromise ?? Promise.resolve<DispatchResponse>({ ok: true, content: '{"applied": []}' }),
  ])

  let gateParseFailed = false
  if (dqRes.ok && dqRes.content) {
    const parsed = parseGateResponse(dqRes.content)
    disqualifiedId = parsed.disqualified_id
    if (parsed.parse_ok === false) gateParseFailed = true
  }
  if (dqRes.usage?.cost) totalCost += dqRes.usage.cost
  if (dqRes.model_used) lastModel = dqRes.model_used

  if (sbRes.ok && sbRes.content) {
    const parsed = parseGateResponse(sbRes.content)
    appliedBoostIds = parsed.applied_boosts
    if (parsed.parse_ok === false) gateParseFailed = true
  }
  if (sbRes.usage?.cost) totalCost += sbRes.usage.cost
  if (sbRes.model_used) lastModel = sbRes.model_used

  return finalize({
    signal,
    rubric,
    criteriaRes,
    disqualifiedId,
    appliedBoostIds,
    costSoFar: totalCost,
    modelSoFar: lastModel,
    gateParseFailed,
  })
}

function finalize(args: {
  signal: ScoredSignalInput
  rubric: RubricOverride
  criteriaRes: DispatchResponse
  disqualifiedId: string | null
  appliedBoostIds: string[]
  costSoFar: number
  modelSoFar: string
  gateParseFailed?: boolean
}): ScoredSignalOutput {
  const { signal, rubric, criteriaRes, disqualifiedId, appliedBoostIds } = args
  let totalCost = args.costSoFar
  let modelUsed = args.modelSoFar

  if (criteriaRes.usage?.cost) totalCost += criteriaRes.usage.cost
  if (criteriaRes.model_used) modelUsed = criteriaRes.model_used

  // CAS 1 — disqualifié : score=0, on n'utilise PAS le résultat criteria.
  if (disqualifiedId !== null) {
    // Vérifier que l'id existe vraiment dans la rubric (sinon ignorer comme bruit LLM)
    const known = rubric.disqualifiers.some((d) => d.id === disqualifiedId)
    if (known) {
      return {
        signal_id: signal.id,
        score: 0,
        raw_score: 0,
        reasoning: `Signal disqualifié par règle ${disqualifiedId}.`,
        disqualified: true,
        applied_disqualifier: disqualifiedId,
        applied_boosts: [],
        cost: totalCost,
        model_used: modelUsed,
        ...(args.gateParseFailed ? { gate_parse_failed: true } : {}),
      }
    }
  }

  // CAS 2 — non disqualifié : score criteria + boosts.
  let rawScore = 0
  let reasoning = ''
  if (criteriaRes.ok && criteriaRes.content) {
    const parsed = parseLLMScoreResponse(criteriaRes.content)
    if (parsed) {
      rawScore = parsed.score
      reasoning = parsed.reasoning
    }
  }

  // Filtrer les applied_boosts inconnus avant cap & stockage.
  const validBoostIds = new Set(rubric.soft_boosts.map((b) => b.id))
  const knownAppliedBoosts = appliedBoostIds.filter((id) => validBoostIds.has(id))

  const finalScore = applyBoosts(rawScore, knownAppliedBoosts, rubric.soft_boosts)

  return {
    signal_id: signal.id,
    score: finalScore,
    raw_score: rawScore,
    reasoning,
    disqualified: false,
    applied_disqualifier: null,
    applied_boosts: knownAppliedBoosts,
    cost: totalCost,
    model_used: modelUsed,
    ...(args.gateParseFailed ? { gate_parse_failed: true } : {}),
  }
}
