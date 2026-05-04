// Shared signal filter types and helpers — isolated to satisfy react-refresh/only-export-components

export interface SignalFilters {
  topicSlugs: string[]
  personaKeys: string[]
  sources: string[]
  minScore: number | null
  windowHours: number | null
}

export const INITIAL_SIGNAL_FILTERS: SignalFilters = {
  topicSlugs: [],
  personaKeys: [],
  sources: [],
  minScore: null,
  windowHours: null,
}

export function isFiltersEmpty(f: SignalFilters): boolean {
  return (
    f.topicSlugs.length === 0 &&
    f.personaKeys.length === 0 &&
    f.sources.length === 0 &&
    (f.minScore === null || f.minScore === 0) &&
    f.windowHours === null
  )
}
