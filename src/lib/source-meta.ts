import type { LucideIcon } from 'lucide-react'
import { AtSign, FileText, MessageSquare } from 'lucide-react'

export type SignalSource = 'reddit' | 'arxiv' | 'x'

export const SOURCES: SignalSource[] = ['reddit', 'arxiv', 'x']

export const SOURCE_META: Record<
  SignalSource,
  { label: string; badgeClass: string; Icon: LucideIcon }
> = {
  reddit: {
    label: 'Reddit',
    badgeClass: 'bg-orange-100 text-orange-800 hover:bg-orange-200',
    Icon: MessageSquare,
  },
  arxiv: {
    label: 'Arxiv',
    badgeClass: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
    Icon: FileText,
  },
  x: {
    label: 'X',
    badgeClass: 'bg-slate-100 text-slate-800 hover:bg-slate-200',
    Icon: AtSign,
  },
}
