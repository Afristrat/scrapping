import { ChevronDown } from 'lucide-react'

interface FaqItem {
  q: string
  a: React.ReactNode
}

const FAQ: FaqItem[] = [
  {
    q: 'Pourquoi Maison vs BYOK ?',
    a: (
      <>
        <p>
          <span className="font-semibold">Mode Maison</span> = simplicité. Notre Sonnet est inclus,
          vous ne gérez ni clés ni quotas. Idéal pour démarrer vite et garder une expérience
          intégrée.
        </p>
        <p className="mt-2">
          <span className="font-semibold">Mode BYOK</span> = souveraineté. Vos clés Anthropic /
          OpenAI / Mistral, votre Opus si vous voulez, vos données qui ne quittent pas votre tenant.
          Le BYOK est plus cher car il s'adresse aux acteurs avec budget tooling enterprise et
          exigence de contrôle — pas parce que ça nous coûte plus.
        </p>
      </>
    ),
  },
  {
    q: 'Pourquoi pas Feedly, Inoreader ou un agrégateur RSS ?',
    a: (
      <p>
        Feedly agrège, mais ne score pas selon VOS critères. Kairos n'est pas un agrégateur : c'est
        un scoreur LLM custom + cascade transversale + topic memory 90 jours. Vous gardez le flux
        brut, mais vous obtenez un classement aligné sur vos rubriques d'investissement, de veille
        techno ou de conformité.
      </p>
    ),
  },
  {
    q: 'Combien ça coûte vraiment en LLM (mode BYOK) ?',
    a: (
      <p>
        Vous payez VOTRE consommation directement à votre provider (OpenRouter, Anthropic, OpenAI,
        etc.). Pas de marge cachée chez nous. Pour un usage type ~700 signaux scorés par jour,
        comptez environ 3 €/mois en Haiku (économique) à 15 €/mois en Sonnet (premium). Opus dépasse
        200 €/mois — réservé aux deals VC ou aux audits IA Act.
      </p>
    ),
  },
  {
    q: 'Mes données sont-elles sécurisées ?',
    a: (
      <p>
        Oui. Postgres avec Row Level Security (RLS) activé sur toutes les tables, vos clés BYOK ne
        quittent pas votre tenant, tenant isolé en option (Pro+) et self-host Docker en Enterprise.
        Hébergement EU disponible. Aucune donnée n'est mutualisée entre tenants.
      </p>
    ),
  },
  {
    q: 'Mon équipe / mon organisation est-elle éligible ?',
    a: (
      <p>
        Oui. Le multi-tenant org-level avec billing par organisation arrive Wave 6 (Q3 2026). En
        attendant, un tenant par organisation, auth multi-méthodes (magic link + OAuth), partage de
        rubriques au sein de l'équipe. Les seats Pro et Enterprise sont déjà supportés via le
        configurateur.
      </p>
    ),
  },
]

function FaqEntry({ q, a }: FaqItem): React.ReactElement {
  return (
    <details className="group rounded-xl border border-slate-200 bg-white p-5 open:shadow-sm">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-base font-semibold text-slate-900">
        <span>{q}</span>
        <ChevronDown
          className="mt-1 h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="mt-3 text-sm leading-relaxed text-slate-600">{a}</div>
    </details>
  )
}

export function FAQSection(): React.ReactElement {
  return (
    <section id="faq" className="border-b border-slate-100">
      <div className="mx-auto w-full max-w-4xl px-4 py-20 sm:px-6">
        <div className="mb-10">
          <p className="text-sm font-semibold tracking-wider text-slate-500 uppercase">FAQ</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Les questions qu'on nous pose avant signature.
          </h2>
        </div>

        <div className="flex flex-col gap-3">
          {FAQ.map((item) => (
            <FaqEntry key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
      </div>
    </section>
  )
}
