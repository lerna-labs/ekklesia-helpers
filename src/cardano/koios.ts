/**
 * Koios API helper functions for interacting with Cardano blockchain data.
 *
 * All functions read `API_URL` and `API_TOKEN` from `process.env` at call time.
 *
 * @module cardano/koios
 */

import { ScriptHash } from "@emurgo/cardano-serialization-lib-nodejs";

function getApiConfig(): { apiUrl: string; apiToken: string } {
  const apiUrl = process.env.API_URL;
  const apiToken = process.env.API_TOKEN;
  if (!apiUrl) throw new Error("API_URL is not set in the environment variables.");
  if (!apiToken) throw new Error("API_TOKEN is not set in the environment variables.");
  return { apiUrl, apiToken };
}

/** Calidus key record from the Koios API. */
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

/** Transaction information from the Koios API. */
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

/** DRep info record from the Koios API. */
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

/**
 * Fetches script information from the Koios API for a given script hash.
 *
 * Validates the script hash format before making the API call.
 *
 * @param scriptHash - The hexadecimal script hash to look up.
 * @returns The script data object if found, `false` otherwise.
 *
 * @example
 * ```ts
 * const script = await getScript("abc123...");
 * if (script) {
 *   console.log(script.type); // "timelock"
 * }
 * ```
 */
export async function getScript(scriptHash: string): Promise<Record<string, unknown> | false> {
  const { apiUrl, apiToken } = getApiConfig();

  // Validate the script hash format
  try {
    ScriptHash.from_hex(scriptHash);
  } catch (_error) {
    console.error(`Not a valid script hash: ${scriptHash}`);
    throw new Error("Not a valid script hash");
  }

  try {
    const scripts = await fetch(apiUrl + "/script_info", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "count=exact",
        authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({ _script_hashes: [scriptHash] }),
    });

    const script_data = (await scripts.json()) as Record<string, unknown>[];

    if (script_data.length > 0) {
      return script_data[0];
    }
    return false;
  } catch (error) {
    console.log("Error fetching script hash:", scriptHash);
    console.error(error);
  }

  return false;
}

/**
 * Fetches the latest Calidus key for a given stake pool from the Koios API.
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
  const { apiUrl, apiToken } = getApiConfig();

  try {
    const response = await fetch(`${apiUrl}/pool_calidus_keys?pool_id_bech32=eq.${poolBech32}`, {
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${apiToken}`,
      },
    });
    const data = (await response.json()) as CalidusKey[];
    if (data.length === 0) {
      return null;
    }
    return data[0];
  } catch (error) {
    console.error("Error fetching Calidus key:", error);
    return null;
  }
}

/**
 * Fetches the DRep name for a given DRep ID from the Koios API.
 *
 * Queries the DRep info endpoint and then fetches the CIP-119 metadata URL
 * to retrieve the human-readable name.
 *
 * @param drepId - The DRep ID in bech32 format.
 * @returns The DRep name if found, `undefined` if metadata lacks a name, `null` on error.
 */
export async function fetchDrepName(drepId: string): Promise<string | undefined | null> {
  const { apiUrl, apiToken } = getApiConfig();

  try {
    const response = await fetch(`${apiUrl}/drep_info?registered=eq.true`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ _drep_ids: [drepId] }),
    });
    const data = (await response.json()) as DrepInfo[];

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
 */
export async function validateDrep(drepId: string): Promise<boolean> {
  const { apiUrl, apiToken } = getApiConfig();

  try {
    const response = await fetch(`${apiUrl}/drep_info?registered=eq.true`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ _drep_ids: [drepId] }),
    });
    const data = (await response.json()) as DrepInfo[];
    return data.length > 0;
  } catch (error) {
    console.error("Error validating DRep:", error);
    return false;
  }
}

/**
 * Fetches the Cardano handle for a given address.
 * Tries Handle.me API first, falls back to Koios if Handle.me is unavailable.
 *
 * @param address - The Cardano address (stake or payment address).
 * @returns The handle name if found, `null` otherwise.
 */
export async function fetchHandle(address: string): Promise<string | null> {
  try {
    return await fetchHandleMe(address);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Handle.me unavailable, falling back to Koios:", message);
    return fetchHandleKoios(address);
  }
}

async function fetchHandleMe(address: string): Promise<string | null> {
  const baseUrl =
    process.env.NETWORK_NAME === "mainnet"
      ? "https://api.handle.me"
      : "https://preprod.api.handle.me";
  const response = await fetch(`${baseUrl}/holders/${address}`);
  if (response.status === 200 || response.status === 202) {
    const data = (await response.json()) as { default_handle?: string };
    return data.default_handle || null;
  }
  if (response.status === 404) {
    return null;
  }
  throw new Error(`Handle.me returned unexpected status ${response.status}`);
}

async function fetchHandleKoios(address: string): Promise<string | null> {
  const { apiUrl, apiToken } = getApiConfig();
  const handlePolicyId = "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a";
  let endpoint: string | undefined;
  let body: Record<string, string[]> | undefined;

  if (address.startsWith("stake")) {
    endpoint = "account_assets";
    body = { _stake_addresses: [address] };
  }
  if (address.startsWith("addr")) {
    endpoint = "address_assets";
    body = { _addresses: [address] };
  }
  if (!endpoint || !body) {
    console.error("Invalid address");
    return null;
  }

  try {
    const response = await fetch(`${apiUrl}/${endpoint}?policy_id=eq.${handlePolicyId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = (await response.json()) as { policy_id: string; asset_name: string }[];
    if (data.length === 0) {
      console.log("No handle found");
      return null;
    }

    try {
      const metaResponse = await fetch(`${apiUrl}/asset_info`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ _asset_list: [[data[0].policy_id, data[0].asset_name]] }),
      });
      const metadata = (await metaResponse.json()) as { asset_name_ascii: string }[];
      return metadata[0].asset_name_ascii;
    } catch (error) {
      console.error("Error fetching handle metadata:", error);
      return null;
    }
  } catch (error) {
    console.error("Error fetching endpoint:", error);
    return null;
  }
}

/**
 * Fetches transaction information from the Koios API.
 *
 * @param txHash - Transaction hash in hex format.
 * @returns The transaction data if found, `null` otherwise.
 */
export async function fetchTxInfo(txHash: string): Promise<TxInfo | null> {
  const { apiUrl, apiToken } = getApiConfig();

  try {
    const response = await fetch(`${apiUrl}/tx_info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        _tx_hashes: [txHash],
        _inputs: true,
        _metadata: false,
        _assets: false,
        _withdrawals: false,
        _certs: false,
        _scripts: false,
        _bytecode: false,
        _governance: false,
      }),
    });
    const data = (await response.json()) as TxInfo[];
    if (data.length === 0) {
      return null;
    }
    return data[0];
  } catch (error) {
    console.error("Error fetching tx info:", error);
    return null;
  }
}
