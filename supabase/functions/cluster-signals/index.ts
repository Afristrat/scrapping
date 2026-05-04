import { createClient } from 'jsr:@supabase/supabase-js@2'
import { formatError } from '../_shared/errors.ts'
import { getUserApiKey } from '../_shared/api-keys.ts'
import { cosineSimilarity, isSimilar } from './cluster.ts'

/**
 * cluster-signals — Clustering cross-source de signaux via embeddings.
 *
 * Invoqué par pg_cron toutes les heures (ou manuellement).
 * Corps vide attendu (le cron ne transmet pas de body métier).
 *
 * Logique :
 *   1. Récupérer un batch de 30 pending_enrichments WHERE pass_kind='clustering' AND status='pending'
 *   2. Pour chaque signal :
 *      a. Générer l'embedding du titre via OpenAI text-embedding-3-small (256 dims)
 *      b. Comparer avec les centroids des clusters existants (48h, même org)
 *      c. cosine > 0.80 → ajouter au cluster (UPDATE signal_count, last_seen_at, sources)
 *      d. Sinon → créer un nouveau cluster (centroid_title = signal.title)
 *      e. Insérer dans signal_cluster_members
 *      f. Marquer pending status='completed'
 *   3. Logger les résultats
 *   4. Retourner { ok, processed, clusters_created, clusters_updated }
 *
 * Si aucune clé OpenRouter/OpenAI n'est disponible :
 *   Skip graceful — marquer 'completed' sans clustering, log warning.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMS = 256
const CLUSTERING_THRESHOLD = 0.8
const BATCH_SIZE = 30
const WINDOW_HOURS = 48

interface PendingEnrichmentRow {
  id: string
  signal_id: string
  org_id: string
}

interface SignalRow {
  id: string
  title: string | null
  source: string
  org_id: string
}

interface ClusterRow {
  id: string
  org_id: string
  centroid_title: string | null
  signal_count: number
  sources: string[] | null
  last_seen_at: string
  /** Embedding du centroid — stocké en mémoire pendant le run, pas en DB */
  _embedding?: number[]
}

interface EmbeddingResponse {
  data: Array<{ embedding: number[] }>
  usage?: { prompt_tokens?: number; total_tokens?: number }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json(null, 204)
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // Authentification : service_role via Authorization OU cron secret
  const cronSecret = req.headers.get('x-cron-secret')
  const expectedSecret = Deno.env.get('CRON_SECRET')
  const auth = req.headers.get('Authorization')

  const isCronCall = expectedSecret && cronSecret === expectedSecret
  if (!isCronCall && !auth) {
    return json({ error: 'missing_authorization' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
    return json({ error: 'supabase_env_missing' }, 500)
  }

  // Le cron utilise service_role pour accéder à toutes les orgs
  const supabase = createClient(supabaseUrl, isCronCall ? supabaseServiceKey : supabaseAnonKey, {
    global: { headers: auth ? { Authorization: auth } : {} },
  })

  // Récupérer userId pour les logs (null si appel cron service_role)
  let userId: string | null = null
  if (auth) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return json({ error: 'invalid_token' }, 401)
    userId = user.id
  }

  // --- Batch : pending clustering jobs ---
  const { data: pendingData, error: pendingErr } = await supabase
    .from('pending_enrichments')
    .select('id, signal_id, org_id')
    .eq('pass_kind', 'clustering')
    .eq('status', 'pending')
    .order('scheduled_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (pendingErr) {
    const f = formatError(pendingErr)
    return json({ error: 'fetch_pending_failed', detail: f.message }, 500)
  }

  const pending: PendingEnrichmentRow[] = (pendingData ?? []) as PendingEnrichmentRow[]

  if (pending.length === 0) {
    return json({ ok: true, processed: 0, clusters_created: 0, clusters_updated: 0 }, 200)
  }

  // Récupérer les signaux correspondants en une seule requête
  const signalIds = pending.map((p) => p.signal_id)
  const { data: signalsData, error: signalsErr } = await supabase
    .from('signals')
    .select('id, title, source, org_id')
    .in('id', signalIds)

  if (signalsErr) {
    const f = formatError(signalsErr)
    return json({ error: 'fetch_signals_failed', detail: f.message }, 500)
  }

  const signalMap = new Map<string, SignalRow>(
    ((signalsData ?? []) as SignalRow[]).map((s) => [s.id, s]),
  )

  // Résoudre la clé API embedding (OpenRouter → OpenAI fallback)
  // On prend la clé de l'org du premier pending (toutes les orgs peuvent ne pas avoir de clé)
  // → on résout par org_id en utilisant le premier user de l'org disponible
  // Simplification : on tente OpenRouter (proxy) puis OpenAI directement via env
  const openRouterKey = userId
    ? await getUserApiKey(supabase, userId, 'openrouter')
    : (Deno.env.get('OPENROUTER_API_KEY') ?? null)

  const openAiKey = userId
    ? await getUserApiKey(supabase, userId, 'openai')
    : (Deno.env.get('OPENAI_API_KEY') ?? null)

  const hasEmbeddingKey = Boolean(openRouterKey ?? openAiKey)

  if (!hasEmbeddingKey) {
    // Pas de clé → skip graceful : marquer completed sans clustering
    await markBatchCompleted(
      supabase,
      pending.map((p) => p.id),
    )
    const orgIds = [...new Set(pending.map((p) => p.org_id))]
    for (const orgId of orgIds) {
      await supabase.from('logs').insert({
        user_id: userId,
        org_id: orgId,
        action: 'cluster:signals',
        status: 'warning',
        payload: {
          message: 'no_embedding_key_available',
          processed: pending.filter((p) => p.org_id === orgId).length,
        },
      })
    }
    return json(
      {
        ok: true,
        processed: pending.length,
        clusters_created: 0,
        clusters_updated: 0,
        skipped: true,
        reason: 'no_embedding_key',
      },
      200,
    )
  }

  // --- Chargement des clusters existants (48h, toutes orgs du batch) ---
  const orgIds = [...new Set(pending.map((p) => p.org_id))]
  const windowStart = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString()

  const { data: existingClusters, error: clustersErr } = await supabase
    .from('signal_clusters')
    .select('id, org_id, centroid_title, signal_count, sources, last_seen_at')
    .in('org_id', orgIds)
    .gte('last_seen_at', windowStart)
    .order('last_seen_at', { ascending: false })

  if (clustersErr) {
    const f = formatError(clustersErr)
    return json({ error: 'fetch_clusters_failed', detail: f.message }, 500)
  }

  // Index des clusters par org pour accès O(1)
  const clustersByOrg = new Map<string, ClusterRow[]>()
  for (const cluster of (existingClusters ?? []) as ClusterRow[]) {
    const list = clustersByOrg.get(cluster.org_id) ?? []
    list.push(cluster)
    clustersByOrg.set(cluster.org_id, list)
  }

  // Pré-calculer les embeddings des centroids (batch sur les titres uniques)
  const centroidTitles = [
    ...new Set(
      (existingClusters ?? [])
        .map((c) => (c as ClusterRow).centroid_title)
        .filter((t): t is string => Boolean(t)),
    ),
  ]

  const centroidEmbeddingMap = new Map<string, number[]>()
  if (centroidTitles.length > 0) {
    const embeddings = await fetchEmbeddingsBatch(centroidTitles, openRouterKey, openAiKey)
    centroidTitles.forEach((title, i) => {
      if (embeddings[i]) centroidEmbeddingMap.set(title, embeddings[i])
    })
  }

  // Attacher les embeddings pré-calculés aux clusters
  for (const clusters of clustersByOrg.values()) {
    for (const cluster of clusters) {
      if (cluster.centroid_title && centroidEmbeddingMap.has(cluster.centroid_title)) {
        cluster._embedding = centroidEmbeddingMap.get(cluster.centroid_title)
      }
    }
  }

  // --- Traitement signal par signal ---
  let totalProcessed = 0
  let totalClustersCreated = 0
  let totalClustersUpdated = 0

  for (const job of pending) {
    const signal = signalMap.get(job.signal_id)
    if (!signal) {
      await markPendingStatus(supabase, job.id, 'failed', 'signal_not_found')
      continue
    }

    const title = signal.title?.trim() ?? ''
    if (!title) {
      // Pas de titre → impossible à embedder → marquer completed sans clustering
      await markPendingStatus(supabase, job.id, 'completed')
      totalProcessed++
      continue
    }

    // Générer l'embedding du signal
    const embeddings = await fetchEmbeddingsBatch([title], openRouterKey, openAiKey)
    const signalEmbedding = embeddings[0]

    if (!signalEmbedding) {
      await markPendingStatus(supabase, job.id, 'failed', 'embedding_failed')
      continue
    }

    // Chercher le cluster le plus similaire dans la fenêtre 48h pour cette org
    const orgClusters = clustersByOrg.get(signal.org_id) ?? []
    let bestCluster: ClusterRow | null = null
    let bestSim = 0

    for (const cluster of orgClusters) {
      if (!cluster._embedding) continue
      const sim = cosineSimilarity(signalEmbedding, cluster._embedding)
      if (isSimilar(sim, CLUSTERING_THRESHOLD) && sim > bestSim) {
        bestSim = sim
        bestCluster = cluster
      }
    }

    if (bestCluster) {
      // --- Ajouter au cluster existant ---
      const updatedSources = [...new Set([...(bestCluster.sources ?? []), signal.source])]

      const { error: updateErr } = await supabase
        .from('signal_clusters')
        .update({
          signal_count: bestCluster.signal_count + 1,
          last_seen_at: new Date().toISOString(),
          sources: updatedSources,
        })
        .eq('id', bestCluster.id)

      if (updateErr) {
        await markPendingStatus(supabase, job.id, 'failed', formatError(updateErr).message)
        continue
      }

      // Mettre à jour la version en mémoire pour les signaux suivants du même run
      bestCluster.signal_count++
      bestCluster.sources = updatedSources
      bestCluster.last_seen_at = new Date().toISOString()

      // Insérer dans signal_cluster_members
      await supabase.from('signal_cluster_members').upsert(
        {
          cluster_id: bestCluster.id,
          signal_id: signal.id,
          org_id: signal.org_id,
          similarity: Math.round(bestSim * 1000) / 1000,
        },
        { onConflict: 'cluster_id,signal_id' },
      )

      await markPendingStatus(supabase, job.id, 'completed')
      totalClustersUpdated++
    } else {
      // --- Créer un nouveau cluster ---
      const { data: newCluster, error: insertErr } = await supabase
        .from('signal_clusters')
        .insert({
          org_id: signal.org_id,
          centroid_title: title,
          signal_count: 1,
          sources: [signal.source],
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        })
        .select('id, org_id, centroid_title, signal_count, sources, last_seen_at')
        .single()

      if (insertErr || !newCluster) {
        await markPendingStatus(supabase, job.id, 'failed', formatError(insertErr).message)
        continue
      }

      const newClusterRow = newCluster as ClusterRow
      newClusterRow._embedding = signalEmbedding

      // Ajouter au cache en mémoire pour le reste du run
      const list = clustersByOrg.get(signal.org_id) ?? []
      list.push(newClusterRow)
      clustersByOrg.set(signal.org_id, list)

      // Insérer dans signal_cluster_members (similarité = 1.0 : fondateur du cluster)
      await supabase.from('signal_cluster_members').upsert(
        {
          cluster_id: newClusterRow.id,
          signal_id: signal.id,
          org_id: signal.org_id,
          similarity: 1.0,
        },
        { onConflict: 'cluster_id,signal_id' },
      )

      await markPendingStatus(supabase, job.id, 'completed')
      totalClustersCreated++
    }

    totalProcessed++
  }

  // Logs agrégés par org
  for (const orgId of orgIds) {
    await supabase.from('logs').insert({
      user_id: userId,
      org_id: orgId,
      action: 'cluster:signals',
      status: 'ok',
      payload: {
        processed: totalProcessed,
        clusters_created: totalClustersCreated,
        clusters_updated: totalClustersUpdated,
        batch_size: pending.length,
      },
    })
  }

  return json(
    {
      ok: true,
      processed: totalProcessed,
      clusters_created: totalClustersCreated,
      clusters_updated: totalClustersUpdated,
    },
    200,
  )
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Génère les embeddings pour un batch de textes via l'API OpenAI (ou OpenRouter comme proxy).
 * Retourne un tableau d'embeddings dans le même ordre que `texts`.
 * Retourne un tableau de `undefined` si l'appel échoue.
 */
async function fetchEmbeddingsBatch(
  texts: string[],
  openRouterKey: string | null,
  openAiKey: string | null,
): Promise<(number[] | undefined)[]> {
  if (texts.length === 0) return []

  // Préférer OpenAI directement pour les embeddings (OpenRouter les proxifie aussi)
  const apiKey = openAiKey ?? openRouterKey
  if (!apiKey) return texts.map(() => undefined)

  // OpenAI direct ou OpenRouter selon la clé disponible
  const baseUrl = openAiKey ? 'https://api.openai.com/v1' : 'https://openrouter.ai/api/v1'

  try {
    const resp = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: texts,
        dimensions: EMBEDDING_DIMS,
        encoding_format: 'float',
      }),
    })

    if (!resp.ok) {
      console.error(`[cluster-signals] embedding API error: ${resp.status} ${resp.statusText}`)
      return texts.map(() => undefined)
    }

    const body = (await resp.json()) as EmbeddingResponse
    // L'API retourne data[] dans l'ordre de l'input (garanti par OpenAI)
    return body.data.map((d) => d.embedding)
  } catch (err) {
    console.error(`[cluster-signals] embedding fetch exception:`, err)
    return texts.map(() => undefined)
  }
}

/** Marque un job pending comme 'completed' ou 'failed'. */
async function markPendingStatus(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  status: 'completed' | 'failed',
  error?: string,
): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    completed_at: status === 'completed' ? new Date().toISOString() : null,
  }
  if (error) update.last_error = error
  await supabase.from('pending_enrichments').update(update).eq('id', jobId)
}

/** Marque un batch de jobs comme 'completed' en une seule requête. */
async function markBatchCompleted(
  supabase: ReturnType<typeof createClient>,
  jobIds: string[],
): Promise<void> {
  if (jobIds.length === 0) return
  await supabase
    .from('pending_enrichments')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .in('id', jobIds)
}

function json(body: unknown, status: number): Response {
  if (status === 204) return new Response(null, { status, headers: CORS })
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
