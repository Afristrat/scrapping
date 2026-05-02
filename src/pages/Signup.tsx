import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCheckout } from '@/hooks/useCheckout'
import { ADDONS, type AddonId, type BillingMode, BASE_PRICES, type Segment } from '@/lib/pricing'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

const schema = z
  .object({
    email: z.string().email('Adresse email invalide'),
    password: z.string().min(8, 'Au moins 8 caractères').max(100),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirm'],
  })
type FormValues = z.infer<typeof schema>

function sanitizeNext(raw: string | null): string {
  if (!raw) return '/dashboard'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/dashboard'
  return raw
}

const VALID_SEGMENTS: ReadonlySet<Segment> = new Set(Object.keys(BASE_PRICES) as Segment[])
const VALID_MODES: ReadonlySet<BillingMode> = new Set(['maison', 'byok'])
const VALID_ADDONS: ReadonlySet<AddonId> = new Set(Object.keys(ADDONS) as AddonId[])

interface PendingCheckout {
  segment: Segment
  seats: number
  mode: BillingMode
  addons: AddonId[]
}

/**
 * Parse les query params éventuels venant de `/pricing` (PricingPublic) :
 *   ?segment=cto_sme&seats=10&mode=maison&addons=webhooks,api_public
 * Retourne null si la sérialisation est incomplète ou invalide.
 */
function parsePendingCheckout(params: URLSearchParams): PendingCheckout | null {
  const segment = params.get('segment')
  const seatsRaw = params.get('seats')
  const mode = params.get('mode')
  const addonsRaw = params.get('addons')

  if (!segment || !seatsRaw || !mode) return null
  if (!VALID_SEGMENTS.has(segment as Segment)) return null
  if (!VALID_MODES.has(mode as BillingMode)) return null

  const seats = Number.parseInt(seatsRaw, 10)
  if (!Number.isInteger(seats) || seats < 1 || seats > 100) return null

  let addons: AddonId[] = []
  if (addonsRaw && addonsRaw.length > 0) {
    const list = addonsRaw
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.length > 0)
    for (const a of list) {
      if (!VALID_ADDONS.has(a as AddonId)) return null
    }
    addons = list as AddonId[]
  }

  return {
    segment: segment as Segment,
    seats,
    mode: mode as BillingMode,
    addons,
  }
}

export default function Signup() {
  const session = useAuthStore((s) => s.session)
  const [searchParams] = useSearchParams()
  const nextPath = sanitizeNext(searchParams.get('next'))
  const [sent, setSent] = useState(false)
  const [checkoutTriggered, setCheckoutTriggered] = useState(false)

  const checkout = useCheckout()
  const pendingCheckout = useMemo(() => parsePendingCheckout(searchParams), [searchParams])
  const hasPendingCheckout = pendingCheckout !== null

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', confirm: '' },
  })

  // Si une session est active ET qu'on a des query params pricing, on
  // déclenche le checkout au lieu de naviguer vers `nextPath`. Cas typique :
  // - User arrive depuis /pricing → s'inscrit → session immédiate → checkout
  // - User déjà loggé arrive directement sur /signup avec query params
  useEffect(() => {
    if (!session || !pendingCheckout || checkoutTriggered) return
    if (checkout.isPending) return

    let cancelled = false
    async function triggerCheckout() {
      // Récupère la 1re org du user où il est owner. Le trigger
      // create_default_org_for_user crée automatiquement une org au signup,
      // donc cette query renvoie au moins 1 ligne pour un nouvel inscrit.
      // Defensive : si le user a plusieurs orgs (cas existant), on prend
      // la 1re owner — l'utilisateur peut toujours utiliser le configurateur
      // depuis le dashboard pour cibler une autre org.
      const userId = session?.user?.id
      if (!userId) return
      const { data, error } = await supabase
        .from('organization_members')
        .select('org_id')
        .eq('user_id', userId)
        .eq('role', 'owner')
        .order('joined_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (cancelled) return
      if (error || !data) {
        toast.error('Impossible de récupérer votre organisation', {
          description: error?.message ?? 'Aucune organisation owner trouvée.',
        })
        return
      }
      // Si pendingCheckout a été invalidé entre-temps (cleanup), on abandonne.
      if (!pendingCheckout) return

      setCheckoutTriggered(true)
      checkout.mutate({
        org_id: data.org_id,
        segment: pendingCheckout.segment,
        seats: pendingCheckout.seats,
        billing_mode: pendingCheckout.mode,
        addons: pendingCheckout.addons,
      })
    }
    void triggerCheckout()
    return () => {
      cancelled = true
    }
  }, [session, pendingCheckout, checkoutTriggered, checkout])

  // Redirection finale uniquement si pas de checkout en cours.
  if (session && !hasPendingCheckout) {
    return <Navigate to={nextPath} replace />
  }

  async function onSubmit(values: FormValues) {
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: { emailRedirectTo: `${window.location.origin}${nextPath}` },
    })
    if (error) {
      toast.error(`Échec : ${error.message}`)
      return
    }
    setSent(true)
    toast.success('Compte créé. Vérifie ta boîte mail pour confirmer.')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Créer un compte</CardTitle>
          <CardDescription>
            {sent
              ? 'Compte créé. Confirme ton email puis reviens te connecter.'
              : hasPendingCheckout
                ? 'Inscris-toi pour finaliser ton abonnement Kairos.'
                : 'Inscris-toi avec email et mot de passe.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {session && hasPendingCheckout ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-slate-600">
                Redirection vers le paiement Stripe en cours&nbsp;…
              </p>
            </div>
          ) : !sent ? (
            <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  placeholder="toi@example.com"
                  {...form.register('email')}
                />
                {form.formState.errors.email && (
                  <p className="text-sm text-red-600">{form.formState.errors.email.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="signup-password">Mot de passe</Label>
                <Input
                  id="signup-password"
                  type="password"
                  autoComplete="new-password"
                  {...form.register('password')}
                />
                {form.formState.errors.password && (
                  <p className="text-sm text-red-600">{form.formState.errors.password.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="signup-confirm">Confirmer le mot de passe</Label>
                <Input
                  id="signup-confirm"
                  type="password"
                  autoComplete="new-password"
                  {...form.register('confirm')}
                />
                {form.formState.errors.confirm && (
                  <p className="text-sm text-red-600">{form.formState.errors.confirm.message}</p>
                )}
              </div>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Création…' : 'Créer le compte'}
              </Button>
              <p className="text-center text-xs text-slate-500">
                Déjà inscrit ?{' '}
                <Link
                  to={`/login${searchParams.get('next') ? `?next=${encodeURIComponent(nextPath)}` : ''}`}
                  className="text-primary hover:underline"
                >
                  Se connecter
                </Link>
              </p>
            </form>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-slate-600">
                Un email de confirmation a été envoyé à ton adresse. Clique le lien dedans, puis
                connecte-toi.
              </p>
              <Link to="/login">
                <Button variant="outline" className="w-full">
                  Aller à la page de connexion
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
