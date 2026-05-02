interface ProblemStatProps {
  value: string
  label: string
  detail: string
}

function ProblemStat({ value, label, detail }: ProblemStatProps): React.ReactElement {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="text-primary-fixed-dim text-4xl font-bold tracking-[-0.02em] sm:text-5xl">
        {value}
      </span>
      <span className="mt-2 text-sm font-medium text-white/80">{label}</span>
      <span className="mt-1 text-xs text-white/50">{detail}</span>
    </div>
  )
}

export function ProblemSection(): React.ReactElement {
  return (
    <section className="bg-inverse-surface text-inverse-on-surface relative w-full overflow-hidden py-24">
      {/* Overlay gradient subtil — accent emerald sur fond slate-900 */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-900/30 via-transparent to-transparent"
        aria-hidden
      />
      <div className="relative mx-auto w-full max-w-[72rem] px-6">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-primary-fixed-dim mb-4 text-xs font-semibold tracking-[0.05em] uppercase">
            Le problème
          </p>
          <h2 className="text-3xl font-bold tracking-[-0.02em] sm:text-4xl lg:text-[42px]">
            90 % de bruit IA. 10 % de signal. 100 % de fatigue.
          </h2>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-white/70">
            Chaque jour : ~350 nouveaux papers arXiv en IA, ~12 000 tweets dans les listes que vous
            suivez, des centaines de threads Reddit. Aucun outil de veille générique ne comprend ce
            qui compte POUR VOTRE équipe.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8 border-t border-white/10 pt-12 md:grid-cols-3">
          <ProblemStat
            value="≈ 350 / j"
            label="papers déposés sur arXiv"
            detail="cs.AI · cs.CL · cs.LG"
          />
          <ProblemStat
            value="≈ 12 000 / j"
            label="tweets IA dans vos listes"
            detail="X listes tier 1 + curation perso"
          />
          <ProblemStat
            value="5 h / sem."
            label="passées à scroller au lieu de décider"
            detail="80 % de la valeur tient dans 20 % des signaux"
          />
        </div>

        <p className="mx-auto mt-12 max-w-3xl text-center text-base text-white/70">
          <span className="font-semibold text-white">
            Aucun outil de veille générique ne comprend ce qui compte POUR VOTRE équipe.
          </span>{' '}
          Feedly agrège, ChatGPT résume, Exa cherche — mais aucun ne score selon vos rubriques, ne
          cascade entre vos sources, ni ne mémorise les topics qui émergent dans VOTRE écosystème.
        </p>
      </div>
    </section>
  )
}
