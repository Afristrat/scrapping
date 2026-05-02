/**
 * Helper d'analytics — wrapper minimal autour de Plausible.
 *
 * Plausible est chargé via un script externe dans `index.html` (commenté
 * par défaut, à activer après création du compte Plausible). Quand le
 * script est présent, il expose `window.plausible(eventName, { props })`.
 *
 * Si le script n'est pas chargé (dev local, env de tests, RGPD strict), les
 * appels deviennent des no-ops silencieux — aucun warning, aucun crash.
 *
 * Voir `docs/architecture/adrs/0005-analytics.md` pour la décision détaillée.
 */

type PlausibleProps = Record<string, string | number | boolean | undefined>

interface PlausibleEventOptions {
  props?: PlausibleProps
  callback?: () => void
}

type PlausibleFn = (eventName: string, options?: PlausibleEventOptions) => void

interface WindowWithPlausible extends Window {
  plausible?: PlausibleFn
}

/**
 * Émet un événement custom vers Plausible.
 *
 * @param name Nom de l'événement (ex. `signup_started`, `pricing_cta_click`).
 *             Doit correspondre à un Custom Event configuré dans Plausible.
 * @param props Propriétés additionnelles (segment, persona, plan, etc.).
 *              Plausible accepte des string/number/boolean uniquement.
 *
 * @example
 * trackEvent('signup_started', { plan: 'pro', mode: 'maison' })
 * trackEvent('case_study_view', { persona: 'vc' })
 */
export function trackEvent(name: string, props?: PlausibleProps): void {
  if (typeof window === 'undefined') return

  const win = window as WindowWithPlausible
  if (typeof win.plausible !== 'function') return

  if (props === undefined) {
    win.plausible(name)
    return
  }
  win.plausible(name, { props })
}

/**
 * Émet un page view manuel — utile quand le routing client (React Router)
 * change l'URL sans full reload. Plausible auto-détecte normalement
 * `history.pushState`, mais pour les SPA on peut le forcer si besoin.
 */
export function trackPageview(url?: string): void {
  if (typeof window === 'undefined') return
  const win = window as WindowWithPlausible
  if (typeof win.plausible !== 'function') return

  if (url !== undefined) {
    win.plausible('pageview', { props: { url } })
    return
  }
  win.plausible('pageview')
}
