import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  getScript,
  fetchCalidusKey,
  fetchDrepName,
  validateDrep,
  fetchHandle,
  fetchHandles,
  fetchTxInfo,
  fetchPoolTicker,
  fetchPoolMetadata,
  fetchName,
  fetchIdentity,
  resetProviders,
} from './cardanoApi.js';
import { ProviderError } from './provider.js';

// Valid script hash for format validation (28 bytes = 56 hex chars)
const validScriptHash = '2ac096b860eb407ffb4a8955ef15c3774be4c632f6d3310925f2026f';

describe('cardanoApi', () => {
  const ORIGINAL_ENV = process.env;
  const mockFetch = vi.fn();

  beforeEach(() => {
    resetProviders();
    process.env = {
      ...ORIGINAL_ENV,
      API_URL: 'https://api.koios.rest/api/v1',
      API_TOKEN: 'test-token',
    };
    vi.stubGlobal('fetch', mockFetch);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('getApiConfig (indirect)', () => {
    it('throws when no provider is configured', async () => {
      delete process.env.API_URL;
      delete process.env.API_TOKEN;
      await expect(getScript(validScriptHash)).rejects.toThrow('No Cardano provider configured');
    });
  });

  describe('getScript', () => {
    it('returns script data for valid hash', async () => {
      const scriptData = { script_hash: validScriptHash, type: 'timelock', value: {} };
      mockFetch.mockResolvedValueOnce({
        json: async () => [scriptData],
      });
      const result = await getScript(validScriptHash);
      expect(result).toEqual(scriptData);
    });

    it('returns false when script not found', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [],
      });
      const result = await getScript(validScriptHash);
      expect(result).toBe(false);
    });

    it('throws for invalid script hash format', async () => {
      await expect(getScript('invalidhash')).rejects.toThrow('Not a valid script hash');
    });

    it('throws rather than reporting a missing script when the provider errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await expect(getScript(validScriptHash)).rejects.toThrow(ProviderError);
    });
  });

  describe('fetchCalidusKey', () => {
    it('returns calidus key data', async () => {
      const keyData = {
        pool_id_bech32: 'pool1abc',
        calidus_pub_key: 'abcdef1234',
        pool_status: 'registered',
        calidus_nonce: 1,
        calidus_id_bech32: 'calidus1abc',
        tx_hash: 'tx123',
        epoch_no: 500,
        block_height: 100000,
        block_time: 1700000000,
      };
      mockFetch.mockResolvedValueOnce({
        json: async () => [keyData],
      });
      const result = await fetchCalidusKey('pool1abc');
      expect(result).toEqual(keyData);
    });

    it('returns null when no key found', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [],
      });
      const result = await fetchCalidusKey('pool1abc');
      expect(result).toBeNull();
    });

    it('throws rather than reporting no key when the provider errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await expect(fetchCalidusKey('pool1abc')).rejects.toThrow(ProviderError);
    });
  });

  describe('fetchDrepName', () => {
    const mockDrepInfo = (metaUrl: string | null) => ({
      json: async () => [{ drep_id: 'drep1abc', meta_url: metaUrl }],
    });
    const mockMeta = (body: unknown) => ({
      ok: true,
      json: async () => body,
    });

    it('returns name from dRepName.@value (typed JSON-LD)', async () => {
      mockFetch
        .mockResolvedValueOnce(mockDrepInfo('https://meta.example.com/drep.json'))
        .mockResolvedValueOnce(mockMeta({ body: { dRepName: { '@value': 'Alice DRep' } } }));
      expect(await fetchDrepName('drep1abc')).toBe('Alice DRep');
    });

    it('returns name from dRepName plain string', async () => {
      mockFetch
        .mockResolvedValueOnce(mockDrepInfo('https://meta.example.com/drep.json'))
        .mockResolvedValueOnce(mockMeta({ body: { dRepName: 'Alice DRep' } }));
      expect(await fetchDrepName('drep1abc')).toBe('Alice DRep');
    });

    it('returns name from givenName plain string', async () => {
      mockFetch
        .mockResolvedValueOnce(mockDrepInfo('https://meta.example.com/drep.json'))
        .mockResolvedValueOnce(mockMeta({ body: { givenName: 'Bob DRep' } }));
      expect(await fetchDrepName('drep1abc')).toBe('Bob DRep');
    });

    it('returns inner @value when givenName is typed JSON-LD (the leak bucket)', async () => {
      mockFetch
        .mockResolvedValueOnce(mockDrepInfo('https://meta.example.com/drep.json'))
        .mockResolvedValueOnce(
          mockMeta({ body: { givenName: { '@value': 'CAMP', '@language': 'en' } } }),
        );
      const result = await fetchDrepName('drep1abc');
      expect(result).toBe('CAMP');
      expect(typeof result).toBe('string');
    });

    it('falls back to familyName when dRepName/givenName are absent', async () => {
      mockFetch
        .mockResolvedValueOnce(mockDrepInfo('https://meta.example.com/drep.json'))
        .mockResolvedValueOnce(mockMeta({ body: { familyName: { '@value': 'Nakamoto' } } }));
      expect(await fetchDrepName('drep1abc')).toBe('Nakamoto');
    });

    it('falls back to body.name (CIP-119 organization)', async () => {
      mockFetch
        .mockResolvedValueOnce(mockDrepInfo('https://meta.example.com/drep.json'))
        .mockResolvedValueOnce(mockMeta({ body: { name: 'DRep Org' } }));
      expect(await fetchDrepName('drep1abc')).toBe('DRep Org');
    });

    it('falls back to top-level name (pool-metadata-style)', async () => {
      mockFetch
        .mockResolvedValueOnce(mockDrepInfo('https://meta.example.com/drep.json'))
        .mockResolvedValueOnce(mockMeta({ name: 'Igud HaKohanim DRep' }));
      expect(await fetchDrepName('drep1abc')).toBe('Igud HaKohanim DRep');
    });

    it('trims whitespace from string values', async () => {
      mockFetch
        .mockResolvedValueOnce(mockDrepInfo('https://meta.example.com/drep.json'))
        .mockResolvedValueOnce(mockMeta({ body: { givenName: '  Vie Vie  ' } }));
      expect(await fetchDrepName('drep1abc')).toBe('Vie Vie');
    });

    it('skips empty-string values and continues the cascade', async () => {
      mockFetch
        .mockResolvedValueOnce(mockDrepInfo('https://meta.example.com/drep.json'))
        .mockResolvedValueOnce(
          mockMeta({ body: { dRepName: '   ', givenName: { '@value': 'Fallback' } } }),
        );
      expect(await fetchDrepName('drep1abc')).toBe('Fallback');
    });

    it('returns undefined when no recognized name field is present', async () => {
      mockFetch
        .mockResolvedValueOnce(mockDrepInfo('https://meta.example.com/drep.json'))
        .mockResolvedValueOnce(mockMeta({ body: {} }));
      expect(await fetchDrepName('drep1abc')).toBeUndefined();
    });

    it('returns undefined when no meta_url', async () => {
      mockFetch.mockResolvedValueOnce(mockDrepInfo(null));
      expect(await fetchDrepName('drep1abc')).toBeUndefined();
    });

    it('returns null when no DRep found', async () => {
      mockFetch.mockResolvedValueOnce({ json: async () => [] });
      expect(await fetchDrepName('drep1nonexistent')).toBeNull();
    });

    it('returns undefined when metadata fetch throws', async () => {
      mockFetch
        .mockResolvedValueOnce(mockDrepInfo('https://meta.example.com/drep.json'))
        .mockRejectedValueOnce(new Error('Metadata fetch failed'));
      expect(await fetchDrepName('drep1abc')).toBeUndefined();
    });

    it('returns undefined when metadata URL returns non-2xx', async () => {
      mockFetch
        .mockResolvedValueOnce(mockDrepInfo('https://meta.example.com/drep.json'))
        .mockResolvedValueOnce({ ok: false, status: 404 });
      expect(await fetchDrepName('drep1abc')).toBeUndefined();
    });

    it('throws rather than reporting an unknown DRep when the provider errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await expect(fetchDrepName('drep1abc')).rejects.toThrow(ProviderError);
    });

    it('still returns undefined when only the off-chain metadata is unreachable', async () => {
      mockFetch
        .mockResolvedValueOnce(mockDrepInfo('https://meta.example.com/drep.json'))
        .mockRejectedValueOnce(new Error('Network error'));
      expect(await fetchDrepName('drep1abc')).toBeUndefined();
    });
  });

  describe('validateDrep', () => {
    it('returns true when DRep is found', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [{ drep_id: 'drep1abc' }],
      });
      expect(await validateDrep('drep1abc')).toBe(true);
    });

    it('returns false when DRep not found', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [],
      });
      expect(await validateDrep('drep1nonexistent')).toBe(false);
    });

    it('throws rather than reporting the DRep unregistered when the provider errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await expect(validateDrep('drep1abc')).rejects.toThrow(ProviderError);
    });
  });

  describe('provider availability (issue #9)', () => {
    // The reported symptom: an expired API token made every lookup answer
    // "not found", so callers could not tell an outage from a real absence.
    const expiredToken = { ok: false, status: 401 };

    it('surfaces an expired token instead of reporting the tx missing', async () => {
      mockFetch.mockResolvedValueOnce(expiredToken);
      await expect(fetchTxInfo('abc123')).rejects.toThrow(ProviderError);
    });

    it('surfaces an expired token instead of reporting the DRep unregistered', async () => {
      mockFetch.mockResolvedValueOnce(expiredToken);
      await expect(validateDrep('drep1abc')).rejects.toThrow(ProviderError);
    });

    it('names the failing provider in the error', async () => {
      mockFetch.mockResolvedValueOnce(expiredToken);
      await expect(fetchTxInfo('abc123')).rejects.toThrow(/koios/i);
    });

    it('propagates through fetchName rather than resolving to null', async () => {
      mockFetch.mockResolvedValue(expiredToken);
      await expect(fetchName('pool1abc')).rejects.toThrow(ProviderError);
    });

    it('propagates through fetchIdentity rather than resolving to null', async () => {
      mockFetch.mockResolvedValue(expiredToken);
      await expect(fetchIdentity('pool1abc')).rejects.toThrow(ProviderError);
    });

    it('does not throw when the provider answers that nothing was found', async () => {
      mockFetch.mockResolvedValueOnce({ json: async () => [] });
      expect(await fetchTxInfo('abc123')).toBeNull();
    });

    it('still tries the secondary provider before giving up', async () => {
      process.env.BLOCKFROST_URL = 'https://blockfrost.example';
      process.env.BLOCKFROST_PROJECT_ID = 'test-project';
      resetProviders();
      mockFetch.mockResolvedValue(expiredToken);
      // Both providers are down, so this still rejects — but only after the
      // secondary was actually consulted.
      await expect(fetchTxInfo('abc123')).rejects.toThrow(ProviderError);
      const hosts = mockFetch.mock.calls.map((c) => String(c[0]));
      expect(hosts.some((u) => u.includes('koios'))).toBe(true);
      expect(hosts.some((u) => u.includes('blockfrost'))).toBe(true);
    });
  });

  describe('fetchHandles', () => {
    const HANDLE_POLICY = 'f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a';

    it('returns every handle from Handle.me with the default first', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          handles: ['zeta', 'ada', 'bigirishlion', '_a'],
          default_handle: 'bigirishlion',
        }),
      });
      const result = await fetchHandles('stake1uabc');
      // Default first, then shortest-first with a lexicographic tiebreak.
      expect(result).toEqual(['bigirishlion', '_a', 'ada', 'zeta']);
    });

    it('orders handles deterministically when there is no default', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ handles: ['zeta', 'ada', 'bob', 'a'] }),
      });
      expect(await fetchHandles('stake1uabc')).toEqual(['a', 'ada', 'bob', 'zeta']);
    });

    it('returns the same order regardless of how the API happens to sort', async () => {
      const shuffles = [
        ['zeta', 'ada', 'bob', 'a'],
        ['a', 'bob', 'zeta', 'ada'],
        ['bob', 'a', 'ada', 'zeta'],
      ];
      for (const handles of shuffles) {
        resetProviders();
        mockFetch.mockResolvedValueOnce({ status: 200, json: async () => ({ handles }) });
        expect(await fetchHandles('stake1uabc')).toEqual(['a', 'ada', 'bob', 'zeta']);
      }
    });

    it('falls back to default_handle when the response omits the handles array', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ default_handle: 'alice' }),
      });
      expect(await fetchHandles('stake1uabc')).toEqual(['alice']);
    });

    it('returns an empty array when the address holds no handles', async () => {
      mockFetch.mockResolvedValueOnce({ status: 404 });
      expect(await fetchHandles('stake1uabc')).toEqual([]);
    });

    it('enumerates every handle asset via the Koios fallback', async () => {
      mockFetch.mockResolvedValueOnce({ status: 500 }); // Handle.me unavailable
      mockFetch.mockResolvedValueOnce({
        json: async () => [
          { policy_id: HANDLE_POLICY, asset_name: 'a1' },
          { policy_id: HANDLE_POLICY, asset_name: 'a2' },
          { policy_id: HANDLE_POLICY, asset_name: 'a3' },
        ],
      });
      mockFetch.mockResolvedValueOnce({
        json: async () => [
          { asset_name_ascii: 'zeta' },
          { asset_name_ascii: 'ada' },
          { asset_name_ascii: 'bob' },
        ],
      });
      expect(await fetchHandles('stake1uabc')).toEqual(['ada', 'bob', 'zeta']);
      // All three assets must be looked up, not just the first.
      const assetInfoBody = JSON.parse(mockFetch.mock.calls[2][1].body);
      expect(assetInfoBody._asset_list).toHaveLength(3);
    });

    it('returns an empty array when Koios finds no handle assets', async () => {
      mockFetch.mockResolvedValueOnce({ status: 500 });
      mockFetch.mockResolvedValueOnce({ json: async () => [] });
      expect(await fetchHandles('stake1uabc')).toEqual([]);
    });
  });

  describe('fetchHandle', () => {
    it('returns the default handle when an address holds several', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ handles: ['zeta', 'ada', 'ninja'], default_handle: 'ninja' }),
      });
      expect(await fetchHandle('stake1uabc')).toBe('ninja');
    });

    it('picks deterministically when an address holds several and sets no default', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ handles: ['zeta', 'ada', 'bob'] }),
      });
      expect(await fetchHandle('stake1uabc')).toBe('ada');
    });

    it('returns handle from Handle.me on 200', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ default_handle: 'alice' }),
      });
      const result = await fetchHandle('stake1uabc');
      expect(result).toBe('alice');
    });

    it('returns null from Handle.me on 404', async () => {
      mockFetch.mockResolvedValueOnce({ status: 404 });
      const result = await fetchHandle('stake1uabc');
      expect(result).toBeNull();
    });

    it('falls back to Koios when Handle.me fails', async () => {
      // Handle.me returns unexpected status (throws)
      mockFetch.mockResolvedValueOnce({ status: 500 });
      // Koios account_assets returns data
      mockFetch.mockResolvedValueOnce({
        json: async () => [
          {
            policy_id: 'f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a',
            asset_name: 'abc',
          },
        ],
      });
      // Koios asset_info returns metadata
      mockFetch.mockResolvedValueOnce({
        json: async () => [{ asset_name_ascii: 'alice_handle' }],
      });
      const result = await fetchHandle('stake1uabc');
      expect(result).toBe('alice_handle');
    });

    it('uses Koios addr endpoint for addr prefix', async () => {
      mockFetch.mockResolvedValueOnce({ status: 500 }); // Handle.me fails
      mockFetch.mockResolvedValueOnce({
        json: async () => [
          {
            policy_id: 'f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a',
            asset_name: 'abc',
          },
        ],
      });
      mockFetch.mockResolvedValueOnce({
        json: async () => [{ asset_name_ascii: 'bob_handle' }],
      });
      const result = await fetchHandle('addr1qxabc');
      expect(result).toBe('bob_handle');
      // Verify the Koios call used address_assets endpoint
      expect(mockFetch.mock.calls[1][0]).toContain('address_assets');
    });

    it('throws for an invalid address prefix via the Koios fallback', async () => {
      mockFetch.mockResolvedValueOnce({ status: 500 }); // Handle.me fails
      await expect(fetchHandle('invalid_prefix')).rejects.toThrow(ProviderError);
    });

    it('uses preprod Handle.me API when NETWORK_NAME is not mainnet', async () => {
      process.env.NETWORK_NAME = 'preprod';
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ default_handle: 'preprod_handle' }),
      });
      await fetchHandle('stake1uabc');
      expect(mockFetch.mock.calls[0][0]).toContain('preprod.api.handle.me');
    });

    it('uses mainnet Handle.me API when NETWORK_NAME is mainnet', async () => {
      process.env.NETWORK_NAME = 'mainnet';
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ default_handle: 'mainnet_handle' }),
      });
      await fetchHandle('stake1uabc');
      expect(mockFetch.mock.calls[0][0]).toContain('api.handle.me');
      expect(mockFetch.mock.calls[0][0]).not.toContain('preprod');
    });

    it('returns null when Koios finds no handle assets', async () => {
      mockFetch.mockResolvedValueOnce({ status: 500 }); // Handle.me fails
      mockFetch.mockResolvedValueOnce({
        json: async () => [],
      });
      const result = await fetchHandle('stake1uabc');
      expect(result).toBeNull();
    });
  });

  describe('fetchTxInfo', () => {
    it('returns transaction data', async () => {
      const txData = { tx_hash: 'abc123', block_height: 100 };
      mockFetch.mockResolvedValueOnce({
        json: async () => [txData],
      });
      const result = await fetchTxInfo('abc123');
      expect(result).toEqual(txData);
    });

    it('returns null when tx not found', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [],
      });
      const result = await fetchTxInfo('nonexistent');
      expect(result).toBeNull();
    });

    it('throws rather than reporting a missing tx when the provider errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await expect(fetchTxInfo('abc123')).rejects.toThrow(ProviderError);
    });
  });

  describe('fetchPoolTicker', () => {
    it('returns ticker for known pool', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [
          {
            pool_id_bech32: 'pool1abc',
            meta_json: {
              ticker: 'NUTS',
              name: 'Stake Nuts',
              homepage: 'https://example.com',
              description: 'A pool',
            },
          },
        ],
      });
      const result = await fetchPoolTicker('pool1abc');
      expect(result).toBe('NUTS');
    });

    it('returns null when pool not found', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [],
      });
      const result = await fetchPoolTicker('pool1nonexistent');
      expect(result).toBeNull();
    });

    it('returns null when pool has no metadata', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [{ pool_id_bech32: 'pool1abc', meta_json: null }],
      });
      const result = await fetchPoolTicker('pool1abc');
      expect(result).toBeNull();
    });

    it('throws rather than reporting no ticker when the provider errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      await expect(fetchPoolTicker('pool1abc')).rejects.toThrow(ProviderError);
    });
  });

  describe('fetchPoolMetadata', () => {
    it('returns full metadata for known pool', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [
          {
            pool_id_bech32: 'pool1abc',
            meta_json: {
              ticker: 'NUTS',
              name: 'Stake Nuts',
              homepage: 'https://stakenuts.com',
              description: 'The best pool',
            },
          },
        ],
      });
      const result = await fetchPoolMetadata('pool1abc');
      expect(result).toEqual({
        pool_id: 'pool1abc',
        ticker: 'NUTS',
        name: 'Stake Nuts',
        homepage: 'https://stakenuts.com',
        description: 'The best pool',
        meta_url: null,
      });
    });

    it('recovers ticker via direct fetch when Koios meta_json is null', async () => {
      // Koios /pool_info returns the pool with meta_url set but meta_json: null
      mockFetch
        .mockResolvedValueOnce({
          json: async () => [
            {
              pool_id_bech32: 'pool1abc',
              meta_url: 'https://meta.example.com/pool.json',
              meta_json: null,
            },
          ],
        })
        // Direct fetch returns a usable CIP-006 document
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ticker: 'RECV',
            name: 'Recovered Pool',
            description: 'Came back via direct fetch',
            homepage: 'https://recovered.example.com',
          }),
        });
      const result = await fetchPoolMetadata('pool1abc');
      expect(result).toEqual({
        pool_id: 'pool1abc',
        ticker: 'RECV',
        name: 'Recovered Pool',
        description: 'Came back via direct fetch',
        homepage: 'https://recovered.example.com',
        meta_url: 'https://meta.example.com/pool.json',
      });
    });

    it('skips direct fetch when ticker is already populated', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [
          {
            pool_id_bech32: 'pool1abc',
            meta_url: 'https://meta.example.com/pool.json',
            meta_json: {
              ticker: 'NUTS',
              name: null,
              homepage: null,
              description: null,
            },
          },
        ],
      });
      const result = await fetchPoolMetadata('pool1abc');
      expect(result?.ticker).toBe('NUTS');
      // Only the Koios call should have happened — no recovery fetch
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('returns Koios record unchanged when direct fetch fails', async () => {
      mockFetch
        .mockResolvedValueOnce({
          json: async () => [
            {
              pool_id_bech32: 'pool1abc',
              meta_url: 'https://parked.example.com/pool.json',
              meta_json: null,
            },
          ],
        })
        .mockResolvedValueOnce({ ok: false, status: 404 });
      const result = await fetchPoolMetadata('pool1abc');
      expect(result).toEqual({
        pool_id: 'pool1abc',
        ticker: null,
        name: null,
        description: null,
        homepage: null,
        meta_url: 'https://parked.example.com/pool.json',
      });
    });

    it('returns Koios record unchanged when direct fetch throws', async () => {
      mockFetch
        .mockResolvedValueOnce({
          json: async () => [
            {
              pool_id_bech32: 'pool1abc',
              meta_url: 'https://dead.example.com/pool.json',
              meta_json: null,
            },
          ],
        })
        .mockRejectedValueOnce(new Error('ENOTFOUND'));
      const result = await fetchPoolMetadata('pool1abc');
      expect(result?.ticker).toBeNull();
      expect(result?.name).toBeNull();
    });

    it('skips direct fetch when meta_url is not registered', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [
          {
            pool_id_bech32: 'pool1abc',
            meta_url: null,
            meta_json: null,
          },
        ],
      });
      const result = await fetchPoolMetadata('pool1abc');
      expect(result?.ticker).toBeNull();
      expect(result?.name).toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('returns null when pool not found', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [],
      });
      const result = await fetchPoolMetadata('pool1nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('fetchName', () => {
    it('routes addr prefix to fetchHandle', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ default_handle: 'alice' }),
      });
      const result = await fetchName('addr1qxabc');
      expect(result).toBe('alice');
    });

    it('routes addr_test prefix to fetchHandle', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ default_handle: 'bob' }),
      });
      const result = await fetchName('addr_test1qxabc');
      expect(result).toBe('bob');
    });

    it('routes stake prefix to fetchHandle', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ default_handle: 'charlie' }),
      });
      const result = await fetchName('stake1uabc');
      expect(result).toBe('charlie');
    });

    it('routes stake_test prefix to fetchHandle', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ default_handle: 'dave' }),
      });
      const result = await fetchName('stake_test1uabc');
      expect(result).toBe('dave');
    });

    it('routes drep prefix to fetchDrepName', async () => {
      mockFetch
        .mockResolvedValueOnce({
          json: async () => [
            { drep_id: 'drep1abc', meta_url: 'https://meta.example.com/drep.json' },
          ],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ body: { givenName: 'Alice DRep' } }),
        });
      const result = await fetchName('drep1abc');
      expect(result).toBe('Alice DRep');
    });

    it('returns null for drep when name is undefined', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [{ drep_id: 'drep1abc', meta_url: null }],
      });
      const result = await fetchName('drep1abc');
      expect(result).toBeNull();
    });

    it('routes pool prefix to fetchPoolMetadata and returns ticker', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [
          {
            pool_id_bech32: 'pool1abc',
            meta_json: {
              ticker: 'NUTS',
              name: 'Stake Nuts',
              homepage: 'https://example.com',
              description: 'A pool',
            },
          },
        ],
      });
      const result = await fetchName('pool1abc');
      expect(result).toBe('NUTS');
    });

    it('falls back to name when pool ticker is null', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [
          {
            pool_id_bech32: 'pool1abc',
            meta_json: { ticker: null, name: 'Stake Nuts', homepage: null, description: null },
          },
        ],
      });
      const result = await fetchName('pool1abc');
      expect(result).toBe('Stake Nuts');
    });

    it('returns null for unsupported prefix', async () => {
      const result = await fetchName('script1abc');
      expect(result).toBeNull();
    });

    it('returns null for empty string', async () => {
      const result = await fetchName('');
      expect(result).toBeNull();
    });
  });

  describe('fetchIdentity', () => {
    it('returns full pool metadata with ticker as displayName', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [
          {
            pool_id_bech32: 'pool1abc',
            meta_json: {
              ticker: 'NUTS',
              name: 'Stake Nuts',
              homepage: 'https://example.com',
              description: 'A pool',
            },
          },
        ],
      });
      const result = await fetchIdentity('pool1abc');
      expect(result).toEqual({
        displayName: 'NUTS',
        fullName: 'Stake Nuts',
        description: 'A pool',
        homepage: 'https://example.com',
        type: 'pool',
      });
    });

    it('falls back to name when pool ticker is null', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [
          {
            pool_id_bech32: 'pool1abc',
            meta_json: { ticker: null, name: 'Stake Nuts', homepage: null, description: null },
          },
        ],
      });
      const result = await fetchIdentity('pool1abc');
      expect(result).toEqual({
        displayName: 'Stake Nuts',
        fullName: 'Stake Nuts',
        type: 'pool',
      });
    });

    it('returns null when pool has no ticker or name', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [
          {
            pool_id_bech32: 'pool1abc',
            meta_json: { ticker: null, name: null, homepage: null, description: null },
          },
        ],
      });
      const result = await fetchIdentity('pool1abc');
      expect(result).toBeNull();
    });

    it('returns drep identity with givenName', async () => {
      mockFetch
        .mockResolvedValueOnce({
          json: async () => [{ drep_id: 'drep1abc', meta_url: 'https://meta.example.com' }],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ body: { givenName: 'Alice DRep' } }),
        });
      const result = await fetchIdentity('drep1abc');
      expect(result).toEqual({ displayName: 'Alice DRep', type: 'drep' });
    });

    it('returns null when drep has no metadata URL', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [{ drep_id: 'drep1abc', meta_url: null }],
      });
      const result = await fetchIdentity('drep1abc');
      expect(result).toBeNull();
    });

    it('returns handle identity for addr prefix', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ default_handle: 'alice' }),
      });
      const result = await fetchIdentity('addr1qxabc');
      expect(result).toEqual({ displayName: 'alice', type: 'handle' });
    });

    it('returns handle identity for stake prefix', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ default_handle: 'charlie' }),
      });
      const result = await fetchIdentity('stake1uabc');
      expect(result).toEqual({ displayName: 'charlie', type: 'handle' });
    });

    it('returns null when handle not found', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 404,
      });
      const result = await fetchIdentity('stake1uabc');
      expect(result).toBeNull();
    });

    it('returns null for unsupported prefix', async () => {
      const result = await fetchIdentity('script1abc');
      expect(result).toBeNull();
    });
  });

  describe('provider fallback', () => {
    it('falls back to Blockfrost when Koios fails for fetchTxInfo', async () => {
      process.env.BLOCKFROST_URL = 'https://cardano-mainnet.blockfrost.io/api/v0';
      process.env.BLOCKFROST_PROJECT_ID = 'test-project-id';

      // Koios fails with network error
      mockFetch.mockRejectedValueOnce(new Error('Koios is down'));
      // Blockfrost /txs/{hash} succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          hash: 'abc123',
          block: 'block456',
          block_height: 100,
          block_time: 1700000000,
          fees: '200000',
          deposit: '0',
          treasury_donation: '0',
          output_amount: [{ unit: 'lovelace', quantity: '10000000' }],
        }),
      });
      // Blockfrost /txs/{hash}/utxos succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ hash: 'abc123', inputs: [], outputs: [] }),
      });

      const result = await fetchTxInfo('abc123');
      expect(result).not.toBeNull();
      expect(result!.tx_hash).toBe('abc123');
    });

    it('falls back to Koios when Blockfrost is primary and fails', async () => {
      process.env.PRIMARY_PROVIDER = 'blockfrost';
      process.env.BLOCKFROST_URL = 'https://cardano-mainnet.blockfrost.io/api/v0';
      process.env.BLOCKFROST_PROJECT_ID = 'test-project-id';

      // Blockfrost fails
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      // Koios succeeds
      mockFetch.mockResolvedValueOnce({
        json: async () => [{ tx_hash: 'abc123', block_height: 100 }],
      });

      const result = await fetchTxInfo('abc123');
      expect(result).not.toBeNull();
      expect(result!.tx_hash).toBe('abc123');
    });
  });
});
