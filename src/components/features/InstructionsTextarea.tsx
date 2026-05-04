import { useCallback, useRef, useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { SlashCommandMenu } from '@/components/features/SlashCommandMenu'
import { useSlashCommands } from '@/hooks/useSlashCommands'

interface InstructionsTextareaProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

/**
 * Textarea avec gestion intégrée des slash commands.
 *
 * Quand l'utilisateur tape `/`, un menu contextuel s'ouvre. La sélection
 * d'une commande remplace le `/` et tout ce qui suit (jusqu'au prochain
 * espace ou fin de ligne) par le texte de la commande.
 */
export function InstructionsTextarea({
  value,
  onChange,
  placeholder,
}: InstructionsTextareaProps): React.ReactElement {
  const { filter } = useSlashCommands()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Position du `/` déclencheur dans la valeur du textarea
  const slashPosRef = useRef<number | null>(null)

  // Query de filtrage (texte tapé après `/`)
  const [menuQuery, setMenuQuery] = useState<string>('')
  const [menuOpen, setMenuOpen] = useState(false)

  const filteredCommands = menuOpen ? filter(menuQuery) : []

  const closeMenu = useCallback((): void => {
    setMenuOpen(false)
    setMenuQuery('')
    slashPosRef.current = null
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const newValue = e.target.value
    onChange(newValue)

    const cursor = e.target.selectionStart ?? newValue.length

    // Chercher le dernier `/` avant le curseur sur la même ligne
    const textBeforeCursor = newValue.slice(0, cursor)
    const lastNewline = textBeforeCursor.lastIndexOf('\n')
    const lineStart = lastNewline + 1
    const lineBeforeCursor = textBeforeCursor.slice(lineStart)
    const slashIdx = lineBeforeCursor.lastIndexOf('/')

    if (slashIdx !== -1) {
      // Le `/` est présent sur cette ligne avant le curseur
      const absoluteSlashPos = lineStart + slashIdx
      const queryAfterSlash = lineBeforeCursor.slice(slashIdx + 1)

      // La query ne doit pas contenir d'espace (sinon on ne filtre plus)
      if (!queryAfterSlash.includes(' ')) {
        slashPosRef.current = absoluteSlashPos
        setMenuQuery(queryAfterSlash)
        const matched = filter(queryAfterSlash)
        if (matched.length > 0) {
          setMenuOpen(true)
        } else {
          // Aucune correspondance → fermer automatiquement
          closeMenu()
        }
        return
      }
    }

    // Pas de `/` valide → fermer si ouvert
    if (menuOpen) {
      closeMenu()
    }
  }

  const handleCommandSelect = useCallback(
    (insertText: string): void => {
      if (slashPosRef.current === null) {
        closeMenu()
        return
      }

      const slashPos = slashPosRef.current

      // Texte avant le `/`
      const before = value.slice(0, slashPos)

      // Texte après le `/` + query : on cherche la fin du "token" slash
      // (jusqu'au prochain espace ou fin de ligne)
      const afterSlash = value.slice(slashPos + 1)
      const endOfToken = afterSlash.search(/[ \n]/)
      const after =
        endOfToken === -1
          ? value.slice(slashPos + 1 + afterSlash.length)
          : value.slice(slashPos + 1 + endOfToken)

      const newValue = `${before}${insertText}${after}`
      onChange(newValue)
      closeMenu()

      // Replacer le curseur juste après le texte inséré
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const newPos = before.length + insertText.length
          textareaRef.current.setSelectionRange(newPos, newPos)
          textareaRef.current.focus()
        }
      })
    },
    [value, onChange, closeMenu],
  )

  // Fermer le menu si l'utilisateur appuie sur Escape directement dans le textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Escape' && menuOpen) {
      e.preventDefault()
      closeMenu()
    }
  }

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={3}
        className="resize-none"
        data-testid="instructions-textarea"
      />
      {menuOpen && filteredCommands.length > 0 && (
        <SlashCommandMenu
          commands={filteredCommands}
          onSelect={handleCommandSelect}
          onClose={closeMenu}
        />
      )}
    </div>
  )
}
