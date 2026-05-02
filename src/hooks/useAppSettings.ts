import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { toast } from 'sonner'

import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

// =============================================================================
// Wave 8.B — Story S8B-AppSettings
//
// Lecture / écriture des paramètres globaux de l'application (table
// `app_settings`, RLS = SELECT public + INSERT/UPDATE/DELETE app_admin).
//
// Les types Supabase générés (`src/types/database.ts`) ne sont pas encore à
// jour pour cette table tant que la migration `20260502000013_app_settings`
// n'a pas été poussée + types régénérés. On utilise donc un cast minimal,
// pattern identique à `useIsAppAdmin.ts`.
// =============================================================================

const DEFAULT_DOMAIN = 'kairos.ai-mpower.com'
const DEFAULT_BRAND_NAME = 'Kairos'

interface AppSettingRow {
  key: string
  value: string
}

type AppSettingsMap = Record<string, string>

// Cast minimal sur le client Supabase pour adresser une table non encore
// présente dans les types générés. Voir CLAUDE.md (« régénérer les types
// après chaque migration »).
type AnySupabaseClient = {
  from: (table: string) => {
    select: (columns: string) => Promise<{
      data: AppSettingRow[] | null
      error: { message: string } | null
    }>
    upsert: (
      values: { key: string; value: string; updated_by: string | null },
      options: { onConflict: string },
    ) => Promise<{ error: { message: string } | null }>
  }
}

function castClient(): AnySupabaseClient {
  return supabase as unknown as AnySupabaseClient
}

/**
 * Récupère TOUS les paramètres `app_settings` sous forme de map clé→valeur.
 * Cache 5 min ; lecture publique (fonctionne pour anon comme pour auth).
 */
export function useAppSettings(): UseQueryResult<AppSettingsMap, Error> {
  return useQuery<AppSettingsMap, Error>({
    queryKey: ['app_settings'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await castClient().from('app_settings').select('key, value')
      if (error) throw new Error(error.message)
      const map: AppSettingsMap = {}
      for (const row of data ?? []) {
        map[row.key] = row.value
      }
      return map
    },
  })
}

/**
 * Domaine de l'application. Fallback sur `kairos.ai-mpower.com` si la table
 * n'est pas encore disponible (migration non poussée) ou si le hook est
 * appelé avant la première résolution du fetch.
 */
export function useAppDomain(): string {
  const { data: settings } = useAppSettings()
  return settings?.app_domain ?? DEFAULT_DOMAIN
}

/**
 * Nom de marque par défaut affiché sur les pages publiques. Différent de
 * `useAppName()` qui priorise le `branding.name` de l'utilisateur connecté.
 */
export function useAppBrandName(): string {
  const { data: settings } = useAppSettings()
  return settings?.app_brand_name ?? DEFAULT_BRAND_NAME
}

/**
 * Email de contact public construit à partir du domaine configuré :
 * toujours `labs@<app_domain>` — pas de override possible (cohérence
 * branding sur toute la plateforme).
 */
export function useContactEmail(): string {
  const domain = useAppDomain()
  return `labs@${domain}`
}

interface UpdateInput {
  key: string
  value: string
}

/**
 * Mutation `upsert` pour les app_admins. RLS garantit que les non-admins ne
 * peuvent pas écrire — pas de double-check ici (frontend = pas une source
 * de vérité). Toast succès / erreur intégré.
 */
export function useUpdateAppSetting() {
  const qc = useQueryClient()
  return useMutation<void, Error, UpdateInput>({
    mutationFn: async ({ key, value }) => {
      const userId = useAuthStore.getState().user?.id ?? null
      const { error } = await castClient()
        .from('app_settings')
        .upsert({ key, value, updated_by: userId }, { onConflict: 'key' })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app_settings'] })
      toast.success('Paramètre mis à jour')
    },
    onError: (err) => {
      toast.error('Erreur', { description: err.message })
    },
  })
}
