---
"@lerna-labs/ekklesia-helpers": patch
---

Lint with ESLint 10 and `@eslint/js` 10. The `Not a valid script hash`, `Signature is invalid`, `Invalid signature key` and `Invalid signature` errors thrown by `getScript` and `verifySignature` now carry the underlying error as `cause`; their messages are unchanged.
