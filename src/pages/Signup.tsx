import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

export default function Signup() {
  const session = useAuthStore((s) => s.session)
  const [sent, setSent] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', confirm: '' },
  })

  if (session) return <Navigate to="/" replace />

  async function onSubmit(values: FormValues) {
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: { emailRedirectTo: window.location.origin },
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
              : 'Inscris-toi avec email et mot de passe.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!sent ? (
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
                <Link to="/login" className="text-primary hover:underline">
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
