import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Loader2, Play, Rocket } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// =============================================================================
// Wave 7.5 — Onboarding étape 4 : déclenchement du premier run de pipeline.
// L'orchestration réelle (run-pipeline edge fn) est gérée par le bouton dédié
// dans le dashboard ; ici on visualise une timeline pour donner confiance à
// l'utilisateur, puis on redirige vers /dashboard.
// =============================================================================

interface TimelineStep {
  id: string
  label: string
  description: string
}

const TIMELINE: ReadonlyArray<TimelineStep> = [
  {
    id: 'init',
    label: 'Initialisation',
    description: 'Configuration de votre espace et liaison de vos sources.',
  },
  {
    id: 'scrape',
    label: 'Collecte des signaux',
    description: 'X, Reddit et arXiv sont scrappés en parallèle.',
  },
  {
    id: 'score',
    label: 'Scoring LLM',
    description: 'Les signaux sont scorés selon vos critères.',
  },
  {
    id: 'ready',
    label: 'Dashboard prêt',
    description: 'Redirection automatique vers votre tableau de bord.',
  },
]

type RunStatus = 'idle' | 'running' | 'done'

export default function OnboardingFirstRun(): React.ReactElement {
  const navigate = useNavigate()
  const [status, setStatus] = useState<RunStatus>('idle')
  const [stepIdx, setStepIdx] = useState<number>(-1)

  useEffect(() => {
    if (status !== 'running') return
    const tick = window.setTimeout(() => {
      setStepIdx((prev) => {
        const next = prev + 1
        if (next >= TIMELINE.length) {
          setStatus('done')
          return TIMELINE.length - 1
        }
        return next
      })
    }, 900)
    return () => window.clearTimeout(tick)
  }, [status, stepIdx])

  useEffect(() => {
    if (status !== 'done') return
    const redirect = window.setTimeout(() => navigate('/dashboard', { replace: true }), 1200)
    return () => window.clearTimeout(redirect)
  }, [status, navigate])

  const onLaunch = (): void => {
    setStatus('running')
    setStepIdx(0)
  }

  return (
    <div>
      <header>
        <p className="text-primary text-xs font-semibold tracking-[0.18em] uppercase">Étape 4/4</p>
        <h1 className="text-on-surface mt-2 text-2xl font-semibold tracking-[-0.01em]">
          Lançons votre première veille
        </h1>
        <p className="text-on-surface-variant mt-2 text-sm">
          Quelques secondes suffisent pour amorcer le pipeline. Vous pourrez ensuite affiner les
          sources et rubriques depuis le dashboard.
        </p>
      </header>

      <section className="mt-8">
        <ol className="space-y-4">
          {TIMELINE.map((step, idx) => {
            const isDone = status === 'running' ? idx < stepIdx : status === 'done'
            const isActive = status === 'running' && idx === stepIdx
            return (
              <li
                key={step.id}
                className={cn(
                  'flex items-start gap-4 rounded-xl border p-4 transition-colors',
                  isActive && 'border-primary bg-primary-fixed/30',
                  isDone && 'border-primary/60 bg-surface-container-low',
                  !isActive && !isDone && 'border-outline-variant bg-surface-container-lowest',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
                    isDone && 'border-primary bg-primary text-on-primary',
                    isActive && 'border-primary bg-primary-fixed text-on-primary-fixed-variant',
                    !isActive &&
                      !isDone &&
                      'border-outline-variant bg-surface-container text-on-surface-variant',
                  )}
                  aria-hidden="true"
                >
                  {isDone ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : isActive ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span className="text-xs font-semibold">{idx + 1}</span>
                  )}
                </span>
                <div className="flex-1">
                  <p
                    className={cn(
                      'text-sm font-semibold',
                      isActive ? 'text-primary' : 'text-on-surface',
                    )}
                  >
                    {step.label}
                  </p>
                  <p className="text-on-surface-variant mt-0.5 text-xs">{step.description}</p>
                </div>
              </li>
            )
          })}
        </ol>
      </section>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => navigate('/onboarding/configurator')}
          disabled={status !== 'idle'}
          className="text-on-surface-variant h-11 gap-2 rounded-lg"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Retour
        </Button>
        {status === 'idle' && (
          <Button
            onClick={onLaunch}
            className="bg-primary text-on-primary hover:bg-primary-container h-11 gap-2 rounded-lg px-6 font-medium"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            Lancer la pipeline
          </Button>
        )}
        {status === 'running' && (
          <span className="text-on-surface-variant inline-flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Préparation en cours…
          </span>
        )}
        {status === 'done' && (
          <Button
            onClick={() => navigate('/dashboard', { replace: true })}
            className="bg-primary text-on-primary hover:bg-primary-container h-11 gap-2 rounded-lg px-6 font-medium"
          >
            <Rocket className="h-4 w-4" aria-hidden="true" />
            Accéder au dashboard
          </Button>
        )}
      </div>
    </div>
  )
}
