# @lerna-labs/ekklesia-helpers

## 2.0.0

### Major Changes

- 8488e58: Resolve every handle an address holds, in a stable order (#8)

  `fetchHandles(address)` is new and returns all of an address's handles rather
  than one arbitrary pick, letting callers decide which one is "primary". The
  order is deterministic: the holder's own default handle first where they have
  set one, then shortest-first with a lexicographic tiebreak.

  `fetchHandle(address)` keeps its signature and now returns the first entry of
  that list. Previously it returned `data[0]` from an unsorted Koios response, so
  an address holding several handles could resolve to a different name run to
  run.

  The Koios fallback also now looks up every handle asset it finds instead of only
  the first, and non-error conditions ("No handle found", the Handle.me-to-Koios
  fallback) no longer write to the console.

  **Breaking:** the `CardanoProvider` interface replaces `fetchHandle(address):
Promise<string | null>` with `fetchHandles(address): Promise<string[]>`. Custom
  provider implementations must be updated; callers of the exported helper
  functions are unaffected.

- 8081282: Surface provider outages instead of reporting "not found" (#9)

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

  The `/crypto` signature helpers (`verifySignature`, `isPartyToScript`,
  `validateScriptSignatures`) propagate too, since they resolve scripts and
  Calidus keys through these lookups. Their `SignatureError` returns are
  correspondingly more trustworthy: `'Script not found'` now means the script is
  genuinely unpublished rather than "we could not check". Note that a
  `SignatureError` is truthy, so callers gating on completeness with `if (!result)`
  were already falling through on that error and should be tightened to
  `if (result !== true)`.

  Off-chain metadata is exempt: `fetchDrepName` and `fetchPoolMetadata` fetch
  operator-controlled URLs that are expected to be flaky, so an unreachable or
  malformed metadata document still yields `undefined` / partial metadata.

  **Breaking:** these functions previously never threw. Call sites in the
  backend, proposal and voting modules need `try`/`catch` around them — see the
  "Errors vs. absence" section in the README for the migration pattern.

### Minor Changes

- 92dca31: Distinguish credential and throttling failures from transient ones

  `ProviderError` reported only `[Koios] POST /tx_info failed`, so callers could
  neither see why a request failed nor tell a dead API key from a blip. Both are
  now addressed.

  **Messages carry the upstream explanation.** The status and a bounded slice of
  the response body are folded in:

  ```
  [Koios] POST /tx_info failed: HTTP 403 Subscription expired, Please renew your
  token from https://koios.rest/Profile.html
  ```

  This matters because a status alone is often ambiguous. Probing the live API
  with a genuinely expired token showed Koios answers `403` for an expired
  subscription, an unrecognised token, and a malformed one alike, and only the
  body distinguishes them.

  **Two subclasses carve out the failures retrying will not fix.** Both extend
  `ProviderError`, so existing `instanceof ProviderError` handling keeps working
  unchanged.

  | error                    | statuses        | meaning                                      |
  | ------------------------ | --------------- | -------------------------------------------- |
  | `ProviderAuthError`      | 401, 403, 418   | credentials rejected; needs an operator      |
  | `ProviderRateLimitError` | 402, 429        | throttled or quota exhausted; wait and retry |
  | `ProviderError`          | everything else | transient; retry                             |

  `ProviderRateLimitError` exposes `retryAfterSeconds` from the `Retry-After`
  header when the provider sends one. Every `ProviderError` now also carries
  `status` when the failure came from a response.

  Applies to both the Koios and Blockfrost providers. The fallback provider is
  still tried before any of these is raised.

## 1.1.1

### Patch Changes

- 0d72439: Update the cbor dependency to version 10.
