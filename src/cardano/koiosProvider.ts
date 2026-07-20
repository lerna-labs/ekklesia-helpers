/**
 * Koios API provider implementation.
 *
 * @module cardano/koiosProvider
 */

import type { CardanoProvider } from './provider.js';
import { ProviderError, errorFromResponse, type PoolMetadata } from './provider.js';
import type { CalidusKey, DrepInfo, TxInfo } from './cardanoApi.js';

/** Configuration for the Koios provider. */
export interface KoiosConfig {
  apiUrl: string;
  apiToken: string;
  networkName?: string;
}

/**
 * Reads Koios configuration from environment variables.
 *
 * @returns The Koios config.
 * @throws If `API_URL` or `API_TOKEN` is not set.
 */
export function getKoiosConfig(): KoiosConfig {
  const apiUrl = process.env.API_URL;
  const apiToken = process.env.API_TOKEN;
  if (!apiUrl) throw new Error('API_URL is not set in the environment variables.');
  if (!apiToken) throw new Error('API_TOKEN is not set in the environment variables.');
  return { apiUrl, apiToken, networkName: process.env.NETWORK_NAME };
}

/** Koios pool info response shape (relevant fields only). */
interface KoiosPoolInfo {
  pool_id_bech32: string;
  meta_url: string | null;
  meta_json: {
    name: string;
    ticker: string;
    homepage: string;
    description: string;
  } | null;
}

/**
 * Cardano data provider backed by the Koios REST API.
 */
export class KoiosProvider implements CardanoProvider {
  readonly name = 'Koios';

  constructor(private readonly config: KoiosConfig) {}

  async fetchTxInfo(txHash: string): Promise<TxInfo | null> {
    const data = await this.post<TxInfo[]>('/tx_info', {
      _tx_hashes: [txHash],
      _inputs: true,
      _metadata: false,
      _assets: false,
      _withdrawals: false,
      _certs: false,
      _scripts: false,
      _bytecode: false,
      _governance: false,
    });
    return data.length > 0 ? data[0] : null;
  }

  async fetchScript(scriptHash: string): Promise<Record<string, unknown> | false> {
    const data = await this.post<Record<string, unknown>[]>('/script_info', {
      _script_hashes: [scriptHash],
    });
    return data.length > 0 ? data[0] : false;
  }

  async fetchPoolMetadata(poolBech32: string): Promise<PoolMetadata | null> {
    const data = await this.post<KoiosPoolInfo[]>('/pool_info', {
      _pool_bech32_ids: [poolBech32],
    });
    if (data.length === 0) return null;
    const pool = data[0];
    return {
      pool_id: pool.pool_id_bech32,
      ticker: pool.meta_json?.ticker ?? null,
      name: pool.meta_json?.name ?? null,
      description: pool.meta_json?.description ?? null,
      homepage: pool.meta_json?.homepage ?? null,
      meta_url: pool.meta_url ?? null,
    };
  }

  async fetchDrepInfo(drepIds: string[]): Promise<DrepInfo[]> {
    return this.post<DrepInfo[]>('/drep_info', {
      _drep_ids: drepIds,
    });
  }

  async fetchCalidusKey(poolBech32: string): Promise<CalidusKey | null> {
    const data = await this.get<CalidusKey[]>(`/pool_calidus_keys?pool_id_bech32=eq.${poolBech32}`);
    return data.length > 0 ? data[0] : null;
  }

  async fetchHandles(address: string): Promise<string[]> {
    // Handle.me is authoritative: it enumerates every handle in one request and
    // reports which one the holder designated as their default.
    try {
      const holder = await fetchHandleMe(address, this.config.networkName);
      if (holder) return orderHolderHandles(holder);
      return [];
    } catch {
      // Handle.me unavailable — fall back to the Koios asset lookup.
    }

    return this.fetchHandlesViaAssets(address);
  }

  private async fetchHandlesViaAssets(address: string): Promise<string[]> {
    const handlePolicyId = 'f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a';
    let endpoint: string | undefined;
    let body: Record<string, string[]> | undefined;

    if (address.startsWith('stake')) {
      endpoint = 'account_assets';
      body = { _stake_addresses: [address] };
    }
    if (address.startsWith('addr')) {
      endpoint = 'address_assets';
      body = { _addresses: [address] };
    }
    if (!endpoint || !body) {
      throw new ProviderError(this.name, `Not a stake or payment address: ${address}`);
    }

    const data = await this.post<{ policy_id: string; asset_name: string }[]>(
      `/${endpoint}?policy_id=eq.${handlePolicyId}`,
      body,
    );
    if (data.length === 0) return [];

    // Koios has no notion of a default handle, so ordering is ours to impose.
    const metadata = await this.post<{ asset_name_ascii: string }[]>('/asset_info', {
      _asset_list: data.map((asset) => [asset.policy_id, asset.asset_name]),
    });
    return sortHandles(metadata.map((m) => m.asset_name_ascii).filter(Boolean));
  }

  private async get<T>(path: string): Promise<T> {
    try {
      const response = await fetch(`${this.config.apiUrl}${path}`, {
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${this.config.apiToken}`,
        },
      });
      if (response.ok === false) {
        throw await errorFromResponse(this.name, `GET ${path}`, response);
      }
      return (await response.json()) as T;
    } catch (error) {
      // Already descriptive; re-wrapping would bury the upstream explanation.
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(this.name, `GET ${path} failed`, error);
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    try {
      const response = await fetch(`${this.config.apiUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${this.config.apiToken}`,
        },
        body: JSON.stringify(body),
      });
      if (response.ok === false) {
        throw await errorFromResponse(this.name, `POST ${path}`, response);
      }
      return (await response.json()) as T;
    } catch (error) {
      // Already descriptive; re-wrapping would bury the upstream explanation.
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(this.name, `POST ${path} failed`, error);
    }
  }
}

/** A holder's handles as reported by Handle.me. */
export interface HandleMeHolder {
  /** Every handle held by the address. */
  handles: string[];
  /** The holder's designated default handle, if they have one. */
  defaultHandle: string | null;
}

/**
 * Orders handles so the result of a lookup is stable across calls.
 *
 * Koios returns handle assets in no particular order, so an address holding
 * several handles would otherwise resolve to a different name run to run.
 * Shortest-first matches the community reading of a short handle as the more
 * significant one, with a lexicographic tiebreak to make it total.
 *
 * @param handles - Handle names in arbitrary order.
 * @returns A new array sorted by length, then lexicographically.
 */
export function sortHandles(handles: string[]): string[] {
  return [...handles].sort((a, b) => a.length - b.length || a.localeCompare(b));
}

/**
 * Fetch every handle held by an address from the Handle.me API.
 *
 * @param address - Cardano address (stake or payment).
 * @param networkName - Network name for URL selection.
 * @returns The holder's handles and their designated default, or `null` if the
 *   address holds none.
 * @throws On unexpected HTTP status.
 */
export async function fetchHandleMe(
  address: string,
  networkName?: string,
): Promise<HandleMeHolder | null> {
  const baseUrl =
    networkName === 'mainnet' ? 'https://api.handle.me' : 'https://preprod.api.handle.me';
  const response = await fetch(`${baseUrl}/holders/${address}`);
  if (response.status === 200 || response.status === 202) {
    const data = (await response.json()) as { handles?: string[]; default_handle?: string };
    const handles = Array.isArray(data.handles) ? data.handles.filter(Boolean) : [];
    const defaultHandle = data.default_handle || null;
    // Older responses (and any we can't parse) may carry only default_handle.
    if (handles.length === 0) {
      return defaultHandle ? { handles: [defaultHandle], defaultHandle } : null;
    }
    return { handles, defaultHandle };
  }
  if (response.status === 404) {
    return null;
  }
  throw new Error(`Handle.me returned unexpected status ${response.status}`);
}

/**
 * Orders a holder's handles with their designated default first.
 *
 * The default handle is the holder's own statement of which name represents
 * them, so it outranks any rule we could impose; everything else falls back to
 * {@link sortHandles}.
 *
 * @param holder - A Handle.me holder record.
 * @returns All handles, default first.
 */
export function orderHolderHandles(holder: HandleMeHolder): string[] {
  const rest = sortHandles(holder.handles.filter((h) => h !== holder.defaultHandle));
  return holder.defaultHandle && holder.handles.includes(holder.defaultHandle)
    ? [holder.defaultHandle, ...rest]
    : rest;
}
