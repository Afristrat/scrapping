import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        manualChunks: (id: string): string | null => {
          if (!id.includes('node_modules')) return null
          if (id.includes('/recharts/') || id.includes('\\recharts\\')) {
            return 'recharts'
          }
          if (
            id.includes('/@supabase/') ||
            id.includes('\\@supabase\\') ||
            id.includes('/@tanstack/') ||
            id.includes('\\@tanstack\\')
          ) {
            return 'supabase'
          }
          if (
            id.includes('/radix-ui/') ||
            id.includes('\\radix-ui\\') ||
            id.includes('/@radix-ui/') ||
            id.includes('\\@radix-ui\\')
          ) {
            return 'radix'
          }
          if (
            id.includes('/react-router-dom/') ||
            id.includes('\\react-router-dom\\') ||
            id.includes('/react-router/') ||
            id.includes('\\react-router\\') ||
            id.endsWith('/react/index.js') ||
            id.endsWith('\\react\\index.js') ||
            id.includes('/react-dom/') ||
            id.includes('\\react-dom\\') ||
            /[\\/]node_modules[\\/]react[\\/]/.test(id)
          ) {
            return 'react-vendor'
          }
          return null
        },
      },
    },
  },
})
