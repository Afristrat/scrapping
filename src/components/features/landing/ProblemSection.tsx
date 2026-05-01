import { AlertTriangle, BellOff, Clock4 } from 'lucide-react'

interface ProblemStatProps {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  value: string
  label: string
  detail: string
}

function ProblemStat({ icon: Icon, value, label, detail }: ProblemStatProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-6">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-orange-50 text-orange-600">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <p className="text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <p className="text-sm text-slate-500">{detail}</p>
    </div>
  )
}

export function ProblemSection(): React.ReactElement {
  return (
    <section className="border-b border-slate-100 bg-slate-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-10 max-w-3xl">
          <p className="text-sm font-semibold tracking-wider text-orange-600 uppercase">
            Le problème
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            90 % de bruit IA. 10 % de signal. 100 % de fatigue.
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Chaque jour, votre équipe se noie dans des centaines de threads, papers et posts. Aucun
            outil de veille générique ne sait distinguer ce qui compte pour VOTRE organisation de ce
            qui buzze pour le grand public.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <ProblemStat
            icon={AlertTriangle}
            value="≈ 350 / jour"
            label="papers déposés sur arXiv (cs.AI + cs.CL + cs.LG)"
            detail="Impossible à trier sans critères propres à votre thèse d'investissement ou votre roadmap."
          />
          <ProblemStat
            icon={BellOff}
            value="≈ 12 000 / jour"
            label="tweets IA dans les listes que vous suivez"
            detail="Feedly, Twitter listes, Slack RSS : tout est agrégé, rien n'est priorisé selon vos enjeux."
          />
          <ProblemStat
            icon={Clock4}
            value="5 h / sem."
            label="passées à scroller au lieu de décider"
            detail="Et pourtant, 80 % de la valeur tient dans 20 % des signaux — encore faut-il les retrouver."
          />
        </div>

        <p className="mt-10 max-w-3xl text-base text-slate-700">
          <span className="font-semibold">
            Aucun outil de veille générique ne comprend ce qui compte POUR VOTRE équipe.
          </span>{' '}
          Feedly agrège, ChatGPT résume, Exa cherche — mais aucun ne score selon vos rubriques, ne
          cascade entre vos sources, ni ne mémorise les topics qui émergent dans VOTRE écosystème.
        </p>
      </div>
    </section>
  )
}
