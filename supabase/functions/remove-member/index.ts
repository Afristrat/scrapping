// =============================================================================
// Wave 6 — Sub-wave 6.3 — S6-TeamPage
// Edge function `remove-member` : permet à un owner/admin de retirer un
// membre de l'org OU de changer son rôle. Vérifie qu'on ne retire pas le
// dernier owner et qu'un admin ne peut pas modifier un owner.
//
// Sécurité :
//  - Auth obligatoire
//  - Caller doit être owner ou admin de l'org
//  - Seul un owner peut promouvoir/rétrograder un autre owner
//  - Impossible de retirer le dernier owner (garde-fou anti-orphelin)
//  - Action 'remove' ou 'change_role' (mutuellement exclusives)
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { audit, extractAuditContext } from '../_shared/audit.ts'
import { formatError } from '../_shared/errors.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type OrgRole = 'owner' | 'admin' | 'member' | 'viewer'

interface RequestBody {
  org_id?: string
  user_id?: string
  action?: 'remove' | 'change_role'
  new_role?: OrgRole
}

function isOrgRole(role: unknown): role is OrgRole {
  return role === 'owner' || role === 'admin' || role === 'member' || role === 'viewer'
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

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400)
  }

  const orgId = body.org_id
  const targetUserId = body.user_id
  const action = body.action
  if (!orgId || !targetUserId || !action) {
    return jsonResponse({ error: 'missing_fields' }, 400)
  }
  if (action !== 'remove' && action !== 'change_role') {
    return jsonResponse({ error: 'invalid_action' }, 400)
  }
  if (action === 'change_role' && !isOrgRole(body.new_role)) {
    return jsonResponse({ error: 'invalid_role' }, 400)
  }

  // 1. Lookup caller's role
  const { data: callerMembership, error: callerErr } = await supabase
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (callerErr) {
    return jsonResponse(
      { error: 'caller_lookup_failed', detail: formatError(callerErr).message },
      500,
    )
  }
  if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role)) {
    return jsonResponse({ error: 'forbidden' }, 403)
  }

  // 2. Lookup target's current role
  const { data: targetMembership, error: targetErr } = await supabase
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', targetUserId)
    .maybeSingle()

  if (targetErr) {
    return jsonResponse(
      { error: 'target_lookup_failed', detail: formatError(targetErr).message },
      500,
    )
  }
  if (!targetMembership) {
    return jsonResponse({ error: 'target_not_member' }, 404)
  }

  // 3. Un admin ne peut pas modifier/retirer un owner
  if (targetMembership.role === 'owner' && callerMembership.role !== 'owner') {
    return jsonResponse({ error: 'forbidden_owner_target' }, 403)
  }

  // 4. Garde-fou : si target est owner, vérifier qu'il en reste au moins un autre
  const removingOrDemotingOwner =
    targetMembership.role === 'owner' &&
    (action === 'remove' || (action === 'change_role' && body.new_role !== 'owner'))

  if (removingOrDemotingOwner) {
    const { count, error: countErr } = await supabase
      .from('organization_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('role', 'owner')
    if (countErr) {
      return jsonResponse(
        { error: 'owner_count_failed', detail: formatError(countErr).message },
        500,
      )
    }
    if ((count ?? 0) <= 1) {
      return jsonResponse({ error: 'cannot_remove_last_owner' }, 409)
    }
  }

  // 5. Exécution
  if (action === 'remove') {
    const { error: deleteErr } = await supabase
      .from('organization_members')
      .delete()
      .eq('org_id', orgId)
      .eq('user_id', targetUserId)

    if (deleteErr) {
      return jsonResponse({ error: 'remove_failed', detail: formatError(deleteErr).message }, 500)
    }

    await audit(supabase, {
      org_id: orgId,
      user_id: user.id,
      action: 'member.remove',
      severity: 'warning',
      entity_type: 'organization_member',
      entity_id: targetUserId,
      description: `Membre ${targetUserId} retiré de l'organisation (rôle précédent : ${targetMembership.role})`,
      diff: { before: { role: targetMembership.role }, after: null },
      metadata: { previous_role: targetMembership.role },
      ...extractAuditContext(req),
    })

    return jsonResponse({ ok: true, removed: true }, 200)
  }

  // change_role
  const newRole = body.new_role
  if (!newRole) return jsonResponse({ error: 'invalid_role' }, 400)

  if (newRole === targetMembership.role) {
    return jsonResponse({ ok: true, unchanged: true, role: newRole }, 200)
  }

  // Seul un owner peut promouvoir vers owner
  if (newRole === 'owner' && callerMembership.role !== 'owner') {
    return jsonResponse({ error: 'forbidden_promote_to_owner' }, 403)
  }

  const { error: updateErr } = await supabase
    .from('organization_members')
    .update({ role: newRole })
    .eq('org_id', orgId)
    .eq('user_id', targetUserId)

  if (updateErr) {
    return jsonResponse(
      { error: 'role_change_failed', detail: formatError(updateErr).message },
      500,
    )
  }

  await audit(supabase, {
    org_id: orgId,
    user_id: user.id,
    action: 'member.role_change',
    severity: 'warning',
    entity_type: 'organization_member',
    entity_id: targetUserId,
    description: `Rôle de ${targetUserId} changé de ${targetMembership.role} vers ${newRole}`,
    diff: { before: { role: targetMembership.role }, after: { role: newRole } },
    metadata: { previous_role: targetMembership.role, new_role: newRole },
    ...extractAuditContext(req),
  })

  return jsonResponse({ ok: true, role: newRole }, 200)
})
