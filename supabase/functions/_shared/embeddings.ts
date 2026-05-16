/**
 * _shared/embeddings.ts — Helper embedding multi-provider BYOK-aware.
 *
 * Résout un texte (ou batch de textes) en vector(256) pour pgvector,
 * en utilisant le provider configuré côté user (`settings.model_config.embedding`)
 * avec fallback gracieux sur les clés env vars.
 *
 * Providers supportés :
 *   - `dashscope` (Alibaba Cloud) → Qwen3-Embedding-8B via Matryoshka 256 dims.
 *     Endpoint : https://dashscope-intl.aliyuncs.com/compatible-mode/v1/embeddings
 *     Model défaut : `text-embedding-v3` (alias DashScope pour Qwen3-Embedding-8B).
 *     Customisable via settings.model_config.embedding.model si nom différent.
 *   - `openai` (canonique) → text-embedding-3-small 256 dims.
 *     Endpoint : https://api.openai.com/v1/embeddings
 *   - `openrouter` (passthrough) → text-embedding-3-small (peu de coverage embeddings).
 *     Endpoint : https://openrouter.ai/api/v1/embeddings
 *
 * Cohérence avec cluster-signals (qui utilise déjà text-embedding-3-small 256d) :
 * la dimension est figée à 256 pour partager le même schema vector(256) côté DB.
 * Si Qwen3-Embedding-8B native produit > 256 dims, on tronque via paramètre
 * `dimensions: 256` (Matryoshka representation learning — propriété native du modèle).
 *
 * BYOK strict — aucune clé API hardcodée. Cf. CLAUDE.md feedback_byok_supreme.
 */

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Dimension par défaut pour topics_watchlist. 1024 = sweet spot qualité
 * multilingue FR/AR/EN avec Qwen3-Embedding-8B (Matryoshka downscale native
 * 4096 → 1024). HNSW performant à cette échelle (<200ms query sur 1M vectors).
 *
 * Note : cluster-signals utilise 256 dims pour son propre usage avec
 * text-embedding-3-small. Les deux systèmes coexistent (tables séparées).
 */
export const EMBEDDING_DIMS = 1024

/**
 * Dimension legacy pour les helpers qui exposent un fallback OpenAI
 * (text-embedding-3-small max 1536 dims, mais on cible 1024 via Matryoshka
 * Matryoshka downscale pour parité avec Qwen).
 */
export const EMBEDDING_DIMS_FALLBACK = 1024

export type EmbeddingProvider = 'dashscope' | 'openai' | 'openrouter'

interface ProviderConfig {
  baseUrl: string
  defaultModel: string
  /** Certains endpoints (DashScope intl) attendent `model: text-embedding-v3` pour
   * Qwen3-Embedding-8B. On laisse l'user override via settings si nécessaire. */
  acceptsDimensionsParam: boolean
}

const PROVIDER_DEFAULTS: Record<EmbeddingProvider, ProviderConfig> = {
  dashscope: {
    // Singapore intl endpoint (latence Maroc/MENA optimale).
    // Le path /compatible-mode/v1 expose une API OpenAI-compatible.
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    // Alias DashScope pour Qwen3-Embedding-8B (à confirmer côté user lors de la
    // création de la clé — peut être 'qwen3-embedding-8b' ou autre selon région).
    defaultModel: 'text-embedding-v3',
    acceptsDimensionsParam: true,
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'text-embedding-3-small',
    acceptsDimensionsParam: true,
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'text-embedding-3-small',
    acceptsDimensionsParam: true,
  },
}

export interface EmbeddingResult {
  embedding: number[]
  model: string
  provider: EmbeddingProvider
  dimensions: number
  cost?: number
  /** Présent si le résultat vient d'un fallback (l'user-preferred provider a échoué). */
  fallback_engaged?: boolean
}

export interface EmbeddingBatchResult {
  embeddings: number[][]
  model: string
  provider: EmbeddingProvider
  dimensions: number
  cost?: number
  fallback_engaged?: boolean
}

/** Erreur sentinel : aucun provider configuré. Le caller décide quoi faire. */
export class NoEmbeddingProviderError extends Error {
  constructor() {
    super('no_embedding_provider_available')
    this.name = 'NoEmbeddingProviderError'
  }
}

/**
 * Cascade BYOK : lit settings.model_config.embedding → user_api_keys[provider]
 * → env vars. Retourne le 1er provider configuré, ou throw NoEmbeddingProviderError.
 */
async function resolveProvider(
  supabase: SupabaseClient,
  proxyUserId: string | null,
): Promise<{
  provider: EmbeddingProvider
  apiKey: string
  model: string
  fromUserConfig: boolean
}> {
  let preferredProvider: EmbeddingProvider | null = null
  let preferredModel: string | null = null

  // Étape 1 : settings.model_config.embedding (préférence explicite user)
  if (proxyUserId) {
    const { data: settings } = await supabase
      .from('settings')
      .select('model_config')
      .eq('user_id', proxyUserId)
      .maybeSingle()
    const cfg = (settings?.model_config as Record<string, unknown> | null)?.embedding as
      | { provider?: string; model?: string }
      | undefined
    if (cfg && typeof cfg.provider === 'string' && isKnownProvider(cfg.provider)) {
      preferredProvider = cfg.provider
      if (typeof cfg.model === 'string' && cfg.model.length > 0) {
        preferredModel = cfg.model
      }
    }
  }

  // Étape 2 : user_api_keys par ordre de préférence
  if (proxyUserId) {
    const { data: keys } = await supabase
      .from('user_api_keys')
      .select('provider, encrypted_key')
      .eq('user_id', proxyUserId)
    const byProvider = new Map<string, string>()
    for (const row of (keys ?? []) as Array<{ provider: string; encrypted_key: string }>) {
      byProvider.set(row.provider, row.encrypted_key)
    }

    // Si le user a explicitement choisi un provider et la clé existe → on l'utilise.
    if (preferredProvider && byProvider.has(preferredProvider)) {
      const key = byProvider.get(preferredProvider) as string
      return {
        provider: preferredProvider,
        apiKey: key,
        model: preferredModel ?? PROVIDER_DEFAULTS[preferredProvider].defaultModel,
        fromUserConfig: true,
      }
    }

    // Sinon, fallback par ordre : dashscope > openai > openrouter
    for (const candidate of ['dashscope', 'openai', 'openrouter'] as EmbeddingProvider[]) {
      if (byProvider.has(candidate)) {
        return {
          provider: candidate,
          apiKey: byProvider.get(candidate) as string,
          model: PROVIDER_DEFAULTS[candidate].defaultModel,
          fromUserConfig: false,
        }
      }
    }
  }

  // Étape 3 : env vars (cron service_role)
  const envOpenAi = Deno.env.get('OPENAI_API_KEY')
  if (envOpenAi) {
    return {
      provider: 'openai',
      apiKey: envOpenAi,
      model: PROVIDER_DEFAULTS.openai.defaultModel,
      fromUserConfig: false,
    }
  }
  const envOpenRouter = Deno.env.get('OPENROUTER_API_KEY')
  if (envOpenRouter) {
    return {
      provider: 'openrouter',
      apiKey: envOpenRouter,
      model: PROVIDER_DEFAULTS.openrouter.defaultModel,
      fromUserConfig: false,
    }
  }
  const envDashScope = Deno.env.get('DASHSCOPE_API_KEY')
  if (envDashScope) {
    return {
      provider: 'dashscope',
      apiKey: envDashScope,
      model: PROVIDER_DEFAULTS.dashscope.defaultModel,
      fromUserConfig: false,
    }
  }

  throw new NoEmbeddingProviderError()
}

function isKnownProvider(s: string): s is EmbeddingProvider {
  return s === 'dashscope' || s === 'openai' || s === 'openrouter'
}

interface EmbeddingApiResponse {
  data: Array<{ embedding: number[]; index?: number }>
  model?: string
  usage?: { prompt_tokens?: number; total_tokens?: number }
}

/**
 * Embed UN texte. Retourne le vector + métadonnées.
 *
 * En cas d'échec de l'user-preferred provider (timeout, 401, quota), retry une
 * fois avec le provider de fallback suivant disponible. fallback_engaged=true
 * dans le résultat.
 */
export async function embedText(
  supabase: SupabaseClient,
  proxyUserId: string | null,
  text: string,
  options?: { dimensions?: number },
): Promise<EmbeddingResult> {
  const dims = options?.dimensions ?? EMBEDDING_DIMS
  const resolved = await resolveProvider(supabase, proxyUserId)
  const cfg = PROVIDER_DEFAULTS[resolved.provider]

  try {
    const out = await callEmbeddingApi(cfg.baseUrl, resolved.apiKey, {
      model: resolved.model,
      input: [text],
      dimensions: cfg.acceptsDimensionsParam ? dims : undefined,
    })
    if (!out.data?.[0]?.embedding) {
      throw new Error('embedding_api_no_data')
    }
    const emb = ensureDimensions(out.data[0].embedding, dims)
    return {
      embedding: emb,
      model: out.model ?? resolved.model,
      provider: resolved.provider,
      dimensions: dims,
      cost: estimateCost(resolved.provider, out.usage?.total_tokens ?? text.length / 4),
    }
  } catch (err) {
    // Fallback : essaye OpenAI direct si on n'était pas déjà dessus.
    if (resolved.provider !== 'openai') {
      const fallbackKey = Deno.env.get('OPENAI_API_KEY')
      if (fallbackKey) {
        try {
          const out = await callEmbeddingApi(PROVIDER_DEFAULTS.openai.baseUrl, fallbackKey, {
            model: PROVIDER_DEFAULTS.openai.defaultModel,
            input: [text],
            dimensions: dims,
          })
          if (out.data?.[0]?.embedding) {
            return {
              embedding: ensureDimensions(out.data[0].embedding, dims),
              model: PROVIDER_DEFAULTS.openai.defaultModel,
              provider: 'openai',
              dimensions: dims,
              cost: estimateCost('openai', out.usage?.total_tokens ?? text.length / 4),
              fallback_engaged: true,
            }
          }
        } catch {
          // ignore, on relance l'erreur originale
        }
      }
    }
    throw err
  }
}

/**
 * Embed un batch de textes. Plus efficient pour les seeds[] des
 * topics_of_interest (jusqu'à 5 en un appel).
 */
export async function embedTexts(
  supabase: SupabaseClient,
  proxyUserId: string | null,
  texts: string[],
  options?: { dimensions?: number },
): Promise<EmbeddingBatchResult> {
  if (texts.length === 0) {
    throw new Error('embedTexts_called_with_empty_input')
  }
  const dims = options?.dimensions ?? EMBEDDING_DIMS
  const resolved = await resolveProvider(supabase, proxyUserId)
  const cfg = PROVIDER_DEFAULTS[resolved.provider]

  const out = await callEmbeddingApi(cfg.baseUrl, resolved.apiKey, {
    model: resolved.model,
    input: texts,
    dimensions: cfg.acceptsDimensionsParam ? dims : undefined,
  })

  if (!Array.isArray(out.data) || out.data.length !== texts.length) {
    throw new Error('embedding_api_data_count_mismatch')
  }

  // Ordonner par index si présent (l'API peut retourner désordonné).
  const ordered = [...out.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))

  return {
    embeddings: ordered.map((d) => ensureDimensions(d.embedding, dims)),
    model: out.model ?? resolved.model,
    provider: resolved.provider,
    dimensions: dims,
    cost: estimateCost(resolved.provider, out.usage?.total_tokens),
  }
}

/**
 * Computes the **arithmetic mean** of N embeddings (centroid).
 *
 * Pour topics_of_interest.seeds_embedding : on prend la moyenne des embeddings
 * des seeds individuels. Plus précis qu'embedder la concaténation, parce que
 * chaque seed reste un point d'ancrage sémantique distinct.
 *
 * Préserve la norme L2 unitaire (post-normalisation) pour que cosine similarity
 * reste valide.
 */
export function meanEmbedding(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    throw new Error('meanEmbedding_called_with_empty_input')
  }
  if (embeddings.length === 1) return embeddings[0]

  const dims = embeddings[0].length
  const sum = new Array<number>(dims).fill(0)
  for (const e of embeddings) {
    if (e.length !== dims) {
      throw new Error('meanEmbedding_dim_mismatch')
    }
    for (let i = 0; i < dims; i++) {
      sum[i] += e[i]
    }
  }
  const n = embeddings.length
  for (let i = 0; i < dims; i++) sum[i] /= n

  // Normalize L2 pour cosine similarity stable.
  let norm = 0
  for (const v of sum) norm += v * v
  norm = Math.sqrt(norm)
  if (norm === 0) return sum // edge case improbable
  return sum.map((v) => v / norm)
}

/**
 * Format pgvector text representation (cf. https://github.com/pgvector/pgvector#text-format).
 * Exemple : `[0.1,0.2,0.3]`. Utilisable comme bind param dans une query Postgres.
 */
export function toPgVector(embedding: number[]): string {
  return '[' + embedding.map((v) => v.toFixed(7)).join(',') + ']'
}

// ─── Internals ──────────────────────────────────────────────────────────────

async function callEmbeddingApi(
  baseUrl: string,
  apiKey: string,
  body: { model: string; input: string[]; dimensions?: number },
): Promise<EmbeddingApiResponse> {
  const res = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: body.model,
      input: body.input,
      ...(body.dimensions ? { dimensions: body.dimensions, encoding_format: 'float' } : {}),
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`embedding_api_http_${res.status}: ${text.slice(0, 200)}`)
  }
  return (await res.json()) as EmbeddingApiResponse
}

/**
 * Si le provider retourne plus de dims que demandé (Qwen native 4096 dims sans
 * paramètre dimensions), tronque à `target` (Matryoshka downscale).
 * Vérifie aussi que la dim retournée n'est PAS plus petite (incohérence).
 */
function ensureDimensions(embedding: number[], target: number): number[] {
  if (embedding.length === target) return embedding
  if (embedding.length > target) return embedding.slice(0, target)
  // < target = erreur : on ne peut pas créer des dims qui n'existent pas.
  throw new Error(`embedding_dimensions_too_low: got=${embedding.length} target=${target}`)
}

/** Estimation de coût grossière (USD). Pour télémétrie, pas pour facturation. */
function estimateCost(provider: EmbeddingProvider, tokens: number | undefined): number {
  if (!tokens || tokens <= 0) return 0
  // Prix approximatifs par 1k tokens (2026, peut dériver) :
  //   - OpenAI text-embedding-3-small : $0.00002
  //   - OpenRouter passthrough OpenAI : idem
  //   - DashScope Qwen3-Embedding-8B intl : ~$0.0007 (35× plus cher mais reste trivial)
  const pricePer1k = provider === 'dashscope' ? 0.0007 : 0.00002
  return (tokens / 1000) * pricePer1k
}
