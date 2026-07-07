// google-news.ts — porté de Saqr (P1).
//
// RSS n'a pas de mécanisme de recherche natif (contrairement à X/Reddit/arXiv
// où un handle/sub/catégorie identifie un flux interrogeable) — un flux RSS
// est une URL fixe qu'on suit, pas une API interrogeable par mot-clé. Google
// News expose un endpoint de recherche non documenté mais stable, sans clé
// API, qui retourne un flux RSS valide pour n'importe quelle requête — c'est
// le seul agrégateur gratuit permettant de transformer un rss_keyword de
// research_strategy en contenu réel sans dépendre d'un flux pré-souscrit (cf.
// mode session de scraper-rss, hints.rss_keywords dans research-from-seed).
//
// Module séparé (comme parse.ts côté Saqr) pour rester testable sans
// démarrer Deno.serve() : `index.ts` l'exécute au chargement du module, ce
// qui casserait un import direct dans les tests.

export type GoogleNewsLang = 'fr' | 'en' | 'ar'

const LOCALE_MAP: Record<GoogleNewsLang, { hl: string; gl: string; ceid: string }> = {
  fr: { hl: 'fr', gl: 'MA', ceid: 'MA:fr' },
  en: { hl: 'en', gl: 'US', ceid: 'US:en' },
  ar: { hl: 'ar', gl: 'MA', ceid: 'MA:ar' },
}

/**
 * Construit l'URL de recherche RSS Google News pour un mot-clé.
 *
 * `hl`/`gl`/`ceid` pilotent la langue/région des résultats — alignés sur le
 * `lang` de la research_strategy (research-from-seed).
 */
export function buildGoogleNewsSearchUrl(keyword: string, lang: GoogleNewsLang = 'fr'): string {
  const { hl, gl, ceid } = LOCALE_MAP[lang] ?? LOCALE_MAP.fr
  const q = encodeURIComponent(keyword)
  return `https://news.google.com/rss/search?q=${q}&hl=${hl}&gl=${gl}&ceid=${ceid}`
}
