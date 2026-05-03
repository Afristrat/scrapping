import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Wave 11 — Edge fn `create-public-share`
 *
 * Authentifié (JWT user requis). Génère un slug court 8 chars random et crée
 * une row dans public_shares pour le digest_id passé. Retourne l URL publique
 * complète à partager.
 *
 * Limites :
 *   - 1 share simultané par digest_id (idempotent : retourne existant si actif)
 *   - User doit être membre de l org du digest (RLS le contraint au INSERT)
 *   - Expiration default 30 jours (configurable via body.expires_days)
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface RequestBody {
  digest_id: string
  expires_days?: number
}

const SLUG_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789' // évite caractères ambigus 0/O/1/l/i

function generateSlug(length = 8): string {
  const buf = new Uint8Array(length)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += SLUG_ALPHABET[buf[i] % SLUG_ALPHABET.length]
  }
  return out
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  const auth = req.headers.get('Authorization')
  if (!auth) return json({ ok: false, error: 'missing_authorization' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: auth } },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ ok: false, error: 'invalid_token' }, 401)

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }
  if (!body.digest_id) return json({ ok: false, error: 'digest_id_required' }, 400)

  const expiresDays = body.expires_days && body.expires_days > 0 ? body.expires_days : 30

  // Lookup le digest pour récupérer org_id (et vérifier accès via RLS)
  const { data: digest, error: digestErr } = await supabase
    .from('digests')
    .select('id, org_id')
    .eq('id', body.digest_id)
    .single()
  if (digestErr || !digest) {
    return json({ ok: false, error: 'digest_not_found_or_no_access' }, 404)
  }

  // Idempotence : si un share actif existe déjà pour ce digest, le retourner
  const { data: existing } = await supabase
    .from('public_shares')
    .select('slug, expires_at')
    .eq('digest_id', body.digest_id)
    .gt('expires_at', new Date().toISOString())
    .limit(1)
    .maybeSingle()

  if (existing) {
    return json(
      {
        ok: true,
        slug: existing.slug,
        url: `${getOrigin(req)}/share/${existing.slug}`,
        expires_at: existing.expires_at,
        reused: true,
      },
      200,
    )
  }

  // Sinon : créer un nouveau share avec retry si collision sur slug (rare avec
  // 32^8 = 1 trillion combinaisons mais défensif).
  const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString()
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = generateSlug(8)
    const { data: inserted, error: insErr } = await supabase
      .from('public_shares')
      .insert({
        slug,
        digest_id: body.digest_id,
        created_by: user.id,
        org_id: digest.org_id,
        expires_at: expiresAt,
      })
      .select('slug, expires_at')
      .single()
    if (!insErr && inserted) {
      return json(
        {
          ok: true,
          slug: inserted.slug,
          url: `${getOrigin(req)}/share/${inserted.slug}`,
          expires_at: inserted.expires_at,
          reused: false,
        },
        200,
      )
    }
    // Si conflit unique slug, retry. Sinon error.
    if (!insErr?.message?.includes('public_shares_slug_key')) {
      return json({ ok: false, error: 'insert_failed', detail: insErr?.message }, 500)
    }
  }

  return json({ ok: false, error: 'slug_generation_failed_after_retries' }, 500)
})

function getOrigin(req: Request): string {
  const origin = req.headers.get('Origin')
  if (origin) return origin
  // Fallback : domaine de prod par défaut
  return 'https://scrap.ai-mpower.com'
}
