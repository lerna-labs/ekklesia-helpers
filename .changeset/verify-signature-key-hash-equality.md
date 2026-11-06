---
"@lerna-labs/ekklesia-helpers": patch
---

`verifySignature` now requires the signing key's hash to equal the address's credential, or, for a pool with a registered calidus key, that key's hash. It previously checked only that the credential contained that hash, so it accepted a signature for a crafted DRep ID whose credential was longer than 28 bytes and held the signer's key hash. `getAddressType` and `validateAddress` now reject a DRep ID whose key or script credential is not exactly 28 bytes, returning `{ error: 'DRep credential must be 28 bytes' }`.
