---
'@lerna-labs/ekklesia-helpers': major
---

Surface provider outages instead of reporting "not found" (#9)

The Cardano helpers caught every error and returned `null`/`false`, so an
unreachable or misconfigured provider — an expired `API_TOKEN`, say — was
indistinguishable from a transaction, DRep, or pool that genuinely does not
exist. Callers had no way to tell the two apart.

`getScript`, `fetchCalidusKey`, `fetchDrepName`, `validateDrep`, `fetchHandle`,
`fetchHandles`, `fetchTxInfo`, `fetchPoolTicker`, `fetchPoolMetadata` and
`verifyDeposit` now let `ProviderError` propagate. `fetchName` and
`fetchIdentity` propagate too, by way of the lookups they delegate to. A falsy result means the
provider answered and the thing does not exist; a throw means we could not ask.
The secondary-provider fallback is unchanged and still runs first.

This matters most for `verifyDeposit`, which previously turned an outage into
`{ error: 'Transaction not found' }` — rejecting a legitimate deposit.

Off-chain metadata is exempt: `fetchDrepName` and `fetchPoolMetadata` fetch
operator-controlled URLs that are expected to be flaky, so an unreachable or
malformed metadata document still yields `undefined` / partial metadata.

**Breaking:** these functions previously never threw. Call sites in the
backend, proposal and voting modules need `try`/`catch` around them — see the
"Errors vs. absence" section in the README for the migration pattern.
