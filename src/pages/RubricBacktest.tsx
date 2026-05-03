import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertTriangle, FlaskConical } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { BacktestComparator } from '@/components/features/BacktestComparator'
import {
  useBacktestRubric,
  type BacktestResult,
  type BacktestRubricPayload,
} from '@/hooks/useBacktestRubric'
import { useBacktestCostEstimate } from '@/hooks/useBacktestCostEstimate'
import { useFormatCost } from '@/hooks/useFormatCost'
import { useSettings } from '@/hooks/useSettings'
import { useCreateRubric } from '@/hooks/useRubrics'

// Seuil de confirmation : 5 € ≈ 5.5 USD
const CONFIRM_COST_THRESHOLD_USD = 5.5

export default function RubricBacktest() {
  const location = useLocation()
  const prefill = location.state as {
    rubric?: { prompt: string; criteria?: unknown; name?: string }
  } | null

  const { data: settings } = useSettings()
  const formatCost = useFormatCost()
  const { cancel: cancelBacktest, ...backtestMutation } = useBacktestRubric()
  const createRubricMutation = useCreateRubric()

  const [rubricPrompt, setRubricPrompt] = useState(prefill?.rubric?.prompt ?? '')
  const [criteriaRaw, setCriteriaRaw] = useState(
    prefill?.rubric?.criteria ? JSON.stringify(prefill.rubric.criteria, null, 2) : '',
  )
  const [criteriaError, setCriteriaError] = useState<string | null>(null)
  const [signalCount, setSignalCount] = useState(50)
  const [showConfirm, setShowConfirm] = useState(false)
  const [results, setResults] = useState<BacktestResult[] | null>(null)

  // Résout le modèle actif depuis les settings
  const modelId = settings?.model_config?.scoring?.model ?? 'openrouter/auto'

  const { estimatedCost, tokensIn, tokensOut } = useBacktestCostEstimate(
    rubricPrompt,
    modelId,
    signalCount,
  )

  const formattedCost = formatCost(estimatedCost)

  const parsedCriteria = (): Array<{ label: string; weight: number }> | null => {
    if (!criteriaRaw.trim()) return null
    try {
      const parsed = JSON.parse(criteriaRaw) as unknown
      if (!Array.isArray(parsed)) {
        setCriteriaError('Le JSON doit être un tableau')
        return null
      }
      setCriteriaError(null)
      return parsed as Array<{ label: string; weight: number }>
    } catch {
      setCriteriaError('JSON invalide')
      return null
    }
  }

  const handleLaunch = () => {
    if (!rubricPrompt.trim()) {
      toast.error('Le prompt de la rubric est requis')
      return
    }

    // Validation criteria JSON si renseigné
    if (criteriaRaw.trim()) {
      try {
        const parsed = JSON.parse(criteriaRaw) as unknown
        if (!Array.isArray(parsed)) {
          setCriteriaError('Le JSON doit être un tableau')
          return
        }
        setCriteriaError(null)
      } catch {
        setCriteriaError('JSON invalide')
        return
      }
    }

    // Confirmation si coût estimé > seuil
    if (estimatedCost > CONFIRM_COST_THRESHOLD_USD) {
      setShowConfirm(true)
      return
    }

    runBacktest()
  }

  const runBacktest = () => {
    const criteria = parsedCriteria()
    const payload: BacktestRubricPayload = {
      rubric_prompt: rubricPrompt,
      criteria: criteria ?? undefined,
      max_signals: signalCount,
    }
    backtestMutation.mutate(payload, {
      onSuccess: (data) => {
        setResults(data)
        toast.success(`Backtest terminé — ${data.length} signaux comparés`)
      },
      onError: (err) => {
        if (err.message === 'backtest_in_progress') {
          // Le toast est déjà géré dans useBacktestRubric.onError
        } else if (err.message === 'backtest_cancelled') {
          toast.info('Backtest annulé')
        } else {
          toast.error('Erreur lors du backtest', { description: err.message.slice(0, 200) })
        }
      },
    })
  }

  const handleAdoptRubric = () => {
    if (!rubricPrompt.trim()) return
    const criteria = parsedCriteria()
    createRubricMutation.mutate(
      {
        name: `Rubric backtest ${new Date().toLocaleDateString('fr-FR')}`,
        description: 'Créée via le backtest',
        prompt: rubricPrompt,
        criteria: criteria ?? [{ label: 'Pertinence', weight: 1 }],
        is_default: false,
      },
      {
        onSuccess: () => {
          toast.success('Rubric adoptée et sauvegardée')
        },
      },
    )
  }

  const estimatedSeconds = Math.round(signalCount * 1.5)

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <FlaskConical className="text-primary h-6 w-6" />
        <div>
          <h1 className="text-xl font-semibold">Backtest de rubric</h1>
          <p className="text-muted-foreground text-sm">
            Testez l'impact d'une nouvelle grille de scoring sur les signaux des 30 derniers jours,
            sans modifier vos scores existants.
          </p>
        </div>
      </div>

      {/* Formulaire */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Paramètres du backtest</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Prompt */}
          <div className="space-y-2">
            <Label htmlFor="rubric-prompt">Prompt de scoring</Label>
            <Textarea
              id="rubric-prompt"
              placeholder="Décris ici ta rubric de scoring. Ex : Score ce signal entre 0 et 100 selon sa pertinence pour les professionnels de l'IA générative..."
              value={rubricPrompt}
              onChange={(e) => setRubricPrompt(e.target.value)}
              rows={8}
              className="font-mono text-sm"
              disabled={backtestMutation.isPending}
            />
          </div>

          {/* Critères JSON */}
          <div className="space-y-2">
            <Label htmlFor="criteria-json">
              Critères pondérés{' '}
              <span className="text-muted-foreground font-normal">(JSON optionnel)</span>
            </Label>
            <Textarea
              id="criteria-json"
              placeholder='[{"label": "Pertinence IA", "weight": 0.6}, {"label": "Nouveauté", "weight": 0.4}]'
              value={criteriaRaw}
              onChange={(e) => {
                setCriteriaRaw(e.target.value)
                if (criteriaError) setCriteriaError(null)
              }}
              rows={3}
              className="font-mono text-sm"
              disabled={backtestMutation.isPending}
            />
            {criteriaError && (
              <p className="text-destructive flex items-center gap-1 text-xs">
                <AlertTriangle className="h-3 w-3" />
                {criteriaError}
              </p>
            )}
          </div>

          {/* Slider nombre de signaux */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Nombre de signaux à tester</Label>
              <span className="text-muted-foreground text-sm font-medium">{signalCount}</span>
            </div>
            <Slider
              min={10}
              max={100}
              step={10}
              value={[signalCount]}
              onValueChange={([v]) => setSignalCount(v ?? signalCount)}
              disabled={backtestMutation.isPending}
              className="w-full"
            />
            <div className="text-muted-foreground flex justify-between text-xs">
              <span>10</span>
              <span>100</span>
            </div>
          </div>

          {/* Estimation du coût */}
          <div className="bg-muted rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Coût estimé</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  ~{tokensIn.toLocaleString('fr-FR')} tokens in · ~
                  {tokensOut.toLocaleString('fr-FR')} tokens out
                </p>
              </div>
              <span
                className={`text-lg font-bold ${
                  estimatedCost > CONFIRM_COST_THRESHOLD_USD
                    ? 'text-destructive'
                    : 'text-foreground'
                }`}
              >
                {formattedCost}
              </span>
            </div>
            {estimatedCost > CONFIRM_COST_THRESHOLD_USD && (
              <p className="text-destructive mt-2 flex items-center gap-1 text-xs">
                <AlertTriangle className="h-3 w-3" />
                Coût élevé — une confirmation sera demandée avant le lancement.
              </p>
            )}
          </div>

          {/* Bouton lancer + Annuler */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleLaunch}
              disabled={backtestMutation.isPending || !rubricPrompt.trim()}
              className="gap-2"
            >
              {backtestMutation.isPending ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Backtest en cours…
                </>
              ) : (
                <>
                  <FlaskConical className="h-4 w-4" />
                  Lancer le backtest
                </>
              )}
            </Button>
            {backtestMutation.isPending && (
              <>
                <p className="text-muted-foreground text-sm">
                  Durée estimée : ~{estimatedSeconds}s restantes
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={cancelBacktest}
                  className="text-destructive hover:text-destructive"
                >
                  Annuler
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Résultats en cours de chargement */}
      {backtestMutation.isPending && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-muted-foreground text-sm font-medium">Backtest en cours…</p>
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-8 w-5/6" />
            <Skeleton className="h-8 w-2/3" />
          </CardContent>
        </Card>
      )}

      {/* Résultats */}
      {results !== null && !backtestMutation.isPending && (
        <>
          <BacktestComparator results={results} />

          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={handleAdoptRubric}
              disabled={createRubricMutation.isPending || !rubricPrompt.trim()}
            >
              {createRubricMutation.isPending ? 'Sauvegarde…' : 'Adopter cette rubric'}
            </Button>
          </div>
        </>
      )}

      {/* AlertDialog confirmation coût élevé */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Coût estimé élevé</AlertDialogTitle>
            <AlertDialogDescription>
              Ce backtest est estimé à <strong className="text-foreground">{formattedCost}</strong>{' '}
              pour {signalCount} signaux. Voulez-vous continuer ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowConfirm(false)
                runBacktest()
              }}
            >
              Lancer quand même
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
