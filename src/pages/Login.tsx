import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

const magicSchema = z.object({
  email: z.string().email('Adresse email invalide'),
})
type MagicValues = z.infer<typeof magicSchema>

const passwordSchema = z.object({
  email: z.string().email('Adresse email invalide'),
  password: z.string().min(8, 'Au moins 8 caractères'),
})
type PasswordValues = z.infer<typeof passwordSchema>

function GoogleIcon() {
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

export default function Login() {
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

  async function onMagicSubmit(values: MagicValues) {
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

  async function onPasswordSubmit(values: PasswordValues) {
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

  async function onGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl },
    })
    if (error) {
      toast.error(`Échec Google : ${error.message}`)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Kairos</CardTitle>
          <CardDescription>
            Connectez-vous pour accéder à votre dashboard de veille IA.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            className="mb-4 w-full justify-center gap-2"
            onClick={onGoogle}
          >
            <GoogleIcon />
            Continuer avec Google
          </Button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-2 text-xs text-slate-500">ou</span>
            </div>
          </div>

          <Tabs defaultValue="password">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="password">Mot de passe</TabsTrigger>
              <TabsTrigger value="magic">Lien magique</TabsTrigger>
            </TabsList>

            <TabsContent value="password" className="mt-4">
              <form
                noValidate
                onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
                className="flex flex-col gap-3"
              >
                <div className="flex flex-col gap-1">
                  <Label htmlFor="pwd-email">Email</Label>
                  <Input
                    id="pwd-email"
                    type="email"
                    autoComplete="email"
                    placeholder="toi@example.com"
                    {...passwordForm.register('email')}
                  />
                  {passwordForm.formState.errors.email && (
                    <p className="text-sm text-red-600">
                      {passwordForm.formState.errors.email.message}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="pwd-password">Mot de passe</Label>
                  <Input
                    id="pwd-password"
                    type="password"
                    autoComplete="current-password"
                    {...passwordForm.register('password')}
                  />
                  {passwordForm.formState.errors.password && (
                    <p className="text-sm text-red-600">
                      {passwordForm.formState.errors.password.message}
                    </p>
                  )}
                </div>
                <Button type="submit" disabled={passwordForm.formState.isSubmitting}>
                  {passwordForm.formState.isSubmitting ? 'Connexion…' : 'Se connecter'}
                </Button>
                <p className="text-center text-xs text-slate-500">
                  Pas encore de compte ?{' '}
                  <Link
                    to={`/signup${searchParams.get('next') ? `?next=${encodeURIComponent(nextPath)}` : ''}`}
                    className="text-primary hover:underline"
                  >
                    Créer un compte
                  </Link>
                </p>
              </form>
            </TabsContent>

            <TabsContent value="magic" className="mt-4">
              {!magicSent ? (
                <form
                  noValidate
                  onSubmit={magicForm.handleSubmit(onMagicSubmit)}
                  className="flex flex-col gap-3"
                >
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="magic-email">Email</Label>
                    <Input
                      id="magic-email"
                      type="email"
                      autoComplete="email"
                      placeholder="toi@example.com"
                      {...magicForm.register('email')}
                    />
                    {magicForm.formState.errors.email && (
                      <p className="text-sm text-red-600">
                        {magicForm.formState.errors.email.message}
                      </p>
                    )}
                  </div>
                  <Button type="submit" disabled={magicForm.formState.isSubmitting}>
                    {magicForm.formState.isSubmitting ? 'Envoi…' : 'Envoyer le lien magique'}
                  </Button>
                </form>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-slate-600">
                    Lien envoyé. Clique le lien reçu par mail pour te connecter.
                  </p>
                  <Button variant="outline" onClick={() => setMagicSent(false)}>
                    Renvoyer un nouveau lien
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </main>
  )
}
