/**
 * Blockfrost API provider implementation.
 *
 * @module cardano/blockfrostProvider
 */

import { Address, BaseAddress, RewardAddress } from "@emurgo/cardano-serialization-lib-nodejs";

import type { CardanoProvider } from "./provider.js";
import { ProviderError, UnsupportedOperationError, type PoolMetadata } from "./provider.js";
import type { CalidusKey, DrepInfo, TxIO, TxInfo } from "./cardanoApi.js";
import { fetchHandleMe } from "./koiosProvider.js";

/** Configuration for the Blockfrost provider. */
export interface BlockfrostConfig {
  url: string;
  projectId: string;
  networkName?: string;
}

/**
 * Reads Blockfrost configuration from environment variables.
 *
 * @returns The Blockfrost config.
 * @throws If `BLOCKFROST_URL` or `BLOCKFROST_PROJECT_ID` is not set.
 */
export function getBlockfrostConfig(): BlockfrostConfig {
  const url = process.env.BLOCKFROST_URL;
  const projectId = process.env.BLOCKFROST_PROJECT_ID;
  if (!url) throw new Error("BLOCKFROST_URL is not set in the environment variables.");
  if (!projectId) throw new Error("BLOCKFROST_PROJECT_ID is not set in the environment variables.");
  return { url, projectId, networkName: process.env.NETWORK_NAME };
}

/** Blockfrost /txs/{hash} response (relevant fields). */
interface BfTxContent {
  hash: string;
  block: string;
  block_height: number;
  block_time: number;
  fees: string;
  deposit: string;
  treasury_donation: string;
  output_amount: { unit: string; quantity: string }[];
}

/** Blockfrost /txs/{hash}/utxos response. */
interface BfTxUtxos {
  hash: string;
  inputs: BfUtxo[];
  outputs: BfUtxo[];
}

/** Blockfrost UTXO entry. */
interface BfUtxo {
  address: string;
  amount: { unit: string; quantity: string }[];
  tx_hash: string;
  output_index: number;
}

/** Blockfrost /pools/{pool_id}/metadata response. */
interface BfPoolMetadata {
  pool_id: string;
  hex: string;
  url: string | null;
  hash: string | null;
  ticker: string | null;
  name: string | null;
  description: string | null;
  homepage: string | null;
}

/** Blockfrost /governance/dreps/{drep_id} response. */
interface BfDrep {
  drep_id: string;
  hex: string;
  amount: string;
  has_script: boolean;
  retired: boolean;
  expired: boolean;
  last_active_epoch: number | null;
}

/** Blockfrost /governance/dreps/{drep_id}/metadata response. */
interface BfDrepMetadata {
  drep_id: string;
  hex: string;
  url: string;
  hash: string;
}

/**
 * Derive the stake address (bech32) from a Shelley base address.
 *
 * @param bech32Addr - A bech32-encoded Cardano address.
 * @returns The stake address or `null` if not derivable.
 */
function deriveStakeAddress(bech32Addr: string): string | null {
  try {
    const addr = Address.from_bech32(bech32Addr);
    const baseAddr = BaseAddress.from_address(addr);
    if (!baseAddr) return null;
    const rewardAddr = RewardAddress.new(addr.network_id(), baseAddr.stake_cred());
    const stakeAddr = rewardAddr.to_address().to_bech32();
    addr.free();
    baseAddr.free();
    rewardAddr.free();
    return stakeAddr;
  } catch {
    return null;
  }
}

/**
 * Cardano data provider backed by the Blockfrost REST API.
 */
export class BlockfrostProvider implements CardanoProvider {
  readonly name = "Blockfrost";

  constructor(private readonly config: BlockfrostConfig) {}

  async fetchTxInfo(txHash: string): Promise<TxInfo | null> {
    const [tx, utxos] = await Promise.all([
      this.get<BfTxContent>(`/txs/${txHash}`),
      this.get<BfTxUtxos>(`/txs/${txHash}/utxos`),
    ]);

    if (!tx) return null;

    const lovelaceOutput = tx.output_amount.find((a) => a.unit === "lovelace")?.quantity ?? "0";

    return {
      tx_hash: tx.hash,
      block_hash: tx.block,
      block_height: tx.block_height,
      epoch_no: 0, // Not available from Blockfrost /txs endpoint
      tx_timestamp: tx.block_time,
      total_output: lovelaceOutput,
      fee: tx.fees,
      treasury_donation: tx.treasury_donation === "0" ? null : tx.treasury_donation,
      deposit: tx.deposit,
      inputs: utxos ? utxos.inputs.map(mapUtxoToTxIO) : [],
      outputs: utxos ? utxos.outputs.map(mapUtxoToTxIO) : [],
    };
  }

  async fetchScript(scriptHash: string): Promise<Record<string, unknown> | false> {
    const data = await this.get<Record<string, unknown>>(`/scripts/${scriptHash}`);
    return data ?? false;
  }

  async fetchPoolMetadata(poolBech32: string): Promise<PoolMetadata | null> {
    const data = await this.get<BfPoolMetadata>(`/pools/${poolBech32}/metadata`);
    if (!data) return null;
    return {
      pool_id: data.pool_id,
      ticker: data.ticker,
      name: data.name,
      description: data.description,
      homepage: data.homepage,
      meta_url: data.url,
    };
  }

  async fetchDrepInfo(drepIds: string[]): Promise<DrepInfo[]> {
    const results: DrepInfo[] = [];
    for (const drepId of drepIds) {
      const drep = await this.get<BfDrep>(`/governance/dreps/${drepId}`);
      if (!drep || drep.retired) continue;

      let metaUrl: string | null = null;
      let metaHash: string | null = null;
      try {
        const meta = await this.get<BfDrepMetadata>(`/governance/dreps/${drepId}/metadata`);
        if (meta) {
          metaUrl = meta.url;
          metaHash = meta.hash;
        }
      } catch {
        // Metadata may not exist
      }

      results.push({
        drep_id: drep.drep_id,
        hex: drep.hex,
        has_script: drep.has_script,
        registered: !drep.retired,
        deposit: "0",
        active: !drep.expired,
        expires_epoch_no: drep.last_active_epoch ?? 0,
        amount: drep.amount,
        meta_url: metaUrl,
        meta_hash: metaHash,
      });
    }
    return results;
  }

  async fetchCalidusKey(_poolBech32: string): Promise<CalidusKey | null> {
    throw new UnsupportedOperationError(this.name, "fetchCalidusKey");
  }

  async fetchHandle(address: string): Promise<string | null> {
    // Handle.me works independently of blockchain provider
    try {
      return await fetchHandleMe(address, this.config.networkName);
    } catch {
      // Blockfrost doesn't have an efficient handle asset lookup
      throw new UnsupportedOperationError(this.name, "fetchHandle (asset fallback)");
    }
  }

  /**
   * GET a Blockfrost endpoint. Returns `null` for 404 responses.
   */
  private async get<T>(path: string): Promise<T | null> {
    try {
      const response = await fetch(`${this.config.url}${path}`, {
        headers: { project_id: this.config.projectId },
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new ProviderError(this.name, `GET ${path} returned ${response.status}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ProviderError || error instanceof UnsupportedOperationError) {
        throw error;
      }
      throw new ProviderError(this.name, `GET ${path} failed`, error);
    }
  }
}

function mapUtxoToTxIO(utxo: BfUtxo): TxIO {
  const lovelace = utxo.amount.find((a) => a.unit === "lovelace")?.quantity ?? "0";
  return {
    value: lovelace,
    tx_hash: utxo.tx_hash,
    tx_index: utxo.output_index,
    stake_addr: deriveStakeAddress(utxo.address),
    payment_addr: { cred: "", bech32: utxo.address },
  };
}
