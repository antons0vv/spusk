import { defineConfig } from 'vitest/config'

/** End-to-end checks in a real browser. Requires Google Chrome to be installed. */
export default defineConfig({
  test: {
    include: ['test/browser/**/*.e2e.ts'],
    environment: 'node',
    fileParallelism: false,
  },
})
