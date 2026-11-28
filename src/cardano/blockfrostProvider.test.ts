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

describe('BlockfrostProvider fetchDrepInfo', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  it('reports a DRep that has not retired as registered', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          drep_id: 'drep1abc',
          hex: 'aa',
          amount: '0',
          has_script: false,
          retired: false,
          expired: true,
          last_active_epoch: 5,
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 404 });
    const [info] = await new BlockfrostProvider(config()).fetchDrepInfo(['drep1abc']);
    expect(info.drep_status).toBe('registered');
    expect(info.active).toBe(false);
  });

  it('reports a row with no last_active_epoch as not_registered', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          drep_id: 'drep1abc',
          hex: 'aa',
          amount: '0',
          has_script: false,
          retired: false,
          expired: false,
          last_active_epoch: null,
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 404 });
    const [info] = await new BlockfrostProvider(config()).fetchDrepInfo(['drep1abc']);
    expect(info.drep_status).toBe('not_registered');
    expect(info.active).toBe(true);
  });

  it('reports a predefined DRep with no last_active_epoch as registered', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          drep_id: 'drep_always_abstain',
          hex: 'aa',
          amount: '0',
          has_script: false,
          retired: false,
          expired: true,
          last_active_epoch: null,
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 404 });
    const [info] = await new BlockfrostProvider(config()).fetchDrepInfo(['drep_always_abstain']);
    expect(info.drep_status).toBe('registered');
  });
});

describe('BlockfrostProvider fetchPoolStatus', () => {
  const mockFetch = vi.fn();
  const poolId = 'pool1zfd0gl76h3f0ammgp4gu0qvt99qcqkn5a895wv0q779d6p9dz5u';
  const retireTx = 'de2fcc1484ebeb1d8badc1871085fa560524a896b6ce1c5e75401b7fc0dcd838';
  const ok = (body: unknown): { ok: true; status: 200; json: () => Promise<unknown> } => ({
    ok: true,
    status: 200,
    json: async () => body,
  });
  // Routes by path, so the parallel retirement and epoch lookups may arrive in any order.
  const answer = (routes: Record<string, unknown>): void => {
    mockFetch.mockImplementation(async (url: string) => {
      const path = url.replace(config().url, '');
      if (!(path in routes)) return { ok: false, status: 404 };
      const body = routes[path];
      return body instanceof Error ? Promise.reject(body) : ok(body);
    });
  };
  const updates = `/pools/${poolId}/updates?order=desc&count=1`;
  const retirement = (epoch: number, cert_index = 0): Record<string, unknown> => ({
    [updates]: [{ tx_hash: retireTx, cert_index, action: 'deregistered' }],
    [`/txs/${retireTx}/pool_retires`]: [{ cert_index: 0, pool_id: poolId, retiring_epoch: epoch }],
    '/epochs/latest': { epoch: 670 },
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  it('reports a pool whose latest certificate is a registration as registered', async () => {
    answer({ [updates]: [{ tx_hash: 'aa', cert_index: 0, action: 'registered' }] });
    expect(await new BlockfrostProvider(config()).fetchPoolStatus(poolId)).toEqual({
      pool_id: poolId,
      pool_status: 'registered',
      retiring_epoch: null,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('reports a pool retiring in a later epoch as retiring', async () => {
    answer(retirement(672));
    expect(await new BlockfrostProvider(config()).fetchPoolStatus(poolId)).toEqual({
      pool_id: poolId,
      pool_status: 'retiring',
      retiring_epoch: 672,
    });
  });

  it('reports a pool as retired from the start of its retiring epoch', async () => {
    answer(retirement(670));
    expect(await new BlockfrostProvider(config()).fetchPoolStatus(poolId)).toMatchObject({
      pool_status: 'retired',
      retiring_epoch: 670,
    });
  });

  it('returns null for a pool that was never registered', async () => {
    answer({});
    expect(await new BlockfrostProvider(config()).fetchPoolStatus(poolId)).toBeNull();
  });

  it('throws when the retirement certificate cannot be found', async () => {
    answer(retirement(672, 1));
    await expect(new BlockfrostProvider(config()).fetchPoolStatus(poolId)).rejects.toThrow(
      ProviderError,
    );
  });

  it('throws rather than reporting the pool unregistered when the provider errors', async () => {
    answer({ [updates]: new Error('ECONNRESET') });
    await expect(new BlockfrostProvider(config()).fetchPoolStatus(poolId)).rejects.toThrow(
      ProviderError,
    );
  });
});

/**
 * Address vectors from CIP-19, "Test Vectors". All use the same payment key,
 * stake key and script, so each base address maps to the stake address of its
 * delegation part (type-14 for a key hash, type-15 for a script hash).
 */
const CIP19_MAINNET = {
  base: {
    'type-00':
      'addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x',
    'type-01':
      'addr1z8phkx6acpnf78fuvxn0mkew3l0fd058hzquvz7w36x4gten0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgs9yc0hh',
    'type-02':
      'addr1yx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzerkr0vd4msrxnuwnccdxlhdjar77j6lg0wypcc9uar5d2shs2z78ve',
    'type-03':
      'addr1x8phkx6acpnf78fuvxn0mkew3l0fd058hzquvz7w36x4gt7r0vd4msrxnuwnccdxlhdjar77j6lg0wypcc9uar5d2shskhj42g',
  },
  pointer: {
    'type-04': 'addr1gx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer5pnz75xxcrzqf96k',
    'type-05': 'addr128phkx6acpnf78fuvxn0mkew3l0fd058hzquvz7w36x4gtupnz75xxcrtw79hu',
  },
  enterprise: {
    'type-06': 'addr1vx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzers66hrl8',
    'type-07': 'addr1w8phkx6acpnf78fuvxn0mkew3l0fd058hzquvz7w36x4gtcyjy7wx',
  },
  stakeKey: 'stake1uyehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gh6ffgw',
  stakeScript: 'stake178phkx6acpnf78fuvxn0mkew3l0fd058hzquvz7w36x4gtcccycj5',
};

const CIP19_TESTNET = {
  base: {
    'type-00':
      'addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgs68faae',
    'type-01':
      'addr_test1zrphkx6acpnf78fuvxn0mkew3l0fd058hzquvz7w36x4gten0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgsxj90mg',
    'type-02':
      'addr_test1yz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzerkr0vd4msrxnuwnccdxlhdjar77j6lg0wypcc9uar5d2shsf5r8qx',
    'type-03':
      'addr_test1xrphkx6acpnf78fuvxn0mkew3l0fd058hzquvz7w36x4gt7r0vd4msrxnuwnccdxlhdjar77j6lg0wypcc9uar5d2shs4p04xh',
  },
  pointer: {
    'type-04': 'addr_test1gz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer5pnz75xxcrdw5vky',
    'type-05': 'addr_test12rphkx6acpnf78fuvxn0mkew3l0fd058hzquvz7w36x4gtupnz75xxcryqrvmw',
  },
  enterprise: {
    'type-06': 'addr_test1vz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzerspjrlsz',
    'type-07': 'addr_test1wrphkx6acpnf78fuvxn0mkew3l0fd058hzquvz7w36x4gtcl6szpr',
  },
  stakeKey: 'stake_test1uqehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gssrtvn',
  stakeScript: 'stake_test17rphkx6acpnf78fuvxn0mkew3l0fd058hzquvz7w36x4gtcljw6kf',
};

describe('BlockfrostProvider stake address derivation', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  /** Runs each address through fetchTxInfo as a transaction output and returns its stake_addr. */
  async function stakeAddressesOf(addresses: string[]): Promise<(string | null)[]> {
    const utxo = (address: string, index: number): Record<string, unknown> => ({
      address,
      tx_hash: 'a'.repeat(64),
      output_index: index,
      amount: [{ unit: 'lovelace', quantity: '1000000' }],
    });
    mockFetch.mockImplementation(async (url: string) => {
      const body = url.endsWith('/utxos')
        ? { inputs: [], outputs: addresses.map(utxo) }
        : {
            hash: 'a'.repeat(64),
            block: 'b'.repeat(64),
            block_height: 1,
            block_time: 1,
            output_amount: [{ unit: 'lovelace', quantity: '1000000' }],
            fees: '170000',
            treasury_donation: '0',
            deposit: '0',
          };
      return { ok: true, status: 200, json: async (): Promise<unknown> => body };
    });
    const info = await new BlockfrostProvider(config()).fetchTxInfo('a'.repeat(64));
    return info!.outputs.map((o) => o.stake_addr);
  }

  describe.each([
    ['mainnet', CIP19_MAINNET],
    ['testnet', CIP19_TESTNET],
  ])('%s', (_network, vectors) => {
    it('derives the stake key address from key-delegated base addresses', async () => {
      expect(await stakeAddressesOf([vectors.base['type-00'], vectors.base['type-01']])).toEqual([
        vectors.stakeKey,
        vectors.stakeKey,
      ]);
    });

    it('derives the stake script address from script-delegated base addresses', async () => {
      expect(await stakeAddressesOf([vectors.base['type-02'], vectors.base['type-03']])).toEqual([
        vectors.stakeScript,
        vectors.stakeScript,
      ]);
    });

    it('returns null for enterprise addresses', async () => {
      expect(
        await stakeAddressesOf([vectors.enterprise['type-06'], vectors.enterprise['type-07']]),
      ).toEqual([null, null]);
    });

    it('returns null for pointer addresses', async () => {
      expect(
        await stakeAddressesOf([vectors.pointer['type-04'], vectors.pointer['type-05']]),
      ).toEqual([null, null]);
    });

    it('returns null for a stake address', async () => {
      expect(await stakeAddressesOf([vectors.stakeKey])).toEqual([null]);
    });
  });

  it('returns null for malformed strings', async () => {
    const valid = CIP19_MAINNET.base['type-00'];
    const badChecksum = valid.slice(0, -1) + (valid.endsWith('x') ? 'q' : 'x');
    expect(await stakeAddressesOf(['not-an-address', '', valid.slice(0, 40), badChecksum])).toEqual(
      [null, null, null, null],
    );
  });
});
