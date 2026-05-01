/**
 * compose.ts — Résolution de la chaîne `{{run:<kind>}}` pour run-admin-prompt.
 *
 * Pour chaque task_kind référencé dans un template :
 *   - Si un run success existe en DB et son âge ≤ max_age_hours    → 'cached'
 *   - Sinon, si un prompt parent existe pour ce kind                → 'cascade'
 *     (on exécute le prompt parent, persiste le run, propage le coût)
 *   - Sinon                                                          → 'missing'
 *   - Si la profondeur courante > max_depth                          → 'depth_limit'
 *   - Si le kind est déjà dans la stack `visited`                    → 'cycle'
 *
 * Ce module reste agnostique du moteur de template : il reçoit en injection
 * la fonction `executePromptOnce` qui sait exécuter un prompt et persister son
 * run, ce qui évite une dépendance circulaire avec index.ts et permet de
 * tester resolveComposedRuns en isolation si besoin.
 */

export type ComposedSource = 'cached' | 'cascade' | 'missing' | 'cycle' | 'depth_limit'

export interface ComposedChainEntry {
  kind: string
  source: ComposedSource
  run_id: string | null
  age_hours: number | null
  cost: number
}

export interface ResolveComposedRunsResult {
  composedRuns: Record<string, string>
  chain: ComposedChainEntry[]
  totalCost: number
}

/** Forme minimale d'un prompt admin nécessaire à la cascade. */
export interface ParentPromptRow {
  id: string
  task_kind: string
  system_prompt: string
  user_prompt_template: string
  source_filter: Record<string, unknown> | null
}

/** Résultat retourné par executePromptOnce après une exécution réussie ou échouée. */
export interface ExecutePromptResult {
  ok: boolean
  run_id: string | null
  output_markdown: string | null
  cost: number
}

/**
 * Signature minimale du client Supabase utilisée ici.
 * On garde `unknown` côté retour pour que le module reste utilisable avec
 * n'importe quel client typé en aval (les appels concrets se font dans index.ts).
 */
// deno-lint-ignore no-explicit-any
export type SupabaseClientLike = any

export interface ResolveComposedRunsParams {
  supabase: SupabaseClientLike
  userId: string
  kinds: string[]
  maxAgeHours: number
  maxDepth: number
  depth: number
  visited: Set<string>
  /**
   * Exécute un prompt parent (cascade). Retourne le résultat de la persistance.
   * Cette fonction est responsable de :
   *   - charger settings, signaux, topics, rubrique
   *   - rendre system + user prompt
   *   - appeler dispatch-llm
   *   - persister `admin_prompt_runs` + `llm_costs`
   *   - re-déclencher resolveComposedRuns récursivement si le prompt parent
   *     contient lui-même des `{{run:<kind>}}`
   */
  executePromptOnce: (
    parent: ParentPromptRow,
    nextDepth: number,
    nextVisited: Set<string>,
  ) => Promise<ExecutePromptResult>
}

/**
 * Sélectionne le prompt parent (display_order ASC, premier du kind) pour ce
 * task_kind, RLS-safe sur user_id.
 */
async function fetchParentPrompt(
  supabase: SupabaseClientLike,
  userId: string,
  kind: string,
): Promise<ParentPromptRow | null> {
  const res = await supabase
    .from('admin_prompts')
    .select('id, task_kind, system_prompt, user_prompt_template, source_filter')
    .eq('user_id', userId)
    .eq('task_kind', kind)
    .order('display_order', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (res.error || !res.data) return null
  return res.data as ParentPromptRow
}

/**
 * Cherche le dernier run success pour ce kind (via les prompts du user dont
 * task_kind == kind). Retourne null si aucun run success n'existe.
 */
async function fetchLatestSuccessRun(
  supabase: SupabaseClientLike,
  userId: string,
  kind: string,
): Promise<{ run_id: string; output_markdown: string; executed_at: string } | null> {
  const promptsRes = await supabase
    .from('admin_prompts')
    .select('id')
    .eq('user_id', userId)
    .eq('task_kind', kind)
  if (promptsRes.error || !promptsRes.data) return null
  const ids = (promptsRes.data as { id: string }[]).map((p) => p.id)
  if (ids.length === 0) return null

  const runsRes = await supabase
    .from('admin_prompt_runs')
    .select('id, output_markdown, executed_at')
    .eq('user_id', userId)
    .eq('status', 'success')
    .in('prompt_id', ids)
    .order('executed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (runsRes.error || !runsRes.data) return null
  const row = runsRes.data as {
    id: string
    output_markdown: string | null
    executed_at: string
  }
  if (!row.output_markdown || row.output_markdown.trim().length === 0) return null
  return { run_id: row.id, output_markdown: row.output_markdown, executed_at: row.executed_at }
}

/** Calcule l'âge en heures d'un timestamp ISO, arrondi à 0,1 h. */
function ageHoursFromIso(iso: string): number {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY
  const hours = (Date.now() - t) / (60 * 60 * 1000)
  return Math.round(hours * 10) / 10
}

/**
 * Pour chaque kind référencé, retourne :
 *   - le contenu à substituer (composedRuns[kind])
 *   - une entrée de log dans `chain` (source, run_id, age_hours, cost)
 *   - la somme des coûts générés par les cascades (totalCost)
 *
 * Ordre des décisions par kind :
 *   1. Si profondeur > maxDepth                                → 'depth_limit'
 *   2. Si kind ∈ visited                                       → 'cycle'
 *   3. Si dernier run success ≤ maxAgeHours                    → 'cached'
 *   4. Sinon, si prompt parent existe                          → 'cascade'
 *   5. Sinon                                                   → 'missing'
 */
export async function resolveComposedRuns(
  params: ResolveComposedRunsParams,
): Promise<ResolveComposedRunsResult> {
  const composedRuns: Record<string, string> = {}
  const chain: ComposedChainEntry[] = []
  let totalCost = 0

  for (const kind of params.kinds) {
    if (params.depth > params.maxDepth) {
      composedRuns[kind] = '(profondeur max atteinte)'
      chain.push({ kind, source: 'depth_limit', run_id: null, age_hours: null, cost: 0 })
      continue
    }

    if (params.visited.has(kind)) {
      composedRuns[kind] = '(cycle détecté)'
      chain.push({ kind, source: 'cycle', run_id: null, age_hours: null, cost: 0 })
      continue
    }

    const latest = await fetchLatestSuccessRun(params.supabase, params.userId, kind)
    if (latest !== null) {
      const ageH = ageHoursFromIso(latest.executed_at)
      if (ageH <= params.maxAgeHours) {
        composedRuns[kind] = latest.output_markdown
        chain.push({
          kind,
          source: 'cached',
          run_id: latest.run_id,
          age_hours: ageH,
          cost: 0,
        })
        continue
      }
    }

    const parent = await fetchParentPrompt(params.supabase, params.userId, kind)
    if (!parent) {
      composedRuns[kind] = '(aucun run précédent disponible)'
      chain.push({ kind, source: 'missing', run_id: null, age_hours: null, cost: 0 })
      continue
    }

    const nextVisited = new Set(params.visited)
    nextVisited.add(kind)
    const result = await params.executePromptOnce(parent, params.depth + 1, nextVisited)
    totalCost += result.cost
    if (result.ok && result.output_markdown) {
      composedRuns[kind] = result.output_markdown
      chain.push({
        kind,
        source: 'cascade',
        run_id: result.run_id,
        age_hours: null,
        cost: result.cost,
      })
    } else {
      composedRuns[kind] = '(aucun run précédent disponible)'
      chain.push({
        kind,
        source: 'missing',
        run_id: result.run_id,
        age_hours: null,
        cost: result.cost,
      })
    }
  }

  return { composedRuns, chain, totalCost }
}
