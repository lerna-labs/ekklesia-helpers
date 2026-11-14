---
"@lerna-labs/ekklesia-helpers": patch
---

`getAddressType` now rejects a `calidus`, `stake` or `stake_test` ID whose payload is not exactly 29 bytes (one header byte and a 28-byte hash), returning `{ error: 'Calidus ID must be 29 bytes' }` or `{ error: 'Stake address must be 29 bytes' }`. It previously accepted a longer payload and returned every byte after the header as the key hash, so the key hash could be longer than 28 bytes. A 28-byte payload was already rejected, now with these messages in place of `{ error: 'Not a valid bech32 address' }`.
