import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AdminPromptsConfig } from '@/components/features/AdminPromptsConfig'
import { ApiKeyForm } from '@/components/features/ApiKeyForm'
import { ApifyConfigForm } from '@/components/features/ApifyConfigForm'
import { ProvidersConfig } from '@/components/features/ProvidersConfig'
import { BrandingForm } from '@/components/features/BrandingForm'
import { ModelCascadeSelect, type ModelChoice } from '@/components/features/ModelCascadeSelect'
import { RubricsManager } from '@/components/features/RubricsManager'
import { SourcePrioritySliders } from '@/components/features/SourcePrioritySliders'
import { TagInput } from '@/components/features/TagInput'
import { useApiKeys } from '@/hooks/useApiKeys'
import { useSettings } from '@/hooks/useSettings'
import { useUpdateSettings } from '@/hooks/useUpdateSettings'
import {
  DEFAULT_APIFY_CONFIG,
  DEFAULT_SOURCE_PRIORITY,
  settingsSchema,
  type SettingsFormValues,
} from '@/lib/schemas/settings-schema'

export default function Settings() {
  const { data: settings } = useSettings()
  const { data: apiKeys } = useApiKeys()
  const updateMutation = useUpdateSettings()

  const {
    control,
    handleSubmit,
    register,
    setValue,
    watch,
    formState: { isDirty, errors },
  } = useForm<SettingsFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(settingsSchema) as any,
    values: settings
      ? {
          prompt_scoring: settings.prompt_scoring,
          reddit_subs: settings.reddit_subs,
          arxiv_categories: settings.arxiv_categories,
          x_queries: settings.x_queries,
          topic_seeds: settings.topic_seeds ?? [],
          model_config: settings.model_config ?? {},
          branding: {
            name: settings.branding.name,
            primary: settings.branding.primary,
            logo_url: settings.branding.logo_url,
          },
          source_priority: settings.source_priority ?? DEFAULT_SOURCE_PRIORITY,
          apify_config: settings.apify_config ?? DEFAULT_APIFY_CONFIG,
          daily_budget_usd: settings.daily_budget_usd ?? 5,
          active_rubric_id: settings.active_rubric_id ?? null,
          language: settings.language ?? 'fr',
          score_concurrency: settings.score_concurrency ?? 20,
        }
      : undefined,
  })

  const sourcePriority = watch('source_priority')
  const apifyConfig = watch('apify_config')
  const watchedModelConfig = watch('model_config')

  const onSubmit = (values: SettingsFormValues) => {
    updateMutation.mutate(values)
  }

  const apifyKey = apiKeys?.find((k) => k.provider === 'apify')

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Parametres</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Tabs defaultValue="models">
          <TabsList className="w-full">
            <TabsTrigger value="models">Modeles</TabsTrigger>
            <TabsTrigger value="rubrics">Grilles</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="api-keys">Cles API</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="admin">Admin</TabsTrigger>
          </TabsList>

          {/* Onglet 1 : Modeles */}
          <TabsContent value="models" className="space-y-4 pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Modèles par tâche (BYOK)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Choisis un provider puis un modèle pour chaque tâche. Les modèles sont chargés
                  depuis l'onglet "Clés API" via "Refresh models" pour chaque provider configuré.
                </p>
                {(['scoring', 'scraping', 'monitoring', 'digest'] as const).map((task) => {
                  const cur = (watchedModelConfig ?? {})[task] ?? null
                  return (
                    <div key={task} className="space-y-1">
                      <p className="text-xs font-medium capitalize">{task}</p>
                      <ModelCascadeSelect
                        value={(cur as ModelChoice | null) ?? null}
                        onChange={(next) => {
                          const current = watchedModelConfig ?? {}
                          setValue(
                            'model_config',
                            { ...current, [task]: next ?? undefined },
                            { shouldDirty: true },
                          )
                        }}
                      />
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Onglet 2 : Grilles de scoring */}
          <TabsContent value="rubrics" className="space-y-4 pt-4">
            <RubricsManager activeRubricId={settings?.active_rubric_id ?? null} />
          </TabsContent>

          {/* Onglet 3 : Sources */}
          <TabsContent value="sources" className="space-y-4 pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Sources de donnees</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Subreddits Reddit</Label>
                  <TagInput
                    value={settings?.reddit_subs ?? []}
                    onChange={(next) => setValue('reddit_subs', next, { shouldDirty: true })}
                    placeholder="ex: MachineLearning"
                  />
                  {errors.reddit_subs && (
                    <p className="text-xs text-red-500">{errors.reddit_subs.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>Categories Arxiv</Label>
                  <TagInput
                    value={settings?.arxiv_categories ?? []}
                    onChange={(next) => setValue('arxiv_categories', next, { shouldDirty: true })}
                    placeholder="ex: cs.AI"
                  />
                  {errors.arxiv_categories && (
                    <p className="text-xs text-red-500">{errors.arxiv_categories.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>Requetes X / Twitter</Label>
                  <TagInput
                    value={settings?.x_queries ?? []}
                    onChange={(next) => setValue('x_queries', next, { shouldDirty: true })}
                    placeholder="ex: #LLM"
                  />
                  {errors.x_queries && (
                    <p className="text-xs text-red-500">{errors.x_queries.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>Topic seeds</Label>
                  <p className="text-xs text-muted-foreground">
                    Liste de topics de référence utilisée par le classifier. Le LLM peut aussi
                    proposer des topics émergents en plus.
                  </p>
                  <TagInput
                    value={settings?.topic_seeds ?? []}
                    onChange={(next) => setValue('topic_seeds', next, { shouldDirty: true })}
                    placeholder="ex: Embeddings & Vector DB"
                  />
                  {errors.topic_seeds && (
                    <p className="text-xs text-red-500">{errors.topic_seeds.message}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <ApifyConfigForm
              value={apifyConfig ?? DEFAULT_APIFY_CONFIG}
              onChange={(next) => setValue('apify_config', next, { shouldDirty: true })}
            />

            <SourcePrioritySliders
              value={sourcePriority ?? DEFAULT_SOURCE_PRIORITY}
              onChange={(next) => setValue('source_priority', next, { shouldDirty: true })}
            />
          </TabsContent>

          {/* Onglet 4 : Cles API */}
          <TabsContent value="api-keys" className="space-y-4 pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Providers LLM (BYOK)</CardTitle>
              </CardHeader>
              <CardContent>
                <ProvidersConfig />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Apify (scraping)</CardTitle>
              </CardHeader>
              <CardContent>
                <ApiKeyForm provider="apify" existingKey={apifyKey} label="Apify" />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Onglet 5 : Branding & Budget */}
          <TabsContent value="branding" className="space-y-4 pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Branding</CardTitle>
              </CardHeader>
              <CardContent>
                <BrandingForm control={control} setValue={setValue} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Langue du brief</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <Label htmlFor="language">Langue de la synthèse LLM</Label>
                <select
                  id="language"
                  className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                  {...register('language')}
                >
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
                <p className="text-xs text-slate-500">
                  Langue utilisée par le brief de veille (page Brief).
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Budget quotidien</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <Label htmlFor="daily-budget">Budget max par jour (USD)</Label>
                <Input
                  id="daily-budget"
                  type="number"
                  step="0.01"
                  min="0"
                  max="1000"
                  {...register('daily_budget_usd', { valueAsNumber: true })}
                />
                {errors.daily_budget_usd && (
                  <p className="text-xs text-red-500">{errors.daily_budget_usd.message}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performance scoring</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <Label htmlFor="score-concurrency">Appels OpenRouter parallèles (scoring)</Label>
                <Input
                  id="score-concurrency"
                  type="number"
                  step="1"
                  min="1"
                  max="100"
                  {...register('score_concurrency', { valueAsNumber: true })}
                />
                <p className="text-xs text-slate-500">
                  Nombre d'appels OpenRouter simultanés pendant le scoring. Règle OpenRouter
                  pay-as-you-go : <strong>$1 de solde = 1 RPS</strong> (max 500). Default 20 (safe
                  avec $20+ de solde). Augmente si ton solde est plus élevé pour un pipeline plus
                  rapide.
                </p>
                {errors.score_concurrency && (
                  <p className="text-xs text-red-500">{errors.score_concurrency.message}</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Onglet 6 : Admin — Prompts Moat Hunter */}
          <TabsContent value="admin" className="space-y-4 pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Admin — Prompts Moat Hunter</CardTitle>
              </CardHeader>
              <CardContent>
                <AdminPromptsConfig />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Button type="submit" disabled={!isDirty || updateMutation.isPending} className="w-full">
          {updateMutation.isPending ? 'Sauvegarde...' : 'Enregistrer'}
        </Button>
      </form>
    </main>
  )
}
