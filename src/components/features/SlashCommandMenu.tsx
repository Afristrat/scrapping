import { useEffect, useRef, useState } from 'react'
import type { SlashCommand } from '@/hooks/useSlashCommands'

interface SlashCommandMenuProps {
  commands: SlashCommand[]
  onSelect: (text: string) => void
  onClose: () => void
}

export function SlashCommandMenu({
  commands,
  onSelect,
  onClose,
}: SlashCommandMenuProps): React.ReactElement {
  // L'index actif est borné à la taille réelle de la liste au moment du rendu.
  // La navigation clavier utilise `commands.length` du moment où l'effet est
  // enregistré, ce qui est cohérent. Pas besoin de réinitialiser explicitement
  // via un effet : `safeActiveIndex` garantit que l'index est toujours valide.
  const [activeIndex, setActiveIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)

  // Index actif borné à la taille actuelle de la liste (évite l'état invalide
  // quand `commands` est réduit par le filtrage)
  const safeActiveIndex = commands.length > 0 ? Math.min(activeIndex, commands.length - 1) : 0

  // Fermer si clic en dehors
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [onClose])

  // Navigation clavier — on capture `safeActiveIndex` et `commands` via la closure
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((prev) => (prev + 1) % commands.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((prev) => (prev - 1 + commands.length) % commands.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const cmd = commands[safeActiveIndex]
        if (cmd) {
          onSelect(cmd.insertText)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [commands, safeActiveIndex, onSelect, onClose])

  if (commands.length === 0) return <></>

  return (
    <div
      ref={menuRef}
      role="listbox"
      aria-label="Commandes slash"
      className="border-border bg-popover absolute top-full left-0 z-50 mt-1 min-w-[280px] rounded-md border shadow-md"
      data-testid="slash-command-menu"
    >
      {commands.map((cmd, index) => (
        <button
          key={cmd.id}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors first:rounded-t-md last:rounded-b-md focus:outline-none ${
            index === activeIndex
              ? 'bg-accent text-accent-foreground'
              : 'text-popover-foreground hover:bg-accent hover:text-accent-foreground'
          }`}
          onMouseEnter={() => setActiveIndex(index)}
          onMouseDown={(e) => {
            // Éviter que le blur du textarea ne ferme le menu avant le clic
            e.preventDefault()
            onSelect(cmd.insertText)
          }}
          data-testid={`slash-command-item-${cmd.id}`}
        >
          <span className="text-sm font-medium">{cmd.label}</span>
          <span className="text-muted-foreground text-xs">{cmd.description}</span>
        </button>
      ))}
    </div>
  )
}
