/**
 * Tests pages publiques — aucune auth requise.
 * Couvre : landing, pricing, login, signup, share/:slug, redirects.
 */
import { expect, test } from '@playwright/test'

test.describe('Pages publiques', () => {
  test('landing / — charge et contient le CTA principal', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Kairos/i)
    // Le hero doit contenir un lien vers /signup ou /login
    const cta = page
      .getByRole('link', {
        name: /démarrer|commencer|get started|essayer|s'inscrire|signup|inscription/i,
      })
      .first()
    await expect(cta).toBeVisible()
  })

  test('/pricing — page tarification accessible', async ({ page }) => {
    await page.goto('/pricing')
    await expect(page).toHaveURL(/\/pricing/)
    await page.waitForLoadState('networkidle')
    // La page doit afficher des éléments de pricing (titre ou section)
    await expect(page.getByText(/tarif|pricing|plan|abonnement|mois/i).first()).toBeVisible({
      timeout: 8_000,
    })
  })

  test('/login — formulaire magic link visible', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible()
  })

  test('/signup — formulaire inscription visible', async ({ page }) => {
    await page.goto('/signup')
    await expect(page).toHaveURL(/\/signup/)
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible()
  })

  test('/share/nonexistent — 404 ou message erreur (pas de crash)', async ({ page }) => {
    await page.goto('/share/slug-inexistant-test-pw')
    // La page doit répondre (200 SPA ou redirection), sans crash JS
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.waitForLoadState('networkidle')
    expect(errors.filter((e) => !e.includes('ResizeObserver'))).toHaveLength(0)
  })

  test('/status — page statut accessible', async ({ page }) => {
    await page.goto('/status')
    await expect(page).toHaveURL(/\/status/)
  })

  test('/dashboard sans auth — redirige vers /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 })
  })

  test('/admin sans auth — redirige vers /login', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 })
  })

  test('/settings sans auth — redirige vers /login', async ({ page }) => {
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 })
  })

  test('/accept-invitation/:token sans auth — redirige vers /login', async ({ page }) => {
    // Sans session, la page doit rediriger vers /login avec ?next= pour reprendre après auth
    await page.goto('/accept-invitation/token-bidon-test')
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 })
  })
})
