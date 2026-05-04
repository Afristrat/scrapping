import { useEffect, useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AdminPromptsConfig } from '@/components/features/AdminPromptsConfig'
import { ApiKeysConfig } from '@/components/features/ApiKeysConfig'
import { ApifyConfigForm } from '@/components/features/ApifyConfigForm'
import { BrandingForm } from '@/components/features/BrandingForm'
import { ModelCascadeSelect, type ModelChoice } from '@/components/features/ModelCascadeSelect'
import { PersonasEditor } from '@/components/features/PersonasEditor'
import { RssFeedsManager } from '@/components/features/RssFeedsManager'
import { RubricsManager } from '@/components/features/RubricsManager'
import { SourcePrioritySliders } from '@/components/features/SourcePrioritySliders'
import { TagInput } from '@/components/features/TagInput'
import { TopicsTaxonomyEditor } from '@/components/features/TopicsTaxonomyEditor'
import { SourceHealthBadge } from '@/components/features/SourceHealthBadge'
import { useSubredditHealth } from '@/hooks/useSourceHealth'
import { useSettings } from '@/hooks/useSettings'
import { useUpdateSettings } from '@/hooks/useUpdateSettings'
import { useUpdateConsensusModels } from '@/hooks/useUpdateConsensusModels'
import { useProviderModels } from '@/hooks/useProviderModels'
import { SettingsProfileBar } from '@/components/features/SettingsProfileBar'
import {
  DEFAULT_APIFY_CONFIG,
  DEFAULT_SOURCE_PRIORITY,
  settingsSchema,
  type SettingsFormValues,
} from '@/lib/schemas/settings-schema'

const TASK_LABELS: Record<'scoring' | 'scraping' | 'monitoring' | 'digest' | 'enrichment', string> =
  {
    scoring: 'Scoring',
    scraping: 'Scraping',
    monitoring: 'Monitoring',
    digest: 'Digest',
    enrichment: 'Enrichissement',
  }

const TASK_DESCRIPTIONS: Record<
  'scoring' | 'scraping' | 'monitoring' | 'digest' | 'enrichment',
  string
> = {
  scoring: 'Évaluation pertinence des signaux',
  scraping: 'Filtre intelligent sur les flux',
  monitoring: 'Détection de tendances émergentes',
  digest: 'Synthèse stratégique 80/20',
  enrichment: 'Classification topics, personas PARA, suggestions IA',
}

export default function Settings() {
  const { data: settings } = useSettings()
  const updateMutation = useUpdateSettings()
  const updateConsensusMutation = useUpdateConsensusModels()
  const { data: providerModels = [] } = useProviderModels()

  // Consensus models local state (independent of the main form)
  const [consensusModels, setConsensusModels] = useState<string[]>(
    () => settings?.consensus_models ?? [],
  )
  // Sync when settings load
  if (
    settings?.consensus_models !== undefined &&
    consensusModels.length === 0 &&
    settings.consensus_models.length > 0
  ) {
    setConsensusModels(settings.consensus_models)
  }

  const consensusError =
    consensusModels.length === 1 ? 'Sélectionnez 0 ou au moins 2 modèles distincts.' : null

  const handleConsensusToggle = (modelId: string) => {
    setConsensusModels((prev) => {
      if (prev.includes(modelId)) return prev.filter((m) => m !== modelId)
      if (prev.length >= 3) return prev // max 3
      return [...prev, modelId]
    })
  }

  const handleSaveConsensus = () => {
    if (consensusModels.length === 1) return
    updateConsensusMutation.mutate(consensusModels)
  }

  const {
    control,
    handleSubmit,
    register,
    setValue,
    reset,
    formState: { isDirty, errors },
  } = useForm<SettingsFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(settingsSchema) as any,
    defaultValues: {
      prompt_scoring: '',
      reddit_subs: [],
      arxiv_categories: [],
      x_queries: [],
      topic_seeds: [],
      model_config: {},
      branding: { name: 'Kairos', primary: '#6750A4', logo_url: null },
      source_priority: DEFAULT_SOURCE_PRIORITY,
      apify_config: DEFAULT_APIFY_CONFIG,
      daily_budget_usd: 5,
      active_rubric_id: null,
      language: 'fr',
      score_concurrency: 20,
    },
  })

  // Initialise le formulaire une seule fois quand settings arrive.
  // On évite `values` prop qui reset le form à chaque refetch TanStack Query,
  // ce qui effaçait les modifications en cours.
  const initializedRef = useRef(false)
  useEffect(() => {
    if (!settings || initializedRef.current) return
    initializedRef.current = true
    reset({
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
    })
  }, [settings, reset])

  // useWatch est stable côté React Compiler (vs watch() qui force des
  // re-renders non mémorisables — règle react-hooks/incompatible-library).
  const sourcePriority = useWatch({ control, name: 'source_priority' })
  const apifyConfig = useWatch({ control, name: 'apify_config' })
  const watchedModelConfig = useWatch({ control, name: 'model_config' })
  const watchedRedditSubs = useWatch({ control, name: 'reddit_subs' })
  const watchedArxivCategories = useWatch({ control, name: 'arxiv_categories' })
  const watchedXQueries = useWatch({ control, name: 'x_queries' })
  const watchedTopicSeeds = useWatch({ control, name: 'topic_seeds' })

  // Snapshot complet du formulaire pour SettingsProfileBar
  const watchedPromptScoring = useWatch({ control, name: 'prompt_scoring' })
  const watchedBranding = useWatch({ control, name: 'branding' })
  const watchedDailyBudget = useWatch({ control, name: 'daily_budget_usd' })
  const watchedActiveRubricId = useWatch({ control, name: 'active_rubric_id' })
  const watchedLanguage = useWatch({ control, name: 'language' })
  const watchedScoreConcurrency = useWatch({ control, name: 'score_concurrency' })

  const currentSnapshot: SettingsFormValues = {
    prompt_scoring: watchedPromptScoring ?? '',
    reddit_subs: watchedRedditSubs ?? [],
    arxiv_categories: watchedArxivCategories ?? [],
    x_queries: watchedXQueries ?? [],
    topic_seeds: watchedTopicSeeds ?? [],
    model_config: watchedModelConfig ?? {},
    branding: watchedBranding ?? { name: 'Kairos', primary: '#6750A4', logo_url: null },
    source_priority: sourcePriority ?? DEFAULT_SOURCE_PRIORITY,
    apify_config: apifyConfig ?? DEFAULT_APIFY_CONFIG,
    daily_budget_usd: watchedDailyBudget ?? 5,
    active_rubric_id: watchedActiveRubricId ?? null,
    language: watchedLanguage ?? 'fr',
    score_concurrency: watchedScoreConcurrency ?? 20,
  }

  const handleApplyProfile = (values: SettingsFormValues) => {
    reset(values)
  }

  const onSubmit = (values: SettingsFormValues) => {
    updateMutation.mutate(values)
  }

  return (
    <div className="bg-surface min-h-full">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <header className="mb-8">
          <h1 className="text-on-surface text-3xl font-bold tracking-tight md:text-4xl">
            Paramètres
          </h1>
          <p className="text-on-surface-variant mt-2 text-base">
            Configurez Kairos selon vos besoins.
          </p>
        </header>

        <SettingsProfileBar currentSnapshot={currentSnapshot} onApply={handleApplyProfile} />

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          <Tabs defaultValue="models" className="gap-0">
            {/* Onglets — style underline Stitch (border-b primary sur active) */}
            <TabsList className="border-outline-variant flex h-auto w-full justify-start gap-6 overflow-x-auto rounded-none border-b bg-transparent p-0">
              {[
                { value: 'models', label: 'Modèles' },
                { value: 'rubrics', label: 'Grilles' },
                { value: 'sources', label: 'Sources' },
                { value: 'api-keys', label: 'Clés API' },
                { value: 'admin', label: 'Prompts Admin' },
                { value: 'branding', label: 'Branding' },
                { value: 'topics', label: 'Topics' },
                { value: 'para', label: 'PARA' },
              ].map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="text-on-surface-variant hover:text-on-surface data-[state=active]:text-primary data-[state=active]:border-primary -mb-px h-auto rounded-none border-b-2 border-transparent bg-transparent px-1 py-4 text-sm font-medium whitespace-nowrap shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Onglet 1 : Modèles — grille de cartes par tâche */}
            <TabsContent value="models" className="space-y-6 pt-8">
              <SectionHeader
                title="Modèles par tâche (BYOK)"
                description="Définissez les modèles d'intelligence artificielle utilisés pour chaque étape du traitement Kairos. Les modèles sont chargés depuis l'onglet « Clés API » via « Modèles » pour chaque provider configuré."
              />
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {(['scoring', 'scraping', 'monitoring', 'digest', 'enrichment'] as const).map(
                  (task) => {
                    const cur = (watchedModelConfig ?? {})[task] ?? null
                    const isActive = !!cur?.provider && !!cur?.model
                    return (
                      <div
                        key={task}
                        className="bg-surface-container-lowest border-outline-variant rounded-xl border p-6 shadow-sm"
                      >
                        <div className="mb-4 flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-on-surface text-lg font-semibold">
                              {TASK_LABELS[task]}
                            </h3>
                            <p className="text-on-surface-variant mt-0.5 text-xs">
                              {TASK_DESCRIPTIONS[task]}
                            </p>
                          </div>
                          <span
                            className={
                              isActive
                                ? 'bg-primary-fixed text-on-primary-fixed inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium'
                                : 'bg-surface-container-high text-on-surface-variant inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium'
                            }
                          >
                            {isActive ? 'Actif' : 'Non configuré'}
                          </span>
                        </div>
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
                  },
                )}
              </div>

              {/* Section consensus scoring */}
              <SectionCard>
                <div className="mb-4 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-on-surface text-lg font-semibold">
                      Consensus scoring (BYOK avancé)
                    </h3>
                    <p className="text-on-surface-variant mt-0.5 text-sm leading-relaxed">
                      Sélectionnez 2 ou 3 modèles distincts. Chaque signal sera scoré par chacun
                      d'eux et le score final sera la moyenne (consensus).{' '}
                      <span className="text-tertiary font-medium">
                        Coût × {consensusModels.length > 0 ? consensusModels.length : 'N'} modèles
                        sélectionnés.
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {providerModels.length === 0 && (
                    <p className="text-on-surface-variant text-sm">
                      Aucun modèle disponible — configurez vos clés API dans l'onglet «&nbsp;Clés
                      API&nbsp;» puis rafraîchissez les modèles.
                    </p>
                  )}
                  {providerModels.map((m) => {
                    const id = `${m.provider}:${m.model_id}`
                    const selected = consensusModels.includes(id)
                    const disabledAdd = !selected && consensusModels.length >= 3
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={selected}
                        disabled={disabledAdd}
                        onClick={() => handleConsensusToggle(id)}
                        className={[
                          'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                          selected
                            ? 'bg-primary text-on-primary border-primary'
                            : 'border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary bg-transparent',
                          disabledAdd ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
                        ].join(' ')}
                      >
                        {m.display_name ?? m.model_id}{' '}
                        <span className="opacity-60">({m.provider})</span>
                      </button>
                    )
                  })}
                </div>
                {consensusError && <p className="text-error mt-2 text-xs">{consensusError}</p>}
                {consensusModels.length > 0 && (
                  <p className="text-on-surface-variant mt-2 text-xs">
                    Sélectionnés ({consensusModels.length}/3)&nbsp;: {consensusModels.join(', ')}
                  </p>
                )}
                <div className="mt-4 flex justify-end">
                  <Button
                    type="button"
                    disabled={!!consensusError || updateConsensusMutation.isPending}
                    onClick={handleSaveConsensus}
                    className="bg-primary text-on-primary hover:bg-primary/90 gap-2 rounded-lg px-5"
                  >
                    <Save className="h-4 w-4" />
                    {updateConsensusMutation.isPending ? 'Sauvegarde…' : 'Sauvegarder le consensus'}
                  </Button>
                </div>
              </SectionCard>
            </TabsContent>

            {/* Onglet 2 : Rubriques de scoring */}
            <TabsContent value="rubrics" className="space-y-6 pt-8">
              <SectionHeader
                title="Grilles de scoring"
                description="Crée et active les grilles de critères utilisées par le LLM pour évaluer chaque signal."
              />
              <SectionCard>
                <RubricsManager activeRubricId={settings?.active_rubric_id ?? null} />
              </SectionCard>
            </TabsContent>

            {/* Onglet 3 : Sources */}
            <TabsContent value="sources" className="space-y-6 pt-8">
              <SectionHeader
                title="Sources de données"
                description="Gérez les flux d'informations alimentant votre moteur d'IA Kairos."
              />

              <SectionCard>
                <div className="space-y-5">
                  <FieldGroup
                    label="Subreddits Reddit"
                    error={errors.reddit_subs?.message}
                    help="Liste de subreddits scrapés via Apify."
                  >
                    <TagInput
                      value={watchedRedditSubs ?? []}
                      onChange={(next) => setValue('reddit_subs', next, { shouldDirty: true })}
                      placeholder="ex : MachineLearning"
                    />
                    {(watchedRedditSubs ?? []).length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {(watchedRedditSubs ?? []).map((sub) => (
                          <SubredditHealthRow key={sub} sub={sub} />
                        ))}
                      </ul>
                    )}
                  </FieldGroup>

                  <FieldGroup
                    label="Catégories arXiv"
                    error={errors.arxiv_categories?.message}
                    help="Catégories arXiv (ex : cs.AI, cs.CL) interrogées via l'API officielle."
                  >
                    <TagInput
                      value={watchedArxivCategories ?? []}
                      onChange={(next) => setValue('arxiv_categories', next, { shouldDirty: true })}
                      placeholder="ex : cs.AI"
                    />
                  </FieldGroup>

                  <FieldGroup
                    label="Requêtes X / Twitter"
                    error={errors.x_queries?.message}
                    help="Hashtags ou requêtes injectées dans le scraper Apify."
                  >
                    <TagInput
                      value={watchedXQueries ?? []}
                      onChange={(next) => setValue('x_queries', next, { shouldDirty: true })}
                      placeholder="ex : #LLM"
                    />
                  </FieldGroup>

                  <FieldGroup
                    label="Topic seeds"
                    error={errors.topic_seeds?.message}
                    help="Liste de topics de référence utilisée par le classifier. Le LLM peut aussi proposer des topics émergents en plus."
                  >
                    <TagInput
                      value={watchedTopicSeeds ?? []}
                      onChange={(next) => setValue('topic_seeds', next, { shouldDirty: true })}
                      placeholder="ex : Embeddings & Vector DB"
                    />
                  </FieldGroup>
                </div>
              </SectionCard>

              <SectionCard>
                <RssFeedsManager />
              </SectionCard>

              <ApifyConfigForm
                value={apifyConfig ?? DEFAULT_APIFY_CONFIG}
                onChange={(next) => setValue('apify_config', next, { shouldDirty: true })}
              />

              <SourcePrioritySliders
                value={sourcePriority ?? DEFAULT_SOURCE_PRIORITY}
                onChange={(next) => setValue('source_priority', next, { shouldDirty: true })}
              />
            </TabsContent>

            {/* Onglet 4 : Clés API */}
            <TabsContent value="api-keys" className="space-y-6 pt-8">
              <SectionHeader
                title="Clés API"
                description="Apportez vos propres clés (BYOK) pour les 10 providers LLM et Apify. Validation automatique à la sauvegarde, fallback Maison transparent en cas d'invalidité."
              />
              <ApiKeysConfig />
            </TabsContent>

            {/* Onglet 5 : Prompts Admin */}
            <TabsContent value="admin" className="space-y-6 pt-8">
              <SectionHeader
                title="Prompts d'analyse"
                description="Bibliothèque de prompts d'analyse stratégique exécutables sur ton corpus de signaux. Quatre seeds pré-installés et tes prompts personnalisés."
              />
              <SectionCard>
                <AdminPromptsConfig />
              </SectionCard>
            </TabsContent>

            {/* Onglet 6 : Branding & Budget & Performance */}
            <TabsContent value="branding" className="space-y-6 pt-8">
              <SectionHeader
                title="Branding & préférences"
                description="Personnalisez l'apparence de Kairos et les paramètres globaux du pipeline."
              />

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <SectionCard title="Identité visuelle">
                  <BrandingForm control={control} setValue={setValue} />
                </SectionCard>

                <SectionCard title="Langue du brief">
                  <FieldGroup
                    label="Langue de la synthèse LLM"
                    htmlFor="language"
                    help="Langue utilisée par le brief de veille (page Brief)."
                  >
                    <select
                      id="language"
                      className="border-outline-variant bg-surface text-on-surface focus-visible:ring-primary/40 focus-visible:border-primary h-9 w-full rounded-md border px-3 text-sm shadow-sm focus-visible:ring-2 focus-visible:outline-none"
                      {...register('language')}
                    >
                      <option value="fr">Français</option>
                      <option value="en">English</option>
                      <option value="es">Español</option>
                    </select>
                  </FieldGroup>
                </SectionCard>

                <SectionCard title="Budget quotidien">
                  <FieldGroup
                    label="Budget max par jour (USD)"
                    htmlFor="daily-budget"
                    error={errors.daily_budget_usd?.message}
                    help="Plafond journalier appliqué par le Cost Guard avant d'exécuter un run."
                  >
                    <Input
                      id="daily-budget"
                      type="number"
                      step="0.01"
                      min="0"
                      max="1000"
                      {...register('daily_budget_usd', { valueAsNumber: true })}
                    />
                  </FieldGroup>
                </SectionCard>

                <SectionCard title="Performance scoring">
                  <FieldGroup
                    label="Appels OpenRouter parallèles"
                    htmlFor="score-concurrency"
                    error={errors.score_concurrency?.message}
                  >
                    <Input
                      id="score-concurrency"
                      type="number"
                      step="1"
                      min="1"
                      max="100"
                      {...register('score_concurrency', { valueAsNumber: true })}
                    />
                    <p className="text-on-surface-variant mt-2 text-xs leading-relaxed">
                      Nombre d'appels OpenRouter simultanés pendant le scoring. Règle OpenRouter
                      pay-as-you-go : <strong>$1 de solde = 1 RPS</strong> (max 500). Default 20
                      (safe avec $20+ de solde). Augmente si ton solde est plus élevé pour un
                      pipeline plus rapide.
                    </p>
                  </FieldGroup>
                </SectionCard>
              </div>
            </TabsContent>
            {/* Onglet 7 : Taxonomie Topics */}
            <TabsContent value="topics" className="space-y-6 pt-8">
              <SectionHeader
                title="Taxonomie des topics"
                description="Gérez l'arbre de sujets utilisé pour classifier les signaux. Double-cliquez sur un nom pour le renommer directement."
              />
              <SectionCard>
                <TopicsTaxonomyEditor />
              </SectionCard>
            </TabsContent>

            {/* Onglet 8 : Personas PARA */}
            <TabsContent value="para" className="space-y-6 pt-8">
              <SectionHeader
                title="Personas PARA"
                description="Organisez vos personas selon la méthode PARA (Inbox, Projects, Hats, Resources). Chaque persona peut être personnelle ou partagée avec toute l'organisation."
              />
              <SectionCard>
                <PersonasEditor />
              </SectionCard>
            </TabsContent>
          </Tabs>

          {/* Sticky save bar */}
          <div className="bg-surface-container-lowest border-outline-variant sticky bottom-0 -mx-6 mt-8 flex items-center justify-end gap-3 border-t px-6 py-4">
            <p className="text-on-surface-variant mr-auto text-sm">
              {isDirty
                ? 'Modifications non enregistrées'
                : 'Toutes les modifications sont sauvegardées.'}
            </p>
            <Button
              type="submit"
              disabled={!isDirty || updateMutation.isPending}
              className="bg-primary text-on-primary hover:bg-primary/90 gap-2 rounded-lg px-5"
            >
              <Save className="h-4 w-4" />
              {updateMutation.isPending ? 'Sauvegarde…' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Sous-composants santé sources                                               */
/* -------------------------------------------------------------------------- */

function SubredditHealthRow({ sub }: { sub: string }) {
  const health = useSubredditHealth(sub)
  return (
    <li className="flex items-center gap-2 text-xs">
      <span className="text-on-surface-variant">
        r/<span className="text-on-surface font-medium">{sub}</span>
      </span>
      <SourceHealthBadge health={health} />
    </li>
  )
}

/* -------------------------------------------------------------------------- */
/* Helpers visuels — purement présentation, sans logique                       */
/* -------------------------------------------------------------------------- */

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h2 className="text-on-surface text-xl font-semibold tracking-tight md:text-2xl">{title}</h2>
      {description && (
        <p className="text-on-surface-variant mt-1.5 text-sm leading-relaxed">{description}</p>
      )}
    </div>
  )
}

function SectionCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface-container-lowest border-outline-variant rounded-xl border p-6 shadow-sm">
      {title && (
        <h3 className="text-on-surface mb-5 text-lg font-semibold tracking-tight">{title}</h3>
      )}
      {children}
    </section>
  )
}

function FieldGroup({
  label,
  htmlFor,
  help,
  error,
  children,
}: {
  label: string
  htmlFor?: string
  help?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={htmlFor}
        className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase"
      >
        {label}
      </Label>
      {children}
      {help && <p className="text-on-surface-variant text-xs leading-relaxed">{help}</p>}
      {error && <p className="text-error text-xs">{error}</p>}
    </div>
  )
}
