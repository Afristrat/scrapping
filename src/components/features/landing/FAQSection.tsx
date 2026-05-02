import { ChevronDown } from 'lucide-react'

interface FaqItem {
  q: string
  a: React.ReactNode
}

const FAQ: FaqItem[] = [
  {
    q: 'Pourquoi BYOK est-il plus cher que Maison ?',
    a: (
      <>
        <p>
          La différence de prix s'explique par le contrôle et la souveraineté.{' '}
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
        Feedly et Inoreader agrègent et affichent des flux d'information de manière chronologique.
        Kairos va beaucoup plus loin : c'est un scoreur LLM custom + cascade transversale + topic
        memory 90 jours. Vous gardez le flux brut, mais vous obtenez un classement aligné sur vos
        rubriques d'investissement, de veille techno ou de conformité.
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
    <details className="group border-outline-variant hover:bg-surface-container-low rounded-xl border-b p-2 transition-colors duration-150">
      <summary className="text-on-surface group-open:text-primary flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-3 text-lg font-semibold tracking-[-0.01em] focus:outline-none">
        <span>{q}</span>
        <ChevronDown
          className="text-outline h-5 w-5 shrink-0 transition-transform duration-300 group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="text-on-surface-variant px-2 py-4 text-base leading-relaxed">{a}</div>
    </details>
  )
}

export function FAQSection(): React.ReactElement {
  return (
    <section id="faq" className="bg-surface-container-lowest border-outline-variant border-b py-24">
      <div className="mx-auto w-full max-w-3xl px-6">
        <div className="mb-12 text-center">
          <p className="text-outline mb-3 text-xs font-semibold tracking-[0.05em] uppercase">
            Foire aux questions
          </p>
          <h2 className="text-on-surface text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            Les 5 questions qu'on nous pose.
          </h2>
        </div>

        <div className="space-y-4">
          {FAQ.map((item) => (
            <FaqEntry key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
      </div>
    </section>
  )
}
