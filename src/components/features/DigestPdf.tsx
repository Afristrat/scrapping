/**
 * Wave 11 — Export PDF brandé sélectionnable.
 *
 * Génère un vrai PDF A4 avec texte sélectionnable (pas une image), depuis le
 * markdown du brief. Utilise @react-pdf/renderer (lib React → PDF natif).
 *
 * Différences vs window.print() précédent :
 *   - Texte sélectionnable, copiable, indexable par moteurs de recherche
 *   - Mise en page contrôlée (pas dépendante du dialogue print du navigateur)
 *   - Branding Kairos cohérent quel que soit le navigateur/OS
 *   - Footer pro avec sources cliquables et watermark
 *
 * Le parsing markdown → React-PDF est manuel (sections par `## ` regex), ciblé
 * sur le format PDB-style produit par l'edge fn `digest`.
 */

import { Document, Page, Text, View, StyleSheet, Link, Font } from '@react-pdf/renderer'
import type { DigestRow } from '@/hooks/useDigest'

// Inter pour cohérence avec le design system Kairos. Charger explicitement
// puisque @react-pdf/renderer ne lit pas les fonts du navigateur.
Font.register({
  family: 'Inter',
  fonts: [
    {
      src: 'https://fonts.gstatic.com/s/inter/v18/UcCo3FwrK3iLTcvneQg7Ca725JhhKnNqk4j1ebLhAm8SrXTc.ttf',
      fontWeight: 400,
    },
    {
      src: 'https://fonts.gstatic.com/s/inter/v18/UcCo3FwrK3iLTcvneQg7Ca725JhhKnNqk4j1ebLhAm8WrXTc.ttf',
      fontWeight: 600,
    },
    {
      src: 'https://fonts.gstatic.com/s/inter/v18/UcCo3FwrK3iLTcvneQg7Ca725JhhKnNqk4j1ebLhAm8XrXTc.ttf',
      fontWeight: 700,
    },
  ],
})

// Palette Material You Kairos (extraite des design tokens)
const COLORS = {
  primary: '#006948',
  primaryDim: '#338372',
  surface: '#fbfdf8',
  surfaceContainer: '#eaf1ec',
  onSurface: '#181d1a',
  onSurfaceVariant: '#3d4a42',
  outline: '#6b7a72',
  outlineVariant: '#bccac0',
  tertiary: '#9b3e3b',
  secondary: '#0051d5',
  badgeAlmostBg: '#cdf0d8',
  badgeAlmostFg: '#002111',
  badgeVeryLikelyBg: '#ffd9d6',
  badgeVeryLikelyFg: '#3a0907',
  badgeLikelyBg: '#dee0ff',
  badgeLikelyFg: '#02105e',
  badgePossibleBg: '#eaf1ec',
  badgePossibleFg: '#3d4a42',
  badgeSpeculativeBg: '#ffeaea',
  badgeSpeculativeFg: '#601410',
}

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: 'Inter',
    fontSize: 9,
    color: COLORS.onSurface,
    backgroundColor: COLORS.surface,
    lineHeight: 1.4,
  },
  // Header
  header: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    paddingBottom: 14,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  brandBlock: { flexDirection: 'column' },
  brandName: { fontSize: 20, fontWeight: 700, color: COLORS.primary, letterSpacing: -0.3 },
  brandTagline: { fontSize: 8, color: COLORS.onSurfaceVariant, marginTop: 2 },
  metaBlock: { flexDirection: 'column', alignItems: 'flex-end' },
  metaTitle: { fontSize: 13, fontWeight: 700, color: COLORS.onSurface },
  metaLine: { fontSize: 8, color: COLORS.onSurfaceVariant, marginTop: 2 },
  // Sections
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: COLORS.primary,
    marginTop: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  paragraph: { marginBottom: 6 },
  bullet: { flexDirection: 'row', marginBottom: 5, paddingLeft: 8 },
  bulletDot: { width: 8, fontSize: 9 },
  bulletText: { flex: 1 },
  // Insights avec WEP badges
  insightBlock: { marginBottom: 8 },
  insightLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 2 },
  badge: {
    paddingTop: 1.5,
    paddingBottom: 1.5,
    paddingLeft: 5,
    paddingRight: 5,
    borderRadius: 8,
    fontSize: 7,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginRight: 4,
  },
  insightText: { fontWeight: 700, fontSize: 9 },
  whyMatters: {
    fontSize: 8,
    color: COLORS.onSurfaceVariant,
    fontStyle: 'italic',
    marginTop: 1,
    marginLeft: 0,
  },
  citation: { fontSize: 7, color: COLORS.secondary, fontWeight: 600 },
  // Sources
  sourceItem: { fontSize: 8, color: COLORS.onSurfaceVariant, marginBottom: 3 },
  sourceLink: { color: COLORS.secondary, textDecoration: 'none' },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 36,
    right: 36,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: COLORS.outline,
  },
  pageNumber: { color: COLORS.outline },
})

// Mapping confidence label → couleurs
const BADGE_COLORS_BY_LABEL: Record<string, { bg: string; fg: string }> = {
  'almost certain': { bg: COLORS.badgeAlmostBg, fg: COLORS.badgeAlmostFg },
  'quasi-certain': { bg: COLORS.badgeAlmostBg, fg: COLORS.badgeAlmostFg },
  'casi seguro': { bg: COLORS.badgeAlmostBg, fg: COLORS.badgeAlmostFg },
  'very likely': { bg: COLORS.badgeVeryLikelyBg, fg: COLORS.badgeVeryLikelyFg },
  'très probable': { bg: COLORS.badgeVeryLikelyBg, fg: COLORS.badgeVeryLikelyFg },
  'tres probable': { bg: COLORS.badgeVeryLikelyBg, fg: COLORS.badgeVeryLikelyFg },
  'muy probable': { bg: COLORS.badgeVeryLikelyBg, fg: COLORS.badgeVeryLikelyFg },
  likely: { bg: COLORS.badgeLikelyBg, fg: COLORS.badgeLikelyFg },
  probable: { bg: COLORS.badgeLikelyBg, fg: COLORS.badgeLikelyFg },
  possible: { bg: COLORS.badgePossibleBg, fg: COLORS.badgePossibleFg },
  posible: { bg: COLORS.badgePossibleBg, fg: COLORS.badgePossibleFg },
  speculative: { bg: COLORS.badgeSpeculativeBg, fg: COLORS.badgeSpeculativeFg },
  spéculatif: { bg: COLORS.badgeSpeculativeBg, fg: COLORS.badgeSpeculativeFg },
  speculatif: { bg: COLORS.badgeSpeculativeBg, fg: COLORS.badgeSpeculativeFg },
  especulativo: { bg: COLORS.badgeSpeculativeBg, fg: COLORS.badgeSpeculativeFg },
}

interface ParsedSection {
  title: string
  body: string
}

/**
 * Découpe le markdown en sections par `## Title`. Garde la première section
 * qui n a pas de header (TL;DR avant le premier `##`) si présente.
 */
function parseSections(content: string): ParsedSection[] {
  const sections: ParsedSection[] = []
  const lines = content.split('\n')
  let currentTitle = ''
  let currentBody: string[] = []

  for (const line of lines) {
    const headerMatch = line.match(/^## (.+)$/)
    if (headerMatch) {
      if (currentTitle || currentBody.length > 0) {
        sections.push({ title: currentTitle, body: currentBody.join('\n').trim() })
      }
      currentTitle = headerMatch[1].trim()
      currentBody = []
    } else {
      currentBody.push(line)
    }
  }
  if (currentTitle || currentBody.length > 0) {
    sections.push({ title: currentTitle, body: currentBody.join('\n').trim() })
  }
  return sections.filter((s) => s.title || s.body)
}

interface ParsedFootnote {
  n: string
  title: string
  url: string
  meta: string
}

/**
 * Extrait les définitions de footnote `[^N]: [Title](url) — meta` du markdown.
 */
function parseFootnotes(content: string): ParsedFootnote[] {
  const footnotes: ParsedFootnote[] = []
  for (const match of content.matchAll(/^\[\^(\d+)\]:\s*\[([^\]]+)\]\(([^)]+)\)\s*(—\s*.+)?$/gm)) {
    footnotes.push({
      n: match[1],
      title: match[2],
      url: match[3],
      meta: (match[4] ?? '').replace(/^—\s*/, ''),
    })
  }
  return footnotes
}

const CONFIDENCE_TAG_REGEX =
  /^\*\*\[(Almost certain|Very likely|Likely|Possible|Speculative|Quasi-certain|Très probable|Tres probable|Probable|Spéculatif|Speculatif|Casi seguro|Muy probable|Posible|Especulativo)]\s*([^*]+)\*\*\s*(\[\^[\d[\]]+)*(.*)$/i

interface InsightLine {
  kind: 'insight'
  badge?: string
  text: string
  refs: string[]
}

interface PlainLine {
  kind: 'plain'
  text: string
}

interface BulletLine {
  kind: 'bullet'
  text: string
}

interface WhyLine {
  kind: 'why'
  text: string
}

type ParsedLine = InsightLine | PlainLine | BulletLine | WhyLine

/**
 * Pour le body d'une section : extrait insights (avec badge), bullets, plain text.
 * Ignore les lignes vides.
 */
function parseSectionLines(body: string): ParsedLine[] {
  const lines: ParsedLine[] = []
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('[^')) continue // footnote def déjà extraite

    // Insight format : **[Tag] Insight text** [^1][^2]
    const insightMatch = line.match(CONFIDENCE_TAG_REGEX)
    if (insightMatch) {
      const refs = (insightMatch[3] || '').match(/\[\^(\d+)\]/g) || []
      lines.push({
        kind: 'insight',
        badge: insightMatch[1].trim(),
        text: insightMatch[2].trim(),
        refs: refs.map((r) => r.replace(/[[\]^]/g, '')),
      })
      continue
    }

    // Why it matters : *Pourquoi ça compte : ...*
    const whyMatch = line.match(/^\*(?:Pourquoi[^:]*|Why[^:]*|Por qué[^:]*):\s*(.+)\*$/i)
    if (whyMatch) {
      lines.push({ kind: 'why', text: whyMatch[1].trim() })
      continue
    }

    // Bullet : - ... ou * ...
    const bulletMatch = line.match(/^[-*]\s+(.+)$/)
    if (bulletMatch) {
      lines.push({ kind: 'bullet', text: bulletMatch[1].trim() })
      continue
    }

    // Plain
    lines.push({ kind: 'plain', text: line })
  }
  return lines
}

/**
 * Strip markdown bold + simple syntax pour render plain text dans @react-pdf.
 */
function stripMd(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\[\^(\d+)\]/g, '[$1]')
    .replace(/`([^`]+)`/g, '$1')
}

interface Props {
  digest: DigestRow
  brandName?: string
  brandTagline?: string
}

export function DigestPdf({
  digest,
  brandName = 'Kairos',
  brandTagline = 'Brief stratégique de veille IA',
}: Props): React.ReactElement {
  const sections = parseSections(digest.content)
  const footnotes = parseFootnotes(digest.content)
  const dateLabel = new Date(digest.generated_at).toLocaleDateString(
    digest.language === 'fr' ? 'fr-FR' : digest.language === 'es' ? 'es-ES' : 'en-US',
    { day: 'numeric', month: 'long', year: 'numeric' },
  )

  return (
    <Document
      title={`${brandName} — ${dateLabel}`}
      author={brandName}
      subject={`Brief de veille IA — ${dateLabel}`}
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header} fixed>
          <View style={styles.brandBlock}>
            <Text style={styles.brandName}>{brandName}</Text>
            <Text style={styles.brandTagline}>{brandTagline}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaTitle}>Brief stratégique</Text>
            <Text style={styles.metaLine}>{dateLabel}</Text>
            <Text style={styles.metaLine}>
              {digest.signal_count} signaux · fenêtre {digest.window_hours} h · score ≥{' '}
              {digest.min_score}
            </Text>
            <Text style={styles.metaLine}>
              Modèle : {digest.model_used ?? '—'} · Langue : {String(digest.language).toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Sections */}
        {sections.map((section, idx) => {
          // Skip section sources : on la rend séparément à la fin avec un styling différent
          const isSourcesSection =
            /^(Confiance.+sources?|Confidence.+Sources|Confianza.+fuentes)$/i.test(section.title)
          if (isSourcesSection) return null

          const lines = parseSectionLines(section.body)
          return (
            <View key={idx} wrap={false}>
              {section.title && <Text style={styles.sectionTitle}>{section.title}</Text>}
              {lines.map((line, lidx) => {
                if (line.kind === 'insight') {
                  const badgeKey = (line.badge || '').toLowerCase()
                  const badgeColor = BADGE_COLORS_BY_LABEL[badgeKey] ?? {
                    bg: COLORS.badgePossibleBg,
                    fg: COLORS.badgePossibleFg,
                  }
                  return (
                    <View key={lidx} style={styles.insightBlock}>
                      <View style={styles.insightLine}>
                        {line.badge && (
                          <Text
                            style={[
                              styles.badge,
                              { backgroundColor: badgeColor.bg, color: badgeColor.fg },
                            ]}
                          >
                            {line.badge}
                          </Text>
                        )}
                        <Text style={styles.insightText}>{stripMd(line.text)} </Text>
                        {line.refs.map((r) => (
                          <Text key={r} style={styles.citation}>
                            [{r}]
                          </Text>
                        ))}
                      </View>
                    </View>
                  )
                }
                if (line.kind === 'why') {
                  return (
                    <Text key={lidx} style={styles.whyMatters}>
                      → {stripMd(line.text)}
                    </Text>
                  )
                }
                if (line.kind === 'bullet') {
                  return (
                    <View key={lidx} style={styles.bullet}>
                      <Text style={styles.bulletDot}>•</Text>
                      <Text style={styles.bulletText}>{stripMd(line.text)}</Text>
                    </View>
                  )
                }
                return (
                  <Text key={lidx} style={styles.paragraph}>
                    {stripMd(line.text)}
                  </Text>
                )
              })}
            </View>
          )
        })}

        {/* Sources cliquables */}
        {footnotes.length > 0 && (
          <View wrap={false}>
            <Text style={styles.sectionTitle}>Sources</Text>
            {footnotes.map((fn) => (
              <Text key={fn.n} style={styles.sourceItem}>
                [{fn.n}]{' '}
                <Link src={fn.url} style={styles.sourceLink}>
                  {fn.title}
                </Link>
                {fn.meta ? ` — ${fn.meta}` : ''}
              </Text>
            ))}
          </View>
        )}

        {/* Footer pro avec watermark + numéro de page */}
        <View style={styles.footer} fixed>
          <Text>{brandName} · scrap.ai-mpower.com · Veille IA scorée par LLM</Text>
          <Text
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
            style={styles.pageNumber}
          />
        </View>
      </Page>
    </Document>
  )
}
