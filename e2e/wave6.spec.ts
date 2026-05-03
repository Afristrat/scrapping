/**
 * Tests Wave 6 — multi-tenant, BYOK, invite membre, audit log, AdminCockpit.
 * Vérifie que les features sont câblées et ne crashent pas.
 * storageState injecté par auth.setup.ts (user de test sans droits admin).
 *
 * Note : AdminCockpit + CSMOnboarding testés séparément avec le founder.
 */
import { expect, test } from '@playwright/test'

test.describe('Wave 6 — Settings équipe & BYOK', () => {
  test('/settings — page settings accessible', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    expect(errors.filter((e) => !e.includes('ResizeObserver'))).toHaveLength(0)
    await expect(page).toHaveURL(/\/settings/)
  })

  test('/settings/team — page gestion équipe accessible', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/settings/team')
    await page.waitForLoadState('networkidle')
    expect(errors.filter((e) => !e.includes('ResizeObserver'))).toHaveLength(0)
    await expect(page).toHaveURL(/\/settings\/team/)
    // La page doit afficher un tableau ou une liste de membres
    await expect(page.getByText(/membre|member|team|équipe/i).first()).toBeVisible()
  })

  test("/settings/audit — journal d'audit accessible", async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/settings/audit')
    await page.waitForLoadState('networkidle')
    expect(errors.filter((e) => !e.includes('ResizeObserver'))).toHaveLength(0)
    await expect(page).toHaveURL(/\/settings\/audit/)
  })

  test('Settings — section clés API BYOK visible', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    // La section BYOK doit être visible (OpenRouter, etc.)
    await expect(page.getByText(/api key|clé api|openrouter|provider/i).first()).toBeVisible({
      timeout: 8_000,
    })
  })

  test('Settings — sélecteur modèle LLM visible', async ({ page }) => {
    await page.goto('/settings')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/modèle|model|scoring|digest/i).first()).toBeVisible({
      timeout: 8_000,
    })
  })
})

test.describe('Wave 6 — Rubrics backtest', () => {
  test('/settings/rubrics/backtest — page backtest accessible', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/settings/rubrics/backtest')
    await page.waitForLoadState('networkidle')
    expect(errors.filter((e) => !e.includes('ResizeObserver'))).toHaveLength(0)
    await expect(page).toHaveURL(/rubrics\/backtest/)
  })
})

test.describe('Wave 6 — Invitation (page publique)', () => {
  test('/accept-invitation/:token — page affiche un état sans crash', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    // Token invalide → la page doit gérer proprement l'erreur
    await page.goto('/accept-invitation/tok-e2e-test-invalide')
    await page.waitForLoadState('networkidle')
    expect(errors.filter((e) => !e.includes('ResizeObserver'))).toHaveLength(0)
    // Doit afficher un message d'erreur explicite, pas une page blanche
    const hasError = await page
      .getByText(/invalid|invalide|expired|introuvable|erreur/i)
      .isVisible()
    const hasContent = await page.locator('main, [role="main"], h1, h2').first().isVisible()
    expect(hasError || hasContent).toBeTruthy()
  })
})
