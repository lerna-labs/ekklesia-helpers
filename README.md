# @ekklesia/helpers

[![CI](https://github.com/lerna-labs/ekklesia-helpers/actions/workflows/ci.yml/badge.svg)](https://github.com/lerna-labs/ekklesia-helpers/actions/workflows/ci.yml)

Shared helper functions for the Ekklesia platform — de-duplicated from the
proposals and voting modules into a single, typed TypeScript library.

## Installation

This package is published to GitHub Packages. Configure your `.npmrc`:

```
@ekklesia:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then install:

```bash
npm install @ekklesia/helpers
```

## Usage

Import from the root or from a specific subpath:

```ts
// Root import
import {validateAddress, verifySignature} from "@ekklesia/helpers";

// Subpath imports (better tree shaking)
import {validateAddress} from "@ekklesia/helpers/validation";
import {verifySignature} from "@ekklesia/helpers/crypto";
import {verifyToken} from "@ekklesia/helpers/auth";
import {fetchCalidusKey, verifyDeposit} from "@ekklesia/helpers/cardano";
import {connectToDatabase, loadRoutes} from "@ekklesia/helpers/server";
```

### Example: Validate a Cardano address

```ts
import {validateAddress} from "@ekklesia/helpers/validation";

const result = validateAddress("stake1uxmeqz...", "stake");
if (typeof result === "string") {
    console.log("Valid stake address:", result);
}
```

### Example: Verify a COSE signature

```ts
import {verifySignature} from "@ekklesia/helpers/crypto";

const isValid = await verifySignature(payload, address, signatureObject);
```

## API

### Validation (`@ekklesia/helpers/validation`)

| Export            | Description                                                              |
|-------------------|--------------------------------------------------------------------------|
| `validateAddress` | Validates Cardano addresses (bech32, hex, DRep CIP-105/CIP-129, calidus) |
| `getAddressType`  | Returns address type, key hash, and hash type from a bech32 address      |
| `pubKeyToBech32`  | Converts a hex public key to a bech32 address (DRep or calidus)          |
| `extractParts`    | Extracts header byte and body from a hex-encoded address                 |
| `sanitizeInput`   | Sanitizes user input (strips HTML tags/entities, preserves URLs)         |

### Crypto (`@ekklesia/helpers/crypto`)

| Export                     | Description                                                          |
|----------------------------|----------------------------------------------------------------------|
| `verifySignature`          | Verifies Ed25519 and COSE Sign1 signatures against a Cardano address |
| `isPartyToScript`          | Checks if an address is a signatory of a native script               |
| `getScriptCriteria`        | Extracts required signature criteria from a native script            |
| `validateScriptSignatures` | Validates multiple signatures against a native script's requirements |

### Auth (`@ekklesia/helpers/auth`)

| Export        | Description                                              |
|---------------|----------------------------------------------------------|
| `verifyToken` | Verifies JWT tokens from cookies or Authorization header |

### Cardano (`@ekklesia/helpers/cardano`)

| Export            | Description                                                   |
|-------------------|---------------------------------------------------------------|
| `getScript`       | Fetches a native script from the Koios API by script hash     |
| `fetchCalidusKey` | Fetches the calidus (pool cold) key for a stake address       |
| `fetchDrepName`   | Fetches the on-chain registered name for a DRep               |
| `validateDrep`    | Validates a DRep ID and returns its registration status       |
| `fetchHandle`     | Resolves an ADA Handle to a stake address (Handle.me + Koios) |
| `fetchTxInfo`     | Fetches detailed transaction info from the Koios API          |
| `verifyDeposit`   | Verifies transaction deposits and treasury donations on-chain |

### Server (`@ekklesia/helpers/server`)

| Export                      | Description                                               |
|-----------------------------|-----------------------------------------------------------|
| `initializeConsole`         | Overrides console methods with colored log-level prefixes |
| `resetConsole`              | Restores original console behavior                        |
| `connectToDatabase`         | Connects to MongoDB with auto-reconnect                   |
| `disconnectFromDatabase`    | Gracefully disconnects from MongoDB                       |
| `checkDatabaseConnection`   | Returns current database connection status                |
| `isDatabaseConnected`       | Boolean check for active database connection              |
| `checkDatabaseConnectionMW` | Express middleware that returns 503 if database is down   |
| `loadEnvironmentVariables`  | Loads `.env.{NODE_ENV}` files with fallback to `.env`     |
| `loadRoutes`                | Recursively loads Express route files from a directory    |

## Environment Variables

The Koios helpers (`getScript`, `fetchCalidusKey`, etc.) require:

| Variable    | Description            |
|-------------|------------------------|
| `API_URL`   | Koios API base URL     |
| `API_TOKEN` | Koios API bearer token |

The auth helper (`verifyToken`) requires:

| Variable     | Description            |
|--------------|------------------------|
| `JWT_SECRET` | Secret for JWT signing |

## Development

```bash
npm install            # Install dependencies
npm run build          # Compile TypeScript
npm run lint           # ESLint + Prettier check
npm run lint:fix       # Auto-fix lint issues
npm run test           # Run tests
npm run test:coverage  # Run tests with coverage
```

## Contributing

1. Create a feature branch from `main`
2. Ensure `npm run lint && npm run test:coverage && npm run build` all pass
3. Open a pull request
