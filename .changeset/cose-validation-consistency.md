---
'@lerna-labs/ekklesia-helpers': patch
---

`isPartyToScript` and `validateScriptSignatures` now return `{ error }` for a
malformed signature or COSE key instead of throwing, matching `verifySignature`.
A malformed COSE key previously propagated as an uncaught rejection from these
two functions even though their return type promises `SignatureError`.
