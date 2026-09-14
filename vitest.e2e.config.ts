import { defineConfig } from 'vitest/config'

/** Сквозные проверки в настоящем браузере. Нужен установленный Google Chrome. */
export default defineConfig({
  test: {
    include: ['test/browser/**/*.e2e.ts'],
    environment: 'node',
    fileParallelism: false,
  },
})
