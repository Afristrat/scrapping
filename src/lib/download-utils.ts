/**
 * Utilitaires de téléchargement et de presse-papier côté navigateur.
 */

/**
 * Copier du texte dans le presse-papier.
 * Utilise l'API Clipboard moderne, avec fallback textarea + execCommand pour les navigateurs anciens.
 */
export async function copyToClipboard(text: string): Promise<void> {
  const nav = window.navigator
  if (nav?.clipboard?.writeText) {
    await nav.clipboard.writeText(text)
    return
  }
  // Fallback ancien navigateur
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

/**
 * Déclenche le téléchargement d'une chaîne de texte sous forme de fichier Markdown.
 * @param content  - Contenu brut à écrire dans le fichier
 * @param filename - Nom du fichier avec extension (ex. `kairos-brief-2026-05-01-10-30.md`)
 */
export function downloadAsMarkdown(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Formate une date ISO en `YYYY-MM-DD-HH-mm` pour nommer un fichier.
 */
export function formatDateForFilename(isoDate: string): string {
  const d = new Date(isoDate)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}-${hh}-${min}`
}
