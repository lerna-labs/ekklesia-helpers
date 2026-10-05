---
"@lerna-labs/ekklesia-helpers": patch
---

Refresh `brace-expansion` in `package-lock.json` to 1.1.21 and 5.0.12, closing the denial-of-service advisories in earlier releases. All three copies are development-only dependencies of the lint and documentation toolchain, so this has no effect on consumers of the published package.
