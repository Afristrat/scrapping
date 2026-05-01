import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

const schema = z.object({
  email: z.string().email('Adresse email invalide'),
})
type FormValues = z.infer<typeof schema>

export default function Login() {
  const session = useAuthStore((s) => s.session)
  const [sent, setSent] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })

  if (session) return <Navigate to="/" replace />

  async function onSubmit(values: FormValues) {
    const { error } = await supabase.auth.signInWithOtp({
      email: values.email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      toast.error(`Échec : ${error.message}`)
      return
    }
    setSent(true)
    toast.success('Lien envoyé. Vérifie ta boîte mail.')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>zlatan-scrap</CardTitle>
          <CardDescription>
            {sent
              ? 'Lien magique envoyé. Clique le lien reçu par mail pour te connecter.'
              : 'Connecte-toi avec ton email — un lien magique te sera envoyé.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!sent ? (
            <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="toi@example.com"
                  {...form.register('email')}
                />
                {form.formState.errors.email && (
                  <p className="text-sm text-red-600">{form.formState.errors.email.message}</p>
                )}
              </div>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Envoi…' : 'Envoyer le lien magique'}
              </Button>
            </form>
          ) : (
            <Button variant="outline" onClick={() => setSent(false)}>
              Renvoyer un nouveau lien
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
