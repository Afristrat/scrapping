// =============================================================================
// Wave 6 — Sub-wave 6.3 — S6-InvitationFlow
// Edge function `invite-member` : génère un token d'invitation, l'inscrit en
// base et tente d'envoyer un email de signup via l'Auth Admin API. Si le
// SUPABASE_SERVICE_ROLE_KEY n'est pas configuré ou si l'envoi échoue, on
// retourne le lien d'acceptation en clair (le caller peut le copier/coller).
//
// Sécurité :
//  - Auth obligatoire (header Authorization)
//  - Le caller doit être owner ou admin de l'org cible
//  - Rôle 'owner' interdit via invite (seul un owner existant peut promouvoir)
//  - Token de 44+ caractères (UUID + suffix random) — non guessable
//  - Expiration : 7 jours (cohérent avec la convention Wave 6.A)
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { audit, extractAuditContext } from '../_shared/audit.ts'
import { formatError } from '../_shared/errors.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 jours

type InvitableRole = 'admin' | 'member' | 'viewer'

interface RequestBody {
  email?: string
  role?: InvitableRole
  org_id?: string
}

function isInvitableRole(role: unknown): role is InvitableRole {
  return role === 'admin' || role === 'member' || role === 'viewer'
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

  // 1. Authentication
  const auth = req.headers.get('Authorization')
  if (!auth) return jsonResponse({ error: 'missing_authorization' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) {
    return jsonResponse({ error: 'server_misconfigured' }, 500)
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
  })

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) return jsonResponse({ error: 'invalid_token' }, 401)

  // 2. Body validation
  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400)
  }

  const email = (body.email ?? '').toLowerCase().trim()
  const role = body.role
  const orgId = body.org_id

  if (!email || !role || !orgId) {
    return jsonResponse({ error: 'missing_fields' }, 400)
  }
  // Email regex minimal — la vraie validation se fait côté Supabase Auth
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: 'invalid_email' }, 400)
  }
  if (!isInvitableRole(role)) {
    return jsonResponse({ error: 'invalid_role' }, 400)
  }

  // 3. Le caller doit être owner ou admin de l'org
  const { data: callerMembership, error: membershipErr } = await supabase
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipErr) {
    return jsonResponse(
      { error: 'membership_lookup_failed', detail: formatError(membershipErr).message },
      500,
    )
  }
  if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role)) {
    return jsonResponse({ error: 'forbidden' }, 403)
  }

  // 4. Génère un token unique non guessable (UUID + 8 chars random)
  const token = `${crypto.randomUUID()}-${crypto.randomUUID().slice(0, 8)}`
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString()

  // 5. Insert invitation (RLS impose déjà owner/admin via inv_insert)
  const { data: inv, error: insertErr } = await supabase
    .from('invitations')
    .insert({
      org_id: orgId,
      email,
      role,
      token,
      expires_at: expiresAt,
      invited_by: user.id,
    })
    .select('id')
    .single()

  if (insertErr || !inv) {
    return jsonResponse(
      {
        error: 'invite_create_failed',
        detail: formatError(insertErr ?? new Error('no_row_returned')).message,
      },
      500,
    )
  }

  // 6. Envoi de l'email via Supabase Auth Admin API (best-effort)
  const baseUrl = Deno.env.get('PUBLIC_BASE_URL') ?? 'https://scrap.ai-mpower.com'
  const acceptUrl = `${baseUrl}/accept-invitation/${token}`
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  let emailSent = false
  let emailError: string | null = null

  if (serviceRoleKey) {
    try {
      const serviceClient = createClient(supabaseUrl, serviceRoleKey)
      const { error: inviteErr } = await serviceClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: acceptUrl,
      })
      if (inviteErr) {
        emailError = inviteErr.message ?? 'unknown_invite_error'
      } else {
        emailSent = true
      }
    } catch (err) {
      emailError = formatError(err).message
    }
  } else {
    emailError = 'service_role_key_not_configured'
  }

  // 7. Audit log (best-effort, n'échoue jamais)
  await audit(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: 'member.invite',
    severity: 'info',
    entity_type: 'invitation',
    entity_id: inv.id,
    description: `Invitation envoyée à ${email} avec le rôle ${role}`,
    metadata: {
      email,
      role,
      expires_at: expiresAt,
      email_sent: emailSent,
      email_error: emailError,
    },
    ...extractAuditContext(req),
  })

  return jsonResponse(
    {
      ok: true,
      invitation_id: inv.id,
      accept_url: acceptUrl,
      email_sent: emailSent,
      email_error: emailError,
      expires_at: expiresAt,
    },
    200,
  )
})
