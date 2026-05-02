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
// Wave 6 — Sub-wave 6.3 — S6-TeamPage
// Page /settings/team : liste des membres de l'organisation, invitations en
// cours, et gestion des rôles. Visible par tous les membres ; les actions
// d'écriture (inviter, retirer, changer rôle) sont gated sur owner/admin.
//
// Sécurité : les RLS et les edge fns invite-member / remove-member font la
// vraie validation. Le frontend cache simplement les boutons pour les rôles
// non autorisés (UX, pas sécurité).
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
  owner: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  admin: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  member: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
  viewer: 'bg-slate-50 text-slate-600 hover:bg-slate-50',
}

const STATUS_BADGE: Record<InvitationView['status'], string> = {
  pending: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  accepted: 'bg-green-100 text-green-800 hover:bg-green-100',
  expired: 'bg-slate-200 text-slate-600 hover:bg-slate-200',
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

  if (!orgId) {
    return (
      <Card className="mx-auto max-w-3xl border-dashed p-8 text-center text-sm text-slate-500">
        Sélectionnez une organisation pour gérer son équipe.
      </Card>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Users className="h-6 w-6" /> Équipe
        </h1>
        <p className="text-sm text-slate-500">
          Gérez les membres de votre organisation et leurs rôles.
        </p>
      </header>

      {/* Section A — Membres */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Membres</CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              {seatsTotal !== null
                ? `${seatsUsed} / ${seatsTotal} sièges utilisés`
                : `${seatsUsed} membre${seatsUsed > 1 ? 's' : ''}`}
            </p>
          </div>
          {seatsTotal !== null && (
            <div className="w-40">
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    seatsUsed >= seatsTotal ? 'bg-red-500' : 'bg-emerald-500',
                  )}
                  style={{
                    width: `${Math.min(100, Math.round((seatsUsed / Math.max(1, seatsTotal)) * 100))}%`,
                  }}
                />
              </div>
              <p className="mt-1 text-right text-[10px] tracking-wide text-slate-400 uppercase">
                Sièges
              </p>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {loadingMembers ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !members || members.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">Aucun membre.</p>
          ) : (
            <div className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Email</th>
                    <th className="w-44 px-4 py-2.5">Rôle</th>
                    <th className="w-44 px-4 py-2.5">Inscrit</th>
                    <th className="w-20 px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {members.map((m) => {
                    const isSelf = m.user_id === currentUserId
                    const canEditMember = canManage && !isSelf && (isOwner || m.role !== 'owner')
                    return (
                      <tr key={m.user_id} className="align-middle hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="text-slate-700">
                              {m.email ?? (
                                <span className="font-mono text-xs text-slate-400">
                                  {m.user_id.slice(0, 8)}…
                                </span>
                              )}
                            </span>
                            {isSelf && <span className="text-xs text-slate-400">(vous)</span>}
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
                          className="px-4 py-3 text-xs text-slate-500"
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
                              className="h-8 w-8 p-0 text-slate-500 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-4 w-4" /> Inviter un nouveau membre
            </CardTitle>
            <p className="mt-1 text-xs text-slate-500">
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
                <Label htmlFor="invite-email" className="mb-1 block text-xs">
                  Email
                </Label>
                <Input
                  id="invite-email"
                  type="email"
                  autoComplete="email"
                  placeholder="collaborateur@exemple.com"
                  {...inviteForm.register('email')}
                />
                {inviteForm.formState.errors.email && (
                  <p className="mt-1 text-xs text-red-600">
                    {inviteForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              <div className="w-full sm:w-44">
                <Label htmlFor="invite-role" className="mb-1 block text-xs">
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
                          <span className="text-[10px] text-slate-500">{opt.hint}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={inviteMutation.isPending} className="gap-2 sm:w-auto">
                <Mail className="h-4 w-4" />
                {inviteMutation.isPending ? 'Envoi…' : "Envoyer l'invitation"}
              </Button>
            </form>
            {inviteMutation.data && !inviteMutation.data.email_sent && (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs">
                <p className="font-medium text-amber-900">
                  Email automatique non envoyé — partagez ce lien manuellement :
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-white px-2 py-1 font-mono text-[11px] text-slate-700">
                    {inviteMutation.data.accept_url}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(inviteMutation.data.accept_url)}
                    className="gap-1"
                  >
                    <Copy className="h-3 w-3" />
                    Copier
                  </Button>
                </div>
                {inviteMutation.data.email_error && (
                  <p className="mt-2 text-[11px] text-amber-800">
                    Détail : {inviteMutation.data.email_error}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Section C — Invitations en cours */}
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Invitations</CardTitle>
            <p className="mt-1 text-xs text-slate-500">
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
              <p className="p-6 text-center text-sm text-slate-500">Aucune invitation en cours.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Email</th>
                    <th className="w-32 px-4 py-2.5">Rôle</th>
                    <th className="w-32 px-4 py-2.5">Statut</th>
                    <th className="w-40 px-4 py-2.5">Envoyée</th>
                    <th className="w-32 px-4 py-2.5">Expire</th>
                    <th className="w-24 px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invitations.map((inv) => (
                    <tr key={inv.id} className="align-middle hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-slate-700">{inv.email}</td>
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
                        className="px-4 py-3 text-xs text-slate-500"
                        title={format(new Date(inv.created_at), 'yyyy-MM-dd HH:mm')}
                      >
                        {formatDistanceToNow(new Date(inv.created_at), {
                          addSuffix: true,
                          locale: fr,
                        })}
                      </td>
                      <td
                        className="px-4 py-3 text-xs text-slate-500"
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
                              className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          )}
                          {inv.status !== 'accepted' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => revokeMutation.mutate({ id: inv.id })}
                              disabled={revokeMutation.isPending}
                              aria-label="Révoquer l'invitation"
                              className="h-8 w-8 p-0 text-slate-500 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                  <span className="font-medium">
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
              className="bg-red-600 hover:bg-red-700"
            >
              {removeMutation.isPending ? 'Suppression…' : 'Retirer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
