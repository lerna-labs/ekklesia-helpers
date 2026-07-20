import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['.claude/**', 'node_modules/**'],
    // Vitest 4 narrowed `vi.restoreAllMocks()` to only restore `vi.spyOn` spies;
    // it no longer clears `vi.fn()` call history. Clearing globally keeps mock
    // state from leaking between tests without per-file afterEach bookkeeping.
    clearMocks: true,
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
      // Recalibrated for vitest 4's AST-aware v8 remapping, which counts real
      // statements/functions rather than mapping them onto lines. It discovers
      // more functions than v3 did (114 vs 87 — arrow functions and callbacks
      // now count), so the same test suite reports a lower `functions` pct.
      thresholds: {
        statements: 70,
        branches: 55,
        functions: 75,
        lines: 70,
      },
    },
  },
});
