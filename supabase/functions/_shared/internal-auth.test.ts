// Tests Deno — _shared/internal-auth.ts (ADR 0009)
// Exec : deno test --allow-env supabase/functions/_shared/internal-auth.test.ts
import { assertEquals, assertThrows } from 'jsr:@std/assert@1'
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import {
  buildInternalHeaders,
  constantTimeEquals,
  INTERNAL_SECRET_HEADER,
  isUuid,
  PROXY_USER_HEADER,
  resolveCaller,
  resolveOrgId,
  resolveUserIdForOrg,
} from './internal-auth.ts'

const UUID = '11111111-2222-4333-8444-555555555555'
const SECRET = 'super-secret-interne-dedie'

/** Fake supabase dont getUser() renvoie l'user injecté (ou null). */
function fakeSupabase(user: { id: string } | null): SupabaseClient {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user }, error: null }),
    },
  } as unknown as SupabaseClient
}

function reqWith(headers: Record<string, string>): Request {
  return new Request('https://fn.local', { method: 'POST', headers })
}

Deno.test('constantTimeEquals — égalité, longueurs et contenus différents', () => {
  assertEquals(constantTimeEquals('abc', 'abc'), true)
  assertEquals(constantTimeEquals('abc', 'abd'), false)
  assertEquals(constantTimeEquals('abc', 'abcd'), false)
  assertEquals(constantTimeEquals('', ''), true)
})

Deno.test('isUuid — valides et invalides', () => {
  assertEquals(isUuid(UUID), true)
  assertEquals(isUuid('not-a-uuid'), false)
  assertEquals(isUuid(''), false)
  assertEquals(isUuid('11111111222243338444555555555555'), false)
})

Deno.test('resolveCaller — mode internal : secret valide + proxy UUID', async () => {
  Deno.env.set('INTERNAL_FN_SECRET', SECRET)
  const res = await resolveCaller(
    fakeSupabase(null),
    reqWith({ [INTERNAL_SECRET_HEADER]: SECRET, [PROXY_USER_HEADER]: UUID }),
  )
  assertEquals(res, { ok: true, mode: 'internal', userId: UUID })
})

Deno.test('resolveCaller — internal : secret présent mais env absent → misconfigured', async () => {
  Deno.env.delete('INTERNAL_FN_SECRET')
  const res = await resolveCaller(
    fakeSupabase(null),
    reqWith({ [INTERNAL_SECRET_HEADER]: SECRET, [PROXY_USER_HEADER]: UUID }),
  )
  assertEquals(res, { ok: false, error: 'internal_secret_misconfigured' })
})

Deno.test('resolveCaller — internal : mauvais secret → invalid_token', async () => {
  Deno.env.set('INTERNAL_FN_SECRET', SECRET)
  const res = await resolveCaller(
    fakeSupabase(null),
    reqWith({ [INTERNAL_SECRET_HEADER]: 'mauvais', [PROXY_USER_HEADER]: UUID }),
  )
  assertEquals(res, { ok: false, error: 'invalid_token' })
})

Deno.test(
  'resolveCaller — internal : proxy header manquant ou non-UUID → internal_missing_proxy_header',
  async () => {
    Deno.env.set('INTERNAL_FN_SECRET', SECRET)
    const sansProxy = await resolveCaller(
      fakeSupabase(null),
      reqWith({ [INTERNAL_SECRET_HEADER]: SECRET }),
    )
    assertEquals(sansProxy, { ok: false, error: 'internal_missing_proxy_header' })
    const proxyInvalide = await resolveCaller(
      fakeSupabase(null),
      reqWith({ [INTERNAL_SECRET_HEADER]: SECRET, [PROXY_USER_HEADER]: 'x' }),
    )
    assertEquals(proxyInvalide, { ok: false, error: 'internal_missing_proxy_header' })
  },
)

Deno.test('resolveCaller — mode user : Authorization + getUser OK', async () => {
  Deno.env.delete('INTERNAL_FN_SECRET')
  const res = await resolveCaller(
    fakeSupabase({ id: UUID }),
    reqWith({ Authorization: 'Bearer jwt-user' }),
  )
  assertEquals(res, { ok: true, mode: 'user', userId: UUID })
})

Deno.test("resolveCaller — user : pas d'Authorization → missing_authorization", async () => {
  const res = await resolveCaller(fakeSupabase({ id: UUID }), reqWith({}))
  assertEquals(res, { ok: false, error: 'missing_authorization' })
})

Deno.test('resolveCaller — user : getUser null → invalid_token', async () => {
  const res = await resolveCaller(
    fakeSupabase(null),
    reqWith({ Authorization: 'Bearer jwt-expire' }),
  )
  assertEquals(res, { ok: false, error: 'invalid_token' })
})

Deno.test('buildInternalHeaders — en-têtes complets quand env présent', () => {
  Deno.env.set('INTERNAL_FN_SECRET', SECRET)
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-xyz')
  const h = buildInternalHeaders(UUID)
  assertEquals(h[INTERNAL_SECRET_HEADER], SECRET)
  assertEquals(h[PROXY_USER_HEADER], UUID)
  assertEquals(h.Authorization, 'Bearer service-role-xyz')
  assertEquals(h['Content-Type'], 'application/json')
})

Deno.test('buildInternalHeaders — lève sur userId non-UUID', () => {
  Deno.env.set('INTERNAL_FN_SECRET', SECRET)
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-xyz')
  assertThrows(() => buildInternalHeaders('pas-un-uuid'))
})

Deno.test('buildInternalHeaders — lève si secrets env manquants', () => {
  Deno.env.delete('INTERNAL_FN_SECRET')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-xyz')
  assertThrows(() => buildInternalHeaders(UUID))
})

/** Fake supabase mockant .from(table).select().eq(col, val).order().limit().maybeSingle(). */
function fakeMembersTable(row: Record<string, unknown> | null): SupabaseClient {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
  }
  return { from: () => builder } as unknown as SupabaseClient
}

const ORG_UUID = '99998888-7777-4666-8555-444433332222'

Deno.test('resolveOrgId — retourne org_id du premier membership trouvé', async () => {
  const db = fakeMembersTable({ org_id: ORG_UUID })
  assertEquals(await resolveOrgId(db, UUID), ORG_UUID)
})

Deno.test('resolveOrgId — aucun membership → null', async () => {
  const db = fakeMembersTable(null)
  assertEquals(await resolveOrgId(db, UUID), null)
})

Deno.test('resolveUserIdForOrg — retourne user_id du premier membre de l’org', async () => {
  const db = fakeMembersTable({ user_id: UUID })
  assertEquals(await resolveUserIdForOrg(db, ORG_UUID), UUID)
})

Deno.test('resolveUserIdForOrg — org sans membre → null', async () => {
  const db = fakeMembersTable(null)
  assertEquals(await resolveUserIdForOrg(db, ORG_UUID), null)
})
