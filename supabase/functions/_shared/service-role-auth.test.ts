import { assert, assertEquals } from 'jsr:@std/assert@0.226'
import { resolveAuthOrProxy } from './service-role-auth.ts'

const REAL_SERVICE_ROLE = 'sk-srv-role-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const SOME_USER_JWT = 'eyJhbGciOiJIUzI1NiJ9.fakeuser.sig'
const VALID_UUID = '11111111-1111-1111-1111-111111111111'
const INVALID_UUID = 'not-a-uuid'

function envSet(value: string | null) {
  if (value === null) {
    try {
      Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY')
    } catch {
      // ignore
    }
  } else {
    Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', value)
  }
}

function makeReq(headers: Record<string, string>): Request {
  return new Request('http://test', { headers })
}

function mockSupabase(user: { id: string } | null) {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user }, error: null }),
    },
    // deno-lint-ignore no-explicit-any
  } as any
}

Deno.test('resolveAuthOrProxy: missing Authorization → error', async () => {
  envSet(REAL_SERVICE_ROLE)
  const r = await resolveAuthOrProxy(mockSupabase(null), makeReq({}))
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'missing_authorization')
})

Deno.test('resolveAuthOrProxy: empty Bearer → error', async () => {
  envSet(REAL_SERVICE_ROLE)
  const r = await resolveAuthOrProxy(mockSupabase(null), makeReq({ Authorization: 'Bearer ' }))
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'missing_authorization')
})

Deno.test('resolveAuthOrProxy: user JWT with valid user → mode=user', async () => {
  envSet(REAL_SERVICE_ROLE)
  const r = await resolveAuthOrProxy(
    mockSupabase({ id: 'user-123' }),
    makeReq({ Authorization: `Bearer ${SOME_USER_JWT}` }),
  )
  assert(r.ok)
  if (r.ok) {
    assertEquals(r.mode, 'user')
    assertEquals(r.userId, 'user-123')
  }
})

Deno.test('resolveAuthOrProxy: user JWT with null user → invalid_token', async () => {
  envSet(REAL_SERVICE_ROLE)
  const r = await resolveAuthOrProxy(
    mockSupabase(null),
    makeReq({ Authorization: `Bearer ${SOME_USER_JWT}` }),
  )
  assertEquals(r.ok, false)
  if (!r.ok) assertEquals(r.error, 'invalid_token')
})

Deno.test('resolveAuthOrProxy: service_role + valid proxy uuid → mode=internal', async () => {
  envSet(REAL_SERVICE_ROLE)
  const r = await resolveAuthOrProxy(
    mockSupabase(null), // not used in internal mode
    makeReq({
      Authorization: `Bearer ${REAL_SERVICE_ROLE}`,
      'x-proxy-user-id': VALID_UUID,
    }),
  )
  assert(r.ok)
  if (r.ok) {
    assertEquals(r.mode, 'internal')
    assertEquals(r.userId, VALID_UUID)
  }
})

Deno.test(
  'resolveAuthOrProxy: service_role WITHOUT proxy header → internal_missing_proxy_header',
  async () => {
    envSet(REAL_SERVICE_ROLE)
    const r = await resolveAuthOrProxy(
      mockSupabase(null),
      makeReq({ Authorization: `Bearer ${REAL_SERVICE_ROLE}` }),
    )
    assertEquals(r.ok, false)
    if (!r.ok) assertEquals(r.error, 'internal_missing_proxy_header')
  },
)

Deno.test(
  'resolveAuthOrProxy: service_role with empty proxy header → internal_missing_proxy_header',
  async () => {
    envSet(REAL_SERVICE_ROLE)
    const r = await resolveAuthOrProxy(
      mockSupabase(null),
      makeReq({
        Authorization: `Bearer ${REAL_SERVICE_ROLE}`,
        'x-proxy-user-id': '   ',
      }),
    )
    assertEquals(r.ok, false)
    if (!r.ok) assertEquals(r.error, 'internal_missing_proxy_header')
  },
)

Deno.test(
  'resolveAuthOrProxy: service_role with invalid proxy uuid → internal_missing_proxy_header',
  async () => {
    envSet(REAL_SERVICE_ROLE)
    const r = await resolveAuthOrProxy(
      mockSupabase(null),
      makeReq({
        Authorization: `Bearer ${REAL_SERVICE_ROLE}`,
        'x-proxy-user-id': INVALID_UUID,
      }),
    )
    assertEquals(r.ok, false)
    if (!r.ok) assertEquals(r.error, 'internal_missing_proxy_header')
  },
)

Deno.test(
  'resolveAuthOrProxy: service_role env unset + matching JWT → falls back to user mode',
  async () => {
    envSet(null)
    const r = await resolveAuthOrProxy(
      mockSupabase({ id: 'fallback-user' }),
      makeReq({ Authorization: `Bearer ${REAL_SERVICE_ROLE}` }),
    )
    // Sans env service_role, le token "matche" rien et tombe sur getUser()
    // qui pour ce mock retourne un user → mode user.
    assert(r.ok)
    if (r.ok) {
      assertEquals(r.mode, 'user')
      assertEquals(r.userId, 'fallback-user')
    }
    envSet(REAL_SERVICE_ROLE) // restore
  },
)

Deno.test('resolveAuthOrProxy: case-insensitive Bearer prefix', async () => {
  envSet(REAL_SERVICE_ROLE)
  const r = await resolveAuthOrProxy(
    mockSupabase(null),
    makeReq({
      Authorization: `bearer ${REAL_SERVICE_ROLE}`,
      'x-proxy-user-id': VALID_UUID,
    }),
  )
  assert(r.ok)
  if (r.ok) assertEquals(r.mode, 'internal')
})

Deno.test(
  'resolveAuthOrProxy: service_role almost-match (1 char off) → falls to getUser',
  async () => {
    envSet(REAL_SERVICE_ROLE)
    const wrong = REAL_SERVICE_ROLE.slice(0, -1) + 'X'
    const r = await resolveAuthOrProxy(
      mockSupabase({ id: 'fake-but-mock-says-yes' }),
      makeReq({
        Authorization: `Bearer ${wrong}`,
        'x-proxy-user-id': VALID_UUID, // ignored
      }),
    )
    assert(r.ok)
    if (r.ok) {
      assertEquals(r.mode, 'user', 'not internal mode, not service_role match')
    }
  },
)

Deno.test('resolveAuthOrProxy: uppercase UUID accepted', async () => {
  envSet(REAL_SERVICE_ROLE)
  const r = await resolveAuthOrProxy(
    mockSupabase(null),
    makeReq({
      Authorization: `Bearer ${REAL_SERVICE_ROLE}`,
      'x-proxy-user-id': '11111111-1111-1111-1111-111111111111'.toUpperCase(),
    }),
  )
  assert(r.ok)
  if (r.ok) assertEquals(r.mode, 'internal')
})
