import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { KoiosProvider, fetchHandleMe, type KoiosConfig } from './koiosProvider.js';
import { ProviderError } from './provider.js';

/** Matches REQUEST_TIMEOUT_MS in koiosProvider.ts. */
const REQUEST_TIMEOUT_MS = 10_000;

function config(): KoiosConfig {
  return { apiUrl: 'https://api.koios.rest/api/v1', apiToken: 'test-token' };
}

/** A fetch mock whose promise only settles when its AbortSignal fires. */
function hangingFetch(_url: string, init: RequestInit): Promise<never> {
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    });
  });
}

describe('KoiosProvider request resilience', () => {
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
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [{ tx_hash: 'abc' }] });
    const result = await new KoiosProvider(config()).fetchTxInfo('abc');
    expect(result).toEqual({ tx_hash: 'abc' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retries once after a network failure and returns the retried result', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce({ ok: true, json: async () => [{ tx_hash: 'abc' }] });
    const result = await new KoiosProvider(config()).fetchTxInfo('abc');
    expect(result).toEqual({ tx_hash: 'abc' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('gives up after one retry on a persistent network failure', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNRESET'));
    await expect(new KoiosProvider(config()).fetchTxInfo('abc')).rejects.toThrow(ProviderError);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('aborts a hung request after the timeout and reports it as a timeout', async () => {
    mockFetch.mockImplementation(hangingFetch);
    const promise = new KoiosProvider(config()).fetchTxInfo('abc');
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
    mockFetch
      .mockImplementationOnce(hangingFetch)
      .mockResolvedValueOnce({ ok: true, json: async () => [{ tx_hash: 'abc' }] });
    const promise = new KoiosProvider(config()).fetchTxInfo('abc');
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1_000);

    await expect(promise).resolves.toEqual({ tx_hash: 'abc' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe('fetchHandleMe request resilience', () => {
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

  it('retries a timed-out call and returns the holder on success', async () => {
    mockFetch.mockImplementationOnce(hangingFetch).mockResolvedValueOnce({
      status: 200,
      json: async () => ({ handles: ['adam'], default_handle: 'adam' }),
    });
    const promise = fetchHandleMe('stake1uabc');
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1_000);

    await expect(promise).resolves.toEqual({ handles: ['adam'], defaultHandle: 'adam' });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('gives up after one retry on a persistent network failure', async () => {
    mockFetch.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(fetchHandleMe('stake1uabc')).rejects.toThrow(/timed out|ENOTFOUND/i);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
