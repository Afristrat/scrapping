// =============================================================================
// Wave 6 — Sub-wave 6.4 — Story S6-BYOKProvisioning
//
// Settings → onglet « Clés API » : UI enrichie avec validation automatique
// par provider (test ping via edge fn `validate-api-key`), affichage du
// statut (verified / invalid / missing) via badges colorés, fallback Maison
// transparent côté backend si la clé est invalide (toast warning).
//
// Org-scoped (Wave 6.A) : toutes les clés sont partagées entre les membres
// de l'organisation courante.
// =============================================================================

import { useMemo, useState } from 'react'
import { CheckCircle2, AlertCircle, Loader2, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  useApiKeys,
  useDeleteApiKey,
  useUpdateApiKeyValidation,
  useUpsertApiKey,
} from '@/hooks/useApiKeys'
import { useLLMProviders } from '@/hooks/useLLMProviders'
import { useRefreshModels } from '@/hooks/useProviderModels'
import { useValidateApiKey, type ValidationResult } from '@/hooks/useValidateApiKey'
import type { LLMProviderId, LLMProviderUI } from '@/lib/providers'
import type { ApiKeyProvider, UserApiKey } from '@/lib/schemas/api-key-schema'
import { cn } from '@/lib/utils'

const OLLAMA_DEFAULT_BASE_URL = 'http://host.docker.internal:11434'

type BadgeState = 'verified' | 'invalid' | 'missing' | 'checking'

function getBadgeState(key: UserApiKey | undefined, isChecking: boolean): BadgeState {
  if (isChecking) return 'checking'
  if (!key) return 'missing'
  if (key.validation_status === 'valid') return 'verified'
  if (key.validation_status === 'invalid') return 'invalid'
  // Inclut 'unknown' (ping rate_limited / unreachable) et null (jamais testé)
  return 'missing'
}

function StateBadge({ state }: { state: BadgeState }) {
  if (state === 'checking') {
    return (
      <Badge className="border-slate-200 bg-slate-100 text-slate-600">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        Vérification…
      </Badge>
    )
  }
  if (state === 'verified') {
    return (
      <Badge className="border-emerald-200 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Vérifiée
      </Badge>
    )
  }
  if (state === 'invalid') {
    return (
      <Badge className="border-red-200 bg-red-100 text-red-700 hover:bg-red-100">
        <AlertCircle className="mr-1 h-3 w-3" />
        Invalide
      </Badge>
    )
  }
  return (
    <Badge className="border-slate-200 bg-slate-100 text-slate-500 hover:bg-slate-100">
      Manquante
    </Badge>
  )
}

interface ProviderCardProps {
  providerId: ApiKeyProvider
  label: string
  hint?: string | null
  existingKey: UserApiKey | undefined
  /** Affiche un input base_url (cas Ollama) */
  showBaseUrl?: boolean
}

function ProviderCard({ providerId, label, hint, existingKey, showBaseUrl }: ProviderCardProps) {
  const [rawKey, setRawKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(
    existingKey?.base_url ?? (providerId === 'ollama' ? OLLAMA_DEFAULT_BASE_URL : ''),
  )

  const upsert = useUpsertApiKey()
  const remove = useDeleteApiKey()
  const validate = useValidateApiKey()
  const updateValidation = useUpdateApiKeyValidation()
  const refreshModels = useRefreshModels()

  // Apify n'est pas un provider LLM → pas de bouton « Refresh models »
  const supportsRefreshModels = providerId !== 'apify'

  const badgeState = getBadgeState(existingKey, validate.isPending)

  const handleTest = async () => {
    const trimmed = rawKey.trim()
    // La clé n'est jamais remontée en clair côté front (security best-practice
    // RLS-aware) — donc on ne peut tester qu'une clé que l'utilisateur vient
    // de saisir. Pour Ollama, l'auth est facultative (test sur base_url seul).
    if (!trimmed && providerId !== 'ollama') {
      toast.error('Saisis la clé pour la tester (la clé enregistrée est masquée)')
      return
    }
    try {
      const result = await validate.mutateAsync({
        provider: providerId,
        api_key: trimmed,
        base_url: showBaseUrl && baseUrl ? baseUrl : undefined,
      })
      // Persiste le nouveau statut sur la clé existante (même si l'utilisateur
      // n'a pas re-sauvegardé) — utile pour Ollama (test sans clé).
      if (existingKey) {
        await updateValidation.mutateAsync({
          id: existingKey.id,
          status:
            result.status === 'verified'
              ? 'valid'
              : result.status === 'invalid'
                ? 'invalid'
                : 'unknown',
        })
      }
      announceValidation(result)
    } catch (err) {
      toast.error('Test échoué', {
        description: err instanceof Error ? err.message.slice(0, 200) : 'unknown_error',
      })
    }
  }

  const handleSave = async () => {
    const trimmed = rawKey.trim()
    if (!trimmed && providerId !== 'ollama') return

    // 1) Valider d'abord (best-effort — si le ping échoue, on enregistre
    //    quand même avec validation=null pour ne pas bloquer l'utilisateur).
    let validation: ValidationResult | null
    try {
      validation = await validate.mutateAsync({
        provider: providerId,
        api_key: trimmed,
        base_url: showBaseUrl && baseUrl ? baseUrl : undefined,
      })
    } catch {
      // Réseau ou timeout : on tente quand même le upsert.
      validation = null
    }

    // Cas Ollama : pas de clé requise — on stocke un placeholder pour que la
    // ligne existe (RLS + dispatch-llm la lisent). Le base_url est l'élément
    // significatif. Pour les autres providers, `trimmed` est obligatoire.
    const rawKeyToStore = trimmed || (providerId === 'ollama' ? 'ollama-no-auth' : '')
    if (!rawKeyToStore) return

    await upsert.mutateAsync({
      provider: providerId,
      rawKey: rawKeyToStore,
      baseUrl: showBaseUrl ? baseUrl || null : undefined,
      validation,
    })
    setRawKey('')
  }

  const handleDelete = () => {
    if (!existingKey) return
    if (!confirm(`Supprimer la clé ${label} ?`)) return
    remove.mutate({ id: existingKey.id })
  }

  const handleRefreshModels = () => {
    refreshModels.mutate({
      provider: providerId as LLMProviderId,
      baseUrl: showBaseUrl && baseUrl ? baseUrl : undefined,
    })
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">{label}</span>
          <StateBadge state={badgeState} />
        </div>
        {existingKey?.masked_key && (
          <span className="font-mono text-[11px] text-slate-500">{existingKey.masked_key}</span>
        )}
      </div>

      {hint && <p className="mb-3 text-xs text-slate-500">{hint}</p>}

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`api-key-${providerId}`} className="text-xs">
            {existingKey ? 'Remplacer la clé' : 'Clé API'}
          </Label>
          <Input
            id={`api-key-${providerId}`}
            type="password"
            value={rawKey}
            onChange={(e) => setRawKey(e.target.value)}
            placeholder={
              providerId === 'ollama'
                ? '(optionnel — Ollama local sans auth)'
                : existingKey
                  ? `(actuelle : ${existingKey.masked_key})`
                  : 'sk-…'
            }
            autoComplete="off"
          />
        </div>

        {showBaseUrl && (
          <div className="space-y-1.5">
            <Label htmlFor={`api-baseurl-${providerId}`} className="text-xs">
              Base URL
            </Label>
            <Input
              id={`api-baseurl-${providerId}`}
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={OLLAMA_DEFAULT_BASE_URL}
            />
            <p className="text-[11px] text-slate-500">
              Endpoint Ollama. Par défaut <code>{OLLAMA_DEFAULT_BASE_URL}</code> (Docker host).
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={
              upsert.isPending ||
              validate.isPending ||
              (!rawKey.trim() && !existingKey && providerId !== 'ollama')
            }
          >
            {upsert.isPending ? 'Sauvegarde…' : 'Sauvegarder'}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleTest}
            disabled={validate.isPending || (!rawKey.trim() && providerId !== 'ollama')}
          >
            {validate.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Tester
          </Button>

          {supportsRefreshModels && existingKey && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleRefreshModels}
              disabled={refreshModels.isPending}
            >
              <RefreshCw
                className={cn('mr-1 h-3 w-3', refreshModels.isPending && 'animate-spin')}
              />
              {refreshModels.isPending ? 'Refresh…' : 'Modèles'}
            </Button>
          )}

          {existingKey && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              disabled={remove.isPending}
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Supprimer
            </Button>
          )}

          {existingKey?.last_validated_at && (
            <span className="ml-auto text-[11px] text-slate-500">
              Testée le{' '}
              {new Date(existingKey.last_validated_at).toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function announceValidation(result: ValidationResult): void {
  if (result.status === 'verified') {
    const count = result.models_count
    toast.success(
      `Clé ${result.provider} vérifiée${count !== undefined ? ` (${count} modèles)` : ''}`,
      { description: `Latence ${result.latency_ms} ms` },
    )
    return
  }
  if (result.status === 'invalid') {
    toast.warning(`Clé ${result.provider} refusée`, {
      description:
        'Le provider a renvoyé 401/403. Vérifiez la clé ou recopiez-la depuis le tableau de bord du provider.',
    })
    return
  }
  if (result.status === 'rate_limited') {
    toast.warning(`Provider ${result.provider} saturé (429)`, {
      description: 'Réessaye dans quelques instants — la clé pourrait être valide.',
    })
    return
  }
  toast.error(`Provider ${result.provider} injoignable`, {
    description: result.detail ?? 'timeout / réseau',
  })
}

/**
 * Composant principal exporté. Affiche :
 *   - Une carte d'info en haut (org-scoping)
 *   - Une carte par provider LLM (10) avec badge état + boutons
 *   - Une section Apify séparée en bas
 */
export function ApiKeysConfig() {
  const { data: keys } = useApiKeys()
  const { data: llmProviders = [] } = useLLMProviders()

  const keyByProvider = useMemo(() => {
    const m = new Map<string, UserApiKey>()
    for (const k of keys ?? []) m.set(k.provider, k)
    return m
  }, [keys])

  const apifyKey = keyByProvider.get('apify')

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 bg-slate-50 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-slate-900">
            <ShieldAlert className="h-4 w-4 text-slate-600" />
            Vos clés sont partagées au sein de l'organisation
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-xs leading-relaxed text-slate-600">
          Toutes les clés API sont visibles et utilisables par les membres de votre organisation
          courante. Elles sont stockées dans <code>user_api_keys</code> (RLS-protégées) et lues
          uniquement par les Edge Functions Supabase — aucun proxy intermédiaire. Si une clé devient
          invalide, le mode Maison (clé OpenRouter / Apify mutualisée) prend automatiquement le
          relais.
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Providers LLM (BYOK)</CardTitle>
        </CardHeader>
        <CardContent className={cn('space-y-3')}>
          {llmProviders.length === 0 && (
            <p className="text-xs text-slate-500">Chargement de la liste des providers…</p>
          )}
          {llmProviders.map((p: LLMProviderUI) => (
            <ProviderCard
              key={p.id}
              providerId={p.id as ApiKeyProvider}
              label={p.label}
              hint={p.hint}
              existingKey={keyByProvider.get(p.id)}
              showBaseUrl={p.baseURLOverridable}
            />
          ))}
        </CardContent>
      </Card>

      <Card className="border-slate-300">
        <CardHeader>
          <CardTitle className="text-base">Apify (scraping X / Reddit)</CardTitle>
        </CardHeader>
        <CardContent>
          <ProviderCard
            providerId="apify"
            label="Apify"
            hint="Token d'accès Apify pour les scrapers X et Reddit. Fallback Maison disponible si non renseigné."
            existingKey={apifyKey}
          />
        </CardContent>
      </Card>
    </div>
  )
}
