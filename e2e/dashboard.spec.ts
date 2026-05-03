/**
 * Tests dashboard + digest + partage — session authentifiée requise.
 * storageState injecté par auth.setup.ts
 */
import { expect, test } from '@playwright/test'

test.describe('Dashboard (auth)', () => {
  test('charge /dashboard sans erreur JS', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    expect(errors.filter((e) => !e.includes('ResizeObserver'))).toHaveLength(0)
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('interface app — navigation présente (dashboard ou onboarding)', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    // Un nouveau user peut être redirigé vers /onboarding avant d'accéder au dashboard
    const url = page.url()
    if (url.includes('/onboarding')) {
      // Vérifier que l'onboarding affiche du contenu
      await expect(page.locator('main, [role="main"], h1, h2').first()).toBeVisible()
    } else {
      // User avec org : vérifier la sidebar
      await expect(page.getByRole('link', { name: /dashboard/i }).first()).toBeVisible()
      await expect(page.getByRole('link', { name: /brief|digest/i }).first()).toBeVisible()
    }
  })

  test('/digest — page génération digest accessible', async ({ page }) => {
    await page.goto('/digest')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/digest/)
    // Bouton de génération présent
    await expect(
      page.getByRole('button', { name: /générer|generate|créer/i }).first(),
    ).toBeVisible()
  })

  test('/topics — page topic tracking accessible', async ({ page }) => {
    await page.goto('/topics')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/topics/)
  })

  test('/costs — page coûts LLM accessible', async ({ page }) => {
    await page.goto('/costs')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/costs/)
  })

  test('/logs — page logs accessible', async ({ page }) => {
    await page.goto('/logs')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/logs/)
  })
})
