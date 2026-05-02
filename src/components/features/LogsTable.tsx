import { Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { format } from 'date-fns'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { LogRow } from '@/hooks/useLogs'

const STATUS_CLASS: Record<string, string> = {
  ok: 'bg-primary-fixed text-on-primary-fixed',
  error: 'bg-error-container text-on-error-container',
  degraded: 'bg-tertiary-fixed text-on-tertiary-fixed',
  start: 'bg-surface-variant text-on-surface-variant',
  info: 'bg-secondary-fixed text-on-secondary-fixed',
}

interface Props {
  rows: LogRow[] | undefined
  isLoading: boolean
}

function serializeRow(r: LogRow): string {
  const ts = format(new Date(r.ts), 'yyyy-MM-dd HH:mm:ss')
  const payload = r.payload ? JSON.stringify(r.payload, null, 2) : '(no payload)'
  return `[${ts}] action=${r.action} status=${r.status ?? '—'}\n${payload}`
}

function serializeAll(rows: LogRow[]): string {
  return rows.map(serializeRow).join('\n\n' + '─'.repeat(60) + '\n\n')
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback for older browsers / non-secure contexts
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  }
}

function CopyButton({ text, label = 'Copier' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-7 gap-1.5 text-xs"
      onClick={async () => {
        const ok = await copyToClipboard(text)
        if (ok) {
          setCopied(true)
          toast.success('Copié dans le presse-papier')
          setTimeout(() => setCopied(false), 1500)
        } else {
          toast.error('Copie impossible')
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copié' : label}
    </Button>
  )
}

/** Extract a one-line preview of an error from the payload, even if nested. */
function errorPreview(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null
  const summary = payload.summary
  if (typeof summary === 'string') return summary
  const message = payload.message
  if (typeof message === 'string') return message
  const error = payload.error
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const m = (error as Record<string, unknown>).message
    if (typeof m === 'string') return m
  }
  // Legacy "[object Object]" sniff: still surface a hint
  if (typeof error === 'string' && error.includes('[object Object]')) {
    return 'Erreur non sérialisée (mettre à jour la fonction edge avec formatError)'
  }
  return null
}

export function LogsTable({ rows, isLoading }: Props) {
  if (isLoading)
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  if (!rows || rows.length === 0)
    return (
      <div className="border-outline-variant bg-surface-container-low text-on-surface-variant rounded-xl border border-dashed p-8 text-center text-sm">
        Pas de logs (purgés &lt; 24h)
      </div>
    )

  return (
    <div className="space-y-2">
      <div className="border-outline-variant bg-surface-container-lowest flex items-center justify-between gap-2 rounded-xl border px-4 py-2 shadow-sm">
        <p className="text-on-surface-variant text-xs">
          <span className="text-on-surface font-semibold">{rows.length}</span> log
          {rows.length > 1 ? 's' : ''} visible
          {rows.length > 1 ? 's' : ''}
        </p>
        <CopyButton text={serializeAll(rows)} label={`Copier les ${rows.length} logs`} />
      </div>

      <div className="border-outline-variant bg-surface-container-lowest overflow-hidden rounded-xl border shadow-md">
        <table className="w-full text-sm">
          <thead className="bg-surface-container text-on-surface-variant border-outline-variant border-b text-left text-xs font-semibold tracking-[0.05em] uppercase">
            <tr>
              <th className="w-32 px-4 py-3">Quand</th>
              <th className="w-40 px-4 py-3">Action</th>
              <th className="w-24 px-4 py-3">Statut</th>
              <th className="px-4 py-3">Payload</th>
              <th className="w-24 px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-outline-variant/40 divide-y">
            {rows.map((r) => {
              const preview = errorPreview(r.payload)
              const isError = r.status === 'error'
              return (
                <tr
                  key={r.id}
                  className={cn(
                    'align-top transition-colors',
                    isError
                      ? 'bg-error-container/40 border-l-error border-l-4'
                      : 'even:bg-surface-container-low/40',
                  )}
                >
                  <td
                    className="text-on-surface-variant px-4 py-3 text-xs"
                    title={format(new Date(r.ts), 'yyyy-MM-dd HH:mm:ss')}
                  >
                    {formatDistanceToNow(new Date(r.ts), { addSuffix: true, locale: fr })}
                  </td>
                  <td className="bg-surface-container/40 text-on-surface-variant px-4 py-3 font-mono text-xs">
                    {r.action}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      className={cn(
                        'rounded-full border-transparent px-2 py-0.5 text-[10px] font-semibold',
                        STATUS_CLASS[r.status ?? ''] ??
                          'bg-surface-variant text-on-surface-variant',
                      )}
                    >
                      {r.status ?? '—'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {preview && (
                      <p
                        className={cn(
                          'mb-1 line-clamp-2 text-xs',
                          isError ? 'text-on-error-container font-semibold' : 'text-on-surface',
                        )}
                        title={preview}
                      >
                        {preview}
                      </p>
                    )}
                    {r.payload ? (
                      <details>
                        <summary className="text-on-surface-variant hover:text-on-surface cursor-pointer text-xs">
                          {preview ? 'voir le payload complet' : 'voir le payload'}
                        </summary>
                        <pre className="bg-inverse-surface text-inverse-on-surface mt-2 max-h-72 overflow-auto rounded-lg p-3 font-mono text-xs break-all whitespace-pre-wrap">
                          {JSON.stringify(r.payload, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-outline text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <CopyButton text={serializeRow(r)} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
