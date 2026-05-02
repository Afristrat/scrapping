import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'

import { KairosLogo } from '@/components/icons/KairosLogo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCheckout } from '@/hooks/useCheckout'
import { looseEmailRegex, normalizeEmail } from '@/lib/email-utils'
import { ADDONS, type AddonId, type BillingMode, BASE_PRICES, type Segment } from '@/lib/pricing'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

// =============================================================================
// Wave 7.5 — Refonte design Material You / Stitch Kairos
// Re-skin uniquement : la logique de signup + auto-checkout est conservée.
// =============================================================================

const schema = z
  .object({
    organizationName: z
      .string()
      .min(2, 'Au moins 2 caractères')
      .max(100, 'Au plus 100 caractères')
      .trim(),
    email: z
      .string()
      .min(3, 'Adresse email invalide')
      .regex(looseEmailRegex, 'Adresse email invalide'),
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

export default function Signup(): React.ReactElement {
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
    defaultValues: { organizationName: '', email: '', password: '', confirm: '' },
  })

  useEffect(() => {
    if (!session || !pendingCheckout || checkoutTriggered) return
    if (checkout.isPending) return

    let cancelled = false
    async function triggerCheckout(): Promise<void> {
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

  if (session && !hasPendingCheckout) {
    return <Navigate to={nextPath} replace />
  }

  async function onSubmit(values: FormValues): Promise<void> {
    const email = normalizeEmail(values.email)
    const { error } = await supabase.auth.signUp({
      email,
      password: values.password,
      options: {
        emailRedirectTo: `${window.location.origin}${nextPath}`,
        data: { organization_name: values.organizationName.trim() },
      },
    })
    if (error) {
      toast.error(`Échec : ${error.message}`)
      return
    }
    setSent(true)
    toast.success('Compte créé. Vérifie ta boîte mail pour confirmer.')
  }

  const loginHref = `/login${searchParams.get('next') ? `?next=${encodeURIComponent(nextPath)}` : ''}`

  const description = sent
    ? 'Compte créé. Confirmez votre email puis revenez vous connecter.'
    : hasPendingCheckout
      ? 'Inscrivez-vous pour finaliser votre abonnement Kairos.'
      : 'Démarrez votre essai 14 jours, sans carte bancaire.'

  return (
    <main className="bg-surface text-on-surface flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-surface-container-lowest border-outline-variant rounded-xl border p-8 shadow-xl">
          <div className="mb-6 flex flex-col items-center gap-3">
            <KairosLogo className="h-10 w-10" />
            <span className="text-on-surface text-xl font-bold tracking-tight">Kairos</span>
          </div>

          <h1 className="text-on-surface text-center text-2xl font-semibold tracking-[-0.01em]">
            Créez votre compte Kairos
          </h1>
          <p className="text-on-surface-variant mt-2 text-center text-sm">{description}</p>

          <div className="mt-8">
            {session && hasPendingCheckout ? (
              <div className="border-outline-variant bg-surface-container-low text-on-surface-variant flex items-center gap-3 rounded-lg border p-4 text-sm">
                <Loader2 className="text-primary h-5 w-5 shrink-0 animate-spin" />
                <span>Redirection vers le paiement Stripe en cours&nbsp;…</span>
              </div>
            ) : !sent ? (
              <form
                noValidate
                onSubmit={form.handleSubmit(onSubmit)}
                className="flex flex-col gap-4"
              >
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="signup-organization-name"
                    className="text-on-surface-variant text-xs font-medium"
                  >
                    Nom de votre organisation
                  </Label>
                  <Input
                    id="signup-organization-name"
                    type="text"
                    autoComplete="organization"
                    placeholder="Ex. Acme Capital, Cabinet Dupont, ma-newsletter.io"
                    className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg"
                    {...form.register('organizationName')}
                  />
                  {form.formState.errors.organizationName && (
                    <p className="text-error text-xs">
                      {form.formState.errors.organizationName.message}
                    </p>
                  )}
                  <p className="text-on-surface-variant text-[11px]">
                    Sera affiché dans le bandeau Kairos. Vous pourrez le modifier plus tard.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="signup-email"
                    className="text-on-surface-variant text-xs font-medium"
                  >
                    Email
                  </Label>
                  <Input
                    id="signup-email"
                    type="email"
                    autoComplete="email"
                    placeholder="prenom@entreprise.com"
                    className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg"
                    {...form.register('email')}
                  />
                  {form.formState.errors.email && (
                    <p className="text-error text-xs">{form.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="signup-password"
                    className="text-on-surface-variant text-xs font-medium"
                  >
                    Mot de passe
                  </Label>
                  <Input
                    id="signup-password"
                    type="password"
                    autoComplete="new-password"
                    className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg"
                    {...form.register('password')}
                  />
                  {form.formState.errors.password && (
                    <p className="text-error text-xs">{form.formState.errors.password.message}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label
                    htmlFor="signup-confirm"
                    className="text-on-surface-variant text-xs font-medium"
                  >
                    Confirmer le mot de passe
                  </Label>
                  <Input
                    id="signup-confirm"
                    type="password"
                    autoComplete="new-password"
                    className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg"
                    {...form.register('confirm')}
                  />
                  {form.formState.errors.confirm && (
                    <p className="text-error text-xs">{form.formState.errors.confirm.message}</p>
                  )}
                </div>
                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                  className="bg-primary text-on-primary hover:bg-primary-container h-11 rounded-lg font-medium"
                >
                  {form.formState.isSubmitting ? 'Création…' : 'Créer le compte'}
                </Button>
              </form>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="border-primary-fixed bg-primary-fixed/30 text-on-primary-fixed-variant rounded-lg border p-4 text-sm">
                  <p className="font-medium">Email de confirmation envoyé.</p>
                  <p className="mt-1 text-xs">Cliquez le lien reçu par mail puis connectez-vous.</p>
                </div>
                <Link to="/login">
                  <Button
                    variant="outline"
                    className="border-outline-variant text-on-surface h-11 w-full rounded-lg"
                  >
                    Aller à la page de connexion
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {!sent && !(session && hasPendingCheckout) && (
            <p className="text-on-surface-variant mt-6 text-center text-sm">
              Déjà un compte ?{' '}
              <Link to={loginHref} className="text-primary font-medium hover:underline">
                Connectez-vous
              </Link>
            </p>
          )}
        </div>

        <p className="text-on-surface-variant mt-6 text-center text-xs">
          En créant un compte, vous acceptez nos CGU et notre politique de confidentialité (RGPD).
          Données hébergées en Europe.
        </p>
      </div>
    </main>
  )
}
