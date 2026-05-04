import { useState } from 'react'
import { Plus, Rss, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  useRssFeeds,
  useAddRssFeed,
  useToggleRssFeed,
  useDeleteRssFeed,
  useRssFeedStats,
  type RssFeed,
} from '@/hooks/useRssFeeds'

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return 'Jamais'
  const diff = Date.now() - new Date(isoDate).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return "À l'instant"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `Il y a ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Il y a ${hours}h`
  const days = Math.floor(hours / 24)
  return `Il y a ${days}j`
}

function truncateUrl(url: string, maxLen = 50): string {
  if (url.length <= maxLen) return url
  return url.slice(0, maxLen) + '…'
}

function HealthBadge({ errorCount }: { errorCount: number | null }) {
  const count = errorCount ?? 0
  if (count === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
        <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
        OK
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
      <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
      {count} erreur{count > 1 ? 's' : ''}
    </span>
  )
}

function AddFeedForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const addMutation = useAddRssFeed()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !url.trim()) return
    addMutation.mutate(
      { name: name.trim(), url: url.trim() },
      {
        onSuccess: () => {
          onClose()
        },
      },
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface-container border-outline-variant mt-4 space-y-3 rounded-lg border p-4"
    >
      <div className="space-y-1.5">
        <Label
          htmlFor="rss-feed-name"
          className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase"
        >
          Nom du flux
        </Label>
        <Input
          id="rss-feed-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex : Blog OpenAI"
          disabled={addMutation.isPending}
        />
      </div>
      <div className="space-y-1.5">
        <Label
          htmlFor="rss-feed-url"
          className="text-on-surface-variant text-xs font-semibold tracking-[0.05em] uppercase"
        >
          URL RSS/Atom
        </Label>
        <Input
          id="rss-feed-url"
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://openai.com/blog/rss.xml"
          disabled={addMutation.isPending}
        />
      </div>
      {addMutation.isError && (
        <p className="text-error text-xs">
          Erreur :{' '}
          {addMutation.error instanceof Error ? addMutation.error.message : "Échec de l'ajout"}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={addMutation.isPending}
        >
          <X className="mr-1 h-4 w-4" />
          Annuler
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={addMutation.isPending || !name.trim() || !url.trim()}
          className="bg-primary text-on-primary hover:bg-primary/90"
        >
          <Plus className="mr-1 h-4 w-4" />
          {addMutation.isPending ? 'Ajout…' : 'Ajouter'}
        </Button>
      </div>
    </form>
  )
}

function FeedRow({ feed }: { feed: RssFeed }) {
  const toggleMutation = useToggleRssFeed()
  const deleteMutation = useDeleteRssFeed()

  return (
    <div className="border-outline-variant flex items-start justify-between gap-3 border-b py-4 last:border-b-0">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-on-surface truncate text-sm font-semibold">{feed.name}</span>
          <button
            type="button"
            aria-pressed={feed.active ?? true}
            onClick={() => toggleMutation.mutate({ id: feed.id, active: !(feed.active ?? true) })}
            disabled={toggleMutation.isPending}
            className={[
              'inline-flex cursor-pointer items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
              (feed.active ?? true)
                ? 'bg-primary-fixed text-on-primary-fixed'
                : 'bg-surface-container-high text-on-surface-variant',
            ].join(' ')}
          >
            {(feed.active ?? true) ? 'Actif' : 'Inactif'}
          </button>
        </div>
        <p className="text-on-surface-variant text-xs" title={feed.url}>
          {truncateUrl(feed.url)}
        </p>
        <div className="flex items-center gap-3 text-xs">
          <HealthBadge errorCount={feed.error_count} />
          <span className="text-on-surface-variant">
            Dernier fetch : {formatRelativeTime(feed.last_fetched_at)}
          </span>
          <span className="text-on-surface-variant">
            {feed.signal_count ?? 0} signal{(feed.signal_count ?? 0) !== 1 ? 'x' : ''}
          </span>
        </div>
        {feed.last_error && (feed.error_count ?? 0) > 0 && (
          <p className="text-error truncate text-xs" title={feed.last_error}>
            {feed.last_error.slice(0, 120)}
          </p>
        )}
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-on-surface-variant hover:text-error h-8 w-8 shrink-0"
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Supprimer {feed.name}</span>
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le flux</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous supprimer «&nbsp;{feed.name}&nbsp;» ? Les signaux déjà collectés ne seront
              pas supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(feed.id)}
              className="bg-error text-on-error hover:bg-error/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function RssFeedsManager() {
  const [showForm, setShowForm] = useState(false)
  const { data: feeds = [], isLoading } = useRssFeeds()
  const { activeCount, totalSignals } = useRssFeedStats(feeds)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-on-surface flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Rss className="text-primary h-5 w-5" />
            Flux RSS & Google Alerts
          </h3>
          {feeds.length > 0 && (
            <p className="text-on-surface-variant mt-0.5 text-xs">
              {activeCount} actif{activeCount !== 1 ? 's' : ''} · {totalSignals} signaux collectés
              au total
            </p>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setShowForm((v) => !v)}
          className="border-outline shrink-0"
        >
          <Plus className="mr-1 h-4 w-4" />
          Ajouter un flux
        </Button>
      </div>

      {showForm && <AddFeedForm onClose={() => setShowForm(false)} />}

      {isLoading && <p className="text-on-surface-variant text-sm">Chargement…</p>}

      {!isLoading && feeds.length === 0 && (
        <div className="border-outline-variant rounded-lg border border-dashed p-6 text-center">
          <Rss className="text-on-surface-variant mx-auto mb-2 h-8 w-8 opacity-40" />
          <p className="text-on-surface-variant text-sm">
            Aucun flux RSS configuré. Ajoutez vos premiers flux RSS ou Google Alerts.
          </p>
        </div>
      )}

      {feeds.length > 0 && (
        <div>
          {feeds.map((feed) => (
            <FeedRow key={feed.id} feed={feed} />
          ))}
        </div>
      )}

      <div className="border-outline-variant bg-surface-container rounded-lg border p-3">
        <p className="text-on-surface-variant text-xs leading-relaxed">
          <strong className="text-on-surface">Google Alerts</strong> : Créer une alerte → Afficher
          les options → Livraison : <em>Flux RSS</em> → copier l'URL ici. Format :{' '}
          <code className="bg-surface-container-high rounded px-1 py-0.5 font-mono text-[11px]">
            https://www.google.com/alerts/feeds/…
          </code>
        </p>
      </div>
    </div>
  )
}
