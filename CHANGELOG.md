# @lerna-labs/ekklesia-helpers

## 2.1.0

### Minor Changes

- 7c969c7: `getAddressType` now returns `networkId`, typed `number | null` on `AddressTypeInfo`. For a `stake` or `stake_test` address it is the low four bits of the header byte (0 for a testnet, 1 for mainnet, per CIP-0019 "Network Tag"). For `drep`, `drep_script`, `pool` and `calidus` IDs, which carry no network, it is `null`.

### Patch Changes

- 40de028: Refresh `brace-expansion` in `package-lock.json` to 1.1.21 and 5.0.12, closing the denial-of-service advisories in earlier releases. All three copies are development-only dependencies of the lint and documentation toolchain, so this has no effect on consumers of the published package.
- 1f501b0: `getAddressType` now rejects a `calidus`, `stake` or `stake_test` ID whose payload is not exactly 29 bytes (one header byte and a 28-byte hash), returning `{ error: 'Calidus ID must be 29 bytes' }` or `{ error: 'Stake address must be 29 bytes' }`. It previously accepted a longer payload and returned every byte after the header as the key hash, so the key hash could be longer than 28 bytes. A 28-byte payload was already rejected, now with these messages in place of `{ error: 'Not a valid bech32 address' }`.
- b83b965: Remove references to unpublished documents from code comments

  Two comments in the compiled `cardanoApi` output pointed readers at documents that are not published with the package. The comments now stand on their own. Behavior is unchanged.

- 5827928: Refresh the development-only `markdown-it`, `vite` and `vitest` lockfile entries to 14.3.3, 8.3.5 and 4.1.12, closing the advisories in earlier releases. All three are dependencies of the documentation and test toolchain, so this has no effect on consumers of the published package.
- e553435: `getAddressType` now rejects a `pool` or `drep_script` ID whose payload is not exactly 28 bytes, returning `{ error: 'Pool ID must be 28 bytes' }` or `{ error: 'DRep credential must be 28 bytes' }`. It previously accepted a 29-byte payload whatever its first byte and returned the last 28 bytes as the key hash, so it accepted 256 other IDs for every pool and every script DRep. It also accepted a `pool` payload of any other length. `validateAddress` with `drep` rejects the same `drep_script` IDs through it. `validateAddress` with `pool` now returns `{ error: 'Invalid pool ID' }` for a payload that is not 28 bytes, where it previously threw.
- b90e2d7: Raise the declared `mongoose` dependency to `^9.11.4`, the first release that fixes GHSA-gg4r-jv3p-qx3c, GHSA-8332-j7wj-wjw4, GHSA-6972-9mcm-vhwj and GHSA-wr5m-5jph-8m96 in mongoose 9.0.0 up to 9.11.3.
- 85ebc41: Refresh the development-only `source-map-js` lockfile entry to 1.2.2 (GHSA-68fv-2mgg-jv7q).
- a52587b: `validateDrep` now returns `true` only when the provider returns a row whose `drep_status` is `registered`. It previously returned `true` for any returned row, so a deregistered DRep, or a DRep ID that had only ever received a delegation, passed. `active` does not affect the result. The `DrepInfo` type replaces the `registered` boolean with `drep_status` (`registered`, `deregistered` or `not_registered`), which is what Koios `/drep_info` returns since v1.4.0. The Blockfrost provider reports a row with a null `last_active_epoch` as `not_registered`, except `drep_always_abstain` and `drep_always_no_confidence`, which stay `registered`.
- d65c012: `verifySignature` now rejects a COSE signature whose protected `address` header does not name the claimed address, returning `{ error: 'The signed address does not match the address provided!' }`. It previously checked only that the signing key's hash matched the address's credential, so it accepted a signature made for one address as valid for another address carrying the same key hash, such as the same stake address on the other network. For a DRep, the header may instead name the DRep key hash, its CIP-129 ID, or a type 6 address carrying the key hash on either network. For a pool signed with its calidus key, it may name the pool ID or the calidus ID. Plain Ed25519 signatures carry no header and are unaffected.
- 276f119: `verifySignature` now requires the signing key's hash to equal the address's credential, or, for a pool with a registered calidus key, that key's hash. It previously checked only that the credential contained that hash, so it accepted a signature for a crafted DRep ID whose credential was longer than 28 bytes and held the signer's key hash. `getAddressType` and `validateAddress` now reject a DRep ID whose key or script credential is not exactly 28 bytes, returning `{ error: 'DRep credential must be 28 bytes' }`.

## 2.0.4

### Patch Changes

- 8695397: `loadRoutes` now rejects when a route file fails to import. Previously a route file that threw on import was logged and skipped, and the call resolved normally, so a server could start with part of its API missing. The walk now continues past a failing file so every other route is still registered, then the call rejects with an error naming each file that failed and its message. A directory that cannot be read also rejects instead of being logged. Callers should let the rejection stop startup before `app.listen()`.
- 17f196b: `sanitizeInput` now strips HTML tags and entities repeatedly until the text stops changing, instead of in a single pass. A single pass could leave two fragments that reassemble into markup once the text between them is removed, for example `<scr<script>ipt>` collapsing to `<script>`. Consumers importing `sanitizeInput` from `@lerna-labs/ekklesia-helpers/validation` get the fix automatically.

## 2.0.3

### Patch Changes

- db912f9: Regenerate `package-lock.json`, which had not been rebuilt since the 2.0.0 release. `brace-expansion` now resolves to 1.1.18 and 5.0.9 everywhere it appears in the tree, and `vitest`, `@vitest/mocker`, and `@vitest/coverage-v8` now resolve to 4.1.11, closing a denial-of-service advisory in `brace-expansion` and a path-traversal advisory in the `vitest` mocker. All three are development-only dependencies, so this has no effect on consumers of the published package. The lockfile's root version had also stayed at 2.0.0 through the 2.0.1 and 2.0.2 releases while `package.json` moved ahead of it; regenerating brings the two back in sync.

## 2.0.2

### Patch Changes

- d152cb1: Bound Blockfrost requests with a timeout and a retry

  `BlockfrostProvider` called `fetch()` with no timeout, so a slow upstream could hold a request open indefinitely. Each attempt is now bounded by a 10 second `AbortController` timeout and retried once before the error propagates — matching the Koios and Handle.me behavior from 2.0.1.

## 2.0.1

### Patch Changes

- 7a61091: Bound Koios and Handle.me requests with a timeout and a retry

  `KoiosProvider` and `fetchHandleMe` called `fetch()` with no timeout, so a slow upstream could hold a request open indefinitely. Each attempt is now bounded by a 10 second `AbortController` timeout and retried once before the error propagates.

- 70a005f: `isPartyToScript` and `validateScriptSignatures` now return `{ error }` for a
  malformed signature or COSE key instead of throwing, matching `verifySignature`.
  A malformed COSE key previously propagated as an uncaught rejection from these
  two functions even though their return type promises `SignatureError`.
- 7b57677: Raise the mongoose dependency floor to ^9.7.2, fixing a moderate-severity prototype pollution issue in update casting present in versions 9.0.0 through 9.7.1. Consumers of this package now resolve a patched mongoose on install.

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
