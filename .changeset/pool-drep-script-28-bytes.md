---
"@lerna-labs/ekklesia-helpers": patch
---

`getAddressType` now rejects a `pool` or `drep_script` ID whose payload is not exactly 28 bytes, returning `{ error: 'Pool ID must be 28 bytes' }` or `{ error: 'DRep credential must be 28 bytes' }`. It previously accepted a 29-byte payload whatever its first byte and returned the last 28 bytes as the key hash, so it accepted 256 other IDs for every pool and every script DRep. It also accepted a `pool` payload of any other length. `validateAddress` with `drep` rejects the same `drep_script` IDs through it. `validateAddress` with `pool` now returns `{ error: 'Invalid pool ID' }` for a payload that is not 28 bytes, where it previously threw.
