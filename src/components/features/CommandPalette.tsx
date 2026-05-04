import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart2,
  BookOpen,
  Cog,
  FileText,
  FlaskConical,
  LayoutDashboard,
  List,
  Play,
  Search,
  Tag,
  Wallet,
} from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { useCommandPalette } from '@/stores/commandPalette'
import { useRunPipeline } from '@/hooks/useRunPipeline'

export function CommandPalette() {
  const { open, setOpen, toggle } = useCommandPalette()
  const navigate = useNavigate()
  const runPipeline = useRunPipeline()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggle])

  const runCommand = (fn: () => void) => {
    fn()
    setOpen(false)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Taper une commande ou chercher..." />
      <CommandList>
        <CommandEmpty>Aucun résultat.</CommandEmpty>

        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => runCommand(() => navigate('/dashboard'))}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>Dashboard</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/digest'))}>
            <BookOpen className="mr-2 h-4 w-4" />
            <span>Brief (Digest)</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/explorer'))}>
            <Search className="mr-2 h-4 w-4" />
            <span>Explorer</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/topics'))}>
            <Tag className="mr-2 h-4 w-4" />
            <span>Topics</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/costs'))}>
            <Wallet className="mr-2 h-4 w-4" />
            <span>Coûts</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/logs'))}>
            <List className="mr-2 h-4 w-4" />
            <span>Logs</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/settings'))}>
            <Cog className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/settings?tab=rubrics'))}>
            <FlaskConical className="mr-2 h-4 w-4" />
            <span>PARA</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/admin/queue'))}>
            <BarChart2 className="mr-2 h-4 w-4" />
            <span>Queue enrichissement</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() =>
              runCommand(() => {
                runPipeline.mutate()
              })
            }
            disabled={runPipeline.isPending}
          >
            <Play className="mr-2 h-4 w-4" />
            <span>{runPipeline.isPending ? 'Pipeline en cours…' : 'Lancer le pipeline'}</span>
            <CommandShortcut>⌘P</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/digest'))}>
            <FileText className="mr-2 h-4 w-4" />
            <span>Générer un brief</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate('/settings'))}>
            <Cog className="mr-2 h-4 w-4" />
            <span>Ouvrir les settings</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
