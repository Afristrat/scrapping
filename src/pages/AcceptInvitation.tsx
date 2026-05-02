import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

// =============================================================================
// Wave 6 — Sub-wave 6.3 — S6-InvitationFlow
// Page publique /accept-invitation/:token
//
// Comportement :
//  - Si pas de token dans l'URL → redirect / (home)
//  - Si user pas loggé → redirect /login?next=/accept-invitation/:token
//    (et un message clair lui demandant de se connecter avec l'email invité)
//  - Si loggé → invoque l'edge fn `accept-invitation` avec le token, affiche
//    succès/erreur, redirect /dashboard au succès (3s)
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

  // L'état initial est 'pending' dès qu'on a token + session : pas de
  // setState synchrone dans l'effet, et on triggere l'appel via une
  // dépendance `triggerKey` qui change uniquement quand on est prêt.
  const ready = !authLoading && !!session && !!token
  const [status, setStatus] = useState<Status>(ready ? { kind: 'pending' } : { kind: 'idle' })

  useEffect(() => {
    if (!ready) return
    if (status.kind !== 'pending') return

    let cancelled = false
    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke<AcceptResponse>(
          'accept-invitation',
          { body: { token } },
        )
        if (cancelled) return
        if (error) {
          // Supabase wraps non-2xx as FunctionsHttpError ; on tente de
          // récupérer le code d'erreur depuis le contexte
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

  // Auto-redirect après succès
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
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Accepter l’invitation</CardTitle>
          <CardDescription>
            Connecté en tant que <span className="font-medium">{session.user.email}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status.kind === 'pending' || status.kind === 'idle' ? (
            <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              Validation de l’invitation en cours…
            </div>
          ) : status.kind === 'success' ? (
            <div className="flex items-start gap-3 rounded-md border border-green-200 bg-green-50 p-4 text-sm">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              <div>
                <p className="font-medium text-green-900">Invitation acceptée</p>
                <p className="mt-1 text-green-800">
                  Vous avez rejoint l’organisation en tant que{' '}
                  <span className="font-medium">{status.role}</span>. Redirection vers le dashboard…
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <div>
                <p className="font-medium text-red-900">Échec de l’acceptation</p>
                <p className="mt-1 text-red-800">{errorMessage(status.code)}</p>
              </div>
            </div>
          )}

          {status.kind === 'success' && (
            <Button className="w-full" onClick={() => navigate('/dashboard', { replace: true })}>
              Aller au dashboard
            </Button>
          )}
          {status.kind === 'error' && (
            <Button variant="outline" className="w-full" onClick={() => navigate('/')}>
              Retour à l’accueil
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

/**
 * Tente d'extraire un code d'erreur lisible depuis l'erreur Supabase
 * Functions. Si le body de la réponse contient `{ error: '...' }`, on le
 * récupère ; sinon fallback sur le message générique.
 */
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
