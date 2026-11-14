---
"@lerna-labs/ekklesia-helpers": patch
---

`validateDrep` now returns `true` only when the provider returns a row for the requested DRep ID whose `drep_status` is `registered`. It previously returned `true` for any returned row, so a deregistered DRep, or a DRep ID that had only ever received a delegation, passed. The row is matched to the requested ID in either CIP-105 or CIP-129 form, and `active` does not affect the result. The `DrepInfo` type replaces the `registered` boolean with `drep_status` (`registered`, `deregistered` or `not_registered`), which is what Koios `/drep_info` returns since v1.4.0; the Blockfrost provider sets it from `retired`.
