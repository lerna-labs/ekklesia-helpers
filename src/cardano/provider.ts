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

/**
 * Thrown when a provider encounters a network or server error.
 *
 * This is the transient case: a timeout, a connection failure, or a 5xx. The
 * request is worth retrying as-is. The two subclasses below carve out the
 * failures where retrying alone will not help, so callers can tell "try again"
 * from "someone needs to do something".
 */
export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly cause?: unknown,
    /** HTTP status that caused this, when the failure came from a response. */
    public readonly status?: number,
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'ProviderError';
  }
}

/**
 * Thrown when the provider rejected our credentials.
 *
 * Covers an expired subscription, an unrecognised or malformed token, and a
 * banned client. Retrying is pointless until an operator rotates or renews the
 * key, so callers should surface this rather than fold it into generic backoff.
 *
 * Extends {@link ProviderError}, so existing `instanceof ProviderError` checks
 * continue to catch it.
 */
export class ProviderAuthError extends ProviderError {
  constructor(provider: string, message: string, status?: number, cause?: unknown) {
    super(provider, message, cause, status);
    this.name = 'ProviderAuthError';
  }
}

/**
 * Thrown when the provider is throttling us or the plan's quota is exhausted.
 *
 * Retrying helps, but only after waiting. Where the provider sent a
 * `Retry-After` header its value is exposed as {@link retryAfterSeconds} so
 * callers can honour it instead of guessing a backoff.
 *
 * Extends {@link ProviderError}, so existing `instanceof ProviderError` checks
 * continue to catch it.
 */
export class ProviderRateLimitError extends ProviderError {
  constructor(
    provider: string,
    message: string,
    status?: number,
    /** Seconds to wait, from the `Retry-After` header, when the provider sent one. */
    public readonly retryAfterSeconds?: number,
    cause?: unknown,
  ) {
    super(provider, message, cause, status);
    this.name = 'ProviderRateLimitError';
  }
}

/**
 * Upper bound on how much of an error response body is folded into a message.
 *
 * Providers explain auth failures in a short plain text line; this is generous
 * enough for those while keeping a stray HTML error page out of the logs.
 */
const ERROR_BODY_MAX_CHARS = 200;

/**
 * Statuses that mean our credentials were rejected.
 *
 * `401` and `403` are the usual pair. Blockfrost also uses `418` for a banned
 * client, which likewise needs an operator rather than a retry.
 */
const AUTH_STATUSES = new Set([401, 403, 418]);

/**
 * Statuses that mean we are being throttled.
 *
 * `429` is standard. Blockfrost uses `402` for a project that has exhausted its
 * daily request allowance, which is the same "wait, then retry" shape rather
 * than a credential problem.
 */
const RATE_LIMIT_STATUSES = new Set([402, 429]);

/**
 * Builds the right {@link ProviderError} subclass for a failed HTTP response.
 *
 * Reads a bounded slice of the body into the message. Providers say precisely
 * what went wrong there and the status alone often cannot distinguish the
 * cases: Koios answers `403` for an expired subscription, an unrecognised
 * token, and a malformed one alike, and only the body tells them apart.
 *
 * Never throws; a body that cannot be read is simply omitted.
 *
 * @param provider - Name of the provider that failed.
 * @param context - What was being attempted, e.g. `POST /tx_info`.
 * @param response - The non-2xx response.
 * @returns A {@link ProviderAuthError}, {@link ProviderRateLimitError}, or
 *   plain {@link ProviderError} depending on the status.
 */
export async function errorFromResponse(
  provider: string,
  context: string,
  response: Response,
): Promise<ProviderError> {
  let detail = '';
  try {
    const body = (await response.text()).trim().replace(/\s+/g, ' ');
    if (body) {
      detail =
        body.length > ERROR_BODY_MAX_CHARS ? `${body.slice(0, ERROR_BODY_MAX_CHARS)}...` : body;
    }
  } catch {
    /* body unreadable; the status alone still beats nothing */
  }

  const status = response.status;
  const message = `${context} failed: HTTP ${status}${detail ? ` ${detail}` : ''}`;

  if (AUTH_STATUSES.has(status)) {
    return new ProviderAuthError(provider, message, status);
  }
  if (RATE_LIMIT_STATUSES.has(status)) {
    const header = response.headers?.get?.('retry-after');
    const parsed = header ? Number(header) : NaN;
    return new ProviderRateLimitError(
      provider,
      message,
      status,
      Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined,
    );
  }
  return new ProviderError(provider, message, undefined, status);
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
