/**
 * Crée un utilisateur Playwright éphémère via l'API Admin Supabase,
 * injecte la session complète dans localStorage, et sauvegarde le storageState.
 *
 * Variables requises (env) :
 *   SUPABASE_URL          (ex: https://crplceoptyeslqyfcqvj.supabase.co)
 *   SUPABASE_SERVICE_ROLE
 *   SUPABASE_ANON_KEY
 */
import { test as setup } from '@playwright/test'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const AUTH_FILE = path.join(__dirname, '.auth/user.json')

const SUPABASE_URL = process.env.SUPABASE_URL!
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!
const ANON_KEY = process.env.SUPABASE_ANON_KEY!

const TEST_EMAIL = `pw-test-${Date.now()}@kairos-e2e.test`
const TEST_PASSWORD = `Playwright#${Date.now()}`

let testUserId: string | null = null

setup('créer session test et sauvegarder storageState', async ({ page }) => {
  // 1. Créer l'utilisateur via API Admin
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    }),
  })
  const user = (await createRes.json()) as { id?: string; error?: string }
  if (!user.id) throw new Error(`Impossible de créer l'user de test : ${JSON.stringify(user)}`)
  testUserId = user.id

  // 2. Obtenir la session complète (avec le champ user) via grant_type=password
  const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  })
  const sessionFull = (await tokenRes.json()) as Record<string, unknown>
  if (!sessionFull.access_token)
    throw new Error(`Token introuvable : ${JSON.stringify(sessionFull)}`)

  // 3. Charger la prod et injecter le token dans localStorage avec le bon format supabase-js
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  const ref = new URL(SUPABASE_URL).hostname.split('.')[0]
  const storageKey = `sb-${ref}-auth-token`

  await page.evaluate(
    ([key, session]) => {
      localStorage.setItem(key, JSON.stringify(session))
    },
    [storageKey, sessionFull] as [string, Record<string, unknown>],
  )

  // 4. Naviguer vers /dashboard (pas de reload — on force la navigation)
  await page.goto('/dashboard')
  // Si la session est reconnue, on reste sur /dashboard
  // Si elle ne l'est pas, on sera redirigé vers /login
  await page.waitForURL(/\/dashboard|\/onboarding|\/login/, { timeout: 15_000 })

  const url = page.url()
  if (url.includes('/login')) {
    throw new Error(
      'Session non reconnue après injection localStorage — vérifier le format du token',
    )
  }

  // 5. Sauvegarder le storageState
  await page.context().storageState({ path: AUTH_FILE })
})

setup.afterAll(async () => {
  if (!testUserId) return
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${testUserId}`, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
  })
})
