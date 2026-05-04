export interface SlashCommand {
  id: string
  label: string
  description: string
  insertText: string
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'focus',
    label: '/focus',
    description: 'Focaliser sur un sujet précis',
    insertText: 'Focus sur : [sujet]',
  },
  {
    id: 'exclude',
    label: '/exclude',
    description: 'Exclure une source ou un sujet',
    insertText: 'Exclure : [source ou sujet]',
  },
  {
    id: 'style-formel',
    label: '/style formel',
    description: 'Adopter un style formel et professionnel',
    insertText: 'Style : formel et professionnel',
  },
  {
    id: 'style-casual',
    label: '/style casual',
    description: 'Adopter un style conversationnel et accessible',
    insertText: 'Style : conversationnel et accessible',
  },
  {
    id: 'longueur-court',
    label: '/longueur court',
    description: 'Synthèse courte (5-7 points max)',
    insertText: 'Longueur : synthèse courte (5-7 points max)',
  },
  {
    id: 'longueur-detaille',
    label: '/longueur détaillé',
    description: 'Analyse détaillée avec contexte',
    insertText: 'Longueur : analyse détaillée avec contexte',
  },
  {
    id: 'angle',
    label: '/angle',
    description: "Définir un angle d'analyse spécifique",
    insertText: "Angle d'analyse : [perspective spécifique]",
  },
  {
    id: 'comparaison',
    label: '/comparaison',
    description: 'Comparer avec la semaine précédente',
    insertText: 'Comparer avec la semaine précédente',
  },
]

export interface UseSlashCommandsResult {
  commands: SlashCommand[]
  filter: (query: string) => SlashCommand[]
}

export function useSlashCommands(): UseSlashCommandsResult {
  const filter = (query: string): SlashCommand[] => {
    if (!query) return SLASH_COMMANDS
    const q = query.toLowerCase()
    return SLASH_COMMANDS.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q) ||
        cmd.insertText.toLowerCase().includes(q),
    )
  }

  return { commands: SLASH_COMMANDS, filter }
}
