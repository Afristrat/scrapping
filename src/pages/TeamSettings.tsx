import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Copy, Mail, Trash2, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useChangeMemberRole } from '@/hooks/useChangeMemberRole'
import { useCurrentOrgId } from '@/hooks/useCurrentOrgId'
import { useInvitations, type InvitationView } from '@/hooks/useInvitations'
import { useInviteMember, type InvitableRole } from '@/hooks/useInviteMember'
import { useOrgSubscription } from '@/hooks/useOrgSubscription'
import { useRemoveMember } from '@/hooks/useRemoveMember'
import { useRevokeInvitation } from '@/hooks/useRevokeInvitation'
import { useTeamMembers, type TeamMember } from '@/hooks/useTeamMembers'
import { useAuthStore } from '@/stores/auth'
import { useOrgStore } from '@/stores/org'
import type { Database } from '@/types/database'
import { cn } from '@/lib/utils'

// =============================================================================
// Wave 7.5 — Refonte design Material You / Stitch Kairos.
// La logique (RLS, hooks, mutations) est conservée à l'identique.
// =============================================================================

type OrgRole = Database['public']['Enums']['org_role']

const ROLE_OPTIONS: ReadonlyArray<{ value: InvitableRole; label: string; hint: string }> = [
  { value: 'admin', label: 'Admin', hint: 'Peut inviter et gérer les membres' },
  { value: 'member', label: 'Membre', hint: 'Accès complet à la plateforme' },
  { value: 'viewer', label: 'Lecteur', hint: 'Lecture seule' },
]

const ROLE_LABEL: Record<OrgRole, string> = {
  owner: 'Propriétaire',
  admin: 'Admin',
  member: 'Membre',
  viewer: 'Lecteur',
}

const ROLE_BADGE: Record<OrgRole, string> = {
  owner: 'bg-tertiary-fixed text-on-tertiary-fixed-variant hover:bg-tertiary-fixed',
  admin: 'bg-secondary-fixed text-on-secondary-fixed-variant hover:bg-secondary-fixed',
  member: 'bg-surface-container-high text-on-surface hover:bg-surface-container-high',
  viewer: 'bg-surface-container text-on-surface-variant hover:bg-surface-container',
}

const STATUS_BADGE: Record<InvitationView['status'], string> = {
  pending: 'bg-secondary-fixed text-on-secondary-fixed-variant hover:bg-secondary-fixed',
  accepted: 'bg-primary-fixed text-on-primary-fixed-variant hover:bg-primary-fixed',
  expired: 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-high',
}

const STATUS_LABEL: Record<InvitationView['status'], string> = {
  pending: 'En attente',
  accepted: 'Acceptée',
  expired: 'Expirée',
}

const inviteSchema = z.object({
  email: z.string().email('Adresse email invalide'),
  role: z.enum(['admin', 'member', 'viewer'] as const),
})
type InviteFormValues = z.infer<typeof inviteSchema>

function copyToClipboard(text: string): void {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    void navigator.clipboard.writeText(text).then(
      () => toast.success('Lien copié dans le presse-papiers'),
      () => toast.error('Impossible de copier le lien'),
    )
  }
}

export default function TeamSettings(): React.ReactElement {
  const orgId = useCurrentOrgId()
  const currentOrg = useOrgStore((s) => s.currentOrg())
  const currentUserId = useAuthStore((s) => s.user?.id ?? null)

  const callerRole: OrgRole | null = currentOrg?.role ?? null
  const canManage = callerRole === 'owner' || callerRole === 'admin'
  const isOwner = callerRole === 'owner'

  const { data: members, isLoading: loadingMembers } = useTeamMembers()
  const { data: invitations, isLoading: loadingInvitations } = useInvitations()
  const { data: subscription } = useOrgSubscription()

  const inviteMutation = useInviteMember()
  const removeMutation = useRemoveMember()
  const changeRoleMutation = useChangeMemberRole()
  const revokeMutation = useRevokeInvitation()

  const [pendingRemoval, setPendingRemoval] = useState<TeamMember | null>(null)

  const inviteForm = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'member' },
  })
  const inviteRoleValue = useWatch({ control: inviteForm.control, name: 'role' })

  const onInviteSubmit = (values: InviteFormValues): void => {
    inviteMutation.mutate(values, {
      onSuccess: () => inviteForm.reset({ email: '', role: 'member' }),
    })
  }

  const handleRoleChange = (member: TeamMember, newRole: OrgRole): void => {
    if (newRole === member.role) return
    changeRoleMutation.mutate({ user_id: member.user_id, new_role: newRole })
  }

  const seatsUsed = members?.length ?? 0
  const seatsTotal = subscription?.seats ?? null
  const seatsPct =
    seatsTotal !== null
      ? Math.min(100, Math.round((seatsUsed / Math.max(1, seatsTotal)) * 100))
      : null

  if (!orgId) {
    return (
      <Card className="border-outline-variant bg-surface-container-lowest mx-auto max-w-3xl border-dashed p-8 text-center">
        <p className="text-on-surface-variant text-sm">
          Sélectionnez une organisation pour gérer son équipe.
        </p>
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-on-surface flex items-center gap-2 text-2xl font-semibold tracking-[-0.01em]">
            <Users className="text-primary h-6 w-6" aria-hidden="true" />
            Équipe
          </h1>
          <p className="text-on-surface-variant mt-1 text-sm">
            Gérez les membres de votre organisation et leurs rôles.
          </p>
        </div>
        {canManage && (
          <Button
            type="button"
            onClick={() => {
              const el = document.getElementById('invite-email')
              el?.focus()
            }}
            className="bg-primary text-on-primary hover:bg-primary-container h-10 gap-2 rounded-lg"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Inviter un membre
          </Button>
        )}
      </header>

      {/* Barre de progression seats */}
      {seatsTotal !== null && (
        <Card className="bg-surface-container-lowest border-outline-variant rounded-xl border shadow-md">
          <CardContent className="p-5">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-on-surface-variant text-xs font-semibold tracking-[0.08em] uppercase">
                  Sièges utilisés
                </p>
                <p className="text-on-surface mt-1 text-xl font-semibold tabular-nums">
                  {seatsUsed}{' '}
                  <span className="text-on-surface-variant text-sm">/ {seatsTotal}</span>
                </p>
              </div>
              <span className="text-on-surface-variant text-xs tabular-nums">{seatsPct ?? 0}%</span>
            </div>
            <div className="bg-surface-container mt-3 h-2 overflow-hidden rounded-full">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  seatsUsed >= seatsTotal ? 'bg-error' : 'bg-primary',
                )}
                style={{ width: `${seatsPct ?? 0}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section A — Membres */}
      <Card className="bg-surface-container-lowest border-outline-variant rounded-xl border shadow-md">
        <CardHeader>
          <CardTitle className="text-on-surface text-base font-semibold">Membres</CardTitle>
          <p className="text-on-surface-variant mt-1 text-xs">
            {seatsTotal === null
              ? `${seatsUsed} membre${seatsUsed > 1 ? 's' : ''}`
              : `${seatsUsed} sur ${seatsTotal} sièges`}
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {loadingMembers ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !members || members.length === 0 ? (
            <p className="text-on-surface-variant p-6 text-center text-sm">Aucun membre.</p>
          ) : (
            <div className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low text-on-surface-variant text-left text-xs font-semibold tracking-[0.05em] uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Email</th>
                    <th className="w-44 px-4 py-2.5">Rôle</th>
                    <th className="w-44 px-4 py-2.5">Inscrit</th>
                    <th className="w-20 px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-outline-variant divide-y">
                  {members.map((m) => {
                    const isSelf = m.user_id === currentUserId
                    const canEditMember = canManage && !isSelf && (isOwner || m.role !== 'owner')
                    return (
                      <tr key={m.user_id} className="hover:bg-surface-container-low align-middle">
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="text-on-surface">
                              {m.email ?? (
                                <span className="text-on-surface-variant font-mono text-xs">
                                  {m.user_id.slice(0, 8)}…
                                </span>
                              )}
                            </span>
                            {isSelf && (
                              <span className="text-on-surface-variant text-xs">(vous)</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {canEditMember ? (
                            <Select
                              value={m.role}
                              onValueChange={(v) => handleRoleChange(m, v as OrgRole)}
                              disabled={changeRoleMutation.isPending}
                            >
                              <SelectTrigger className="w-32" size="sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {isOwner && (
                                  <SelectItem value="owner">{ROLE_LABEL.owner}</SelectItem>
                                )}
                                <SelectItem value="admin">{ROLE_LABEL.admin}</SelectItem>
                                <SelectItem value="member">{ROLE_LABEL.member}</SelectItem>
                                <SelectItem value="viewer">{ROLE_LABEL.viewer}</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge className={cn('font-normal', ROLE_BADGE[m.role])}>
                              {ROLE_LABEL[m.role]}
                            </Badge>
                          )}
                        </td>
                        <td
                          className="text-on-surface-variant px-4 py-3 text-xs"
                          title={format(new Date(m.joined_at), 'yyyy-MM-dd HH:mm')}
                        >
                          {formatDistanceToNow(new Date(m.joined_at), {
                            addSuffix: true,
                            locale: fr,
                          })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {canEditMember && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPendingRemoval(m)}
                              aria-label={`Retirer ${m.email ?? m.user_id}`}
                              className="text-on-surface-variant hover:text-error h-8 w-8 p-0"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section B — Inviter un nouveau membre */}
      {canManage && (
        <Card className="bg-surface-container-lowest border-outline-variant rounded-xl border shadow-md">
          <CardHeader>
            <CardTitle className="text-on-surface flex items-center gap-2 text-base font-semibold">
              <UserPlus className="text-primary h-4 w-4" aria-hidden="true" /> Inviter un nouveau
              membre
            </CardTitle>
            <p className="text-on-surface-variant mt-1 text-xs">
              Le membre recevra un email pour rejoindre l’organisation. Lien valable 7 jours.
            </p>
          </CardHeader>
          <CardContent>
            <form
              noValidate
              onSubmit={inviteForm.handleSubmit(onInviteSubmit)}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <div className="flex-1">
                <Label
                  htmlFor="invite-email"
                  className="text-on-surface-variant mb-1 block text-xs"
                >
                  Email
                </Label>
                <Input
                  id="invite-email"
                  type="email"
                  autoComplete="email"
                  placeholder="collaborateur@exemple.com"
                  className="border-outline-variant bg-surface-container-lowest h-10 rounded-lg"
                  {...inviteForm.register('email')}
                />
                {inviteForm.formState.errors.email && (
                  <p className="text-error mt-1 text-xs">
                    {inviteForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              <div className="w-full sm:w-44">
                <Label htmlFor="invite-role" className="text-on-surface-variant mb-1 block text-xs">
                  Rôle
                </Label>
                <Select
                  value={inviteRoleValue}
                  onValueChange={(v) => inviteForm.setValue('role', v as InvitableRole)}
                >
                  <SelectTrigger id="invite-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex flex-col">
                          <span>{opt.label}</span>
                          <span className="text-on-surface-variant text-[10px]">{opt.hint}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="submit"
                disabled={inviteMutation.isPending}
                className="bg-primary text-on-primary hover:bg-primary-container h-10 gap-2 rounded-lg sm:w-auto"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                {inviteMutation.isPending ? 'Envoi…' : "Envoyer l'invitation"}
              </Button>
            </form>
            {inviteMutation.data && !inviteMutation.data.email_sent && (
              <div className="border-tertiary-fixed bg-tertiary-fixed/40 text-on-tertiary-fixed-variant mt-4 rounded-lg border p-3 text-xs">
                <p className="font-medium">
                  Email automatique non envoyé — partagez ce lien manuellement :
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="bg-surface-container-lowest text-on-surface flex-1 truncate rounded px-2 py-1 font-mono text-[11px]">
                    {inviteMutation.data.accept_url}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(inviteMutation.data.accept_url)}
                    className="border-outline-variant gap-1"
                  >
                    <Copy className="h-3 w-3" aria-hidden="true" />
                    Copier
                  </Button>
                </div>
                {inviteMutation.data.email_error && (
                  <p className="mt-2 text-[11px]">Détail : {inviteMutation.data.email_error}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Section C — Invitations en cours */}
      {canManage && (
        <Card className="bg-surface-container-lowest border-outline-variant rounded-xl border shadow-md">
          <CardHeader>
            <CardTitle className="text-on-surface text-base font-semibold">
              Invitations en cours
            </CardTitle>
            <p className="text-on-surface-variant mt-1 text-xs">
              Suivi des invitations envoyées (en attente, acceptées, expirées).
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {loadingInvitations ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !invitations || invitations.length === 0 ? (
              <p className="text-on-surface-variant p-6 text-center text-sm">
                Aucune invitation en cours.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-container-low text-on-surface-variant text-left text-xs font-semibold tracking-[0.05em] uppercase">
                    <tr>
                      <th className="px-4 py-2.5">Email</th>
                      <th className="w-32 px-4 py-2.5">Rôle</th>
                      <th className="w-32 px-4 py-2.5">Statut</th>
                      <th className="w-40 px-4 py-2.5">Envoyée</th>
                      <th className="w-32 px-4 py-2.5">Expire</th>
                      <th className="w-24 px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-outline-variant divide-y">
                    {invitations.map((inv) => (
                      <tr key={inv.id} className="hover:bg-surface-container-low align-middle">
                        <td className="text-on-surface px-4 py-3">{inv.email}</td>
                        <td className="px-4 py-3">
                          <Badge className={cn('font-normal', ROLE_BADGE[inv.role])}>
                            {ROLE_LABEL[inv.role]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={cn('font-normal', STATUS_BADGE[inv.status])}>
                            {STATUS_LABEL[inv.status]}
                          </Badge>
                        </td>
                        <td
                          className="text-on-surface-variant px-4 py-3 text-xs"
                          title={format(new Date(inv.created_at), 'yyyy-MM-dd HH:mm')}
                        >
                          {formatDistanceToNow(new Date(inv.created_at), {
                            addSuffix: true,
                            locale: fr,
                          })}
                        </td>
                        <td
                          className="text-on-surface-variant px-4 py-3 text-xs"
                          title={format(new Date(inv.expires_at), 'yyyy-MM-dd HH:mm')}
                        >
                          {inv.status === 'accepted'
                            ? '—'
                            : inv.status === 'expired'
                              ? 'Expirée'
                              : inv.expires_in_days !== null
                                ? `Dans ${inv.expires_in_days} j`
                                : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {inv.status === 'pending' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  copyToClipboard(
                                    `${window.location.origin}/accept-invitation/${inv.token}`,
                                  )
                                }
                                aria-label="Copier le lien"
                                className="text-on-surface-variant hover:text-on-surface h-8 w-8 p-0"
                              >
                                <Copy className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            )}
                            {inv.status !== 'accepted' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => revokeMutation.mutate({ id: inv.id })}
                                disabled={revokeMutation.isPending}
                                aria-label="Révoquer l'invitation"
                                className="text-on-surface-variant hover:text-error h-8 w-8 p-0"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Confirmation suppression membre */}
      <AlertDialog
        open={!!pendingRemoval}
        onOpenChange={(open) => !open && setPendingRemoval(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer ce membre ?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemoval ? (
                <>
                  <span className="text-on-surface font-medium">
                    {pendingRemoval.email ?? pendingRemoval.user_id}
                  </span>{' '}
                  perdra immédiatement l’accès à l’organisation. Cette action est journalisée dans
                  le journal d’audit.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRemoval) {
                  removeMutation.mutate(
                    { user_id: pendingRemoval.user_id },
                    { onSettled: () => setPendingRemoval(null) },
                  )
                }
              }}
              disabled={removeMutation.isPending}
              className="bg-error text-on-error hover:bg-error/90"
            >
              {removeMutation.isPending ? 'Suppression…' : 'Retirer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
