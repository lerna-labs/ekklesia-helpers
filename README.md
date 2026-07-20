# @lerna-labs/ekklesia-helpers

[![CI](https://github.com/lerna-labs/ekklesia-helpers/actions/workflows/ci.yml/badge.svg)](https://github.com/lerna-labs/ekklesia-helpers/actions/workflows/ci.yml)

Shared helper functions for the Ekklesia platform — deduplicated from the
proposals and voting modules into a single, typed TypeScript library.

## Installation

```bash
npm install @lerna-labs/ekklesia-helpers
```

## Usage

Import from the root or from a specific subpath:

```ts
// Root import
import { validateAddress, verifySignature } from '@lerna-labs/ekklesia-helpers';

// Subpath imports (better tree shaking)
import { validateAddress } from '@lerna-labs/ekklesia-helpers/validation';
import { verifySignature } from '@lerna-labs/ekklesia-helpers/crypto';
import { verifyToken } from '@lerna-labs/ekklesia-helpers/auth';
import { fetchName, fetchIdentity, verifyDeposit } from '@lerna-labs/ekklesia-helpers/cardano';
import { connectToDatabase, loadRoutes } from '@lerna-labs/ekklesia-helpers/server';
import { canonicalize, canonicalBytes } from '@lerna-labs/ekklesia-helpers/json';
```

### Example: Validate a Cardano address

```ts
import { validateAddress } from '@lerna-labs/ekklesia-helpers/validation';

const result = validateAddress('stake1uxmeqz...', 'stake');
if (typeof result === 'string') {
  console.log('Valid stake address:', result);
}
```

### Example: Verify a COSE signature

```ts
import { verifySignature } from '@lerna-labs/ekklesia-helpers/crypto';

const isValid = await verifySignature(payload, address, signatureObject);
```

### Example: Resolve a Cardano identity

```ts
import { fetchName, fetchIdentity } from '@lerna-labs/ekklesia-helpers/cardano';

// Simple name lookup
await fetchName('pool1qqqqqdk4zh...'); // "ATADA"
await fetchName('drep1y2200we9c9...'); // "YUTA"
await fetchName('stake1uxekfkqgs4...'); // "426"

// Rich identity with metadata
await fetchIdentity('pool1qqqqqdk4zh...');
// { displayName: "ATADA", fullName: "ATADA Stakepool in Austria", description: "...", homepage: "https://stakepool.at", type: "pool" }
```

## API

### Validation (`@lerna-labs/ekklesia-helpers/validation`)

| Export            | Description                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| `validateAddress` | Validates Cardano addresses (bech32, hex, DRep CIP-105/CIP-129, calidus) |
| `getAddressType`  | Returns address type, key hash, and hash type from a bech32 address      |
| `pubKeyToBech32`  | Converts a hex public key to a bech32 address (DRep or calidus)          |
| `extractParts`    | Extracts header byte and body from a hex-encoded address                 |
| `sanitizeInput`   | Sanitizes user input (strips HTML tags/entities, preserves URLs)         |

### Crypto (`@lerna-labs/ekklesia-helpers/crypto`)

| Export                     | Description                                                          |
| -------------------------- | -------------------------------------------------------------------- |
| `verifySignature`          | Verifies Ed25519 and COSE Sign1 signatures against a Cardano address |
| `isPartyToScript`          | Checks if an address is a signatory of a native script               |
| `getScriptCriteria`        | Extracts required signature criteria from a native script            |
| `validateScriptSignatures` | Validates multiple signatures against a native script's requirements |

### Auth (`@lerna-labs/ekklesia-helpers/auth`)

| Export        | Description                                              |
| ------------- | -------------------------------------------------------- |
| `verifyToken` | Verifies JWT tokens from cookies or Authorization header |

### Cardano (`@lerna-labs/ekklesia-helpers/cardano`)

| Export              | Description                                                        |
| ------------------- | ------------------------------------------------------------------ |
| `getScript`         | Fetches a native script by script hash                             |
| `fetchCalidusKey`   | Fetches the calidus (pool cold) key for a stake pool               |
| `fetchDrepName`     | Fetches the on-chain registered name for a DRep                    |
| `validateDrep`      | Validates a DRep ID and returns its registration status            |
| `fetchHandle`       | Resolves the most representative ADA Handle for an address         |
| `fetchHandles`      | Resolves every ADA Handle held by an address, in a stable order    |
| `fetchTxInfo`       | Fetches detailed transaction info                                  |
| `fetchPoolTicker`   | Fetches a stake pool's ticker symbol                               |
| `fetchPoolMetadata` | Fetches full pool metadata (ticker, name, description, homepage)   |
| `fetchName`         | Resolves a human-readable name for any bech32 identifier           |
| `fetchIdentity`     | Returns rich identity metadata (displayName, type, description...) |
| `verifyDeposit`     | Verifies transaction deposits and treasury donations on-chain      |

#### Errors vs. absence

These helpers distinguish "the chain says no" from "we could not ask". A
`null` / `false` / `[]` result always means the provider answered and the thing
genuinely does not exist. If the provider is unreachable, misconfigured, or
rejects the request — an expired `API_TOKEN`, for instance — the call throws a
`ProviderError` naming the provider that failed, after the configured fallback
provider has also been tried.

This matters most for `verifyDeposit`: an outage must never read as a rejected
deposit.

```ts
import { fetchTxInfo, ProviderError } from '@lerna-labs/ekklesia-helpers/cardano';

try {
  const tx = await fetchTxInfo(txHash);
  if (tx === null) {
    // No such transaction on chain.
  }
} catch (error) {
  if (error instanceof ProviderError) {
    // Could not reach the chain — retry, alert, or degrade. Do not treat
    // this as "transaction does not exist".
  }
  throw error;
}
```

#### Telling failures apart

Not every failure wants the same response, so `ProviderError` has two subclasses.
Both extend it, so the block above keeps catching everything; narrow further only
where it changes what you do.

| error                    | meaning                                  | what to do                                                  |
| ------------------------ | ---------------------------------------- | ----------------------------------------------------------- |
| `ProviderAuthError`      | credentials rejected (401, 403, 418)     | retrying will not help — surface it and get the key renewed |
| `ProviderRateLimitError` | throttled or quota exhausted (402, 429)  | wait, then retry; honour `retryAfterSeconds` when set       |
| `ProviderError`          | transient: network failure, timeout, 5xx | retry                                                       |

```ts
import {
  fetchTxInfo,
  ProviderError,
  ProviderAuthError,
  ProviderRateLimitError,
} from '@lerna-labs/ekklesia-helpers/cardano';

try {
  const tx = await fetchTxInfo(txHash);
} catch (error) {
  if (error instanceof ProviderAuthError) {
    // e.g. "[Koios] POST /tx_info failed: HTTP 403 Subscription expired,
    // Please renew your token from https://koios.rest/Profile.html"
    alertOnCall(error.message);
  } else if (error instanceof ProviderRateLimitError) {
    await sleep((error.retryAfterSeconds ?? 60) * 1000);
  } else if (error instanceof ProviderError) {
    scheduleRetry();
  }
  throw error;
}
```

Every `ProviderError` carries `provider`, `status` (when the failure came from a
response), and the upstream explanation in its message. Providers frequently
return the same status for different causes — Koios answers `403` for an expired
subscription, an unrecognised token, and a malformed one alike — so the message
body is what tells them apart.

The fallback provider is always tried before any of these is raised.

Off-chain metadata is deliberately exempt. `fetchDrepName` and
`fetchPoolMetadata` fetch operator-controlled URLs that are expected to be
flaky, so an unreachable or malformed metadata document yields `undefined` /
partial metadata rather than throwing.

### Server (`@lerna-labs/ekklesia-helpers/server`)

| Export                      | Description                                               |
| --------------------------- | --------------------------------------------------------- |
| `initializeConsole`         | Overrides console methods with colored log-level prefixes |
| `resetConsole`              | Restores original console behavior                        |
| `connectToDatabase`         | Connects to MongoDB with auto-reconnect                   |
| `disconnectFromDatabase`    | Gracefully disconnects from MongoDB                       |
| `checkDatabaseConnection`   | Returns current database connection status                |
| `isDatabaseConnected`       | Boolean check for active database connection              |
| `checkDatabaseConnectionMW` | Express middleware that returns 503 if database is down   |
| `loadEnvironmentVariables`  | Loads `.env.{NODE_ENV}` files with fallback to `.env`     |
| `loadRoutes`                | Recursively loads Express route files from a directory    |

### Canonical JSON (`@lerna-labs/ekklesia-helpers/json`)

| Export           | Description                                                        |
| ---------------- | ------------------------------------------------------------------ |
| `canonicalize`   | Serializes a value to canonical JSON (RFC 8785 / JCS), sorted keys |
| `canonicalBytes` | Returns the UTF-8 bytes of `canonicalize(value)` (a `Uint8Array`)  |

`canonicalize` produces a deterministic, whitespace-free string that is
**byte-for-byte stable regardless of key insertion order** — it is the canonical
byte target for signing and hashing (e.g. blake2b `voteHash` / `merkleRoot`).
The output follows [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) so that
implementations in other languages interoperate. Object keys are sorted by
UTF-16 code unit, array order is preserved, and non-finite numbers
(`NaN`/`Infinity`) are rejected with a `TypeError`.

```ts
import { canonicalize, canonicalBytes } from '@lerna-labs/ekklesia-helpers/json';

canonicalize({ b: 1, a: 2 }); // '{"a":2,"b":1}'
canonicalBytes({ b: 1, a: 2 }); // Uint8Array of the UTF-8 bytes, ready to hash
```

## Environment Variables

The Cardano helpers require at least one provider configured:

| Variable                | Description                                                    |
| ----------------------- | -------------------------------------------------------------- |
| `API_URL`               | Koios API base URL                                             |
| `API_TOKEN`             | Koios API bearer token                                         |
| `BLOCKFROST_URL`        | Blockfrost API base URL (no trailing slash)                    |
| `BLOCKFROST_PROJECT_ID` | Blockfrost project ID                                          |
| `NETWORK_NAME`          | Network name (`mainnet` or `preprod`)                          |
| `PRIMARY_PROVIDER`      | Preferred provider (`koios` or `blockfrost`, default: `koios`) |

If both providers are configured, the secondary is used as automatic fallback.

The auth helper (`verifyToken`) requires:

| Variable     | Description            |
| ------------ | ---------------------- |
| `JWT_SECRET` | Secret for JWT signing |

## Development

```bash
npm install            # Install dependencies
npm run build          # Compile TypeScript
npm run lint           # ESLint + Prettier check
npm run lint:fix       # Auto-fix lint issues
npm run test           # Run tests
npm run test:coverage  # Run tests with coverage
npm run docs           # Generate API documentation
```

## Live Tests

Live integration tests run against real mainnet APIs. Copy `.local.env.example` to `.local.env` and fill in your credentials (at least one provider required):

```bash
cp .local.env.example .local.env
# Edit .local.env with your API credentials

source .local.env && LIVE_TEST=true npx vitest run --reporter=verbose src/cardano/cardanoApi.live.test.ts
```

## Contributing

1. Create a feature branch from `development` (the integration branch)
2. Ensure `npm run lint && npm run test:coverage && npm run build` all pass
3. Add a changeset (`npx changeset`) describing your change
4. Open a pull request into `development`

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.
