import { Loader2, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRunPipeline } from '@/hooks/useRunPipeline'

export function RunPipelineButton() {
  const m = useRunPipeline()
  return (
    <Button onClick={() => m.mutate()} disabled={m.isPending} size="default">
      {m.isPending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Play className="mr-2 h-4 w-4" />
      )}
      {m.isPending ? 'Pipeline en cours…' : 'Run pipeline'}
    </Button>
  )
}
