---
"@lerna-labs/ekklesia-helpers": patch
---

Lint with ESLint 10 and `@eslint/js` 10. The `Not a valid script hash` error thrown by `getScript` now carries the underlying decoder error as `cause`; its message is unchanged.
