/**
 * Tests Wave 2 — topic tracking 90j.
 * Vérifie que la page /topics charge et affiche le contenu attendu.
 */
import { expect, test } from '@playwright/test'

test.describe('Wave 2 — Topic tracking', () => {
  test('/topics — charge sans erreur JS', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/topics')
    await page.waitForLoadState('networkidle')
    expect(errors.filter((e) => !e.includes('ResizeObserver'))).toHaveLength(0)
    await expect(page).toHaveURL(/\/topics/)
  })

  test('/topics — contient un tableau ou une liste de sujets', async ({ page }) => {
    await page.goto('/topics')
    await page.waitForLoadState('networkidle')
    // La page doit afficher une structure de données (table/list/empty state)
    const hasTable = await page.locator('table, [role="table"]').isVisible()
    const hasGrid = await page.locator('[role="grid"], [data-topics]').isVisible()
    const hasEmptyState = await page.getByText(/aucun|no topic|pas encore|empty/i).isVisible()
    expect(hasTable || hasGrid || hasEmptyState).toBeTruthy()
  })
})
