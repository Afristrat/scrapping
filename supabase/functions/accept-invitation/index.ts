// =============================================================================
// Wave 6 — Sub-wave 6.3 — S6-InvitationFlow
// Edge function `accept-invitation` : valide un token d'invitation, vérifie
// que l'utilisateur connecté correspond à l'email invité, l'ajoute à l'org
// et marque l'invitation comme acceptée.
//
// Sécurité :
//  - Auth obligatoire (le user doit être loggé pour accepter)
//  - Email du user authentifié == email de l'invitation (case-insensitive)
//  - Token expiré (>7j) → 410 Gone
//  - Invitation déjà acceptée → 410 Gone
//  - Lecture de l'invitation via service_role pour bypass RLS (le user n'est
//    pas encore membre de l'org, donc il ne pourrait pas lire l'invitation
//    via les RLS standards `inv_select`)
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { audit, extractAuditContext } from '../_shared/audit.ts'
import { formatError } from '../_shared/errors.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface RequestBody {
  token?: string
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  const auth = req.headers.get('Authorization')
  if (!auth) return jsonResponse({ error: 'missing_authorization' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey) {
    return jsonResponse({ error: 'server_misconfigured' }, 500)
  }
  if (!serviceRoleKey) {
    // Service role nécessaire pour lire l'invitation (le user n'est pas
    // encore membre, donc RLS le bloquerait).
    return jsonResponse({ error: 'service_role_key_not_configured' }, 500)
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
  })

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) return jsonResponse({ error: 'invalid_token' }, 401)

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400)
  }

  const token = body.token?.trim()
  if (!token) return jsonResponse({ error: 'missing_token' }, 400)

  const serviceClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: inv, error: fetchErr } = await serviceClient
    .from('invitations')
    .select('id, org_id, email, role, expires_at, accepted_at')
    .eq('token', token)
    .maybeSingle()

  if (fetchErr) {
    return jsonResponse(
      { error: 'invitation_lookup_failed', detail: formatError(fetchErr).message },
      500,
    )
  }
  if (!inv) return jsonResponse({ error: 'invitation_not_found' }, 404)
  if (inv.accepted_at) return jsonResponse({ error: 'already_accepted' }, 410)
  if (new Date(inv.expires_at).getTime() < Date.now()) {
    return jsonResponse({ error: 'expired' }, 410)
  }

  const userEmail = (user.email ?? '').toLowerCase()
  if (inv.email.toLowerCase() !== userEmail) {
    return jsonResponse({ error: 'email_mismatch' }, 403)
  }

  // Insère le membership (idempotent : si déjà membre → 23505 → on continue
  // jusqu'à marquer l'invitation acceptée).
  const { error: memberErr } = await serviceClient
    .from('organization_members')
    .insert({ org_id: inv.org_id, user_id: user.id, role: inv.role })

  if (memberErr) {
    const code = (memberErr as { code?: string }).code
    if (code !== '23505') {
      return jsonResponse(
        { error: 'membership_create_failed', detail: formatError(memberErr).message },
        500,
      )
    }
    // 23505 = déjà membre, on tolère (cas idempotent)
  }

  // Marque l'invitation comme acceptée (best-effort sur l'update aussi :
  // si l'update échoue, on a quand même créé le membership, donc on logue)
  const { error: updateErr } = await serviceClient
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', inv.id)

  if (updateErr) {
    console.error('invitation_mark_accepted_failed', formatError(updateErr))
  }

  // Audit log via service_role (sinon RLS bloquerait — le user vient juste
  // de devenir membre de l'org)
  await audit(serviceClient, {
    org_id: inv.org_id,
    user_id: user.id,
    action: 'member.accept',
    severity: 'info',
    entity_type: 'invitation',
    entity_id: inv.id,
    description: `${user.email ?? user.id} a rejoint l'organisation en tant que ${inv.role}`,
    metadata: { invited_email: inv.email, role: inv.role },
    ...extractAuditContext(req),
  })

  return jsonResponse({ ok: true, org_id: inv.org_id, role: inv.role }, 200)
})
