/**
 * Exponential backoff retry helper.
 * Retries `fn` up to `maxAttempts` on errors matching `shouldRetry`.
 * Delays : base × 2^n + jitter [0, 250ms]. Cap : 10s.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number
    baseDelayMs?: number
    shouldRetry?: (err: unknown, attempt: number) => boolean
  } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 5
  const baseDelayMs = options.baseDelayMs ?? 1000
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry

  let lastErr: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === maxAttempts - 1 || !shouldRetry(err, attempt)) throw err
      const delay = Math.min(baseDelayMs * 2 ** attempt + Math.random() * 250, 10_000)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastErr
}

/**
 * Default : retry on 429, 502, 503, 504, network errors.
 */
function defaultShouldRetry(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /\b(429|502|503|504|ECONNRESET|ETIMEDOUT|fetch failed)\b/.test(msg)
}
