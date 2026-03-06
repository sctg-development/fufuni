import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['apps/merchant/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
  },
});
