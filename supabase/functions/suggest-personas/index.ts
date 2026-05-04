import { createClient } from 'jsr:@supabase/supabase-js@2'
import { formatError } from '../_shared/errors.ts'
import { parseSuggestionsResponse } from './suggest.ts'

/**
 * suggest-personas — Génère des suggestions de personas IA basées sur les topics
 * les plus fréquents de l'org sur les 30 derniers jours.
 *
 * POST /suggest-personas
 * Body: { org_id: string }
 *
 * Logique :
 *   1. Auth standard bearer token
 *   2. Top 10 topics sur 30j (signal_topics JOIN topics_taxonomy)
 *   3. Personas existantes de l'org (éviter doublons)
 *   4. Appel LLM Sonnet via dispatch-llm (prompt structuré)
 *   5. Parse réponse JSON → { hats: [...], projects: [...] }
 *   6. Track llm_costs (task='suggest:personas')
 *   7. Log dans logs
 *   8. Retourne { suggestions: { hats, projects } }
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SONNET_MODEL = 'anthropic/claude-sonnet-4-5-20251022'

interface RequestBody {
  org_id: string
}

interface DispatchResponse {
  ok: boolean
  error?: string
  content?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
  model_used?: string
}

interface SignalTopicRow {
  topic_id: string
  topics_taxonomy: {
    slug: string
    name: string
  } | null
}

interface PersonaRow {
  id: string
  name: string
  key: string
  kind: string
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

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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

  if (!body.org_id || typeof body.org_id !== 'string') {
    return json({ error: 'org_id_required' }, 400)
  }

  const { org_id } = body

  // ── 1. Top 10 topics sur les 30 derniers jours ─────────────────────────────
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: signalTopicsData, error: topicsErr } = await supabase
    .from('signal_topics')
    .select(
      `topic_id,
       topics_taxonomy!inner ( slug, name )`,
    )
    .eq('org_id', org_id)
    .gte('created_at', thirtyDaysAgo)

  if (topicsErr) {
    const f = formatError(topicsErr)
    await supabase.from('logs').insert({
      user_id: user.id,
      org_id,
      action: 'suggest:personas',
      status: 'error',
      payload: { stage: 'fetch_signal_topics', ...f },
    })
    return json({ error: 'fetch_topics_failed', detail: f.message }, 500)
  }

  // Compter les fréquences par topic
  const topicFreq = new Map<string, { slug: string; name: string; count: number }>()
  for (const row of (signalTopicsData ?? []) as SignalTopicRow[]) {
    const taxonomy = row.topics_taxonomy
    if (!taxonomy) continue
    const key = row.topic_id
    const existing = topicFreq.get(key)
    if (existing) {
      existing.count++
    } else {
      topicFreq.set(key, { slug: taxonomy.slug, name: taxonomy.name, count: 1 })
    }
  }

  // Trier par fréquence décroissante, top 10
  const topTopics = Array.from(topicFreq.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // ── 2. Personas existantes de l'org ───────────────────────────────────────
  const { data: personasData, error: personasErr } = await supabase
    .from('personas')
    .select('id, name, key, kind')
    .eq('org_id', org_id)
    .is('archived_at', null)

  if (personasErr) {
    const f = formatError(personasErr)
    await supabase.from('logs').insert({
      user_id: user.id,
      org_id,
      action: 'suggest:personas',
      status: 'error',
      payload: { stage: 'fetch_personas', ...f },
    })
    return json({ error: 'fetch_personas_failed', detail: f.message }, 500)
  }

  const existingPersonas = (personasData ?? []) as PersonaRow[]

  // ── 3. Construire le prompt ───────────────────────────────────────────────
  const topicsListStr =
    topTopics.length > 0
      ? topTopics.map((t) => `- ${t.slug} (${t.name}) : ${t.count} signaux`).join('\n')
      : 'Aucun topic disponible pour la période.'

  const existingPersonasStr =
    existingPersonas.length > 0
      ? existingPersonas.map((p) => `- ${p.key} (${p.name}, ${p.kind})`).join('\n')
      : 'Aucune persona existante.'

  const systemPrompt = `Tu es un assistant expert en organisation personnelle PARA (Projects, Areas, Resources, Archives) et en veille stratégique IA.
Tu analyses les centres d'intérêt d'une organisation à partir de ses topics de veille et tu suggères des personas pertinentes.
Réponds UNIQUEMENT en JSON pur, sans markdown ni commentaires.`

  const userPrompt = `Voici les topics de veille les plus fréquents de cette organisation sur les 30 derniers jours :

${topicsListStr}

Personas déjà existantes (à ne pas dupliquer) :
${existingPersonasStr}

Génère des suggestions de nouvelles personas PARA pertinentes :
- 3 à 5 Hats (chapeaux = rôles / angles de lecture : CTO, investisseur, chercheur, etc.)
- 2 à 3 Projects (projets avec dates estimées : YYYY-MM-DD)

Pour chaque persona, fournis un name, un key (slug kebab-case unique), et un context_md (1-3 phrases de contexte).
Les dates des Projects doivent être cohérentes avec la période actuelle (2026).
Ne suggère pas de persona qui existe déjà dans la liste fournie.

Réponds avec ce JSON exact :
{
  "hats": [{ "name": "...", "key": "...", "context_md": "..." }],
  "projects": [{ "name": "...", "key": "...", "context_md": "...", "date_start": "YYYY-MM-DD", "date_end": "YYYY-MM-DD" }]
}`

  // ── 4. Appel LLM via dispatch-llm ────────────────────────────────────────
  const dispatchUrl = `${supabaseUrl}/functions/v1/dispatch-llm`

  let dispatchResp: DispatchResponse
  try {
    const res = await fetch(dispatchUrl, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'enrichment',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        options: {
          max_tokens: 1200,
          temperature: 0.7,
        },
      }),
    })
    dispatchResp = (await res.json()) as DispatchResponse
  } catch (err) {
    const f = formatError(err)
    await supabase.from('logs').insert({
      user_id: user.id,
      org_id,
      action: 'suggest:personas',
      status: 'error',
      payload: { stage: 'dispatch_llm_call', ...f },
    })
    return json({ error: 'dispatch_llm_failed', detail: f.message }, 500)
  }

  if (!dispatchResp.ok) {
    await supabase.from('logs').insert({
      user_id: user.id,
      org_id,
      action: 'suggest:personas',
      status: 'error',
      payload: { stage: 'dispatch_llm_response', error: dispatchResp.error ?? 'unknown' },
    })
    return json({ error: 'llm_error', detail: dispatchResp.error }, 502)
  }

  // ── 5. Parser la réponse ──────────────────────────────────────────────────
  const rawContent = dispatchResp.content ?? ''
  const suggestions = parseSuggestionsResponse(rawContent)

  // ── 6. Tracker les coûts ──────────────────────────────────────────────────
  const cost = dispatchResp.usage?.cost ?? 0
  const promptTokens = dispatchResp.usage?.prompt_tokens ?? 0
  const completionTokens = dispatchResp.usage?.completion_tokens ?? 0

  await supabase.from('llm_costs').insert({
    user_id: user.id,
    org_id,
    task: 'suggest:personas',
    model: dispatchResp.model_used ?? SONNET_MODEL,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    cost,
  })

  // ── 7. Logger ─────────────────────────────────────────────────────────────
  await supabase.from('logs').insert({
    user_id: user.id,
    org_id,
    action: 'suggest:personas',
    status: 'ok',
    payload: {
      topics_analyzed: topTopics.length,
      existing_personas: existingPersonas.length,
      hats_suggested: suggestions.hats.length,
      projects_suggested: suggestions.projects.length,
      cost,
    },
  })

  // ── 8. Retourner les suggestions ──────────────────────────────────────────
  return json({ suggestions }, 200)
})

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
