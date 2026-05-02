import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'
import { maskKey, type ApiKeyProvider, type UserApiKey } from '@/lib/schemas/api-key-schema'
import { toDbValidationStatus, type ValidationResult } from '@/hooks/useValidateApiKey'

/**
 * Wave 6.1 : `user_api_keys` rows now carry an `org_id`. Keys are scoped
 * to the org (every member sees the org's BYOK keys, gated by RLS roles
 * for write). The `(org_id, provider)` unique constraint enforces a
 * single key per provider per org.
 *
 * Wave 6.4 (S6-BYOKProvisioning) : on remonte aussi `validation_status`,
 * `last_validated_at` et `base_url` pour afficher l'état (verified /
 * invalid / missing) dans la UI Settings → Clés API.
 */
export function useApiKeys() {
  const orgId = useCurrentOrgId()
  return useQuery<UserApiKey[]>({
    queryKey: ['api_keys', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_api_keys')
        .select(
          'id, user_id, provider, masked_key, base_url, validation_status, last_validated_at, created_at, updated_at',
        )
        .eq('org_id', orgId ?? '')
        .order('provider')
      if (error) throw error
      return (data ?? []) as unknown as UserApiKey[]
    },
  })
}

interface UpsertApiKeyVars {
  provider: ApiKeyProvider
  rawKey: string
  baseUrl?: string | null
  /**
   * Résultat optionnel d'une validation côté UI (bouton « Tester »). Quand
   * fourni, on persiste le `validation_status` + `last_validated_at` dans la DB
   * pour que l'état s'affiche correctement après un refresh.
   */
  validation?: ValidationResult | null
}

export function useUpsertApiKey() {
  const qc = useQueryClient()
  const orgId = useCurrentOrgId()
  return useMutation<{ status: 'valid' | 'invalid' | 'unknown' | null }, Error, UpsertApiKeyVars>({
    mutationFn: async ({ provider, rawKey, baseUrl, validation }) => {
      const userId = useAuthStore.getState().user?.id
      if (!userId) throw new Error('not_authenticated')
      if (!orgId) throw new Error('no_org_selected')
      const masked = maskKey(rawKey)
      const dbStatus = validation ? toDbValidationStatus(validation.status) : null
      const validatedAt = validation ? new Date().toISOString() : null

      const payload: {
        user_id: string
        org_id: string
        provider: ApiKeyProvider
        encrypted_key: string
        masked_key: string
        base_url?: string | null
        validation_status?: 'valid' | 'invalid' | 'unknown' | null
        last_validated_at?: string | null
      } = {
        user_id: userId,
        org_id: orgId,
        provider,
        encrypted_key: rawKey,
        masked_key: masked,
      }
      if (baseUrl !== undefined) payload.base_url = baseUrl
      if (dbStatus !== null) {
        payload.validation_status = dbStatus
        payload.last_validated_at = validatedAt
      }

      const { error } = await supabase
        .from('user_api_keys')
        .upsert(payload, { onConflict: 'org_id,provider' })
      if (error) throw error
      return { status: dbStatus }
    },
    onSuccess: ({ status }, vars) => {
      if (status === 'invalid') {
        toast.warning(`Clé ${vars.provider} enregistrée mais invalide`, {
          description:
            'Le mode Maison sera utilisé en fallback automatique. Vérifiez votre clé ou ajustez la sélection dans Settings → Modèles.',
        })
      } else if (status === 'valid') {
        toast.success(`Clé ${vars.provider} sauvegardée et validée`)
      } else {
        toast.success(`Clé ${vars.provider} sauvegardée`)
      }
      qc.invalidateQueries({ queryKey: ['api_keys'] })
    },
    onError: (err) =>
      toast.error('Erreur sauvegarde clé', { description: err.message.slice(0, 200) }),
  })
}

export function useDeleteApiKey() {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string }>({
    mutationFn: async ({ id }) => {
      const { error } = await supabase.from('user_api_keys').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Clé supprimée')
      qc.invalidateQueries({ queryKey: ['api_keys'] })
    },
    onError: (err) => toast.error('Erreur suppression', { description: err.message.slice(0, 200) }),
  })
}

/**
 * Mutation utilitaire pour mettre à jour uniquement le statut de validation
 * d'une clé existante (utilisée après un test « Tester » sans changement de
 * clé). Évite un re-upsert complet.
 */
export function useUpdateApiKeyValidation() {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string; status: 'valid' | 'invalid' | 'unknown' }>({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase
        .from('user_api_keys')
        .update({
          validation_status: status,
          last_validated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api_keys'] })
    },
  })
}
