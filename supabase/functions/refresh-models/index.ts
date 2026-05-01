import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getUserApiKey } from '../_shared/api-keys.ts'
import {
  buildAuthHeaders,
  getProviderConfig,
  normalizeModelsResponse,
} from '../_shared/providers.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface RequestBody {
  provider: string
  base_url?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: 'missing_authorization' }, 401)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return json({ error: 'invalid_token' }, 401)

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  if (!body.provider) return json({ error: 'provider_required' }, 400)

  const cfg = await getProviderConfig(supabase, body.provider)
  if (!cfg) return json({ error: 'unknown_provider', provider: body.provider }, 400)

  const apiKey = await getUserApiKey(supabase, user.id, body.provider)
  if (cfg.modelsRequiresAuth && !apiKey) {
    return json({ error: 'api_key_missing', provider: body.provider }, 400)
  }

  const baseURL = body.base_url ?? cfg.baseURL
  const url = `${baseURL}${cfg.modelsEndpoint}`
  const headers = {
    ...buildAuthHeaders(cfg, apiKey),
    'Content-Type': 'application/json',
  }

  let raw: unknown
  try {
    const res = await fetch(url, { headers })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return json(
        {
          error: 'provider_request_failed',
          status: res.status,
          detail: text.slice(0, 500),
        },
        502,
      )
    }
    raw = await res.json()
  } catch (err) {
    return json(
      { error: 'fetch_failed', detail: err instanceof Error ? err.message : String(err) },
      502,
    )
  }

  const models = normalizeModelsResponse(body.provider, raw)
  if (models.length === 0) {
    return json({ ok: true, count: 0, note: 'no_models_returned' }, 200)
  }

  // Wipe stale entries, then bulk insert.
  await supabase
    .from('provider_models')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', body.provider)

  const rows = models.map((m) => ({
    user_id: user.id,
    provider: body.provider,
    model_id: m.id,
    display_name: m.displayName,
    context_window: m.contextWindow,
    pricing_input_per_1m: m.pricingInputPer1M,
    pricing_output_per_1m: m.pricingOutputPer1M,
    capabilities: m.capabilities,
  }))

  const { error: insErr } = await supabase.from('provider_models').upsert(rows, {
    onConflict: 'user_id,provider,model_id',
  })
  if (insErr) {
    return json({ error: 'db_insert_failed', detail: insErr.message }, 500)
  }

  // Mark the API key as validated
  await supabase
    .from('user_api_keys')
    .update({ validation_status: 'valid', last_validated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('provider', body.provider)

  return json({ ok: true, count: models.length, provider: body.provider }, 200)
})

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
