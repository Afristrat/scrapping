import { Filter, Newspaper, Sliders } from 'lucide-react'

interface StepCardProps {
  step: number
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  title: string
  description: string
  highlights: string[]
}

function StepCard({
  step,
  icon: Icon,
  title,
  description,
  highlights,
}: StepCardProps): React.ReactElement {
  return (
    <article className="bg-surface-container-lowest border-outline-variant hover:border-primary-fixed-dim group flex flex-col gap-5 rounded-xl border p-8 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center justify-between">
        <div className="bg-primary-fixed text-on-primary-fixed-variant group-hover:bg-primary-fixed-dim flex h-12 w-12 items-center justify-center rounded-lg transition-colors">
          <Icon className="h-6 w-6" aria-hidden />
        </div>
        <span className="bg-surface-container-high text-primary rounded-full px-2.5 py-1 text-xs font-semibold tracking-[0.05em]">
          ÉTAPE {step}
        </span>
      </div>
      <h3 className="text-on-surface group-hover:text-primary text-2xl font-semibold tracking-[-0.01em] transition-colors">
        {title}
      </h3>
      <p className="text-on-surface-variant text-base leading-relaxed">{description}</p>
      <ul className="text-on-surface-variant mt-1 flex flex-col gap-2 text-sm">
        {highlights.map((h) => (
          <li key={h} className="flex items-start gap-2">
            <span className="bg-primary mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden />
            <span>{h}</span>
          </li>
        ))}
      </ul>
    </article>
  )
}

export function SolutionSteps(): React.ReactElement {
  return (
    <section className="bg-surface-container-low border-outline-variant border-b py-24">
      <div className="mx-auto w-full max-w-[72rem] px-6">
        <div className="mb-16 text-center">
          <p className="text-on-surface-variant mb-3 text-xs font-semibold tracking-[0.05em] uppercase">
            La solution Kairos
          </p>
          <h2 className="text-on-surface text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            3 étapes pour transformer le bruit en signal qualifié.
          </h2>
          <p className="text-on-surface-variant mx-auto mt-4 max-w-2xl text-lg leading-relaxed">
            Branchez vos sources, calibrez votre scoring, recevez votre digest. Le reste tourne en
            background, dans votre langue, pour votre équipe.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <StepCard
            step={1}
            icon={Filter}
            title="Agrégation multi-sources"
            description="X via listes dédiées, Reddit via subs paramétrables, arXiv via catégories sélectionnées. Branchez ce que vous suivez déjà — pas de migration."
            highlights={[
              '192 handles X par défaut, listes privées au choix',
              '35 subreddits IA curatés (r/MachineLearning, r/LocalLLaMA…)',
              '8 catégories arXiv (cs.AI, cs.CL, cs.LG, stat.ML…)',
            ]}
          />
          <StepCard
            step={2}
            icon={Sliders}
            title="Scoring custom — Maison ou BYOK"
            description="Chaque signal noté de 0 à 100 selon VOS rubriques. Choisissez le LLM Maison tout-inclus, ou apportez vos clés (10 providers)."
            highlights={[
              'Maison Sonnet inclus, ou BYOK Anthropic / OpenAI / Mistral / 7 autres',
              'Rubriques versionnées : VC, R&D, conformité, brand…',
              'Cascade {{run:<source>}} — synthèses transversales uniques au marché',
            ]}
          />
          <StepCard
            step={3}
            icon={Newspaper}
            title="Digest 80/20 multi-langues"
            description="Synthèse quotidienne actionnable, en français, anglais ou espagnol. Avec topics émergents et déjà-vus filtrés."
            highlights={[
              'Top signaux du jour + commentaires LLM',
              'Topics émergents 90 jours (z-score Welford)',
              'Export Slack / email / API — au format de votre équipe',
            ]}
          />
        </div>
      </div>
    </section>
  )
}
