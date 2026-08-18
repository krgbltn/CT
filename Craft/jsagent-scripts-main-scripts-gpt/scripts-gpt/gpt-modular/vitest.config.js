import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    root: '.',
    include: ['__tests__/**/*.test.js'],
    exclude: ['__tests__/e2e/**', 'node_modules/**'],
  },
})
