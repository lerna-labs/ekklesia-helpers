/**
 * Koios API provider implementation.
 *
 * @module cardano/koiosProvider
 */

import type { CardanoProvider } from './provider.js';
import { ProviderError, type PoolMetadata } from './provider.js';
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

  async fetchHandle(address: string): Promise<string | null> {
    // Try Handle.me first
    try {
      const result = await fetchHandleMe(address, this.config.networkName);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Handle.me unavailable, falling back to Koios:', message);
    }

    // Fall back to Koios asset lookup
    return this.fetchHandleViaAssets(address);
  }

  private async fetchHandleViaAssets(address: string): Promise<string | null> {
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
      console.error('Invalid address');
      return null;
    }

    const data = await this.post<{ policy_id: string; asset_name: string }[]>(
      `/${endpoint}?policy_id=eq.${handlePolicyId}`,
      body,
    );
    if (data.length === 0) {
      console.log('No handle found');
      return null;
    }

    const metadata = await this.post<{ asset_name_ascii: string }[]>('/asset_info', {
      _asset_list: [[data[0].policy_id, data[0].asset_name]],
    });
    return metadata[0].asset_name_ascii;
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
        throw new Error(`HTTP ${response.status}`);
      }
      return (await response.json()) as T;
    } catch (error) {
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
        throw new Error(`HTTP ${response.status}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      throw new ProviderError(this.name, `POST ${path} failed`, error);
    }
  }
}

/**
 * Fetch handle from Handle.me API.
 *
 * @param address - Cardano address (stake or payment).
 * @param networkName - Network name for URL selection.
 * @returns Handle name or null.
 * @throws On unexpected HTTP status.
 */
export async function fetchHandleMe(address: string, networkName?: string): Promise<string | null> {
  const baseUrl =
    networkName === 'mainnet' ? 'https://api.handle.me' : 'https://preprod.api.handle.me';
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
