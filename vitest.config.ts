import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [".claude/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "**/index.ts",
        "**/*.test.ts",
        "**/*.d.ts",
        "src/auth/**",
        "src/cardano/**",
        "src/crypto/**",
        "src/server/**",
      ],
      thresholds: {
        statements: 70,
        branches: 55,
        functions: 100,
        lines: 70,
      },
    },
  },
});
