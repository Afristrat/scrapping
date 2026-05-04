import type { SourceHealth } from '@/hooks/useSourceHealth'

interface Props {
  health: SourceHealth
  /** Message affiché pour le statut 'static' (ex: "Catégorie validée") */
  staticLabel?: string
}

/**
 * Badge inline indiquant la santé d'une source configurée.
 * Conçu pour s'afficher à côté d'un tag de source (subreddit, flux RSS…).
 */
export function SourceHealthBadge({ health, staticLabel = 'Validé' }: Props) {
  const { status, detail } = health

  switch (status) {
    case 'checking':
      return (
        <span
          className="text-on-surface-variant inline-flex items-center gap-1 text-xs"
          title="Vérification en cours…"
        >
          <span className="bg-on-surface-variant/50 inline-block h-2 w-2 animate-ping rounded-full" />
          Vérification…
        </span>
      )

    case 'ok':
      return (
        <span
          className="inline-flex items-center gap-1 text-xs font-medium text-green-600"
          title="Source active et accessible"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
          Actif
        </span>
      )

    case 'warn':
      return (
        <span
          className="inline-flex items-center gap-1 text-xs font-medium text-amber-600"
          title={detail ?? 'Avertissement'}
        >
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
          {detail ? `Avertissement (${detail})` : 'Avertissement'}
        </span>
      )

    case 'error':
      return (
        <span
          className="inline-flex items-center gap-1 text-xs font-medium text-red-600"
          title={detail ?? 'Inaccessible'}
        >
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
          {detail ?? 'Inaccessible'}
        </span>
      )

    case 'static':
      return (
        <span
          className="text-on-surface-variant inline-flex items-center gap-1 text-xs"
          title={staticLabel}
        >
          <span className="bg-on-surface-variant/40 inline-block h-2 w-2 rounded-full" />
          {staticLabel}
        </span>
      )

    default:
      return null
  }
}
