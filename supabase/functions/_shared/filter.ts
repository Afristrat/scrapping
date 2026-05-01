/**
 * Quality filter for scraped signals. Rejects low-effort / removed / spam content
 * BEFORE insert in `signals` to avoid wasting LLM scoring budget.
 */

const SPAM_PATTERNS = [
  /^\[deleted\]$/i,
  /^\[removed\]$/i,
  /^\.+$/,
  /^onlyfans/i,
  /telegram\s*[:.]?\s*@/i,
]

export interface SignalCandidate {
  title: string
  raw_payload: Record<string, unknown>
  source: 'x' | 'reddit' | 'arxiv'
}

export function isQualitySignal(s: SignalCandidate): boolean {
  const title = (s.title ?? '').trim()

  // Min length per source (X tweets often short, ne pas être trop strict)
  const minLen = s.source === 'x' ? 10 : 10
  if (title.length < minLen) return false

  // Spam patterns
  if (SPAM_PATTERNS.some((re) => re.test(title))) return false

  // Source-specific
  if (s.source === 'reddit') {
    const p = s.raw_payload as Record<string, unknown>
    if (p.removed === true || p.is_removed === true) return false
    if (p.over_18 === true || p.over18 === true) return false
    // Skip pinned/stickied (often community announcements)
    if (p.stickied === true || p.pinned === true) return false
    // Skip very low engagement (likely spam)
    const score = Number(p.score ?? p.upvotes ?? 0)
    if (score < 2) return false
  }

  if (s.source === 'x') {
    const p = s.raw_payload as Record<string, unknown>
    // Skip pure retweets only if no own text (rare since X actor returns the rt text)
    if (p.isRetweet === true && !p.text && !p.fullText && !p.quotedTweet) return false
    // Pas de filtre follower : sources curated par l'utilisateur via lists, on fait confiance
  }

  return true
}
