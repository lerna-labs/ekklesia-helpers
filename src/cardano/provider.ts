/**
 * Cardano data provider abstraction.
 *
 * Defines a common interface for querying Cardano blockchain data,
 * with implementations for Koios and Blockfrost APIs.
 *
 * @module cardano/provider
 */

import type { CalidusKey, DrepInfo, TxInfo } from './cardanoApi.js';

/** Stake pool metadata. */
export interface PoolMetadata {
  pool_id: string;
  ticker: string | null;
  name: string | null;
  description: string | null;
  homepage: string | null;
  /**
   * Off-chain metadata URL registered on-chain. Present when the operator
   * declared one, regardless of whether the upstream provider was able to
   * fetch + parse it. May be used by callers (or {@link fetchPoolMetadata})
   * to attempt direct recovery when `ticker`/`name` are null.
   */
  meta_url: string | null;
}

/** Thrown when a provider does not support a given operation. */
export class UnsupportedOperationError extends Error {
  constructor(provider: string, operation: string) {
    super(`${provider} does not support ${operation}`);
    this.name = 'UnsupportedOperationError';
  }
}

/** Thrown when a provider encounters a network or server error. */
export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'ProviderError';
  }
}

/**
 * Common interface for Cardano blockchain data providers.
 *
 * Implementations may throw {@link UnsupportedOperationError} for operations
 * they do not support, or {@link ProviderError} for network/server failures.
 */
export interface CardanoProvider {
  readonly name: string;

  /** Fetch transaction info including inputs and outputs. */
  fetchTxInfo(txHash: string): Promise<TxInfo | null>;

  /** Fetch script information by hex-encoded script hash. */
  fetchScript(scriptHash: string): Promise<Record<string, unknown> | false>;

  /** Fetch pool metadata by bech32 pool ID. */
  fetchPoolMetadata(poolBech32: string): Promise<PoolMetadata | null>;

  /** Fetch DRep info for given DRep IDs. */
  fetchDrepInfo(drepIds: string[]): Promise<DrepInfo[]>;

  /** Fetch the latest Calidus key for a stake pool. */
  fetchCalidusKey(poolBech32: string): Promise<CalidusKey | null>;

  /**
   * Fetch every Cardano handle held by an address.
   *
   * Implementations must return a deterministically ordered list so repeated
   * lookups for the same address agree. Where the holder has designated a
   * default handle, it comes first.
   */
  fetchHandles(address: string): Promise<string[]>;
}

/**
 * Returns `true` if the error should trigger a fallback to the secondary provider.
 *
 * @param error - The caught error.
 * @returns Whether to retry with the fallback provider.
 */
export function shouldFallback(error: unknown): boolean {
  if (error instanceof UnsupportedOperationError) return true;
  if (error instanceof ProviderError) return true;
  return false;
}

/**
 * Try an operation on the primary provider, falling back to the secondary on
 * retryable errors.
 *
 * @param primary - The preferred provider.
 * @param secondary - The fallback provider, if configured.
 * @param operation - A function that calls a provider method.
 * @returns The result from whichever provider succeeds.
 */
export async function withFallback<T>(
  primary: CardanoProvider,
  secondary: CardanoProvider | null,
  operation: (provider: CardanoProvider) => Promise<T>,
): Promise<T> {
  try {
    return await operation(primary);
  } catch (error) {
    if (secondary && shouldFallback(error)) {
      console.error(
        `${primary.name} failed, falling back to ${secondary.name}:`,
        error instanceof Error ? error.message : error,
      );
      return operation(secondary);
    }
    throw error;
  }
}
