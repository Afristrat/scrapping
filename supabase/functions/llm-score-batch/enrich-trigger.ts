/**
 * enrich-trigger.ts — Helper best-effort pour déclencher enrich-signal
 * après un batch de scoring.
 *
 * Appelé en fire-and-forget via EdgeRuntime.waitUntil ou Promise directe.
 * Ne doit JAMAIS propager d'erreur vers l'appelant.
 */

export interface EnrichPayload {
  signal_ids: string[]
  org_id: string
}

/**
 * Construit le payload pour l'appel enrich-signal.
 * Retourne null si les données sont insuffisantes (signalIds vide ou orgId absent).
 */
export function buildEnrichPayload(
  signalIds: string[],
  orgId: string | undefined | null,
): EnrichPayload | null {
  if (signalIds.length === 0) return null
  if (!orgId || typeof orgId !== 'string' || orgId.trim() === '') return null
  return { signal_ids: signalIds, org_id: orgId }
}

/**
 * Déclenche enrich-signal de manière best-effort.
 * Utilise EdgeRuntime.waitUntil si disponible, sinon fire-and-forget.
 *
 * @returns true si le trigger a été lancé, false sinon
 */
export function triggerEnrichSignal(
  supabaseUrl: string,
  auth: string,
  payload: EnrichPayload,
): boolean {
  const enrichPromise = fetch(`${supabaseUrl}/functions/v1/enrich-signal`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }).catch((err: unknown) => {
    // Best-effort : log mais ne pas propager l'erreur
    console.error('[enrich-signal trigger] failed:', err)
  })

  // Utiliser EdgeRuntime.waitUntil si disponible pour ne pas bloquer la réponse
  try {
    // deno-lint-ignore no-explicit-any
    const er = (globalThis as any).EdgeRuntime as
      | { waitUntil?: (p: Promise<unknown>) => void }
      | undefined
    if (er?.waitUntil) {
      er.waitUntil(enrichPromise)
    }
    // Si EdgeRuntime.waitUntil n'est pas disponible (dev local), fire and forget
  } catch {
    // Silencieux — ne jamais faire échouer le scoring à cause du trigger
  }

  return true
}
