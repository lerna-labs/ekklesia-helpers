import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['.claude/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        '**/index.ts',
        '**/*.test.ts',
        '**/*.live.test.ts',
        '**/*.d.ts',
        'src/__fixtures__/**',
      ],
      thresholds: {
        statements: 70,
        branches: 55,
        functions: 80,
        lines: 70,
      },
    },
  },
});
