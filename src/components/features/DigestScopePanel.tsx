import { useState } from 'react'
import { Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTopicsTaxonomy } from '@/hooks/useTopicsTaxonomy'
import { usePersonas } from '@/hooks/usePersonas'
import type { DigestLanguage } from '@/hooks/useDigest'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DigestScope {
  topicIds: string[]
  personaIds: string[]
  sources: string[]
  customAngle: string
  language: DigestLanguage
  windowHours: number
  minScore: number | null
  prioritize: 'score' | 'freshness'
}

export interface DigestScopeProps {
  onGenerate: (scope: DigestScope) => void
  isGenerating: boolean
  defaultLanguage?: DigestLanguage
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const WINDOW_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 24, label: '24 h' },
  { value: 24 * 7, label: '7 j' },
  { value: 24 * 30, label: '30 j' },
  { value: 24 * 90, label: '90 j' },
]

const SOURCE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'x', label: 'X / Twitter' },
  { key: 'reddit', label: 'Reddit' },
  { key: 'arxiv', label: 'arXiv' },
  { key: 'rss', label: 'RSS' },
]

/** Coût approximatif par signal (en euros). */
const COST_PER_SIGNAL_EUR = 0.002

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export function DigestScopePanel({
  onGenerate,
  isGenerating,
  defaultLanguage = 'fr',
}: DigestScopeProps): React.ReactElement {
  const { data: topics = [], isLoading: topicsLoading } = useTopicsTaxonomy()
  const { data: personas = [], isLoading: personasLoading } = usePersonas()

  // --- État local ---
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([])
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('none')
  const [selectedSources, setSelectedSources] = useState<string[]>(['x', 'reddit', 'arxiv'])
  const [windowHours, setWindowHours] = useState<number>(24)
  const [minScoreRaw, setMinScoreRaw] = useState<string>('')
  const [prioritize, setPrioritize] = useState<'score' | 'freshness'>('score')
  const [customAngle, setCustomAngle] = useState<string>('')
  // defaultLanguage utilisé comme valeur initiale uniquement.
  // L'utilisateur peut ensuite changer la langue librement dans le panneau.
  const [language, setLanguage] = useState<DigestLanguage>(defaultLanguage)

  // --- Calculs dérivés ---
  const parsedMinScore = minScoreRaw === '' ? null : Number(minScoreRaw)
  const hasTopicOrPersona =
    selectedTopicIds.length > 0 || (selectedPersonaId !== 'none' && selectedPersonaId !== '')

  /** Estimation grossière : nb de signaux ≈ (windowHours / 24) * 50 */
  const estimatedSignals = Math.round((windowHours / 24) * 50)
  const estimatedCostEur = (estimatedSignals * COST_PER_SIGNAL_EUR).toFixed(2)

  // --- Handlers ---
  const toggleTopic = (id: string): void => {
    setSelectedTopicIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    )
  }

  const toggleSource = (key: string): void => {
    setSelectedSources((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key],
    )
  }

  const handleGenerate = (): void => {
    const scope: DigestScope = {
      topicIds: selectedTopicIds,
      personaIds: selectedPersonaId !== 'none' ? [selectedPersonaId] : [],
      sources: selectedSources,
      customAngle: customAngle.trim(),
      language,
      windowHours,
      minScore: parsedMinScore,
      prioritize,
    }
    onGenerate(scope)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Card
      className="border-outline-variant bg-surface-container-lowest rounded-xl shadow-sm"
      data-testid="digest-scope-panel"
    >
      <CardContent className="space-y-5 py-5">
        {/* ---- Topics ---- */}
        <div className="flex flex-col gap-2">
          <span className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase">
            Topics
          </span>
          {topicsLoading ? (
            <span className="text-on-surface-variant text-xs">Chargement…</span>
          ) : topics.length === 0 ? (
            <span className="text-on-surface-variant text-xs">Aucun topic configuré</span>
          ) : (
            <div className="flex flex-wrap gap-2" data-testid="topics-list">
              {topics.map((topic) => {
                const active = selectedTopicIds.includes(topic.id)
                return (
                  <Badge
                    key={topic.id}
                    variant={active ? 'default' : 'outline'}
                    className={`cursor-pointer transition-colors select-none ${
                      active
                        ? 'bg-primary text-on-primary border-primary'
                        : 'border-outline-variant text-on-surface-variant hover:border-outline hover:text-on-surface'
                    }`}
                    onClick={() => toggleTopic(topic.id)}
                    data-testid={`topic-badge-${topic.id}`}
                    role="checkbox"
                    aria-checked={active}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleTopic(topic.id)
                      }
                    }}
                  >
                    {topic.name}
                  </Badge>
                )
              })}
            </div>
          )}
        </div>

        {/* ---- Persona ---- */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="scope-persona"
            className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase"
          >
            Persona
          </label>
          {personasLoading ? (
            <span className="text-on-surface-variant text-xs">Chargement…</span>
          ) : (
            <Select value={selectedPersonaId} onValueChange={setSelectedPersonaId}>
              <SelectTrigger id="scope-persona" className="w-56">
                <SelectValue placeholder="Aucune persona" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucune persona</SelectItem>
                {personas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* ---- Sources ---- */}
        <div className="flex flex-col gap-2">
          <span className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase">
            Sources
          </span>
          <div className="flex flex-wrap gap-2">
            {SOURCE_OPTIONS.map((src) => {
              const active = selectedSources.includes(src.key)
              return (
                <button
                  key={src.key}
                  type="button"
                  onClick={() => toggleSource(src.key)}
                  data-testid={`source-toggle-${src.key}`}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
                    active
                      ? 'bg-secondary-container text-on-secondary-container border-secondary-container'
                      : 'border-outline-variant text-on-surface-variant hover:border-outline hover:text-on-surface'
                  }`}
                  aria-pressed={active}
                >
                  {src.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ---- Fenêtre + Langue (ligne) ---- */}
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="scope-window"
              className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase"
            >
              Fenêtre
            </label>
            <Select value={String(windowHours)} onValueChange={(v) => setWindowHours(Number(v))}>
              <SelectTrigger id="scope-window" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOW_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="scope-language"
              className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase"
            >
              Langue
            </label>
            <Select value={language} onValueChange={(v) => setLanguage(v as DigestLanguage)}>
              <SelectTrigger id="scope-language" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Español</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="scope-min-score"
              className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase"
            >
              Score min
            </label>
            <input
              id="scope-min-score"
              type="number"
              min={0}
              max={100}
              value={minScoreRaw}
              onChange={(e) => setMinScoreRaw(e.target.value)}
              placeholder="Aucun filtre"
              data-testid="min-score-input"
              className="border-input bg-background text-on-surface placeholder:text-on-surface-variant focus-visible:ring-primary w-28 rounded-md border px-3 py-1.5 text-sm focus:outline-none focus-visible:ring-2"
            />
          </div>
        </div>

        {/* ---- Priorité ---- */}
        <div className="flex flex-col gap-2">
          <span className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase">
            Priorité
          </span>
          <div className="flex gap-4">
            {(
              [
                { value: 'score', label: 'Privilégier score' },
                { value: 'freshness', label: 'Privilégier fraîcheur' },
              ] as const
            ).map((opt) => (
              <label key={opt.value} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="scope-prioritize"
                  value={opt.value}
                  checked={prioritize === opt.value}
                  onChange={() => setPrioritize(opt.value)}
                  className="accent-primary"
                  data-testid={`prioritize-${opt.value}`}
                />
                <span className="text-on-surface">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* ---- Angle / question ---- */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="scope-angle"
            className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase"
          >
            Angle / question (optionnel)
          </label>
          <textarea
            id="scope-angle"
            rows={2}
            value={customAngle}
            onChange={(e) => setCustomAngle(e.target.value)}
            placeholder="Ex : Focus sur les applications enterprise…"
            data-testid="custom-angle-textarea"
            className="border-input bg-background text-on-surface placeholder:text-on-surface-variant focus-visible:ring-primary w-full resize-none rounded-md border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
          />
        </div>

        {/* ---- Estimation coût + Bouton ---- */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
          <p
            className="text-on-surface-variant text-xs"
            data-testid="cost-estimate"
            aria-live="polite"
          >
            ~{estimatedSignals} signaux dans la fenêtre · ~{estimatedCostEur} € estimé
          </p>

          <div className="flex flex-col items-end gap-1">
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={!hasTopicOrPersona || isGenerating}
              data-testid="generate-button"
              className="bg-primary text-on-primary hover:bg-primary-container gap-2 shadow-sm"
            >
              <Sparkles
                className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              {isGenerating ? 'Génération en cours…' : 'Générer le brief'}
            </Button>
            {!hasTopicOrPersona && (
              <p className="text-on-surface-variant text-xs" role="alert">
                Sélectionne au moins 1 topic ou 1 persona
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
