---
"@lerna-labs/ekklesia-helpers": patch
---

Regenerate `package-lock.json`, which had not been rebuilt since the 2.0.0 release. `brace-expansion` now resolves to 1.1.18 and 5.0.9 everywhere it appears in the tree, and `vitest`, `@vitest/mocker`, and `@vitest/coverage-v8` now resolve to 4.1.11, closing a denial-of-service advisory in `brace-expansion` and a path-traversal advisory in the `vitest` mocker. All three are development-only dependencies, so this has no effect on consumers of the published package. The lockfile's root version had also stayed at 2.0.0 through the 2.0.1 and 2.0.2 releases while `package.json` moved ahead of it; regenerating brings the two back in sync.
