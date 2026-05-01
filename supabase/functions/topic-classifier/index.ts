import { createClient } from 'jsr:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4'
import { getUserApiKey } from '../_shared/api-keys.ts'
import { retryWithBackoff } from '../_shared/retry.ts'
import { welfordUpdate, computeTrend } from '../_shared/welford.ts'
import {
  appendTopicEntry,
  createMinioClient,
  formatEntry,
  getMinioConfig,
  slugify,
} from '../_shared/minio.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
const MODEL = 'anthropic/claude-haiku-4.5'
const BATCH_SIZE = 10
const CONCURRENCY = 3

interface RequestBody {
  signal_ids: string[]
  run_at: string
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
  if (!Array.isArray(body.signal_ids) || !body.run_at) return json({ error: 'bad_body' }, 400)

  return json({ ok: true, todo: 'implement_classification' }, 202)
})

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
