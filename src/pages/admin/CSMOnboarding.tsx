import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Circle,
  Plus,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  UserPlus,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useIsAppAdmin } from '@/hooks/useIsAppAdmin'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

// =============================================================================
// Wave 6 — Sub-wave 6.5 — Story S6-CSMOnboarding
//
// Sub-page /admin/csm — réservée aux super-admins Kairos (app_admins).
// Permet à toi (founder) ou un futur CSM hire de suivre l'avancement de
// l'onboarding pour chaque tenant Enterprise actif.
//
// Source de vérité du workflow : docs/enterprise/csm-playbook.md
//
// Sécurité : double gate (frontend + RLS).
//   1. Hook `useIsAppAdmin()` → cache l'UI aux non-admins.
//   2. Table `csm_onboardings` est protégée par RLS `is_app_admin()` —
//      même si un non-admin bypasse le frontend, Postgres refusera SELECT.
//
// Note typage : la table `csm_onboardings` n'est pas encore dans
// `src/types/database.ts` (régénération nécessaire après push). Cast
// minimal `unknown` au point d'entrée `.from(...)` — pattern documenté
// dans `useAuditLog.ts`.
// =============================================================================

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type OnboardingStep = 'kickoff_done_at' | 'training_done_at' | 'month_1_check_at' | 'qbr_done_at'

type OnboardingStatus =
  | 'kickoff_pending'
  | 'kickoff_done'
  | 'training_done'
  | 'month_1'
  | 'qbr_done'

interface CsmOnboardingRow {
  org_id: string
  csm_user_id: string | null
  started_at: string
  kickoff_done_at: string | null
  training_done_at: string | null
  month_1_check_at: string | null
  qbr_done_at: string | null
  nps_score: number | null
  notes: string | null
}

interface OrgOption {
  id: string
  name: string
  slug: string
}

interface OnboardingView extends CsmOnboardingRow {
  org_name: string
  org_slug: string
  status: OnboardingStatus
  /** Durée en jours entre `started_at` et `training_done_at` (ou maintenant). */
  time_to_onboarded_days: number | null
}

const STEP_LABELS: Record<OnboardingStep, string> = {
  kickoff_done_at: 'Kickoff',
  training_done_at: 'Training',
  month_1_check_at: 'Check-in M1',
  qbr_done_at: 'QBR M3',
}

const STEPS: OnboardingStep[] = [
  'kickoff_done_at',
  'training_done_at',
  'month_1_check_at',
  'qbr_done_at',
]

const STATUS_LABELS: Record<OnboardingStatus, string> = {
  kickoff_pending: 'Kickoff à faire',
  kickoff_done: 'Kickoff fait',
  training_done: 'Training fait',
  month_1: 'Check-in M1 fait',
  qbr_done: 'QBR fait',
}

const STATUS_TONE: Record<OnboardingStatus, string> = {
  kickoff_pending: 'bg-slate-100 text-slate-700',
  kickoff_done: 'bg-amber-100 text-amber-800',
  training_done: 'bg-blue-100 text-blue-800',
  month_1: 'bg-indigo-100 text-indigo-800',
  qbr_done: 'bg-emerald-100 text-emerald-800',
}

// Tampon « churn risk » : un onboarding est considéré à risque si :
//   - NPS < 0 explicitement saisi, OU
//   - kickoff fait mais training jamais validé après 21 jours.
const CHURN_TRAINING_GRACE_DAYS = 21

// -----------------------------------------------------------------------------
// Helpers (purs — testables si besoin)
// -----------------------------------------------------------------------------

function deriveStatus(row: CsmOnboardingRow): OnboardingStatus {
  if (row.qbr_done_at) return 'qbr_done'
  if (row.month_1_check_at) return 'month_1'
  if (row.training_done_at) return 'training_done'
  if (row.kickoff_done_at) return 'kickoff_done'
  return 'kickoff_pending'
}

function diffDays(from: string, to: string | null): number {
  const fromMs = new Date(from).getTime()
  const toMs = to ? new Date(to).getTime() : Date.now()
  return Math.max(0, Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24)))
}

function isChurnRisk(row: CsmOnboardingRow): boolean {
  if (row.nps_score !== null && row.nps_score < 0) return true
  if (row.kickoff_done_at && !row.training_done_at) {
    return diffDays(row.kickoff_done_at, null) > CHURN_TRAINING_GRACE_DAYS
  }
  return false
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export default function CSMOnboarding(): React.ReactElement {
  const { data: isAdmin, isLoading: isAdminLoading } = useIsAppAdmin()
  const [addOpen, setAddOpen] = useState(false)
  const onboardingsQuery = useOnboardingsQuery(isAdmin === true)
  const orgsQuery = useEnterpriseOrgsQuery(isAdmin === true)

  if (isAdminLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!isAdmin) {
    return <AccessDeniedView />
  }

  if (onboardingsQuery.isLoading || !onboardingsQuery.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (onboardingsQuery.isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        <p className="font-medium">Échec du chargement des onboardings.</p>
        <p className="mt-1 text-xs text-red-700">{onboardingsQuery.error.message}</p>
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => onboardingsQuery.refetch()}
        >
          Réessayer
        </Button>
      </div>
    )
  }

  return (
    <CSMOnboardingBody
      rows={onboardingsQuery.data}
      enterpriseOrgs={orgsQuery.data ?? []}
      addOpen={addOpen}
      setAddOpen={setAddOpen}
    />
  )
}

interface BodyProps {
  rows: OnboardingView[]
  enterpriseOrgs: OrgOption[]
  addOpen: boolean
  setAddOpen: (open: boolean) => void
}

function CSMOnboardingBody({
  rows,
  enterpriseOrgs,
  addOpen,
  setAddOpen,
}: BodyProps): React.ReactElement {
  const metrics = useMemo<GlobalMetrics>(() => {
    const withTime = rows.filter((r) => r.time_to_onboarded_days !== null)
    const avgTime =
      withTime.length === 0
        ? null
        : withTime.reduce((acc, r) => acc + (r.time_to_onboarded_days ?? 0), 0) / withTime.length

    const churn = rows.filter((r) => isChurnRisk(r)).length

    const npsRows = rows.filter((r) => r.nps_score !== null)
    const avgNps =
      npsRows.length === 0
        ? null
        : npsRows.reduce((acc, r) => acc + (r.nps_score ?? 0), 0) / npsRows.length

    return {
      avg_time_to_onboarded_days: avgTime,
      churn_risk_count: churn,
      avg_nps: avgNps,
    }
  }, [rows])

  const eligibleOrgs = useMemo(() => {
    const taken = new Set(rows.map((r) => r.org_id))
    return enterpriseOrgs.filter((o) => !taken.has(o.id))
  }, [rows, enterpriseOrgs])

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Onboarding CSM Enterprise</h1>
          <p className="mt-1 text-sm text-slate-500">
            Suivi des contrats Enterprise — réservé aux super-admins.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} disabled={eligibleOrgs.length === 0}>
          <Plus className="mr-2 h-4 w-4" /> Ajouter un tenant
        </Button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Time-to-onboarded moyen"
          value={
            metrics.avg_time_to_onboarded_days !== null
              ? `${metrics.avg_time_to_onboarded_days.toFixed(1)} j`
              : '—'
          }
          tone={
            metrics.avg_time_to_onboarded_days === null
              ? 'slate'
              : metrics.avg_time_to_onboarded_days <= 14
                ? 'emerald'
                : 'amber'
          }
          hint="Cible : ≤ 14 j (kickoff → training)"
        />
        <MetricCard
          label="Tenants à risque churn"
          value={String(metrics.churn_risk_count)}
          tone={metrics.churn_risk_count === 0 ? 'emerald' : 'red'}
          hint="NPS < 0 ou training en retard > 21 j"
        />
        <MetricCard
          label="NPS moyen"
          value={metrics.avg_nps !== null ? metrics.avg_nps.toFixed(1) : '—'}
          tone={metrics.avg_nps === null ? 'slate' : metrics.avg_nps >= 30 ? 'emerald' : 'amber'}
          hint="Cible : ≥ +30"
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tenants en onboarding ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Aucun tenant Enterprise en cours d'onboarding. Cliquer sur « Ajouter un tenant » pour
              démarrer.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-3 py-2.5">Organisation</th>
                    <th className="px-3 py-2.5">Statut</th>
                    {STEPS.map((s) => (
                      <th key={s} className="px-3 py-2.5 text-center">
                        {STEP_LABELS[s]}
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-right">NPS</th>
                    <th className="px-3 py-2.5 text-right">Durée (j)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <OnboardingRow key={row.org_id} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AddTenantDialog open={addOpen} onOpenChange={setAddOpen} eligibleOrgs={eligibleOrgs} />
    </div>
  )
}

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------

function OnboardingRow({ row }: { row: OnboardingView }): React.ReactElement {
  const churnRisk = isChurnRisk(row)
  return (
    <tr className={cn('transition-colors hover:bg-slate-50', churnRisk && 'bg-red-50/40')}>
      <td className="px-3 py-2 font-medium text-slate-900">
        <div className="flex flex-col">
          <span>{row.org_name}</span>
          <code className="text-xs text-slate-500">{row.org_slug}</code>
        </div>
      </td>
      <td className="px-3 py-2">
        <span
          className={cn(
            'inline-block rounded px-2 py-0.5 text-xs font-medium',
            STATUS_TONE[row.status],
          )}
        >
          {STATUS_LABELS[row.status]}
        </span>
        {churnRisk && (
          <span className="ml-2 inline-block rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
            Churn risk
          </span>
        )}
      </td>
      {STEPS.map((step) => (
        <td key={step} className="px-3 py-2 text-center">
          <StepToggle row={row} step={step} />
        </td>
      ))}
      <td className="px-3 py-2 text-right">
        <NpsEditor row={row} />
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs text-slate-600">
        {row.time_to_onboarded_days !== null ? row.time_to_onboarded_days : '—'}
      </td>
    </tr>
  )
}

function StepToggle({
  row,
  step,
}: {
  row: OnboardingView
  step: OnboardingStep
}): React.ReactElement {
  const queryClient = useQueryClient()
  const value = row[step]
  const done = !!value

  const mutation = useMutation({
    mutationFn: async (next: boolean) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as unknown as { from: (t: string) => any }
      const { error } = await client
        .from('csm_onboardings')
        .update({ [step]: next ? new Date().toISOString() : null })
        .eq('org_id', row.org_id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['csm_onboardings'] })
    },
    onError: (err: Error) => {
      toast.error(`Échec de la mise à jour : ${err.message}`)
    },
  })

  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center rounded p-1 transition-colors',
        done ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-300 hover:bg-slate-100',
        mutation.isPending && 'opacity-50',
      )}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate(!done)}
      aria-label={`${STEP_LABELS[step]} ${done ? 'fait' : 'à faire'}`}
      title={value ? new Date(value).toLocaleDateString('fr-FR') : 'Non franchi'}
    >
      {done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
    </button>
  )
}

function NpsEditor({ row }: { row: OnboardingView }): React.ReactElement {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(row.nps_score?.toString() ?? '')

  const mutation = useMutation({
    mutationFn: async (value: number | null) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as unknown as { from: (t: string) => any }
      const { error } = await client
        .from('csm_onboardings')
        .update({ nps_score: value })
        .eq('org_id', row.org_id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['csm_onboardings'] })
      setEditing(false)
    },
    onError: (err: Error) => {
      toast.error(`Échec NPS : ${err.message}`)
    },
  })

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="font-mono text-xs text-slate-700 hover:underline"
      >
        {row.nps_score !== null ? row.nps_score : '—'}
      </button>
    )
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Input
        autoFocus
        type="number"
        min={-100}
        max={100}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="h-7 w-16 text-right font-mono text-xs"
      />
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs"
        onClick={() => {
          const trimmed = draft.trim()
          if (trimmed === '') {
            mutation.mutate(null)
            return
          }
          const parsed = Number.parseInt(trimmed, 10)
          if (Number.isNaN(parsed) || parsed < -100 || parsed > 100) {
            toast.error('NPS doit être un entier entre -100 et +100')
            return
          }
          mutation.mutate(parsed)
        }}
        disabled={mutation.isPending}
      >
        OK
      </Button>
    </div>
  )
}

function AddTenantDialog({
  open,
  onOpenChange,
  eligibleOrgs,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  eligibleOrgs: OrgOption[]
}): React.ReactElement {
  const queryClient = useQueryClient()
  const [orgId, setOrgId] = useState<string>('')
  const [csmId, setCsmId] = useState<string>('')
  const [notes, setNotes] = useState<string>('')

  const mutation = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('Sélectionner une organization')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as unknown as { from: (t: string) => any }
      const { error } = await client.from('csm_onboardings').insert({
        org_id: orgId,
        csm_user_id: csmId || null,
        notes: notes || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['csm_onboardings'] })
      toast.success("Tenant ajouté à l'onboarding")
      setOrgId('')
      setCsmId('')
      setNotes('')
      onOpenChange(false)
    },
    onError: (err: Error) => {
      toast.error(`Échec de l'ajout : ${err.message}`)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter un tenant à l'onboarding</DialogTitle>
          <DialogDescription>
            Sélectionner une organization Enterprise et assigner un CSM responsable.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="org">Organization</Label>
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger id="org">
                <SelectValue placeholder="Sélectionner une organization Enterprise" />
              </SelectTrigger>
              <SelectContent>
                {eligibleOrgs.length === 0 ? (
                  <SelectItem value="__none__" disabled>
                    Aucune organization Enterprise éligible
                  </SelectItem>
                ) : (
                  eligibleOrgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name} ({o.slug})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="csm">UUID du CSM (optionnel)</Label>
            <Input
              id="csm"
              placeholder="uuid auth.users — laisser vide si non assigné"
              value={csmId}
              onChange={(e) => setCsmId(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes initiales (optionnel)</Label>
            <Textarea
              id="notes"
              placeholder="Contexte deal, contact principal, particularités..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!orgId || mutation.isPending}>
            <UserPlus className="mr-2 h-4 w-4" /> Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface MetricCardProps {
  label: string
  value: string
  hint?: string
  tone: 'emerald' | 'amber' | 'red' | 'slate'
}

function MetricCard({ label, value, hint, tone }: MetricCardProps): React.ReactElement {
  const toneClasses: Record<MetricCardProps['tone'], string> = {
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
    slate: 'text-slate-700',
  }
  const Icon = tone === 'red' || tone === 'amber' ? TrendingDown : TrendingUp
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
          <Icon className={cn('h-4 w-4', toneClasses[tone])} />
        </div>
        <p className={cn('mt-2 text-2xl font-semibold', toneClasses[tone])}>{value}</p>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </CardContent>
    </Card>
  )
}

function AccessDeniedView(): React.ReactElement {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <ShieldAlert className="mx-auto h-12 w-12 text-slate-400" />
      <h1 className="mt-4 text-xl font-semibold text-slate-900">Accès refusé</h1>
      <p className="mt-2 text-sm text-slate-600">
        Cette page est réservée aux administrateurs de la plateforme Kairos.
      </p>
      <Link to="/dashboard">
        <Button className="mt-6" variant="default">
          Retour au dashboard
        </Button>
      </Link>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Hooks de données
// -----------------------------------------------------------------------------

function useOnboardingsQuery(enabled: boolean) {
  return useQuery<OnboardingView[], Error>({
    queryKey: ['csm_onboardings'],
    enabled,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as unknown as { from: (t: string) => any }
      // Jointure manuelle : on récupère d'abord les onboardings, puis les
      // organizations correspondantes (la table organizations EST typée).
      const { data: onboardings, error } = await client
        .from('csm_onboardings')
        .select('*')
        .order('started_at', { ascending: false })
      if (error) throw error
      const rows = (onboardings ?? []) as CsmOnboardingRow[]
      if (rows.length === 0) return []

      const orgIds = rows.map((r) => r.org_id)
      const { data: orgs, error: orgErr } = await supabase
        .from('organizations')
        .select('id, name, slug')
        .in('id', orgIds)
      if (orgErr) throw orgErr

      const orgMap = new Map((orgs ?? []).map((o) => [o.id, o]))
      return rows.map<OnboardingView>((r) => {
        const org = orgMap.get(r.org_id)
        return {
          ...r,
          org_name: org?.name ?? '(org introuvable)',
          org_slug: org?.slug ?? '',
          status: deriveStatus(r),
          time_to_onboarded_days: r.training_done_at
            ? diffDays(r.started_at, r.training_done_at)
            : null,
        }
      })
    },
  })
}

function useEnterpriseOrgsQuery(enabled: boolean) {
  return useQuery<OrgOption[], Error>({
    queryKey: ['enterprise_orgs_for_csm'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, slug, plan')
        .eq('plan', 'enterprise')
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []).map((o) => ({ id: o.id, name: o.name, slug: o.slug }))
    },
  })
}

// -----------------------------------------------------------------------------
// Métriques agrégées
// -----------------------------------------------------------------------------

interface GlobalMetrics {
  avg_time_to_onboarded_days: number | null
  churn_risk_count: number
  avg_nps: number | null
}
