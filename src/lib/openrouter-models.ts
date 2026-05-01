export interface OpenRouterModel {
  id: string
  label: string
  costHint: 'low' | 'medium' | 'high'
}

/**
 * Liste de modèles populaires pré-sélectionnés.
 * Pour utiliser un autre modèle, clique "Custom" et saisis l'ID exact depuis openrouter.ai/models.
 */
export const POPULAR_MODELS: OpenRouterModel[] = [
  { id: 'openrouter/auto', label: 'Auto (router decides)', costHint: 'medium' },
  { id: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5', costHint: 'low' },
  { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6', costHint: 'medium' },
  { id: 'anthropic/claude-opus-4.7', label: 'Claude Opus 4.7', costHint: 'high' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini', costHint: 'low' },
  { id: 'openai/gpt-4o', label: 'GPT-4o', costHint: 'medium' },
  { id: 'google/gemini-flash-1.5', label: 'Gemini Flash 1.5', costHint: 'low' },
  { id: 'google/gemini-pro-1.5', label: 'Gemini Pro 1.5', costHint: 'medium' },
  { id: 'meta-llama/llama-3.1-8b-instruct', label: 'Llama 3.1 8B', costHint: 'low' },
  { id: 'meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B', costHint: 'medium' },
  { id: 'mistralai/mistral-7b-instruct', label: 'Mistral 7B', costHint: 'low' },
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat', costHint: 'low' },
]
