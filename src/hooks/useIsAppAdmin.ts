import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

// =============================================================================
// Wave 6 — Sub-wave 6.4 — Story S6-AdminCockpit
//
// Hook de vérification du statut « super-admin Kairos » de l'utilisateur
// courant. Utilise la fonction SQL `public.is_app_admin()` créée par la
// migration 20260502000009_admin_globals.sql.
//
// La RPC `is_app_admin` n'est pas encore présente dans `src/types/database.ts`
// (régénération nécessaire après push). On utilise donc un cast minimal sur
// l'appel `.rpc(...)` — pattern identique à celui d'`useAuditLog.ts` et
// documenté dans CLAUDE.md (« régénérer les types après chaque migration »).
//
// Sécurité : ce hook ne fait QUE de la lecture. Toutes les actions sensibles
// (admin-metrics, etc.) doivent re-vérifier `is_app_admin()` côté edge fn.
// Le frontend ne doit JAMAIS être considéré comme la source de vérité.
// =============================================================================

export function useIsAppAdmin(): UseQueryResult<boolean, Error> {
  const session = useAuthStore((s) => s.session)
  return useQuery<boolean, Error>({
    queryKey: ['is_app_admin', session?.user?.id ?? null],
    enabled: !!session?.user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // Cast nécessaire : `is_app_admin` absent de Database tant que les types
      // ne sont pas régénérés post-migration. Cf. CLAUDE.md piège connu.
      const rpc = (
        supabase as unknown as {
          rpc: (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>
        }
      ).rpc
      const { data, error } = await rpc('is_app_admin')
      if (error) {
        // En cas d'erreur (réseau, RPC manquante) on retombe en non-admin.
        // C'est un fail-safe sécurité : mieux vaut bloquer l'accès qu'autoriser
        // par défaut.
        return false
      }
      return data === true
    },
  })
}
