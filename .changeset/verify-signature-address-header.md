---
'@lerna-labs/ekklesia-helpers': patch
---

`verifySignature` now rejects a COSE signature whose protected `address` header does not name the claimed address, returning `{ error: 'The signed address does not match the address provided!' }`. It previously checked only that the signing key's hash matched the address's credential, so it accepted a signature made for one address as valid for another address carrying the same key hash, such as the same stake address on the other network. For a DRep, the header may instead name the DRep key hash, its CIP-129 ID, or a type 6 address carrying the key hash on either network. For a pool signed with its calidus key, it may name the pool ID or the calidus ID. Plain Ed25519 signatures carry no header and are unaffected.
