import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    root: '.',
    include: ['__tests__/e2e/**/*.test.js'],
    // LLM-вызовы медленные; даём по 2 минуты на тест
    testTimeout: 180000,
    hookTimeout: 30000,
    // mock-сервер хранит state per-process — параллелить нельзя
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
})
