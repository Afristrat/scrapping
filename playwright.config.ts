import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.PW_BASE_URL ?? 'https://scrap.ai-mpower.com'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Setup : génère le storageState authentifié
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Tests publics (pas d'auth)
    {
      name: 'public',
      testMatch: /public\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Tests authentifiés (dépendent du setup)
    {
      name: 'authenticated',
      testMatch: /wave\d+\.spec\.ts|dashboard\.spec\.ts|settings\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
})
