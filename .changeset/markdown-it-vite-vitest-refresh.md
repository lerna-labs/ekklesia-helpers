---
"@lerna-labs/ekklesia-helpers": patch
---

Refresh the development-only `markdown-it`, `vite` and `vitest` lockfile entries to 14.3.3, 8.3.5 and 4.1.12, closing the advisories in earlier releases. All three are dependencies of the documentation and test toolchain, so this has no effect on consumers of the published package.
