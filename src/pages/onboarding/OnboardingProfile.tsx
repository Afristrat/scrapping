import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Banknote,
  Briefcase,
  Building2,
  Mail,
  Server,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { Segment } from '@/lib/pricing'
import { cn } from '@/lib/utils'

// =============================================================================
// Wave 7.5 — Onboarding étape 2 : choix du segment / profil utilisateur.
// Le segment sélectionné est passé via query string à l'étape suivante
// (le configurateur), qui peut alors pré-remplir le slider seats / mode.
// On reste stateless ici : pas de mutation Supabase, juste un choix UI.
// =============================================================================

interface SegmentCard {
  id: Segment
  title: string
  description: string
  icon: LucideIcon
}

const SEGMENT_CARDS: ReadonlyArray<SegmentCard> = [
  {
    id: 'vc_pe',
    title: 'VC / PE',
    description: 'Détecter les opportunités d’investissement avant le marché.',
    icon: Banknote,
  },
  {
    id: 'legal',
    title: 'Avocats / Compliance',
    description: 'Suivre l’AI Act et la jurisprudence émergente sans bruit.',
    icon: Briefcase,
  },
  {
    id: 'newsletter',
    title: 'Newsletter',
    description: 'Trouver les signaux dignes de votre prochaine édition.',
    icon: Mail,
  },
  {
    id: 'brand',
    title: 'Brand / Marketing',
    description: 'Capter les conversations qui façonnent votre marque.',
    icon: Sparkles,
  },
  {
    id: 'cto_sme',
    title: 'CTO / PME',
    description: 'Veille tech et concurrentielle avec le LLM de votre choix.',
    icon: Server,
  },
  {
    id: 'solo',
    title: 'Solo / Indépendant',
    description: 'L’essentiel sans exploser votre budget LLM.',
    icon: Building2,
  },
]

export default function OnboardingProfile(): React.ReactElement {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<Segment | null>(null)

  const onContinue = (): void => {
    if (!selected) return
    navigate(`/onboarding/configurator?segment=${selected}`)
  }

  return (
    <div>
      <header>
        <p className="text-primary text-xs font-semibold tracking-[0.18em] uppercase">Étape 2/4</p>
        <h1 className="text-on-surface mt-2 text-2xl font-semibold tracking-[-0.01em]">
          Quel est votre profil ?
        </h1>
        <p className="text-on-surface-variant mt-2 text-sm">
          Nous adaptons les sources, les rubriques de scoring et le pricing à votre métier.
        </p>
      </header>

      <fieldset className="mt-8">
        <legend className="sr-only">Choix du segment</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SEGMENT_CARDS.map((card) => {
            const isSelected = selected === card.id
            const Icon = card.icon
            return (
              <label
                key={card.id}
                className={cn(
                  'group flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all',
                  isSelected
                    ? 'border-primary bg-primary-fixed/30 shadow-sm'
                    : 'border-outline-variant bg-surface-container-lowest hover:border-primary/60 hover:bg-surface-container-low',
                )}
              >
                <input
                  type="radio"
                  name="segment"
                  value={card.id}
                  checked={isSelected}
                  onChange={() => setSelected(card.id)}
                  className="sr-only"
                />
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                    isSelected
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container text-on-surface-variant group-hover:bg-primary-fixed group-hover:text-on-primary-fixed-variant',
                  )}
                  aria-hidden="true"
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="flex flex-1 flex-col">
                  <span
                    className={cn(
                      'text-sm font-semibold',
                      isSelected ? 'text-on-surface' : 'text-on-surface',
                    )}
                  >
                    {card.title}
                  </span>
                  <span className="text-on-surface-variant mt-0.5 text-xs">{card.description}</span>
                </span>
                <span
                  className={cn(
                    'mt-1 h-4 w-4 shrink-0 rounded-full border',
                    isSelected
                      ? 'border-primary bg-primary ring-primary-fixed ring-2'
                      : 'border-outline-variant bg-surface-container-lowest',
                  )}
                  aria-hidden="true"
                />
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="mt-8 flex items-center justify-end gap-3">
        <Button
          onClick={onContinue}
          disabled={!selected}
          className="bg-primary text-on-primary hover:bg-primary-container h-11 rounded-lg px-6 font-medium"
        >
          Continuer
        </Button>
      </div>
    </div>
  )
}
