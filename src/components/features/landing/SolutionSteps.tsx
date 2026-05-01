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
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-sm font-semibold text-emerald-700">
          {step}
        </span>
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-900 text-white">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-600">{description}</p>
      <ul className="mt-1 flex flex-col gap-1.5 text-sm text-slate-700">
        {highlights.map((h) => (
          <li key={h} className="flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
            <span>{h}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SolutionSteps(): React.ReactElement {
  return (
    <section className="border-b border-slate-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-12 max-w-2xl">
          <p className="text-sm font-semibold tracking-wider text-emerald-600 uppercase">
            La solution
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Trois étapes — du flux brut au brief décisionnel.
          </h2>
          <p className="mt-3 text-slate-600">
            Branchez vos sources, calibrez votre scoring, recevez votre digest. Le reste tourne en
            background, dans votre langue, pour votre équipe.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <StepCard
            step={1}
            icon={Filter}
            title="Agrégation multi-sources"
            description="X, Reddit et arXiv en parallèle, dédupliqués, normalisés. Branchez ce que vous suivez déjà — pas de migration."
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
            description="Chaque signal est noté de 0 à 100 selon VOS rubriques. Choisissez le LLM Maison tout-inclus, ou apportez vos clés (10 providers)."
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
