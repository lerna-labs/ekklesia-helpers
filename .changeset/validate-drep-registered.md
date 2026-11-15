---
"@lerna-labs/ekklesia-helpers": patch
---

`validateDrep` now returns `true` only when the provider returns a row whose `drep_status` is `registered`. It previously returned `true` for any returned row, so a deregistered DRep, or a DRep ID that had only ever received a delegation, passed. `active` does not affect the result. The `DrepInfo` type replaces the `registered` boolean with `drep_status` (`registered`, `deregistered` or `not_registered`), which is what Koios `/drep_info` returns since v1.4.0. The Blockfrost provider reports a row with a null `last_active_epoch` as `not_registered`, except `drep_always_abstain` and `drep_always_no_confidence`, which stay `registered`.
