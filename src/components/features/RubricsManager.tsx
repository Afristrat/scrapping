import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { Check, FlaskConical, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import {
  useRubrics,
  useCreateRubric,
  useUpdateRubric,
  useDeleteRubric,
  useSetActiveRubric,
} from '@/hooks/useRubrics'
import {
  rubricSchema,
  type RubricFormValues,
  type ScoringRubric,
} from '@/lib/schemas/rubric-schema'

interface Props {
  activeRubricId: string | null
}

export function RubricsManager({ activeRubricId }: Props) {
  const navigate = useNavigate()
  const { data: rubrics, isLoading } = useRubrics()
  const createMutation = useCreateRubric()
  const updateMutation = useUpdateRubric()
  const deleteMutation = useDeleteRubric()
  const setActiveMutation = useSetActiveRubric()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const handleEdit = (rubric: ScoringRubric) => {
    setEditingId(rubric.id)
    setShowForm(true)
  }

  const handleDelete = (id: string) => {
    if (confirm('Supprimer cette grille ?')) {
      deleteMutation.mutate({ id })
    }
  }

  const handleSetActive = (rubricId: string) => {
    setActiveMutation.mutate({ rubricId })
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
  }

  if (isLoading) {
    return <div className="text-on-surface-variant text-sm">Chargement des grilles…</div>
  }

  const editingRubric = editingId ? rubrics?.find((r) => r.id === editingId) : undefined

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-on-surface text-sm font-medium">
          {rubrics?.length ?? 0} grille(s) de scoring
        </h3>
        {!showForm && (
          <Button
            type="button"
            size="sm"
            onClick={() => setShowForm(true)}
            className="bg-primary text-on-primary hover:bg-primary/90 gap-1.5 rounded-lg"
          >
            <Plus className="h-3.5 w-3.5" />
            Nouvelle grille
          </Button>
        )}
      </div>

      {showForm && (
        <RubricForm
          initial={editingRubric}
          onSave={(values) => {
            if (editingId) {
              updateMutation.mutate({ id: editingId, values }, { onSuccess: () => handleCancel() })
            } else {
              createMutation.mutate(values, { onSuccess: () => handleCancel() })
            }
          }}
          onCancel={handleCancel}
          isPending={createMutation.isPending || updateMutation.isPending}
        />
      )}

      {rubrics?.map((rubric) => (
        <Card
          key={rubric.id}
          className={
            rubric.id === activeRubricId
              ? 'border-primary bg-surface-container-lowest ring-primary/20 border-2 ring-2'
              : 'border-outline-variant bg-surface-container-lowest'
          }
        >
          <CardHeader className="flex flex-row items-start justify-between pb-2">
            <div>
              <CardTitle className="text-on-surface text-base">{rubric.name}</CardTitle>
              {rubric.description && (
                <p className="text-on-surface-variant mt-0.5 text-xs">{rubric.description}</p>
              )}
            </div>
            <div className="flex items-center gap-1">
              {rubric.id === activeRubricId ? (
                <Badge className="bg-primary-fixed text-on-primary-fixed hover:bg-primary-fixed border-transparent">
                  Active
                </Badge>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSetActive(rubric.id)}
                  className="border-outline-variant gap-1 text-xs"
                >
                  <Check className="h-3 w-3" />
                  Activer
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate('/settings/rubrics/backtest', { state: { rubric } })}
                className="border-outline-variant gap-1 text-xs"
                aria-label="Tester cette grille"
              >
                <FlaskConical className="h-3.5 w-3.5" />
                Tester
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleEdit(rubric)}
                className="border-outline-variant"
                aria-label="Modifier"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleDelete(rubric.id)}
                className="border-outline-variant text-error hover:bg-error-container/40"
                aria-label="Supprimer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {rubric.criteria.map((c, i) => (
                <span
                  key={i}
                  className="bg-surface-container text-on-surface-variant inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                >
                  {c.label}
                  <span className="text-on-surface/60 font-mono text-[10px]">
                    {c.weight.toFixed(1)}
                  </span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {(!rubrics || rubrics.length === 0) && !showForm && (
        <p className="text-on-surface-variant text-sm">
          Aucune grille. Crée-en une pour scorer tes signaux.
        </p>
      )}
    </div>
  )
}

function RubricForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: ScoringRubric
  onSave: (values: RubricFormValues) => void
  onCancel: () => void
  isPending: boolean
}) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RubricFormValues>({
    resolver: zodResolver(rubricSchema),
    defaultValues: initial
      ? {
          name: initial.name,
          description: initial.description ?? '',
          prompt: initial.prompt,
          criteria: initial.criteria,
          is_default: initial.is_default,
        }
      : {
          name: '',
          description: '',
          prompt: '',
          criteria: [{ label: '', weight: 0.5 }],
          is_default: false,
        },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'criteria' })

  return (
    <Card className="border-primary/40 bg-surface-container-low">
      <CardContent className="space-y-4 pt-6">
        <div className="space-y-1.5">
          <Label
            htmlFor="rubric-name"
            className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase"
          >
            Nom
          </Label>
          <Input id="rubric-name" {...register('name')} placeholder="Ex : Pertinence IA Builders" />
          {errors.name && <p className="text-error text-xs">{errors.name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="rubric-desc"
            className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase"
          >
            Description (optionnel)
          </Label>
          <Input
            id="rubric-desc"
            {...register('description')}
            placeholder="Brève description de la grille"
          />
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="rubric-prompt"
            className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase"
          >
            Prompt de scoring
          </Label>
          <Textarea
            id="rubric-prompt"
            rows={4}
            {...register('prompt')}
            placeholder="Tu es un assistant qui évalue les signaux…"
          />
          {errors.prompt && <p className="text-error text-xs">{errors.prompt.message}</p>}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase">
              Critères
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ label: '', weight: 0.5 })}
              className="border-outline-variant gap-1"
            >
              <Plus className="h-3 w-3" />
              Ajouter
            </Button>
          </div>
          {errors.criteria?.root && (
            <p className="text-error text-xs">{errors.criteria.root.message}</p>
          )}
          {fields.map((field, index) => (
            <div key={field.id} className="flex items-center gap-2">
              <Input
                className="flex-1"
                {...register(`criteria.${index}.label`)}
                placeholder="Label du critère"
              />
              <div className="flex w-32 items-center gap-2">
                <CriterionWeightSlider control={control} index={index} />
              </div>
              {fields.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => remove(index)}
                  className="border-outline-variant"
                  aria-label="Retirer critère"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            onClick={handleSubmit(onSave)}
            disabled={isPending}
            className="bg-primary text-on-primary hover:bg-primary/90 rounded-lg"
          >
            {isPending ? 'Sauvegarde…' : initial ? 'Mettre à jour' : 'Créer'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="border-outline-variant"
          >
            Annuler
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function CriterionWeightSlider({
  control,
  index,
}: {
  control: ReturnType<typeof useForm<RubricFormValues>>['control']
  index: number
}) {
  return (
    <Controller
      control={control}
      name={`criteria.${index}.weight` as const}
      render={({ field }) => (
        <>
          <Slider
            value={[field.value]}
            min={0}
            max={1}
            step={0.1}
            onValueChange={(v) => field.onChange(v[0])}
            className="flex-1"
          />
          <span className="text-on-surface-variant w-8 text-right font-mono text-xs">
            {field.value.toFixed(1)}
          </span>
        </>
      )}
    />
  )
}
