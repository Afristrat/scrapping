import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'

import { KairosLogo } from '@/components/icons/KairosLogo'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

// =============================================================================
// Wave 7.5 — Refonte design Material You / Stitch Kairos.
// Re-skin uniquement : la logique d'acceptation d'invitation reste inchangée.
// =============================================================================

interface AcceptResponse {
  ok: true
  org_id: string
  role: string
}

type Status =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'success'; org_id: string; role: string }
  | { kind: 'error'; code: string }

const ERROR_LABELS: Record<string, string> = {
  invitation_not_found: "Cette invitation n'existe pas ou a été révoquée.",
  already_accepted: 'Cette invitation a déjà été acceptée.',
  expired: 'Cette invitation a expiré. Demandez à votre administrateur d’en générer une nouvelle.',
  email_mismatch:
    'L’email de votre compte ne correspond pas à celui de l’invitation. Connectez-vous avec le bon email.',
  invalid_token: 'Votre session a expiré. Veuillez vous reconnecter.',
  missing_token: 'Lien d’invitation invalide.',
  service_role_key_not_configured: 'Configuration serveur incomplète. Contactez l’administrateur.',
}

function errorMessage(code: string): string {
  return ERROR_LABELS[code] ?? `Erreur inattendue : ${code}`
}

export default function AcceptInvitation(): React.ReactElement {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const session = useAuthStore((s) => s.session)
  const authLoading = useAuthStore((s) => s.loading)

  const ready = !authLoading && !!session && !!token
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const firedRef = useRef(false)

  useEffect(() => {
    if (!ready) return
    if (firedRef.current) return
    firedRef.current = true

    let cancelled = false
    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke<AcceptResponse>(
          'accept-invitation',
          { body: { token } },
        )
        if (cancelled) return
        if (error) {
          const code = await extractErrorCode(error)
          setStatus({ kind: 'error', code })
          return
        }
        if (!data?.ok) {
          setStatus({ kind: 'error', code: 'unknown' })
          return
        }
        setStatus({ kind: 'success', org_id: data.org_id, role: data.role })
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        setStatus({ kind: 'error', code: message })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ready, token, status.kind])

  useEffect(() => {
    if (status.kind === 'success') {
      const timer = setTimeout(() => navigate('/dashboard', { replace: true }), 2500)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [status, navigate])

  if (!token) return <Navigate to="/" replace />

  if (authLoading) {
    return (
      <main className="bg-surface text-on-surface flex min-h-screen items-center justify-center px-4">
        <div className="text-on-surface-variant inline-flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Chargement…
        </div>
      </main>
    )
  }

  if (!session) {
    const next = encodeURIComponent(`/accept-invitation/${token}`)
    return <Navigate to={`/login?next=${next}`} replace />
  }

  return (
    <main className="bg-surface text-on-surface flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-surface-container-lowest border-outline-variant rounded-xl border p-8 shadow-xl">
          <div className="mb-6 flex flex-col items-center gap-3">
            <KairosLogo className="h-10 w-10" />
            <span className="text-on-surface text-lg font-bold tracking-tight">Kairos</span>
          </div>

          <h1 className="text-on-surface text-center text-2xl font-semibold tracking-[-0.01em]">
            Accepter l’invitation
          </h1>
          <p className="text-on-surface-variant mt-2 text-center text-sm">
            Connecté en tant que{' '}
            <span className="text-on-surface font-medium">{session.user.email}</span>
          </p>

          <div className="mt-8 space-y-4">
            {status.kind === 'pending' || status.kind === 'idle' ? (
              <div className="border-outline-variant bg-surface-container-low text-on-surface-variant flex items-center gap-3 rounded-lg border p-4 text-sm">
                <Loader2
                  className="text-primary h-5 w-5 shrink-0 animate-spin"
                  aria-hidden="true"
                />
                Validation de l’invitation en cours…
              </div>
            ) : status.kind === 'success' ? (
              <div className="border-primary-fixed bg-primary-fixed/30 text-on-primary-fixed-variant flex items-start gap-3 rounded-lg border p-4 text-sm">
                <CheckCircle2 className="text-primary mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-on-surface font-semibold">Invitation acceptée</p>
                  <p className="mt-1">
                    Vous avez rejoint l’organisation en tant que{' '}
                    <span className="text-on-surface font-medium">{status.role}</span>. Redirection
                    vers le dashboard…
                  </p>
                </div>
              </div>
            ) : (
              <div className="border-error/40 bg-error-container text-on-error-container flex items-start gap-3 rounded-lg border p-4 text-sm">
                <AlertCircle className="text-error mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Échec de l’acceptation</p>
                  <p className="mt-1">{errorMessage(status.code)}</p>
                </div>
              </div>
            )}

            {status.kind === 'success' && (
              <Button
                className="bg-primary text-on-primary hover:bg-primary-container h-11 w-full rounded-lg font-medium"
                onClick={() => navigate('/dashboard', { replace: true })}
              >
                Aller au dashboard
              </Button>
            )}
            {status.kind === 'error' && (
              <Button
                variant="outline"
                className="border-outline-variant text-on-surface h-11 w-full rounded-lg"
                onClick={() => navigate('/')}
              >
                Retour à l’accueil
              </Button>
            )}
          </div>
        </div>

        <p className="text-on-surface-variant mt-6 flex items-center justify-center gap-2 text-center text-xs">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Lien chiffré, valable 7 jours, traçable dans le journal d’audit.
        </p>
      </div>
    </main>
  )
}

async function extractErrorCode(err: unknown): Promise<string> {
  if (err && typeof err === 'object' && 'context' in err) {
    const ctx = (err as { context?: { json?: () => Promise<unknown> } }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const body = await ctx.json()
        if (body && typeof body === 'object' && 'error' in body) {
          return String((body as { error: unknown }).error)
        }
      } catch {
        /* ignore */
      }
    }
  }
  if (err instanceof Error) return err.message
  return 'unknown_error'
}
