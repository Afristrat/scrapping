/**
 * Error formatter that captures every useful field from any throwable.
 * Critical fix: PostgrestError, FetchError, and plain objects don't extend Error,
 * so `String(err)` returns "[object Object]" — losing all context.
 * This helper extracts message, name, code, details, hint, status, stack.
 */
export interface FormattedError {
  message: string
  name?: string
  code?: string | number
  details?: string
  hint?: string
  status?: number
  stack?: string
}

export function formatError(err: unknown): FormattedError {
  if (err == null) return { message: 'unknown_error' }

  if (err instanceof Error) {
    const out: FormattedError = {
      message: err.message || err.name || 'error',
      name: err.name,
    }
    if ('stack' in err && typeof err.stack === 'string') {
      out.stack = err.stack.split('\n').slice(0, 6).join('\n')
    }
    // OpenAI / fetch-style errors often attach status & code
    const anyErr = err as Record<string, unknown>
    if (typeof anyErr.status === 'number') out.status = anyErr.status
    if (typeof anyErr.code === 'string' || typeof anyErr.code === 'number')
      out.code = anyErr.code as string | number
    return out
  }

  if (typeof err === 'object') {
    const e = err as Record<string, unknown>
    return {
      message: typeof e.message === 'string' ? e.message : JSON.stringify(err).slice(0, 500),
      name: typeof e.name === 'string' ? e.name : undefined,
      code:
        typeof e.code === 'string' || typeof e.code === 'number'
          ? (e.code as string | number)
          : undefined,
      details: typeof e.details === 'string' ? e.details : undefined,
      hint: typeof e.hint === 'string' ? e.hint : undefined,
      status: typeof e.status === 'number' ? e.status : undefined,
    }
  }

  return { message: String(err) }
}

/** Short, single-line summary good for status badges and log titles. */
export function summarizeError(err: unknown): string {
  const f = formatError(err)
  const parts = [f.message]
  if (f.code) parts.push(`[code=${f.code}]`)
  if (f.status) parts.push(`[status=${f.status}]`)
  return parts.join(' ').slice(0, 300)
}
