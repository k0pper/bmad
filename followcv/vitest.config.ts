import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    passWithNoTests: true,
    // Vitest owns *.test.ts(x). Playwright owns e2e/*.spec.ts. Keep them
    // disjoint so each runner only sees its own files.
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'e2e', 'playwright-report', 'test-results'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
