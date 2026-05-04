/**
 * reputation.ts — Logique pure de calcul du score de réputation d'un auteur.
 * Exporté pour les tests unitaires (reputation.test.ts).
 *
 * Formule (sur une fenêtre de 90 jours) :
 *   reputation = (n_high / GREATEST(n_total, 1)) × 0.8
 *              + log(1 + n_total) / 10 × 0.2
 *   puis clampé dans [0, 1]
 *
 * Paramètres :
 *   nTotal — nombre total de signaux de l'auteur sur 90 jours
 *   nHigh  — nombre de signaux scorés >= 70 sur la même fenêtre
 */
export function computeReputationScore(nTotal: number, nHigh: number): number {
  if (nTotal <= 0) return 0

  const ratio = nHigh / Math.max(nTotal, 1)
  const volume = Math.log(1 + nTotal) / 10

  const raw = ratio * 0.8 + volume * 0.2

  // Clamp dans [0, 1]
  return Math.min(1, Math.max(0, raw))
}
