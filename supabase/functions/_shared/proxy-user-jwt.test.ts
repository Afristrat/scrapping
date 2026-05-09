import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@0.226'
import {
  _clearProxyJwtCache,
  _getCacheSize,
  _setCachedJwt,
  getProxyUserJwt,
  type SignInFn,
} from './proxy-user-jwt.ts'

const EMAIL = 'bassira-bot@internal.kairos.local'
const PASSWORD = 'p4ssw0rd-test'

function clockFactory(initial: number) {
  let now = initial
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms
    },
  }
}

Deno.test({
  name: 'getProxyUserJwt: cache miss → calls signIn + caches',
  fn: async () => {
    _clearProxyJwtCache()
    let calls = 0
    const signIn: SignInFn = async () => {
      calls++
      return { jwt: 'jwt-1' }
    }
    const r = await getProxyUserJwt(EMAIL, PASSWORD, signIn)
    assertEquals(r.jwt, 'jwt-1')
    assertEquals(r.cached, false)
    assertEquals(calls, 1)
    assertEquals(_getCacheSize(), 1)
  },
})

Deno.test({
  name: 'getProxyUserJwt: cache hit → no signIn call',
  fn: async () => {
    _clearProxyJwtCache()
    const clock = clockFactory(1_000_000)
    _setCachedJwt(EMAIL, 'cached-jwt', clock.now() + 30_000) // expires in 30s
    let calls = 0
    const signIn: SignInFn = async () => {
      calls++
      return { jwt: 'should-not-be-returned' }
    }
    const r = await getProxyUserJwt(EMAIL, PASSWORD, signIn, clock.now)
    assertEquals(r.jwt, 'cached-jwt')
    assertEquals(r.cached, true)
    assertEquals(calls, 0)
  },
})

Deno.test({
  name: 'getProxyUserJwt: expired cache → re-fetches',
  fn: async () => {
    _clearProxyJwtCache()
    const clock = clockFactory(2_000_000)
    _setCachedJwt(EMAIL, 'old-jwt', clock.now() - 1_000) // expired 1s ago
    let calls = 0
    const signIn: SignInFn = async () => {
      calls++
      return { jwt: 'fresh-jwt' }
    }
    const r = await getProxyUserJwt(EMAIL, PASSWORD, signIn, clock.now)
    assertEquals(r.jwt, 'fresh-jwt')
    assertEquals(r.cached, false)
    assertEquals(calls, 1)
  },
})

Deno.test({
  name: 'getProxyUserJwt: cache TTL ~50min default',
  fn: async () => {
    _clearProxyJwtCache()
    const clock = clockFactory(3_000_000)
    let calls = 0
    const signIn: SignInFn = async () => {
      calls++
      return { jwt: 'jwt-ttl' }
    }
    await getProxyUserJwt(EMAIL, PASSWORD, signIn, clock.now)
    assertEquals(calls, 1)

    // 49 min after → still cached
    clock.advance(49 * 60 * 1000)
    await getProxyUserJwt(EMAIL, PASSWORD, signIn, clock.now)
    assertEquals(calls, 1, 'still cached at 49min')

    // 51 min total → expired
    clock.advance(2 * 60 * 1000)
    await getProxyUserJwt(EMAIL, PASSWORD, signIn, clock.now)
    assertEquals(calls, 2, 'expired at 51min')
  },
})

Deno.test({
  name: 'getProxyUserJwt: signIn error propagates',
  fn: async () => {
    _clearProxyJwtCache()
    const signIn: SignInFn = async () => {
      throw new Error('invalid_credentials')
    }
    await assertRejects(
      () => getProxyUserJwt(EMAIL, PASSWORD, signIn),
      Error,
      'invalid_credentials',
    )
    assertEquals(_getCacheSize(), 0, 'failed signIn should not cache')
  },
})

Deno.test({
  name: 'getProxyUserJwt: empty jwt result throws',
  fn: async () => {
    _clearProxyJwtCache()
    const signIn: SignInFn = async () => ({ jwt: '' })
    await assertRejects(
      () => getProxyUserJwt(EMAIL, PASSWORD, signIn),
      Error,
      'signin_returned_empty_jwt',
    )
    assertEquals(_getCacheSize(), 0)
  },
})

Deno.test({
  name: 'getProxyUserJwt: different emails cached separately',
  fn: async () => {
    _clearProxyJwtCache()
    const signIn: SignInFn = async (email) => ({ jwt: `jwt-for-${email}` })
    const a = await getProxyUserJwt('a@x.com', 'pw', signIn)
    const b = await getProxyUserJwt('b@x.com', 'pw', signIn)
    assertEquals(a.jwt, 'jwt-for-a@x.com')
    assertEquals(b.jwt, 'jwt-for-b@x.com')
    assertEquals(_getCacheSize(), 2)

    // Re-call → both cached
    const a2 = await getProxyUserJwt('a@x.com', 'pw', signIn)
    assertEquals(a2.cached, true)
    const b2 = await getProxyUserJwt('b@x.com', 'pw', signIn)
    assertEquals(b2.cached, true)
  },
})

Deno.test({
  name: 'getProxyUserJwt: same email different passwords still keyed by email only',
  fn: async () => {
    // Note volontaire : on cache par email, pas par (email, password). Si le
    // password change il faut purger via _clearProxyJwtCache. Couvert par
    // ce test pour documenter le comportement.
    _clearProxyJwtCache()
    let calls = 0
    const signIn: SignInFn = async (_email, password) => {
      calls++
      return { jwt: `jwt-${password}` }
    }
    const r1 = await getProxyUserJwt('same@x.com', 'pw1', signIn)
    const r2 = await getProxyUserJwt('same@x.com', 'pw2', signIn)
    assertEquals(r1.jwt, 'jwt-pw1')
    assertEquals(r2.jwt, 'jwt-pw1', 'cache hit, ignores new password')
    assertEquals(r2.cached, true)
    assertEquals(calls, 1)
  },
})
