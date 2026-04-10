/**
 * Public Cardano API helper functions.
 *
 * Uses the configured provider (Koios/Blockfrost) with automatic fallback.
 * Set `PRIMARY_PROVIDER` to `"koios"` or `"blockfrost"` (default: `"koios"`).
 *
 * @module cardano/cardanoApi
 */

import { ScriptHash } from "@emurgo/cardano-serialization-lib-nodejs";

import type { CardanoProvider, PoolMetadata } from "./provider.js";
import { withFallback } from "./provider.js";
import { KoiosProvider, getKoiosConfig } from "./koiosProvider.js";
import { BlockfrostProvider, getBlockfrostConfig } from "./blockfrostProvider.js";

/** Calidus key record. */
export interface CalidusKey {
  pool_id_bech32: string;
  pool_status: string;
  calidus_nonce: number;
  calidus_pub_key: string;
  calidus_id_bech32: string;
  tx_hash: string;
  epoch_no: number;
  block_height: number;
  block_time: number;
}

/** Payment address details in a transaction I/O. */
export interface TxPaymentAddr {
  cred: string;
  bech32: string;
}

/** Transaction input or output. */
export interface TxIO {
  value: string;
  tx_hash: string;
  tx_index: number;
  stake_addr: string | null;
  payment_addr: TxPaymentAddr;
}

/** Transaction information. */
export interface TxInfo {
  tx_hash: string;
  block_hash: string;
  block_height: number;
  epoch_no: number;
  tx_timestamp: number;
  total_output: string;
  fee: string;
  treasury_donation: string | null;
  deposit: string;
  inputs: TxIO[];
  outputs: TxIO[];
}

/** Rich identity metadata returned by {@link fetchIdentity}. */
export interface NameResult {
  displayName: string;
  fullName?: string;
  description?: string;
  homepage?: string;
  type: "pool" | "drep" | "handle";
}

/** DRep info record. */
export interface DrepInfo {
  drep_id: string;
  hex: string;
  has_script: boolean;
  registered: boolean;
  deposit: string;
  active: boolean;
  expires_epoch_no: number;
  amount: string;
  meta_url: string | null;
  meta_hash: string | null;
}

// ---------------------------------------------------------------------------
// Provider setup
// ---------------------------------------------------------------------------

let _primary: CardanoProvider | null = null;
let _secondary: CardanoProvider | null = null;

function getProviders(): { primary: CardanoProvider; secondary: CardanoProvider | null } {
  if (!_primary) {
    let koios: CardanoProvider | null = null;
    let blockfrost: CardanoProvider | null = null;

    try {
      koios = new KoiosProvider(getKoiosConfig());
    } catch {
      /* Koios not configured */
    }
    try {
      blockfrost = new BlockfrostProvider(getBlockfrostConfig());
    } catch {
      /* Blockfrost not configured */
    }

    const preferBlockfrost = process.env.PRIMARY_PROVIDER === "blockfrost";
    _primary = (preferBlockfrost ? (blockfrost ?? koios) : (koios ?? blockfrost)) ?? null;
    _secondary = _primary === koios ? blockfrost : koios;

    if (!_primary) {
      throw new Error(
        "No Cardano provider configured. Set API_URL/API_TOKEN (Koios) or BLOCKFROST_URL/BLOCKFROST_PROJECT_ID (Blockfrost).",
      );
    }
  }
  return { primary: _primary, secondary: _secondary };
}

/**
 * Reset the cached providers. Useful for testing.
 *
 * @example
 * ```ts
 * resetProviders();
 * ```
 */
export function resetProviders(): void {
  _primary = null;
  _secondary = null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches script information for a given script hash.
 *
 * @param scriptHash - The hexadecimal script hash to look up.
 * @returns The script data object if found, `false` otherwise.
 *
 * @example
 * ```ts
 * const script = await getScript("abc123...");
 * if (script) {
 *   console.log(script.type);
 * }
 * ```
 */
export async function getScript(scriptHash: string): Promise<Record<string, unknown> | false> {
  try {
    ScriptHash.from_hex(scriptHash);
  } catch (_error) {
    console.error(`Not a valid script hash: ${scriptHash}`);
    throw new Error("Not a valid script hash");
  }

  const { primary, secondary } = getProviders();

  try {
    return await withFallback(primary, secondary, (p) => p.fetchScript(scriptHash));
  } catch (error) {
    console.log("Error fetching script hash:", scriptHash);
    console.error(error);
  }

  return false;
}

/**
 * Fetches the latest Calidus key for a given stake pool.
 *
 * @param poolBech32 - The pool ID in bech32 format (e.g., `"pool1..."`).
 * @returns The Calidus key record if found, `null` otherwise.
 *
 * @example
 * ```ts
 * const key = await fetchCalidusKey("pool1abc...");
 * if (key) {
 *   console.log(key.calidus_pub_key);
 * }
 * ```
 */
export async function fetchCalidusKey(poolBech32: string): Promise<CalidusKey | null> {
  try {
    const { primary, secondary } = getProviders();
    return await withFallback(primary, secondary, (p) => p.fetchCalidusKey(poolBech32));
  } catch (error) {
    console.error("Error fetching Calidus key:", error);
    return null;
  }
}

/**
 * Fetches the DRep name for a given DRep ID.
 *
 * @param drepId - The DRep ID in bech32 format.
 * @returns The DRep name if found, `undefined` if metadata lacks a name, `null` on error.
 *
 * @example
 * ```ts
 * const name = await fetchDrepName("drep1abc...");
 * ```
 */
export async function fetchDrepName(drepId: string): Promise<string | undefined | null> {
  try {
    const { primary, secondary } = getProviders();
    const data = await withFallback(primary, secondary, (p) => p.fetchDrepInfo([drepId]));

    if (data.length === 0) {
      console.log("No DRep found");
      return null;
    }

    if (!data[0].meta_url) {
      console.log("No DRep metadata URL found");
      return undefined;
    }

    try {
      console.log("Fetching DRep metadata:", data[0].meta_url);
      const metaResponse = await fetch(data[0].meta_url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const metadata = (await metaResponse.json()) as {
        body?: { dRepName?: { "@value"?: string }; givenName?: string };
      };

      if (metadata.body?.dRepName?.["@value"]) {
        return metadata.body.dRepName["@value"];
      } else if (metadata.body?.givenName) {
        return metadata.body.givenName;
      } else {
        console.log("No DRep name found");
        return undefined;
      }
    } catch (error) {
      console.error("Error fetching DRep metadata:", error);
      return undefined;
    }
  } catch (error) {
    console.error("Error fetching DRep name:", error);
    return null;
  }
}

/**
 * Validates that a DRep ID is registered.
 *
 * @param drepId - The DRep ID in bech32 format.
 * @returns `true` if the DRep is registered, `false` otherwise.
 *
 * @example
 * ```ts
 * const valid = await validateDrep("drep1abc...");
 * ```
 */
export async function validateDrep(drepId: string): Promise<boolean> {
  try {
    const { primary, secondary } = getProviders();
    const data = await withFallback(primary, secondary, (p) => p.fetchDrepInfo([drepId]));
    return data.length > 0;
  } catch (error) {
    console.error("Error validating DRep:", error);
    return false;
  }
}

/**
 * Fetches the Cardano handle for a given address.
 *
 * @param address - The Cardano address (stake or payment address).
 * @returns The handle name if found, `null` otherwise.
 *
 * @example
 * ```ts
 * const handle = await fetchHandle("stake1u...");
 * ```
 */
export async function fetchHandle(address: string): Promise<string | null> {
  try {
    const { primary, secondary } = getProviders();
    return await withFallback(primary, secondary, (p) => p.fetchHandle(address));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error fetching handle:", message);
    return null;
  }
}

/**
 * Fetches transaction information.
 *
 * @param txHash - Transaction hash in hex format.
 * @returns The transaction data if found, `null` otherwise.
 *
 * @example
 * ```ts
 * const tx = await fetchTxInfo("abc123...");
 * if (tx) console.log(tx.treasury_donation);
 * ```
 */
export async function fetchTxInfo(txHash: string): Promise<TxInfo | null> {
  try {
    const { primary, secondary } = getProviders();
    return await withFallback(primary, secondary, (p) => p.fetchTxInfo(txHash));
  } catch (error) {
    console.error("Error fetching tx info:", error);
    return null;
  }
}

/**
 * Fetches a stake pool's ticker symbol by its bech32 pool ID.
 *
 * @param poolBech32 - The pool ID in bech32 format (e.g., `"pool1..."`).
 * @returns The ticker string (e.g., `"NUTS"`) if found, `null` otherwise.
 *
 * @example
 * ```ts
 * const ticker = await fetchPoolTicker("pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy");
 * console.log(ticker); // "NUTS"
 * ```
 */
export async function fetchPoolTicker(poolBech32: string): Promise<string | null> {
  try {
    const { primary, secondary } = getProviders();
    const metadata = await withFallback(primary, secondary, (p) => p.fetchPoolMetadata(poolBech32));
    return metadata?.ticker ?? null;
  } catch (error) {
    console.error("Error fetching pool ticker:", error);
    return null;
  }
}

/**
 * Fetches full pool metadata by bech32 pool ID.
 *
 * @param poolBech32 - The pool ID in bech32 format (e.g., `"pool1..."`).
 * @returns The pool metadata if found, `null` otherwise.
 *
 * @example
 * ```ts
 * const meta = await fetchPoolMetadata("pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy");
 * console.log(meta?.name); // "Stake Nuts"
 * ```
 */
export async function fetchPoolMetadata(poolBech32: string): Promise<PoolMetadata | null> {
  try {
    const { primary, secondary } = getProviders();
    return await withFallback(primary, secondary, (p) => p.fetchPoolMetadata(poolBech32));
  } catch (error) {
    console.error("Error fetching pool metadata:", error);
    return null;
  }
}

/** Bech32 prefixes that {@link fetchName} can resolve. */
type NameablePrefix = "addr" | "addr_test" | "stake" | "stake_test" | "drep" | "pool";

const NAMEABLE_PREFIXES: NameablePrefix[] = [
  "addr_test",
  "stake_test",
  "addr",
  "stake",
  "drep",
  "pool",
];

/**
 * Resolves a human-readable name for any supported bech32 identifier.
 *
 * Routes to the appropriate lookup based on the bech32 prefix:
 * - `addr` / `addr_test` → Cardano handle via {@link fetchHandle}
 * - `stake` / `stake_test` → Cardano handle via {@link fetchHandle}
 * - `drep` → DRep display name via {@link fetchDrepName}
 * - `pool` → Stake pool name (or ticker) via {@link fetchPoolMetadata}
 *
 * @param bech32Id - A bech32-encoded Cardano identifier.
 * @returns The resolved name, or `null` if not found or the prefix is unsupported.
 *
 * @example
 * ```ts
 * await fetchName("pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy"); // "Stake Nuts"
 * await fetchName("stake1u98nnlkvkk23vtvf9273uq7cph5ww6u2yq2389psuqet90sv4xv9v"); // "alice"
 * await fetchName("drep1abc..."); // "Alice DRep"
 * ```
 */
export async function fetchName(bech32Id: string): Promise<string | null> {
  const prefix = NAMEABLE_PREFIXES.find((p) => bech32Id.startsWith(p));

  if (!prefix) {
    console.error(`Unsupported bech32 prefix in: ${bech32Id}`);
    return null;
  }

  switch (prefix) {
    case "addr":
    case "addr_test":
    case "stake":
    case "stake_test":
      return fetchHandle(bech32Id);

    case "drep":
      return (await fetchDrepName(bech32Id)) ?? null;

    case "pool": {
      const meta = await fetchPoolMetadata(bech32Id);
      return meta?.ticker ?? meta?.name ?? null;
    }
  }
}

/**
 * Fetch rich identity metadata for a Cardano entity.
 *
 * Routes by bech32 prefix to the appropriate provider method and returns
 * a structured {@link NameResult} with display name, description, and type.
 *
 * @param bech32Id - A bech32-encoded pool, DRep, or address/stake identifier.
 * @returns A {@link NameResult} or `null` if the entity cannot be resolved.
 *
 * @example
 * ```ts
 * await fetchIdentity("pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy");
 * // { displayName: "NUTS", fullName: "Stake Nuts", description: "A pool", homepage: "https://example.com", type: "pool" }
 * ```
 */
export async function fetchIdentity(bech32Id: string): Promise<NameResult | null> {
  const prefix = NAMEABLE_PREFIXES.find((p) => bech32Id.startsWith(p));

  if (!prefix) {
    console.error(`Unsupported bech32 prefix in: ${bech32Id}`);
    return null;
  }

  switch (prefix) {
    case "addr":
    case "addr_test":
    case "stake":
    case "stake_test": {
      const handle = await fetchHandle(bech32Id);
      return handle ? { displayName: handle, type: "handle" } : null;
    }

    case "drep": {
      const name = await fetchDrepName(bech32Id);
      return name ? { displayName: name, type: "drep" } : null;
    }

    case "pool": {
      const meta = await fetchPoolMetadata(bech32Id);
      if (!meta) return null;
      const displayName = meta.ticker ?? meta.name;
      if (!displayName) return null;
      return {
        displayName,
        fullName: meta.name ?? undefined,
        description: meta.description ?? undefined,
        homepage: meta.homepage ?? undefined,
        type: "pool",
      };
    }
  }
}
