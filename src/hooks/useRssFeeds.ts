import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'
import type { Database } from '@/types/database'

export type RssFeed = Database['public']['Tables']['rss_feeds']['Row']

const QUERY_KEY = 'rss_feeds'

export function useRssFeeds() {
  const orgId = useCurrentOrgId()
  return useQuery<RssFeed[]>({
    queryKey: [QUERY_KEY, orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rss_feeds')
        .select('*')
        .eq('org_id', orgId ?? '')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useAddRssFeed() {
  const orgId = useCurrentOrgId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, url }: { name: string; url: string }) => {
      if (!orgId) throw new Error('org_id_missing')
      const { data, error } = await supabase
        .from('rss_feeds')
        .insert({ org_id: orgId, name, url })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [QUERY_KEY, orgId] })
    },
  })
}

export function useToggleRssFeed() {
  const orgId = useCurrentOrgId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('rss_feeds').update({ active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [QUERY_KEY, orgId] })
    },
  })
}

export function useDeleteRssFeed() {
  const orgId = useCurrentOrgId()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rss_feeds').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [QUERY_KEY, orgId] })
    },
  })
}

export function useRssFeedStats(feeds: RssFeed[]) {
  const activeCount = feeds.filter((f) => f.active).length
  const totalSignals = feeds.reduce((acc, f) => acc + (f.signal_count ?? 0), 0)
  return { activeCount, totalSignals }
}
