/**
 * orchestrator.ts — Logique pure de l'orchestrateur process-pending-enrichments.
 * Extraite ici pour être testable sans dépendance Supabase/Deno.serve.
 */

export type PassKind = 'entities' | 'reputation' | 'clustering'

/** Mapping pass_kind → chemin de l'edge fn */
export const PASS_KIND_TO_FN: Record<PassKind, string> = {
  entities: '/functions/v1/enrich-entities',
  reputation: '/functions/v1/compute-reputation',
  clustering: '/functions/v1/cluster-signals',
}

const ALL_PASS_KINDS: PassKind[] = ['entities', 'reputation', 'clustering']

export interface PendingCountRow {
  pass_kind: string
  count: number
}

/**
 * Détermine quels pass_kind ont des jobs en attente et retourne la liste
 * des URLs à dispatcher (chemin relatif sans base URL).
 */
export function buildDispatchList(pendingCounts: PendingCountRow[]): PassKind[] {
  const kinds: PassKind[] = []
  for (const row of pendingCounts) {
    if (row.count > 0 && ALL_PASS_KINDS.includes(row.pass_kind as PassKind)) {
      kinds.push(row.pass_kind as PassKind)
    }
  }
  return kinds
}

/**
 * Filtre les jobs failed re-queuables : status='failed' ET attempts < 5.
 * Retourne les ids à remettre en pending.
 */
export function filterRequeuable(jobs: Array<{ id: string; attempts: number }>): string[] {
  return jobs.filter((j) => j.attempts < 5).map((j) => j.id)
}

export interface DispatchResult {
  kind: PassKind
  ok: boolean
  status?: number
  error?: string
}

/**
 * Construit le payload de log pour l'action cron:process-pending.
 */
export function buildLogPayload(
  dispatched: PassKind[],
  requeued: number,
  results: DispatchResult[],
): Record<string, unknown> {
  return {
    dispatched,
    requeued,
    dispatch_results: results.map((r) => ({
      kind: r.kind,
      ok: r.ok,
      status: r.status,
      error: r.error,
    })),
  }
}
