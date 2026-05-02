import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { Save, ShieldAlert } from 'lucide-react'

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
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppSettings, useUpdateAppSetting } from '@/hooks/useAppSettings'
import { useIsAppAdmin } from '@/hooks/useIsAppAdmin'

// =============================================================================
// Wave 8.B — Story S8B-AdminAppSettings
//
// Page d'administration `/admin/settings` permettant aux super-admins Kairos
// de configurer les paramètres globaux de la plateforme (domaine de contact,
// nom de marque…).
//
// Sécurité : double gate via `useIsAppAdmin` côté client (UX) + RLS strict
// côté DB (source de vérité). Le frontend ne doit JAMAIS être considéré
// comme la source de vérité.
// =============================================================================

interface FormValues {
  app_domain: string
  app_brand_name: string
}

const DEFAULTS: FormValues = {
  app_domain: 'kairos.ai-mpower.com',
  app_brand_name: 'Kairos',
}

export default function AppSettings(): React.ReactElement {
  const { data: isAdmin, isLoading: isAdminLoading } = useIsAppAdmin()

  if (isAdminLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!isAdmin) {
    return <AccessDeniedView />
  }

  return <AppSettingsBody />
}

function AppSettingsBody(): React.ReactElement {
  const settingsQuery = useAppSettings()
  const updateMutation = useUpdateAppSetting()

  const form = useForm<FormValues>({
    defaultValues: DEFAULTS,
    mode: 'onChange',
  })

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { isDirty, isValid, dirtyFields },
  } = form

  // Repopule le formulaire dès que les settings sont chargés depuis la DB.
  useEffect(() => {
    if (settingsQuery.data) {
      reset({
        app_domain: settingsQuery.data.app_domain ?? DEFAULTS.app_domain,
        app_brand_name: settingsQuery.data.app_brand_name ?? DEFAULTS.app_brand_name,
      })
    }
  }, [settingsQuery.data, reset])

  // `useWatch` est mémoïsable safely (vs. `form.watch()` qui ne l'est pas).
  const watchedDomain = useWatch({ control, name: 'app_domain' })
  const watchedBrand = useWatch({ control, name: 'app_brand_name' })
  const liveDomain = watchedDomain || DEFAULTS.app_domain
  const liveBrand = watchedBrand || DEFAULTS.app_brand_name
  const livePreviewEmail = `labs@${liveDomain}`

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingValues, setPendingValues] = useState<FormValues | null>(null)

  function onSubmit(values: FormValues): void {
    const trimmed: FormValues = {
      app_domain: values.app_domain.trim(),
      app_brand_name: values.app_brand_name.trim(),
    }
    setPendingValues(trimmed)
    setConfirmOpen(true)
  }

  async function applyChanges(): Promise<void> {
    if (!pendingValues) return
    const tasks: Array<Promise<void>> = []
    if (dirtyFields.app_domain) {
      tasks.push(updateMutation.mutateAsync({ key: 'app_domain', value: pendingValues.app_domain }))
    }
    if (dirtyFields.app_brand_name) {
      tasks.push(
        updateMutation.mutateAsync({
          key: 'app_brand_name',
          value: pendingValues.app_brand_name,
        }),
      )
    }
    try {
      await Promise.all(tasks)
      reset(pendingValues)
    } finally {
      setConfirmOpen(false)
      setPendingValues(null)
    }
  }

  if (settingsQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (settingsQuery.isError) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <div className="border-error/40 bg-error-container text-on-error-container rounded-xl border p-6 text-sm">
          <p className="font-semibold">Échec du chargement des paramètres.</p>
          <p className="mt-1 text-xs">{settingsQuery.error.message}</p>
          <Button
            size="sm"
            variant="outline"
            className="border-outline-variant text-on-surface mt-3"
            onClick={() => settingsQuery.refetch()}
          >
            Réessayer
          </Button>
        </div>
      </div>
    )
  }

  const submitting = updateMutation.isPending

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header>
        <h1 className="text-on-surface text-2xl font-semibold tracking-[-0.01em]">
          Paramètres globaux Kairos
        </h1>
        <p className="text-on-surface-variant mt-1 text-sm">
          Configuration de l’application visible par tous les visiteurs publics.
        </p>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Card className="bg-surface-container-lowest border-outline-variant rounded-xl border shadow-md">
          <CardHeader>
            <CardTitle className="text-on-surface text-base font-semibold">
              Identité de la plateforme
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Domaine */}
            <div className="space-y-2">
              <Label
                htmlFor="app_domain"
                className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase"
              >
                Nom de domaine
              </Label>
              <Input
                id="app_domain"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="kairos.ai-mpower.com"
                className="border-outline-variant bg-surface-container-lowest"
                {...register('app_domain', {
                  required: true,
                  pattern: /^[a-z0-9.-]+\.[a-z]{2,}$/i,
                })}
              />
              <p className="text-on-surface-variant text-xs">
                Ex : <code>kairos.ai-mpower.com</code>. L’email de contact sera{' '}
                <code>labs@&lt;domain&gt;</code>.
              </p>
              <p className="text-primary text-sm font-medium">
                Email contact : <code>{livePreviewEmail}</code>
              </p>
            </div>

            {/* Nom de marque */}
            <div className="space-y-2">
              <Label
                htmlFor="app_brand_name"
                className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase"
              >
                Nom de marque
              </Label>
              <Input
                id="app_brand_name"
                type="text"
                autoComplete="off"
                placeholder="Kairos"
                className="border-outline-variant bg-surface-container-lowest"
                {...register('app_brand_name', { required: true, maxLength: 60 })}
              />
              <p className="text-on-surface-variant text-xs">
                Affiché par défaut sur la landing publique, le footer et l’en-tête marketing.
              </p>
              <p className="text-primary text-sm font-medium">
                Marque affichée : <code>{liveBrand}</code>
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button
            type="submit"
            disabled={!isDirty || !isValid || submitting}
            className="bg-primary text-on-primary hover:bg-primary-container h-10 gap-2 rounded-lg"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            Sauvegarder
          </Button>
        </div>
      </form>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-surface-container-lowest border-outline-variant">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-on-surface">
              Confirmer la modification ?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-on-surface-variant">
              Cette modification sera visible par tous les visiteurs (y compris les
              non-authentifiés).
              {pendingValues ? (
                <span className="mt-3 block space-y-1">
                  <span className="block">
                    Domaine : <code>{pendingValues.app_domain}</code>
                  </span>
                  <span className="block">
                    Email contact : <code>labs@{pendingValues.app_domain}</code>
                  </span>
                  <span className="block">
                    Marque : <code>{pendingValues.app_brand_name}</code>
                  </span>
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={submitting}
              className="border-outline-variant text-on-surface"
            >
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(e) => {
                e.preventDefault()
                void applyChanges()
              }}
              className="bg-primary text-on-primary hover:bg-primary-container"
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function AccessDeniedView(): React.ReactElement {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="bg-error-container text-on-error-container mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full">
        <ShieldAlert className="h-7 w-7" aria-hidden="true" />
      </div>
      <h1 className="text-on-surface mt-4 text-xl font-semibold tracking-[-0.01em]">
        Accès refusé
      </h1>
      <p className="text-on-surface-variant mt-2 text-sm">
        Cette page est réservée aux administrateurs de la plateforme Kairos.
      </p>
      <Link to="/dashboard">
        <Button className="bg-primary text-on-primary hover:bg-primary-container mt-6 h-11 rounded-lg">
          Retour au dashboard
        </Button>
      </Link>
    </div>
  )
}
