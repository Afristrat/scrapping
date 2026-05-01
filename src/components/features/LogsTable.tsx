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
  ok: 'bg-emerald-100 text-emerald-800',
  error: 'bg-red-100 text-red-800',
  degraded: 'bg-amber-100 text-amber-800',
  start: 'bg-slate-100 text-slate-700',
  info: 'bg-blue-100 text-blue-800',
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
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
        Pas de logs (purgés &lt; 24h)
      </div>
    )

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <p className="text-xs text-slate-500">
          <span className="font-medium text-slate-700">{rows.length}</span> log
          {rows.length > 1 ? 's' : ''} visible
          {rows.length > 1 ? 's' : ''}
        </p>
        <CopyButton text={serializeAll(rows)} label={`Copier les ${rows.length} logs`} />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="w-32 px-4 py-2.5">Quand</th>
              <th className="w-40 px-4 py-2.5">Action</th>
              <th className="w-24 px-4 py-2.5">Statut</th>
              <th className="px-4 py-2.5">Payload</th>
              <th className="w-24 px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const preview = errorPreview(r.payload)
              const isError = r.status === 'error'
              return (
                <tr key={r.id} className={cn('align-top', isError && 'bg-red-50/50')}>
                  <td
                    className="px-4 py-3 text-xs text-slate-500"
                    title={format(new Date(r.ts), 'yyyy-MM-dd HH:mm:ss')}
                  >
                    {formatDistanceToNow(new Date(r.ts), { addSuffix: true, locale: fr })}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">{r.action}</td>
                  <td className="px-4 py-3">
                    <Badge
                      className={cn(
                        'font-normal',
                        STATUS_CLASS[r.status ?? ''] ?? 'bg-slate-100 text-slate-600',
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
                          isError ? 'font-medium text-red-700' : 'text-slate-700',
                        )}
                        title={preview}
                      >
                        {preview}
                      </p>
                    )}
                    {r.payload ? (
                      <details>
                        <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-900">
                          {preview ? 'voir le payload complet' : 'voir le payload'}
                        </summary>
                        <pre className="mt-1 max-h-72 overflow-auto rounded bg-slate-50 p-2 text-xs break-all whitespace-pre-wrap">
                          {JSON.stringify(r.payload, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
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
