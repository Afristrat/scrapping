import { Brain, KeyRound, Lock, TrendingUp, Workflow } from 'lucide-react'

interface MoatCardProps {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  title: string
  pitch: string
  details: string[]
  badge: string
  badgeTone: 'delivered' | 'roadmap'
  /** Couleur d'accent du bloc icône. */
  iconTone: 'primary' | 'secondary' | 'tertiary'
  children?: React.ReactNode
  locked?: boolean
}

const ICON_TONE_CLASSES: Record<MoatCardProps['iconTone'], string> = {
  primary: 'bg-surface-container-high text-primary',
  secondary: 'bg-secondary-fixed text-on-secondary-fixed',
  tertiary: 'bg-tertiary-fixed text-on-tertiary-fixed',
}

const BADGE_TONE_CLASSES: Record<MoatCardProps['badgeTone'], string> = {
  delivered: 'bg-surface-container-high text-primary',
  roadmap: 'bg-secondary-fixed text-on-secondary-fixed-variant',
}

function MoatCard({
  icon: Icon,
  title,
  pitch,
  details,
  badge,
  badgeTone,
  iconTone,
  children,
  locked = false,
}: MoatCardProps): React.ReactElement {
  return (
    <article className="bg-surface-container-lowest border-outline-variant hover:border-primary-fixed-dim group relative flex flex-col rounded-xl border p-8 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-lg ${ICON_TONE_CLASSES[iconTone]}`}
        >
          <Icon className="h-6 w-6" aria-hidden />
        </div>
        <span
          className={`rounded px-2 py-1 text-[11px] font-semibold tracking-[0.05em] uppercase ${BADGE_TONE_CLASSES[badgeTone]}`}
        >
          {badge}
        </span>
      </div>
      {locked ? (
        <Lock
          className="text-outline-variant absolute top-8 right-8 h-4 w-4 opacity-50"
          aria-hidden
        />
      ) : null}
      <h3 className="text-on-surface group-hover:text-primary mb-3 text-2xl font-semibold tracking-[-0.01em] transition-colors">
        {title}
      </h3>
      <p className="text-on-surface-variant mb-6 flex-grow text-base leading-relaxed">{pitch}</p>
      <ul className="text-on-surface-variant mb-6 flex flex-col gap-2 text-sm">
        {details.map((d) => (
          <li key={d} className="flex items-start gap-2">
            <span className="bg-outline mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden />
            <span>{d}</span>
          </li>
        ))}
      </ul>
      {children}
    </article>
  )
}

export function MoatsSection(): React.ReactElement {
  return (
    <section className="bg-surface-container-lowest w-full py-24">
      <div className="mx-auto w-full max-w-[72rem] px-6">
        <div className="mb-16 max-w-3xl">
          <p className="text-on-surface-variant mb-3 text-xs font-semibold tracking-[0.05em] uppercase">
            Pourquoi Kairos
          </p>
          <h2 className="text-on-surface mb-4 text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            4 différenciateurs durables.
          </h2>
          <p className="text-on-surface-variant max-w-2xl text-lg leading-relaxed">
            Le scoring devient une commodité. Notre moat, c'est la mémoire longue, la composition,
            et la liberté de stack.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <MoatCard
            icon={KeyRound}
            title="10 providers LLM au choix (BYOK)"
            pitch="Apportez votre clé. Gardez le contrôle des modèles, des coûts et des données."
            details={[
              'OpenRouter, Anthropic, OpenAI, Google, Mistral, Groq, Together, DeepSeek, Moonshot, Ollama',
              'Une tâche = un modèle : scoring Sonnet, scraping Haiku, digest Opus si vous voulez',
              'Pas de marge cachée sur la consommation — vous payez votre conso réelle',
            ]}
            badge="Livré"
            badgeTone="delivered"
            iconTone="primary"
          >
            <div className="mt-auto flex flex-wrap gap-2">
              {['OpenRouter', 'Anthropic', 'OpenAI', 'Google', 'Mistral', '+5 autres'].map(
                (provider) => (
                  <span
                    key={provider}
                    className="bg-surface-container-low text-on-surface-variant rounded-full px-3 py-1 text-xs font-medium"
                  >
                    {provider}
                  </span>
                ),
              )}
            </div>
          </MoatCard>

          <MoatCard
            icon={Workflow}
            title="Cascade Compose Engine"
            pitch="Le seul moteur qui enchaîne des prompts entre sources, en cache ou à la volée."
            details={[
              'Vos prompts admin référencent {{run:reddit}}, {{run:arxiv}}, {{run:x}}',
              'Détection de cycles, profondeur max 5, cache configurable (max_age_hours)',
              'Coût et latence transparents : chaque cascade trace son chemin',
            ]}
            badge="Livré"
            badgeTone="delivered"
            iconTone="secondary"
          >
            <div className="bg-inverse-surface border-outline mt-auto overflow-x-auto rounded-lg border p-4 font-mono text-xs">
              <code className="text-primary-fixed">
                Synthèse de la semaine : {'{{run:reddit}}'} + {'{{run:arxiv}}'} + {'{{run:x}}'}
              </code>
            </div>
          </MoatCard>

          <MoatCard
            icon={TrendingUp}
            title="Topic memory 90 jours"
            pitch="Suivez les topics qui émergent dans VOS sources, avec un z-score Welford streaming."
            details={[
              'Détection des nouvelles entités (modèles, frameworks, acteurs)',
              'Courbes z-score 90 jours — pas une tendance globale, votre tendance',
              'Filtrage anti-déjà-vu : un topic chaud chez vous ≠ un topic chaud partout',
            ]}
            badge="Livré"
            badgeTone="delivered"
            iconTone="tertiary"
          >
            <div className="mt-auto flex h-16 w-full items-end gap-1 px-2" aria-hidden>
              {[
                'h-1/4',
                'h-2/4',
                'h-1/4',
                'h-3/4',
                'h-2/4',
                'h-full',
                'h-full',
                'h-3/4',
                'h-2/4',
                'h-1/4',
              ].map((h, i) => {
                const isAccent = i === 5 || i === 6
                return (
                  <div
                    key={`${h}-${i}`}
                    className={`w-1/12 ${h} rounded-t-sm ${
                      isAccent
                        ? i === 5
                          ? 'bg-primary-fixed-dim'
                          : 'bg-primary'
                        : 'bg-surface-variant'
                    }`}
                  />
                )
              })}
            </div>
          </MoatCard>

          <MoatCard
            icon={Brain}
            title="Multi-LLM consensus + Backtest"
            pitch="Trois moats supplémentaires en route — la mémoire s'accumule à mesure que vous l'utilisez."
            details={[
              "Multi-LLM consensus : quand 3 modèles sont d'accord, le score gagne en confiance",
              'Backtest des grilles : rejouez vos rubriques sur 30 j pour les calibrer',
              'Author reputation : qui dit quoi, avec quelle fiabilité historique',
            ]}
            badge="Roadmap publique"
            badgeTone="roadmap"
            iconTone="secondary"
            locked
          >
            <div className="border-surface-variant relative mt-auto flex flex-col gap-4 border-l-2 pl-2">
              {[
                { q: 'Q3 2026', label: 'Scoring multi-modèles' },
                { q: 'Q4 2026', label: 'Backtest 30 jours' },
                { q: 'Q1 2027', label: 'Trust score auteur' },
              ].map((item) => (
                <div key={item.q} className="relative pl-4">
                  <div
                    className="bg-surface-variant border-surface-container-lowest absolute top-1.5 -left-[5px] h-2 w-2 rounded-full border-2"
                    aria-hidden
                  />
                  <span className="text-on-surface block text-[11px] font-semibold tracking-[0.05em] uppercase">
                    {item.q}
                  </span>
                  <span className="text-on-surface-variant text-sm">{item.label}</span>
                </div>
              ))}
            </div>
          </MoatCard>
        </div>
      </div>
    </section>
  )
}
