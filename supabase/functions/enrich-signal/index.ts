import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { formatError } from '../_shared/errors.ts'
import { parseTopicsResponse, parsePersonasResponse } from './enrich.ts'

/**
 * enrich-signal — Enrichit les signaux avec des topics et des personas via 2 appels LLM parallèles.
 *
 * POST /enrich-signal
 * Body: { signal_ids: string[], org_id: string }
 *
 * Pour chaque signal :
 *   - Récupère les topics de l'org depuis topics_taxonomy
 *   - Récupère les personas actives de l'org depuis personas
 *   - Lance 2 appels LLM parallèles (Haiku) : classification topics + pertinence personas
 *   - Insère dans signal_topics + signal_personas (ON CONFLICT DO UPDATE)
 *   - Met à jour signals.enriched_at
 *   - Coûts tracés par dispatch-llm (péage unique, cost_task='enrich:topic'/'enrich:persona')
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface RequestBody {
  signal_ids: string[]
  org_id: string
}

interface DispatchResponse {
  ok: boolean
  error?: string
  content?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
  model_used?: string
}

interface SignalRow {
  id: string
  title: string | null
  url: string | null
  source: string
  raw_payload: Record<string, unknown> | null
  org_id: string
}

interface TopicTaxonomyRow {
  id: string
  slug: string
  name: string
  description: string | null
}

interface PersonaRow {
  id: string
  key: string
  name: string
  kind: string
  context_md: string | null
}

interface EnrichResult {
  signal_id: string
  ok: boolean
  error?: string
  topics_count?: number
  personas_count?: number
  topic_cost?: number
  persona_cost?: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: 'missing_authorization' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return json({ error: 'supabase_env_missing' }, 500)
  }

  const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: auth } },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ error: 'invalid_token' }, 401)

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  if (!Array.isArray(body.signal_ids) || body.signal_ids.length === 0) {
    return json({ error: 'signal_ids_required' }, 400)
  }
  if (!body.org_id || typeof body.org_id !== 'string') {
    return json({ error: 'org_id_required' }, 400)
  }

  const { org_id } = body
  const signalIds = body.signal_ids.slice(0, 50)

  // Récupérer topics et personas en parallèle (communs à tous les signaux du batch)
  const [topicsRes, personasRes] = await Promise.all([
    supabase
      .from('topics_taxonomy')
      .select('id, slug, name, description')
      .eq('org_id', org_id)
      .order('name'),
    supabase
      .from('personas')
      .select('id, key, name, kind, context_md')
      .eq('org_id', org_id)
      .is('archived_at', null),
  ])

  const topics: TopicTaxonomyRow[] = (topicsRes.data ?? []) as TopicTaxonomyRow[]
  const personas: PersonaRow[] = (personasRes.data ?? []) as PersonaRow[]

  // Récupérer les signaux demandés
  const { data: signalsData, error: signalsErr } = await supabase
    .from('signals')
    .select('id, title, url, source, raw_payload, org_id')
    .in('id', signalIds)
    .eq('org_id', org_id)

  if (signalsErr || !signalsData) {
    const f = formatError(signalsErr)
    await supabase.from('logs').insert({
      user_id: user.id,
      org_id,
      action: 'enrich:signal',
      status: 'error',
      payload: { stage: 'fetch_signals', ids_count: signalIds.length, ...f },
    })
    return json({ error: 'signals_not_found', detail: f.message }, 404)
  }

  const signals = signalsData as SignalRow[]

  if (signals.length === 0) {
    return json({ enriched: 0, failed: 0, costs: { topics: 0, personas: 0 } }, 200)
  }

  // Préparer les listes pour les prompts
  const topicsList = topics.map((t) => `${t.slug}: ${t.description ?? t.name}`).join('\n')

  const personasList = personas
    .map(
      (p) =>
        `${p.key}: ${p.name} (${p.kind})${p.context_md ? ' - ' + p.context_md.slice(0, 200) : ''}`,
    )
    .join('\n')

  const dispatchUrl = `${supabaseUrl}/functions/v1/dispatch-llm`

  let totalEnriched = 0
  let totalFailed = 0
  let totalTopicCost = 0
  let totalPersonaCost = 0

  // Traiter les signaux en séquence (éviter les rate limits)
  for (const signal of signals) {
    const result = await enrichSignal(
      signal,
      topics,
      personas,
      topicsList,
      personasList,
      dispatchUrl,
      auth,
      supabase,
      user.id,
      org_id,
    )

    if (result.ok) {
      totalEnriched++
      totalTopicCost += result.topic_cost ?? 0
      totalPersonaCost += result.persona_cost ?? 0
    } else {
      totalFailed++
    }
  }

  await supabase.from('logs').insert({
    user_id: user.id,
    org_id,
    action: 'enrich:signal',
    status: 'ok',
    payload: {
      enriched: totalEnriched,
      failed: totalFailed,
      signals_count: signals.length,
      topics_available: topics.length,
      personas_available: personas.length,
      costs: { topics: totalTopicCost, personas: totalPersonaCost },
    },
  })

  return json(
    {
      enriched: totalEnriched,
      failed: totalFailed,
      costs: { topics: totalTopicCost, personas: totalPersonaCost },
    },
    200,
  )
})

async function enrichSignal(
  signal: SignalRow,
  topics: TopicTaxonomyRow[],
  personas: PersonaRow[],
  topicsList: string,
  personasList: string,
  dispatchUrl: string,
  auth: string,
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
): Promise<EnrichResult> {
  const signalText = extractSignalText(signal)

  // Lancer les 2 appels LLM en parallèle
  const [topicsCallResult, personasCallResult] = await Promise.allSettled([
    callDispatch(
      dispatchUrl,
      auth,
      {
        system: 'Tu es un classifieur de contenu IA. Retourne UNIQUEMENT un JSON array.',
        user:
          `Signal: ${signal.title ?? ''} ${signal.url ?? ''}\n` +
          (signalText ? `Contenu: ${signalText.slice(0, 500)}\n` : '') +
          `Taxonomie disponible:\n${topicsList}\n` +
          `Retourne: [{ "slug": "...", "confidence": 0.0-1.0 }] — max 3 topics, confidence > 0.5 seulement. JSON pur, pas de markdown.`,
      },
      { max_tokens: 300, cost_task: 'enrich:topic' },
    ),
    callDispatch(
      dispatchUrl,
      auth,
      {
        system:
          "Tu évalues la pertinence d'un signal pour des personas. Retourne UNIQUEMENT un JSON array.",
        user:
          `Signal: ${signal.title ?? ''} ${signal.url ?? ''}\n` +
          (signalText ? `Contenu: ${signalText.slice(0, 500)}\n` : '') +
          `Personas disponibles:\n${personasList}\n` +
          `Retourne: [{ "persona_key": "...", "relevance": 0.0-1.0, "reasoning": "1 phrase" }] — max 3 personas, relevance > 0.4 seulement. JSON pur.`,
      },
      { max_tokens: 400, cost_task: 'enrich:persona' },
    ),
  ])

  // Traiter topics
  let topicsInserted = 0
  let topicCost = 0
  if (topicsCallResult.status === 'fulfilled' && topicsCallResult.value.ok) {
    const dispatchResp = topicsCallResult.value
    const raw = dispatchResp.content ?? ''
    topicCost = dispatchResp.usage?.cost ?? 0
    // Coût déjà enregistré par dispatch-llm (péage unique, ADR 0010).

    const classified = parseTopicsResponse(raw)
    if (classified.length > 0) {
      // Résoudre les topic_id depuis les slugs
      const topicRows = classified
        .map((c) => {
          const topic = topics.find((t) => t.slug === c.slug)
          if (!topic) return null
          return {
            signal_id: signal.id,
            topic_id: topic.id,
            org_id: orgId,
            confidence: c.confidence,
            source: 'llm' as const,
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)

      if (topicRows.length > 0) {
        const { error: insertErr } = await supabase
          .from('signal_topics')
          .upsert(topicRows, { onConflict: 'signal_id,topic_id' })
        if (insertErr) {
          await supabase.from('logs').insert({
            user_id: userId,
            org_id: orgId,
            action: 'enrich:signal',
            status: 'error',
            payload: {
              stage: 'insert_signal_topics',
              signal_id: signal.id,
              error: insertErr.message,
            },
          })
        } else {
          topicsInserted = topicRows.length
        }
      }
    }
  } else {
    // Parse fail ou erreur dispatch
    const errMsg =
      topicsCallResult.status === 'rejected'
        ? String(topicsCallResult.reason)
        : (topicsCallResult.value.error ?? 'dispatch_failed')
    await supabase.from('logs').insert({
      user_id: userId,
      org_id: orgId,
      action: 'enrich:signal',
      status: 'error',
      payload: {
        stage: 'enrich_parse_fail',
        kind: 'topics',
        signal_id: signal.id,
        error: errMsg,
      },
    })
  }

  // Traiter personas
  let personasInserted = 0
  let personaCost = 0
  if (personasCallResult.status === 'fulfilled' && personasCallResult.value.ok) {
    const dispatchResp = personasCallResult.value
    const raw = dispatchResp.content ?? ''
    personaCost = dispatchResp.usage?.cost ?? 0
    // Coût déjà enregistré par dispatch-llm (péage unique, ADR 0010).

    const relevant = parsePersonasResponse(raw)
    if (relevant.length > 0) {
      const personaRows = relevant
        .map((p) => {
          const persona = personas.find((pr) => pr.key === p.persona_key)
          if (!persona) return null
          return {
            signal_id: signal.id,
            persona_id: persona.id,
            org_id: orgId,
            relevance_score: p.relevance,
            reasoning: p.reasoning,
          }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)

      if (personaRows.length > 0) {
        const { error: insertErr } = await supabase
          .from('signal_personas')
          .upsert(personaRows, { onConflict: 'signal_id,persona_id' })
        if (insertErr) {
          await supabase.from('logs').insert({
            user_id: userId,
            org_id: orgId,
            action: 'enrich:signal',
            status: 'error',
            payload: {
              stage: 'insert_signal_personas',
              signal_id: signal.id,
              error: insertErr.message,
            },
          })
        } else {
          personasInserted = personaRows.length
        }
      }
    }
  } else {
    const errMsg =
      personasCallResult.status === 'rejected'
        ? String(personasCallResult.reason)
        : (personasCallResult.value.error ?? 'dispatch_failed')
    await supabase.from('logs').insert({
      user_id: userId,
      org_id: orgId,
      action: 'enrich:signal',
      status: 'error',
      payload: {
        stage: 'enrich_parse_fail',
        kind: 'personas',
        signal_id: signal.id,
        error: errMsg,
      },
    })
  }

  // Mettre à jour enriched_at sur le signal
  const { error: updateErr } = await supabase
    .from('signals')
    .update({ enriched_at: new Date().toISOString() })
    .eq('id', signal.id)
    .eq('org_id', orgId)

  if (updateErr) {
    await supabase.from('logs').insert({
      user_id: userId,
      org_id: orgId,
      action: 'enrich:signal',
      status: 'error',
      payload: {
        stage: 'update_enriched_at',
        signal_id: signal.id,
        error: updateErr.message,
      },
    })
    return {
      signal_id: signal.id,
      ok: false,
      error: 'update_enriched_at_failed',
    }
  }

  return {
    signal_id: signal.id,
    ok: true,
    topics_count: topicsInserted,
    personas_count: personasInserted,
    topic_cost: topicCost,
    persona_cost: personaCost,
  }
}

/**
 * Extrait le texte d'un signal depuis raw_payload.
 */
function extractSignalText(signal: SignalRow): string {
  const payload = signal.raw_payload
  if (!payload) return ''
  const text =
    (payload.text as string | undefined) ??
    (payload.body as string | undefined) ??
    (payload.selftext as string | undefined) ??
    (payload.summary as string | undefined) ??
    ''
  return typeof text === 'string' ? text : ''
}

/**
 * Appelle dispatch-llm avec un couple system/user et retourne la réponse.
 */
async function callDispatch(
  dispatchUrl: string,
  auth: string,
  messages: { system: string; user: string },
  options: { max_tokens?: number; cost_task?: string },
): Promise<DispatchResponse> {
  const res = await fetch(dispatchUrl, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task: 'enrichment',
      ...(options.cost_task ? { cost_task: options.cost_task } : {}),
      messages: [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user },
      ],
      options: {
        max_tokens: options.max_tokens ?? 400,
        temperature: 0,
      },
    }),
  })
  return (await res.json()) as DispatchResponse
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
