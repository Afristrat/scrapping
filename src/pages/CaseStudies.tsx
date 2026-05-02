import {
  ArrowRight,
  Briefcase,
  Code2,
  Mail,
  Megaphone,
  Newspaper,
  Rocket,
  Scale,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const CONTACT_EMAIL = 'contact@kairos.ai-mpower.com'

interface Stat {
  label: string
  value: string
}

interface CaseStudy {
  slug: string
  client: string
  persona: 'VC' | 'Avocat' | 'Newsletter' | 'Brand' | 'CTO' | 'Solo'
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  title: string
  excerpt: string
  stats: [Stat, Stat, Stat]
}

const CASE_STUDIES: CaseStudy[] = [
  {
    slug: 'acme-vc',
    client: 'Acme Ventures',
    persona: 'VC',
    icon: Briefcase,
    title: 'Comment Acme VC a accéléré son deal sourcing 3x avec Kairos',
    excerpt:
      'Avec une équipe de 6 analystes et un univers de 30 chercheurs IA à monitorer, Acme passait 12 h par semaine à scanner arXiv et X. Kairos a réduit ce temps à 3 h tout en remontant 2x plus de signaux faibles pertinents.',
    stats: [
      { label: 'Temps gagné/sem.', value: '-75 %' },
      { label: 'Signaux faibles détectés', value: '+110 %' },
      { label: 'Deals sourcés/trimestre', value: '×3' },
    ],
  },
  {
    slug: 'cabinet-lextria',
    client: 'Cabinet Lextria',
    persona: 'Avocat',
    icon: Scale,
    title: "Lextria anticipe l'AI Act 8 mois avant ses clients grâce à Kairos",
    excerpt:
      'Cabinet de 14 avocats spécialisés en droit du numérique. Kairos curate les sources EU AI Office, CNIL et arXiv en cross-source legal/tech. Audit log activé, exports PDF intégrés à leur workflow Notion.',
    stats: [
      { label: 'Sources monitorées', value: '120+' },
      { label: 'Briefs hebdo générés', value: '52/an' },
      { label: 'ROI sur 12 mois', value: '8,4×' },
    ],
  },
  {
    slug: 'newsletter-frontiers',
    client: 'AI Frontiers Weekly',
    persona: 'Newsletter',
    icon: Newspaper,
    title: 'AI Frontiers Weekly publie en moyenne 36 h avant TechCrunch',
    excerpt:
      'Newsletter IA hebdomadaire de 28 000 abonnés. La rédactrice en chef utilise Kairos pour backtest sa grille éditoriale et identifier les sujets émergents. Webhooks Slack pour alerting temps réel sur les pics de signaux.',
    stats: [
      { label: 'Avance moyenne sur la presse', value: '36 h' },
      { label: "Taux d'ouverture newsletter", value: '+18 %' },
      { label: 'Backtest mensuel', value: 'Illimité' },
    ],
  },
  {
    slug: 'brand-zenith',
    client: 'Zenith Cosmetics',
    persona: 'Brand',
    icon: Megaphone,
    title: 'Zenith détecte une crise réputationnelle 6 h avant son pic viral',
    excerpt:
      'Marque cosmétique premium, équipe brand de 4 personnes. Tenant isolé Kairos en BYOK Sonnet pour conformité RGPD strict. Author Reputation API + alerting Slack temps réel sur 22 handles influenceurs.',
    stats: [
      { label: 'Détection avant pic viral', value: '-6 h' },
      { label: 'Temps de réaction PR', value: '-65 %' },
      { label: 'Coût LLM/mois', value: '< 80 €' },
    ],
  },
  {
    slug: 'cto-modulo',
    client: 'Modulo Tech',
    persona: 'CTO',
    icon: Code2,
    title: 'Modulo a évité 6 mois de dev en validant son archi RAG via Kairos',
    excerpt:
      'PME tech de 35 ingénieurs, CTO seul utilisateur. Rubriques RAG / agents / local LLM curatées, intégration Ollama auto-hosted en BYOK. Décision stack vLLM prise en 3 semaines au lieu de 6 mois d’itération.',
    stats: [
      { label: 'Temps de décision archi', value: '-83 %' },
      { label: 'Veille techno automatisée', value: '100 %' },
      { label: 'Coût/mois (BYOK Ollama)', value: '0 €' },
    ],
  },
  {
    slug: 'solo-claire',
    client: 'Claire D., consultante IA solo',
    persona: 'Solo',
    icon: Rocket,
    title: 'Claire transforme sa veille perso en avantage commercial mesurable',
    excerpt:
      'Consultante indépendante, 1 seul siège Solo + LLM Maison Haiku. Utilise Kairos pour rédiger ses propositions, prep ses calls avec prospects et son podcast hebdo. Pricing 49 €/mois remboursé dès le 1er deal.',
    stats: [
      { label: 'Heures veille/sem.', value: '-70 %' },
      { label: 'Signal-to-noise ratio', value: '×4,2' },
      { label: 'Payback Kairos', value: '< 1 mois' },
    ],
  },
]

interface CaseStudyCardProps {
  caseStudy: CaseStudy
}

function CaseStudyCard({ caseStudy }: CaseStudyCardProps): React.ReactElement {
  const Icon = caseStudy.icon
  return (
    <article className="flex h-full flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-700">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="flex flex-col gap-1">
          <Badge variant="secondary">{caseStudy.persona}</Badge>
          <span className="text-xs text-slate-500">{caseStudy.client}</span>
        </div>
      </div>

      <h3 className="text-lg leading-snug font-semibold tracking-tight text-slate-900">
        {caseStudy.title}
      </h3>

      <p className="text-sm leading-relaxed text-slate-600">{caseStudy.excerpt}</p>

      <dl className="grid grid-cols-3 gap-3 rounded-lg bg-slate-50 p-3">
        {caseStudy.stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1 text-center">
            <dt className="text-xs text-slate-500">{stat.label}</dt>
            <dd className="text-base font-semibold text-emerald-700">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        <span className="inline-flex items-center gap-1 text-xs text-slate-500 italic">
          <TrendingUp className="h-3.5 w-3.5" aria-hidden />
          Étude détaillée à venir
        </span>
      </div>
    </article>
  )
}

export default function CaseStudies(): React.ReactElement {
  return (
    <div className="bg-white">
      <section className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Études de cas
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
            Six profils. Six manières d'utiliser Kairos. Un seul bénéfice : du temps gagné.
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Découvrez comment des VC, cabinets d'avocats, éditeurs, brands, CTOs et consultants
            indépendants utilisent Kairos pour reprendre le contrôle de leur signal-to-noise sur
            l'IA. Études détaillées en préparation — la base de chiffres ci-dessous est un agrégat
            représentatif des bêta-testeurs.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {CASE_STUDIES.map((cs) => (
            <CaseStudyCard key={cs.slug} caseStudy={cs} />
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-sm font-semibold tracking-wider text-slate-500 uppercase">
            Vous voulez être notre prochain case study ?
          </p>
          <h2 className="max-w-2xl text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            Nous cherchons 3 clients design partners pour publier des études détaillées en 2026.
          </h2>
          <p className="max-w-2xl text-slate-600">
            Tarif préférentiel, accès prioritaire aux features Wave 7 (Author Reputation API,
            Multi-LLM consensus), co-rédaction de l'étude avec votre équipe. Écrivez-nous.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Button asChild className="gap-2">
              <a href={`mailto:${CONTACT_EMAIL}?subject=Kairos%20-%20Design%20partner`}>
                <Mail className="h-4 w-4" aria-hidden />
                {CONTACT_EMAIL}
              </a>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link to="/pricing">
                Voir le pricing
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
