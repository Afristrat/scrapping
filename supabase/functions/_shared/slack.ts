// slack.ts — porté de Saqr (P1).
//
// Helper d'envoi de la "Veille IA" quotidienne sur le webhook Slack de
// l'utilisateur. Webhook sortant uniquement. Format : top N en LISTE
// NUMÉROTÉE rich_text (classement), pastille couleur par score, titre court
// cliquable + source. Pas d'éditorialisation LLM, pas de question : direct,
// technique.
//
// Pourquoi rich_text (et pas mrkdwn) : Slack le recommande pour les listes, et
// surtout rich_text gère NATIVEMENT les caractères spéciaux des titres
// scrapés (<, >, |, &, \n) — plus aucun lien cassé. Les titres longs (un
// tweet X = pavé multi-ligne) sont aplatis et tronqués par cleanTitle pour
// rester des titres lisibles.
//
// Le webhook est un secret PER-USER (settings.slack_webhook_url), jamais en
// dur dans le repo.

export interface VeilleItem {
  titre: string
  score: number
  url: string
  source: string // 'reddit' | 'x' | 'arxiv' | 'rss'
}

const SOURCE_LABEL: Record<string, string> = {
  reddit: 'Reddit',
  x: 'X',
  arxiv: 'arXiv',
  rss: 'RSS',
}

const TITLE_MAX = 110

/** Pastille couleur par tranche de score. Candidats filtrés >= 60, donc le plancher est 60-64. */
function scorePastille(score: number): string {
  if (score >= 85) return '🟢'
  if (score >= 65) return '🟡'
  return '🟠'
}

/** Aplatit (retire \n + espaces multiples) puis tronque sur une coupure de mot propre.
 *  Un titre de tweet est souvent un pavé : on le ramène à un titre court et lisible. */
function cleanTitle(s: string, max = TITLE_MAX): string {
  const flat = s.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const cut = flat.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 50 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/** Date FR lisible avec année, ex "mardi 3 juin 2026", calée sur Europe/Paris. */
function dateFr(now: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  }).format(now)
}

/**
 * Construit les blocks Block Kit de la Veille : header + contexte + liste numérotée
 * rich_text (top N). `analysedCount` = nb de signaux collectés sur la fenêtre.
 */
export function buildVeilleBlocks(
  items: VeilleItem[],
  now: Date,
  analysedCount: number,
): unknown[] {
  const listItems = items.map((it) => ({
    type: 'rich_text_section',
    elements: [
      { type: 'text', text: `${scorePastille(it.score)} ` },
      { type: 'text', text: `${it.score}`, style: { bold: true } },
      { type: 'text', text: '  ·  ' },
      { type: 'link', url: it.url, text: cleanTitle(it.titre) },
      {
        type: 'text',
        text: `  ·  ${SOURCE_LABEL[it.source] ?? it.source}`,
        style: { italic: true },
      },
    ],
  }))

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Veille IA · ${dateFr(now)}`, emoji: true },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Top ${items.length}, scoré sur ${analysedCount} signaux analysés ces dernières 24h.`,
        },
      ],
    },
    { type: 'divider' },
    {
      type: 'rich_text',
      elements: [{ type: 'rich_text_list', style: 'ordered', indent: 0, elements: listItems }],
    },
  ]
}

export interface SlackPostResult {
  ok: boolean
  status: number
  detail: string
}

/**
 * POST le payload Block Kit sur le webhook Slack. Timeout 5s.
 * Slack répond 200 "ok" en cas de succès, sinon un code/texte d'erreur.
 */
export async function postToSlack(webhookUrl: string, blocks: unknown[]): Promise<SlackPostResult> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
      signal: AbortSignal.timeout(5000),
    })
    const detail = (await res.text().catch(() => '')).slice(0, 200)
    return { ok: res.ok, status: res.status, detail }
  } catch (err) {
    return { ok: false, status: 0, detail: err instanceof Error ? err.message : String(err) }
  }
}
