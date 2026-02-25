import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['*.spec.e2e.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
