import { useState } from 'react'
import { Eye, EyeOff, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useUpsertApiKey, useDeleteApiKey } from '@/hooks/useApiKeys'
import type { ApiKeyProvider, UserApiKey } from '@/lib/schemas/api-key-schema'

interface Props {
  provider: ApiKeyProvider
  existingKey: UserApiKey | undefined
  label: string
}

export function ApiKeyForm({ provider, existingKey, label }: Props) {
  const [rawKey, setRawKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const upsertMutation = useUpsertApiKey()
  const deleteMutation = useDeleteApiKey()

  const handleSave = () => {
    if (!rawKey.trim()) return
    upsertMutation.mutate({ provider, rawKey: rawKey.trim() }, { onSuccess: () => setRawKey('') })
  }

  const handleDelete = () => {
    if (!existingKey) return
    deleteMutation.mutate({ id: existingKey.id })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {existingKey && (
          <p className="text-sm text-slate-500">
            Cle actuelle : <span className="font-mono text-slate-700">{existingKey.masked_key}</span>
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor={`api-key-${provider}`}>
            {existingKey ? 'Remplacer la cle' : 'Ajouter une cle'}
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id={`api-key-${provider}`}
                type={showKey ? 'text' : 'password'}
                value={rawKey}
                onChange={(e) => setRawKey(e.target.value)}
                placeholder={`Coller la cle ${label}`}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                aria-label={showKey ? 'Masquer' : 'Afficher'}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Button
              type="button"
              onClick={handleSave}
              disabled={!rawKey.trim() || upsertMutation.isPending}
            >
              {upsertMutation.isPending ? 'Sauvegarde...' : 'Enregistrer'}
            </Button>
          </div>
        </div>
        {existingKey && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Supprimer la cle
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
