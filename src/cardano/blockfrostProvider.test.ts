import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { BlockfrostProvider, type BlockfrostConfig } from './blockfrostProvider.js';
import { ProviderError } from './provider.js';

/** Matches REQUEST_TIMEOUT_MS in blockfrostProvider.ts. */
const REQUEST_TIMEOUT_MS = 10_000;

function config(): BlockfrostConfig {
  return {
    url: 'https://cardano-mainnet.blockfrost.io/api/v0',
    projectId: 'test-project-id',
  };
}

/** A fetch mock whose promise only settles when its AbortSignal fires. */
function hangingFetch(_url: string, init: RequestInit): Promise<never> {
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    });
  });
}

describe('BlockfrostProvider request resilience', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  it('does not retry a successful first attempt', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ type: 'plutusV2' }),
    });
    const result = await new BlockfrostProvider(config()).fetchScript('abc');
    expect(result).toEqual({ type: 'plutusV2' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries once after a network failure and returns the retried result', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ type: 'plutusV2' }),
    });
    const result = await new BlockfrostProvider(config()).fetchScript('abc');
    expect(result).toEqual({ type: 'plutusV2' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('gives up after one retry on a persistent network failure', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNRESET'));
    await expect(new BlockfrostProvider(config()).fetchScript('abc')).rejects.toThrow(
      ProviderError,
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('aborts a hung request after the timeout and reports it as a timeout', async () => {
    mockFetch.mockImplementation(hangingFetch);
    const promise = new BlockfrostProvider(config()).fetchScript('abc');
    // Attach handlers before advancing the clock so the rejection, once it
    // happens, is never briefly unhandled.
    const rejects = expect(promise).rejects.toThrow(ProviderError);
    const causePromise = promise.catch((error: ProviderError) => error);

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS * 2 + 1_000);
    await rejects;

    const error = await causePromise;
    expect(error.cause).toBeInstanceOf(Error);
    expect((error.cause as Error).message).toMatch(/timed out/i);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('retries a timed-out attempt and succeeds on the retry', async () => {
    mockFetch.mockImplementationOnce(hangingFetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ type: 'plutusV2' }),
    });
    const promise = new BlockfrostProvider(config()).fetchScript('abc');
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1_000);

    await expect(promise).resolves.toEqual({ type: 'plutusV2' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
