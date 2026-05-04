import type { LucideIcon } from 'lucide-react'
import { AtSign, FileText, MessageSquare, Rss } from 'lucide-react'

export type SignalSource = 'reddit' | 'arxiv' | 'x' | 'rss'

export const SOURCES: SignalSource[] = ['reddit', 'arxiv', 'x', 'rss']

export const SOURCE_META: Record<
  SignalSource,
  { label: string; badgeClass: string; Icon: LucideIcon }
> = {
  reddit: {
    label: 'Reddit',
    badgeClass: 'bg-tertiary-fixed text-on-tertiary-fixed hover:bg-tertiary-fixed-dim',
    Icon: MessageSquare,
  },
  arxiv: {
    label: 'Arxiv',
    badgeClass: 'bg-primary-fixed text-on-primary-fixed hover:bg-primary-fixed-dim',
    Icon: FileText,
  },
  x: {
    label: 'X',
    badgeClass: 'bg-secondary-fixed text-on-secondary-fixed hover:bg-secondary-fixed-dim',
    Icon: AtSign,
  },
  rss: {
    label: 'RSS',
    badgeClass: 'bg-error-container text-on-error-container hover:bg-error/20',
    Icon: Rss,
  },
}
