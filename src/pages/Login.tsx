import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import { KairosLogo } from '@/components/icons/KairosLogo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

// =============================================================================
// Wave 7.5 — Refonte design Material You / Stitch Kairos
// Re-skin uniquement : la logique d'authentification (3 méthodes : Google,
// magic link, mot de passe) est conservée à l'identique. Les noms d'éléments
// (labels, ids, role) sont préservés afin de ne pas casser Login.test.tsx.
// =============================================================================

const magicSchema = z.object({
  email: z.string().email('Adresse email invalide'),
})
type MagicValues = z.infer<typeof magicSchema>

const passwordSchema = z.object({
  email: z.string().email('Adresse email invalide'),
  password: z.string().min(8, 'Au moins 8 caractères'),
})
type PasswordValues = z.infer<typeof passwordSchema>

function GoogleIcon(): React.ReactElement {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.44c-.28 1.55-1.14 2.86-2.41 3.74v3.11h3.9c2.28-2.1 3.6-5.2 3.6-9.09z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.9-3.11c-1.08.72-2.46 1.16-4.05 1.16-3.12 0-5.76-2.11-6.7-4.94H1.27v3.21C3.25 21.31 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.21c-.24-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.42H1.27C.46 8.05 0 9.97 0 12s.46 3.95 1.27 5.58l4.03-3.37z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.45-3.45C17.95 1.19 15.23 0 12 0 7.31 0 3.25 2.69 1.27 6.42l4.03 3.21C6.24 6.88 8.88 4.77 12 4.77z"
      />
    </svg>
  )
}

function sanitizeNext(raw: string | null): string {
  if (!raw) return '/dashboard'
  // Only allow internal absolute paths to avoid open-redirects
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/dashboard'
  return raw
}

export default function Login(): React.ReactElement {
  const session = useAuthStore((s) => s.session)
  const [searchParams] = useSearchParams()
  const nextPath = sanitizeNext(searchParams.get('next'))
  const [magicSent, setMagicSent] = useState(false)

  const magicForm = useForm<MagicValues>({
    resolver: zodResolver(magicSchema),
    defaultValues: { email: '' },
  })

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { email: '', password: '' },
  })

  if (session) return <Navigate to={nextPath} replace />

  const redirectUrl = `${window.location.origin}${nextPath}`

  async function onMagicSubmit(values: MagicValues): Promise<void> {
    const { error } = await supabase.auth.signInWithOtp({
      email: values.email,
      options: { emailRedirectTo: redirectUrl },
    })
    if (error) {
      toast.error(`Échec : ${error.message}`)
      return
    }
    setMagicSent(true)
    toast.success('Lien envoyé. Vérifie ta boîte mail.')
  }

  async function onPasswordSubmit(values: PasswordValues): Promise<void> {
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    })
    if (error) {
      toast.error(`Connexion échouée : ${error.message}`)
      return
    }
    toast.success('Connecté.')
  }

  async function onGoogle(): Promise<void> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl },
    })
    if (error) {
      toast.error(`Échec Google : ${error.message}`)
    }
  }

  const signupHref = `/signup${searchParams.get('next') ? `?next=${encodeURIComponent(nextPath)}` : ''}`

  return (
    <main className="bg-surface text-on-surface flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="bg-surface-container-lowest border-outline-variant rounded-xl border p-8 shadow-xl">
          <div className="mb-6 flex flex-col items-center gap-3">
            <KairosLogo className="h-10 w-10" />
            <span className="text-on-surface text-xl font-bold tracking-tight">Kairos</span>
          </div>

          <h1 className="text-on-surface text-center text-2xl font-semibold tracking-[-0.01em]">
            Connectez-vous
          </h1>
          <p className="text-on-surface-variant mt-2 text-center text-sm">
            Accédez à votre dashboard de veille IA.
          </p>

          <div className="mt-8">
            <Button
              type="button"
              variant="outline"
              className="border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low h-11 w-full justify-center gap-2 rounded-lg"
              onClick={onGoogle}
            >
              <GoogleIcon />
              Continuer avec Google
            </Button>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <span className="border-outline-variant w-full border-t" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-surface-container-lowest text-on-surface-variant px-3 text-xs tracking-wide uppercase">
                  ou
                </span>
              </div>
            </div>

            <Tabs defaultValue="password">
              <TabsList className="bg-surface-container-low grid w-full grid-cols-2">
                <TabsTrigger value="password">Mot de passe</TabsTrigger>
                <TabsTrigger value="magic">Lien magique</TabsTrigger>
              </TabsList>

              <TabsContent value="password" className="mt-5">
                <form
                  noValidate
                  onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
                  className="flex flex-col gap-4"
                >
                  <div className="flex flex-col gap-1.5">
                    <Label
                      htmlFor="pwd-email"
                      className="text-on-surface-variant text-xs font-medium"
                    >
                      Email
                    </Label>
                    <Input
                      id="pwd-email"
                      type="email"
                      autoComplete="email"
                      placeholder="prenom@entreprise.com"
                      className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg"
                      {...passwordForm.register('email')}
                    />
                    {passwordForm.formState.errors.email && (
                      <p className="text-error text-xs">
                        {passwordForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label
                      htmlFor="pwd-password"
                      className="text-on-surface-variant text-xs font-medium"
                    >
                      Mot de passe
                    </Label>
                    <Input
                      id="pwd-password"
                      type="password"
                      autoComplete="current-password"
                      className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg"
                      {...passwordForm.register('password')}
                    />
                    {passwordForm.formState.errors.password && (
                      <p className="text-error text-xs">
                        {passwordForm.formState.errors.password.message}
                      </p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    disabled={passwordForm.formState.isSubmitting}
                    className="bg-primary text-on-primary hover:bg-primary-container h-11 rounded-lg font-medium"
                  >
                    {passwordForm.formState.isSubmitting ? 'Connexion…' : 'Se connecter'}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="magic" className="mt-5">
                {!magicSent ? (
                  <form
                    noValidate
                    onSubmit={magicForm.handleSubmit(onMagicSubmit)}
                    className="flex flex-col gap-4"
                  >
                    <div className="flex flex-col gap-1.5">
                      <Label
                        htmlFor="magic-email"
                        className="text-on-surface-variant text-xs font-medium"
                      >
                        Email
                      </Label>
                      <Input
                        id="magic-email"
                        type="email"
                        autoComplete="email"
                        placeholder="prenom@entreprise.com"
                        className="border-outline-variant bg-surface-container-lowest h-11 rounded-lg"
                        {...magicForm.register('email')}
                      />
                      {magicForm.formState.errors.email && (
                        <p className="text-error text-xs">
                          {magicForm.formState.errors.email.message}
                        </p>
                      )}
                    </div>
                    <Button
                      type="submit"
                      disabled={magicForm.formState.isSubmitting}
                      className="bg-primary text-on-primary hover:bg-primary-container h-11 rounded-lg font-medium"
                    >
                      {magicForm.formState.isSubmitting ? 'Envoi…' : 'Envoyer le lien magique'}
                    </Button>
                  </form>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="border-primary-fixed bg-primary-fixed/30 text-on-primary-fixed-variant rounded-lg border p-4 text-sm">
                      <p className="font-medium">Lien envoyé.</p>
                      <p className="mt-1 text-xs">
                        Cliquez le lien reçu par mail pour vous connecter.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setMagicSent(false)}
                      className="border-outline-variant text-on-surface h-11 rounded-lg"
                    >
                      Renvoyer un nouveau lien
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          <p className="text-on-surface-variant mt-6 text-center text-sm">
            Pas encore de compte ?{' '}
            <Link to={signupHref} className="text-primary font-medium hover:underline">
              Créer un compte
            </Link>
          </p>
        </div>

        <p className="text-on-surface-variant mt-6 text-center text-xs">
          En vous connectant, vous acceptez nos conditions d’utilisation. Vos données sont hébergées
          en Europe et conformes RGPD.
        </p>
      </div>
    </main>
  )
}
