import { describe, it, expect, vi } from 'vitest';

import {
  UnsupportedOperationError,
  ProviderError,
  shouldFallback,
  withFallback,
} from './provider.js';
import type { CardanoProvider } from './provider.js';

function makeMockProvider(name: string, overrides: Partial<CardanoProvider> = {}): CardanoProvider {
  return {
    name,
    fetchTxInfo: vi.fn().mockResolvedValue(null),
    fetchScript: vi.fn().mockResolvedValue(false),
    fetchPoolMetadata: vi.fn().mockResolvedValue(null),
    fetchDrepInfo: vi.fn().mockResolvedValue([]),
    fetchCalidusKey: vi.fn().mockResolvedValue(null),
    fetchHandle: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe('shouldFallback', () => {
  it('returns true for UnsupportedOperationError', () => {
    expect(shouldFallback(new UnsupportedOperationError('Test', 'op'))).toBe(true);
  });

  it('returns true for ProviderError', () => {
    expect(shouldFallback(new ProviderError('Test', 'failed'))).toBe(true);
  });

  it('returns false for generic Error', () => {
    expect(shouldFallback(new Error('something else'))).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(shouldFallback('string')).toBe(false);
    expect(shouldFallback(null)).toBe(false);
  });
});

describe('withFallback', () => {
  it('returns primary result on success', async () => {
    const primary = makeMockProvider('primary', {
      fetchTxInfo: vi.fn().mockResolvedValue({ tx_hash: 'from-primary' }),
    });
    const secondary = makeMockProvider('secondary');

    const result = await withFallback(primary, secondary, (p) => p.fetchTxInfo('hash'));
    expect(result).toEqual({ tx_hash: 'from-primary' });
    expect(secondary.fetchTxInfo).not.toHaveBeenCalled();
  });

  it('falls back to secondary on ProviderError', async () => {
    const primary = makeMockProvider('primary', {
      fetchTxInfo: vi.fn().mockRejectedValue(new ProviderError('primary', 'down')),
    });
    const secondary = makeMockProvider('secondary', {
      fetchTxInfo: vi.fn().mockResolvedValue({ tx_hash: 'from-secondary' }),
    });

    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await withFallback(primary, secondary, (p) => p.fetchTxInfo('hash'));
    expect(result).toEqual({ tx_hash: 'from-secondary' });
  });

  it('falls back to secondary on UnsupportedOperationError', async () => {
    const primary = makeMockProvider('primary', {
      fetchCalidusKey: vi
        .fn()
        .mockRejectedValue(new UnsupportedOperationError('primary', 'fetchCalidusKey')),
    });
    const secondary = makeMockProvider('secondary', {
      fetchCalidusKey: vi.fn().mockResolvedValue({ pool_id_bech32: 'pool1abc' }),
    });

    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await withFallback(primary, secondary, (p) => p.fetchCalidusKey('pool1abc'));
    expect(result).toEqual({ pool_id_bech32: 'pool1abc' });
  });

  it('throws non-retryable errors without fallback', async () => {
    const primary = makeMockProvider('primary', {
      fetchTxInfo: vi.fn().mockRejectedValue(new Error('validation error')),
    });
    const secondary = makeMockProvider('secondary');

    await expect(withFallback(primary, secondary, (p) => p.fetchTxInfo('hash'))).rejects.toThrow(
      'validation error',
    );
    expect(secondary.fetchTxInfo).not.toHaveBeenCalled();
  });

  it('throws when no secondary and primary fails with ProviderError', async () => {
    const primary = makeMockProvider('primary', {
      fetchTxInfo: vi.fn().mockRejectedValue(new ProviderError('primary', 'down')),
    });

    await expect(withFallback(primary, null, (p) => p.fetchTxInfo('hash'))).rejects.toThrow('down');
  });

  it('throws when both providers fail', async () => {
    const primary = makeMockProvider('primary', {
      fetchTxInfo: vi.fn().mockRejectedValue(new ProviderError('primary', 'down')),
    });
    const secondary = makeMockProvider('secondary', {
      fetchTxInfo: vi.fn().mockRejectedValue(new ProviderError('secondary', 'also down')),
    });

    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(withFallback(primary, secondary, (p) => p.fetchTxInfo('hash'))).rejects.toThrow(
      'also down',
    );
  });
});
