import { Brain, KeyRound, Layers, TrendingUp } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

interface MoatCardProps {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  title: string
  pitch: string
  details: string[]
  badge?: string
  accent: 'emerald' | 'blue' | 'orange' | 'slate'
}

const ACCENT_CLASSES: Record<MoatCardProps['accent'], string> = {
  emerald: 'bg-emerald-50 text-emerald-700',
  blue: 'bg-blue-50 text-blue-700',
  orange: 'bg-orange-50 text-orange-700',
  slate: 'bg-slate-100 text-slate-700',
}

function MoatCard({
  icon: Icon,
  title,
  pitch,
  details,
  badge,
  accent,
}: MoatCardProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-md ${ACCENT_CLASSES[accent]}`}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        {badge ? (
          <Badge variant="outline" className="border-slate-200 text-xs text-slate-600">
            {badge}
          </Badge>
        ) : null}
      </div>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="text-sm font-medium text-slate-700">{pitch}</p>
      <ul className="flex flex-col gap-1.5 text-sm text-slate-600">
        {details.map((d) => (
          <li key={d} className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" aria-hidden />
            <span>{d}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function MoatsSection(): React.ReactElement {
  return (
    <section className="border-b border-slate-100 bg-slate-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-12 max-w-3xl">
          <p className="text-sm font-semibold tracking-wider text-blue-700 uppercase">Les moats</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Pourquoi un autre agrégateur ne fait pas le travail.
          </h2>
          <p className="mt-3 text-slate-600">
            Quatre avantages structurels qui ne se rattrapent pas en quelques semaines : ils
            s'accumulent dans la donnée et la composabilité de votre tenant.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <MoatCard
            icon={KeyRound}
            title="10 providers LLM au choix (BYOK)"
            pitch="Apportez votre clé. Gardez le contrôle des modèles, des coûts et des données."
            details={[
              'OpenRouter, Anthropic, OpenAI, Mistral, Groq, Together, Fireworks, DeepSeek, xAI, Cerebras',
              'Une tâche = un modèle : scoring Sonnet, scraping Haiku, digest Opus si vous voulez',
              'Pas de marge cachée sur la consommation — vous payez votre conso réelle',
            ]}
            accent="emerald"
            badge="Disponible"
          />
          <MoatCard
            icon={Layers}
            title="Cascade {{run:<source>}}"
            pitch="Le seul Compose Engine qui enchaîne des prompts entre sources, en cache ou à la volée."
            details={[
              "Référencez la sortie d'un autre prompt dans le vôtre, profondeur jusqu'à 5",
              'Cache configurable (max_age_hours) — runs récents réutilisés sans relancer le LLM',
              "Coût et latence transparents : chaque cascade trace son chemin dans l'historique",
            ]}
            accent="blue"
            badge="Unique au marché"
          />
          <MoatCard
            icon={TrendingUp}
            title="Topic memory 90 jours"
            pitch="Suivez les topics qui émergent dans VOS sources, avec un z-score Welford streaming."
            details={[
              'Détection des nouvelles entités (modèles, frameworks, acteurs)',
              'Courbes z-score 90 jours — pas une tendance globale, votre tendance',
              'Filtrage anti-déjà-vu : un topic chaud chez vous ≠ un topic chaud partout',
            ]}
            accent="orange"
            badge="Disponible"
          />
          <MoatCard
            icon={Brain}
            title="Roadmap publique"
            pitch="Trois moats supplémentaires en route — la mémoire s'accumule à mesure que vous l'utilisez."
            details={[
              "Multi-LLM consensus : quand 3 modèles sont d'accord, le score gagne en confiance",
              'Backtest des grilles : rejouez vos rubriques sur 90 j pour les calibrer',
              'Author reputation : qui dit quoi, avec quelle fiabilité historique',
            ]}
            accent="slate"
            badge="À venir"
          />
        </div>
      </div>
    </section>
  )
}
