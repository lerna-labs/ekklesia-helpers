---
"@lerna-labs/ekklesia-helpers": minor
---

`getAddressType` now returns `networkId`, typed `number | null` on `AddressTypeInfo`. For a `stake` or `stake_test` address it is the low four bits of the header byte (0 for a testnet, 1 for mainnet, per CIP-0019 "Network Tag"). For `drep`, `drep_script`, `pool` and `calidus` IDs, which carry no network, it is `null`.
