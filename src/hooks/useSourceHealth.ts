import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type HealthStatus = 'checking' | 'ok' | 'warn' | 'error' | 'static'

export interface SourceHealth {
  status: HealthStatus
  detail?: string
}

const STALE_TIME = 5 * 60 * 1000 // 5 minutes

interface RedditAboutResponse {
  data?: {
    subscribers?: number
    subreddit_type?: string
  }
}

/**
 * Vérifie la santé d'un subreddit via l'API publique Reddit.
 * CORS peut bloquer la requête depuis le navigateur → on catche silencieusement
 * et on retourne 'warn' avec le detail "CORS".
 */
export function useSubredditHealth(sub: string): SourceHealth {
  const { data, isLoading, isError, error } = useQuery<SourceHealth>({
    queryKey: ['source-health', 'reddit', sub],
    staleTime: STALE_TIME,
    retry: false,
    queryFn: async (): Promise<SourceHealth> => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)
      try {
        const resp = await fetch(`https://www.reddit.com/r/${sub}/about.json`, {
          mode: 'cors',
          signal: controller.signal,
        })
        clearTimeout(timeoutId)

        if (resp.status === 404) {
          return { status: 'error', detail: 'Subreddit introuvable' }
        }
        if (!resp.ok) {
          return { status: 'warn', detail: `HTTP ${resp.status}` }
        }

        const json = (await resp.json()) as RedditAboutResponse
        const subscribers = json.data?.subscribers ?? 0
        if (subscribers > 0) {
          return { status: 'ok' }
        }
        return { status: 'warn', detail: 'Abonnés non détectés' }
      } catch (err: unknown) {
        clearTimeout(timeoutId)
        // CORS ou réseau → warn silencieux
        const message = err instanceof Error ? err.message : String(err)
        if (
          message.includes('Failed to fetch') ||
          message.includes('NetworkError') ||
          message.includes('CORS') ||
          message.includes('AbortError') ||
          (err instanceof DOMException && err.name === 'AbortError')
        ) {
          return { status: 'warn', detail: 'CORS' }
        }
        return { status: 'warn', detail: 'Erreur réseau' }
      }
    },
  })

  if (isLoading) return { status: 'checking' }
  if (isError) {
    const message = error instanceof Error ? error.message : String(error)
    return { status: 'warn', detail: message.slice(0, 60) }
  }
  return data ?? { status: 'warn' }
}

/**
 * Vérifie la santé d'un flux RSS en appelant l'edge fn `scraper-rss` comme proxy
 * (évite les problèmes CORS sur les flux cross-origin).
 */
export function useRssHealth(url: string): SourceHealth {
  const { data, isLoading, isError, error } = useQuery<SourceHealth>({
    queryKey: ['source-health', 'rss', url],
    staleTime: STALE_TIME,
    retry: false,
    enabled: !!url,
    queryFn: async (): Promise<SourceHealth> => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        return { status: 'warn', detail: 'Non authentifié' }
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)

      try {
        const baseUrl = import.meta.env.VITE_SUPABASE_URL as string
        const resp = await fetch(`${baseUrl}/functions/v1/scraper-rss`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url, health_check: true }),
          signal: controller.signal,
        })
        clearTimeout(timeoutId)

        if (resp.ok) {
          return { status: 'ok' }
        }
        if (resp.status >= 400 && resp.status < 500) {
          return { status: 'error', detail: `HTTP ${resp.status} — flux inaccessible` }
        }
        return { status: 'warn', detail: `HTTP ${resp.status}` }
      } catch (err: unknown) {
        clearTimeout(timeoutId)
        const isAbort =
          (err instanceof DOMException && err.name === 'AbortError') ||
          (err instanceof Error && err.name === 'AbortError')
        if (isAbort) {
          return { status: 'warn', detail: 'Timeout (8s)' }
        }
        return { status: 'warn', detail: 'Erreur réseau' }
      }
    },
  })

  if (isLoading) return { status: 'checking' }
  if (isError) {
    const message = error instanceof Error ? error.message : String(error)
    return { status: 'warn', detail: message.slice(0, 60) }
  }
  return data ?? { status: 'warn' }
}
