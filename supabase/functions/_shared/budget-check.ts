// budget-check.ts
//
// Garde-fou budget PARTAGÉ : early-return si la dépense LLM cumulée du jour
// (UTC) atteint settings.daily_budget_usd.
//
// Appliqué par : dispatch-llm (péage unique, ADR 0010) — AVANT tout appel LLM
// payant. Comme dispatch-llm est l'unique point de sortie génératif du repo,
// instrumenter ici couvre TOUTES les fonctions consommatrices (scoring, digest,
// enrichissement, admin prompts, backtest, K06) sans les modifier.
//
// Origine : module de l'associé (repo Saqr), repêché tel quel — sémantique
// alignée sur run-pipeline/budget-guard.ts (skip à spent >= budget).
// Fail-open : daily_budget null/<=0 OU erreur de lecture → false (ne bloque
// jamais à tort un usage légitime). Le coût d'un faux négatif (laisser passer)
// est borné par le budget lui-même ; le coût d'un faux positif (bloquer à tort)
// casse l'outil.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

/** Début de journée UTC au format ISO. */
function startOfDayUtcIso(): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}

/**
 * Retourne true si la dépense LLM cumulée du jour (UTC) atteint dailyBudgetUsd.
 *
 * @param client  Client Supabase (service_role OU user-scoped : llm_costs a une
 *                RLS org-scoped, donc le client user lit ses propres lignes ;
 *                le service_role bypasse la RLS).
 * @param userId  user_id à comptabiliser (filtre explicite, requis en service_role).
 * @param dailyBudgetUsd  budget quotidien configuré. null/<=0 => guard désactivé.
 */
export async function budgetExceeded(
  client: SupabaseClient,
  userId: string,
  dailyBudgetUsd: number | null | undefined,
): Promise<boolean> {
  const budget = Number(dailyBudgetUsd ?? 0)
  if (!Number.isFinite(budget) || budget <= 0) return false

  const { data, error } = await client
    .from('llm_costs')
    .select('cost')
    .eq('user_id', userId)
    .gte('ts', startOfDayUtcIso())
  if (error) return false // fail-open : une erreur de lecture ne bloque jamais

  const spent = (data ?? []).reduce(
    (acc: number, r: { cost: number | string | null }) => acc + Number(r.cost ?? 0),
    0,
  )
  return spent >= budget
}
