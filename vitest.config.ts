import path from 'node:path'
import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Les specs Playwright de e2e/ ne doivent PAS être happées par Vitest
    // (sinon « Playwright Test did not expect test.describe() to be called here »).
    exclude: [...configDefaults.exclude, 'dist', 'supabase/functions/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      exclude: ['node_modules', 'dist', 'src/test', '**/*.config.*', 'supabase/**'],
    },
  },
})
