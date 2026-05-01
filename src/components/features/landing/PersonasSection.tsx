import { Briefcase, Code2, Megaphone, Newspaper, Rocket, Scale } from 'lucide-react'

interface Persona {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  segment: string
  headline: string
  subline: string
  maison: string
  byok: string
  unit: string
}

const PERSONAS: Persona[] = [
  {
    icon: Briefcase,
    segment: 'VC / Private equity IA',
    headline: 'Ne ratez plus un deal qui démarre sur arXiv.',
    subline:
      'Suivi de cohortes de chercheurs, alertes sur les papers à fort potentiel commercial, mémoire des acteurs émergents.',
    maison: 'à partir de 599 €',
    byok: 'à partir de 999 €',
    unit: '/seat / mois',
  },
  {
    icon: Scale,
    segment: "Cabinet d'avocats / conformité IA Act",
    headline: 'Anticipez la réglementation avant vos clients.',
    subline:
      'Sources EU AI Office curatées, cross-source legal/tech, audit log et export PDF rapports — tenant isolé en option.',
    maison: '399 €',
    byok: '699 €',
    unit: '/seat / mois',
  },
  {
    icon: Newspaper,
    segment: 'Newsletter / éditeurs IA',
    headline: 'Publiez avant TechCrunch.',
    subline:
      'Backtest illimité de vos grilles éditoriales, webhooks Slack/Teams, API read+write, branding white-label en BYOK.',
    maison: '499 €',
    byok: '799 €',
    unit: '/organisation / mois',
  },
  {
    icon: Megaphone,
    segment: 'Brand / Marketing IA-corp',
    headline: 'Vos conversations brand restent dans VOTRE infra.',
    subline:
      'Author reputation, sentiment, alerting Slack temps réel. Tenant isolé et rubriques confidentielles en BYOK.',
    maison: '499 €',
    byok: '799 €',
    unit: '/seat / mois',
  },
  {
    icon: Code2,
    segment: 'CTO / Tech Lead PME',
    headline: 'Validez vos choix techno avant 6 mois de dev.',
    subline:
      'Rubriques RAG / agents / local LLM curatées, intégration Ollama / vLLM auto-hosted en BYOK — votre infra LLM, notre filtrage.',
    maison: 'à partir de 149 €',
    byok: '249 €',
    unit: '/seat / mois (5 min.)',
  },
  {
    icon: Rocket,
    segment: 'Solo créateur IA',
    headline: 'Votre clé, votre choix de modèle.',
    subline:
      "Une rubrique, 100 signaux/jour, mémoire 30 j. Funnel d'entrée pour découvrir l'outil — essai 14 j sans carte bancaire.",
    maison: '49 €',
    byok: '99 €',
    unit: '/mois',
  },
]

function PersonaCard({ persona }: { persona: Persona }): React.ReactElement {
  const { icon: Icon, segment, headline, subline, maison, byok, unit } = persona
  return (
    <article className="flex h-full flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-900 text-white">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <p className="text-sm font-semibold tracking-wider text-slate-500 uppercase">{segment}</p>
      </div>
      <div>
        <h3 className="text-lg font-semibold text-slate-900">{headline}</h3>
        <p className="mt-2 text-sm text-slate-600">{subline}</p>
      </div>
      <div className="mt-auto flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-semibold tracking-wider text-emerald-700 uppercase">
            Maison
          </span>
          <span className="text-sm font-semibold text-slate-900">
            {maison}
            <span className="text-xs font-normal text-slate-500"> {unit}</span>
          </span>
        </div>
        <div className="h-px bg-slate-200" />
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-semibold tracking-wider text-blue-700 uppercase">BYOK</span>
          <span className="text-sm font-semibold text-slate-900">
            {byok}
            <span className="text-xs font-normal text-slate-500"> {unit}</span>
          </span>
        </div>
      </div>
    </article>
  )
}

export function PersonasSection(): React.ReactElement {
  return (
    <section className="border-b border-slate-100">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-12 max-w-3xl">
          <p className="text-sm font-semibold tracking-wider text-slate-500 uppercase">
            Cas d'usage
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Six segments, deux modes — un tarif transparent par profil.
          </h2>
          <p className="mt-3 text-slate-600">
            Choisissez le mode Maison (LLM inclus, zéro friction) ou BYOK (vos clés, votre stack,
            votre souveraineté). Le tarif d'entrée est affiché par seat ou par organisation selon le
            segment.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {PERSONAS.map((p) => (
            <PersonaCard key={p.segment} persona={p} />
          ))}
        </div>
      </div>
    </section>
  )
}
