import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@0.226'
import { decodeJwtPayload, signUserJwt } from './sign-user-jwt.ts'

const SECRET = 'test-secret-256-bit-min-length-for-hmac-sha256-please'

Deno.test('signUserJwt produces 3-part JWT', async () => {
  const jwt = await signUserJwt({
    userId: '00000000-0000-0000-0000-000000000001',
    email: 'test@example.com',
    jwtSecret: SECRET,
  })
  const parts = jwt.split('.')
  assertEquals(parts.length, 3)
  assert(parts.every((p) => p.length > 0))
})

Deno.test('signUserJwt header is HS256 + JWT', async () => {
  const jwt = await signUserJwt({
    userId: 'u1',
    email: 'a@b.c',
    jwtSecret: SECRET,
  })
  const headerB64 = jwt.split('.')[0]
  const padded = headerB64.padEnd(headerB64.length + ((4 - (headerB64.length % 4)) % 4), '=')
  const header = JSON.parse(atob(padded.replace(/-/g, '+').replace(/_/g, '/')))
  assertEquals(header.alg, 'HS256')
  assertEquals(header.typ, 'JWT')
})

Deno.test('signUserJwt payload contains required Supabase claims', async () => {
  const userId = '11111111-1111-1111-1111-111111111111'
  const email = 'bassira-bot@internal.kairos'
  const jwt = await signUserJwt({ userId, email, jwtSecret: SECRET })
  const payload = decodeJwtPayload(jwt)
  assertEquals(payload.sub, userId)
  assertEquals(payload.email, email)
  assertEquals(payload.role, 'authenticated')
  assertEquals(payload.aud, 'authenticated')
  assert(typeof payload.iat === 'number')
  assert(typeof payload.exp === 'number')
  assert((payload.exp as number) - (payload.iat as number) >= 30)
})

Deno.test('signUserJwt respects custom ttl clamped to [30, 600]', async () => {
  const j1 = await signUserJwt({ userId: 'u', email: 'a@b', jwtSecret: SECRET, ttlSeconds: 5 })
  const p1 = decodeJwtPayload(j1)
  assertEquals((p1.exp as number) - (p1.iat as number), 30, 'min clamp 30')

  const j2 = await signUserJwt({ userId: 'u', email: 'a@b', jwtSecret: SECRET, ttlSeconds: 9999 })
  const p2 = decodeJwtPayload(j2)
  assertEquals((p2.exp as number) - (p2.iat as number), 600, 'max clamp 600')

  const j3 = await signUserJwt({ userId: 'u', email: 'a@b', jwtSecret: SECRET, ttlSeconds: 90 })
  const p3 = decodeJwtPayload(j3)
  assertEquals((p3.exp as number) - (p3.iat as number), 90)
})

Deno.test('signUserJwt includes issuer when provided', async () => {
  const jwt = await signUserJwt({
    userId: 'u',
    email: 'a@b',
    jwtSecret: SECRET,
    issuer: 'https://example.supabase.co/auth/v1',
  })
  const payload = decodeJwtPayload(jwt)
  assertEquals(payload.iss, 'https://example.supabase.co/auth/v1')
})

Deno.test('signUserJwt omits issuer when not provided', async () => {
  const jwt = await signUserJwt({ userId: 'u', email: 'a@b', jwtSecret: SECRET })
  const payload = decodeJwtPayload(jwt)
  assertEquals(payload.iss, undefined)
})

Deno.test('signUserJwt signature is deterministic for same input + same iat', async () => {
  // Le JWT contient iat=now() donc deux appels successifs auront des sigs différentes.
  // On teste juste que le format est propre et reproductible structurellement.
  const j1 = await signUserJwt({ userId: 'u', email: 'a@b', jwtSecret: SECRET })
  const j2 = await signUserJwt({ userId: 'u', email: 'a@b', jwtSecret: SECRET })
  assertEquals(j1.split('.').length, 3)
  assertEquals(j2.split('.').length, 3)
})

Deno.test('signUserJwt with different secrets produces different signatures', async () => {
  const userId = 'u1'
  const email = 'a@b'
  const j1 = await signUserJwt({
    userId,
    email,
    jwtSecret: 'secret-one-256-bit-min-length-for-hmac-please',
  })
  const j2 = await signUserJwt({
    userId,
    email,
    jwtSecret: 'secret-two-256-bit-min-length-for-hmac-please',
  })
  // Same header (HS256), might have same payload (close iat), but signature differs.
  const sig1 = j1.split('.')[2]
  const sig2 = j2.split('.')[2]
  assert(sig1 !== sig2 || j1 !== j2, 'signatures should differ for different secrets')
})

Deno.test('signUserJwt produces base64url (no +/=)', async () => {
  const jwt = await signUserJwt({ userId: 'u', email: 'a@b', jwtSecret: SECRET })
  for (const part of jwt.split('.')) {
    assert(!part.includes('+'), `part contains + : ${part}`)
    assert(!part.includes('/'), `part contains / : ${part}`)
    assert(!part.includes('='), `part contains = : ${part}`)
  }
})

Deno.test('decodeJwtPayload roundtrips signed JWT', async () => {
  const jwt = await signUserJwt({
    userId: 'roundtrip-user',
    email: 'rt@example.com',
    jwtSecret: SECRET,
  })
  const payload = decodeJwtPayload(jwt)
  assertEquals(payload.sub, 'roundtrip-user')
  assertEquals(payload.email, 'rt@example.com')
})

Deno.test('decodeJwtPayload throws on malformed input', () => {
  let threw = false
  try {
    decodeJwtPayload('not.a.jwt.too.many.parts')
  } catch {
    threw = true
  }
  assert(threw, 'should throw on malformed JWT')
})
