import { describe, it, expect, beforeAll } from 'vitest';

import { verifySignature } from './verifySignature.js';
import { resetProviders, validatePool } from '../cardano/cardanoApi.js';
import {
  valid_calidus_payload,
  invalid_calidus_payload,
  second_pool_calidus_payload,
} from '../__fixtures__/signatures.js';

/**
 * Live API tests for pool sign-in against preprod Koios.
 * Skipped unless LIVE_TEST=true. Requires API_TOKEN, a Koios token.
 */
describe.skipIf(process.env.LIVE_TEST !== 'true')('verifySignature — live calidus tests', () => {
  // Retired at the start of preprod epoch 318.
  const retiredPoolId = 'pool10dtwvn64akqjdtn9d4pd2mnhpxfgp76hvsfkgmfwugrsxef3y2p';
  // No pool has this ID: its key hash is all zeros.
  const unknownPoolId = 'pool1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq8a7a2d';

  beforeAll(() => {
    process.env.API_URL = 'https://preprod.koios.rest/api/v1';
    process.env.NETWORK_NAME = 'preprod';
    delete process.env.BLOCKFROST_URL;
    delete process.env.BLOCKFROST_PROJECT_ID;
    resetProviders();
  });

  it('validates pool signature with real calidus key', async () => {
    const result = await verifySignature(
      valid_calidus_payload.payload,
      valid_calidus_payload.pool_id,
      valid_calidus_payload,
    );
    expect(result).toBe(true);
  }, 15000);

  it('rejects invalid calidus payload', async () => {
    const result = await verifySignature(
      invalid_calidus_payload.payload,
      invalid_calidus_payload.pool_id,
      invalid_calidus_payload,
    );
    expect(result).toBe(false);
  }, 15000);

  it("rejects another pool's calidus key", async () => {
    const result = await verifySignature(
      second_pool_calidus_payload.payload,
      valid_calidus_payload.pool_id,
      second_pool_calidus_payload,
    );
    expect(result).toEqual({
      error: 'The key used for signing does not match the address provided!',
    });
  }, 15000);

  it('refuses a retired pool', async () => {
    const result = await verifySignature(
      valid_calidus_payload.payload,
      retiredPoolId,
      valid_calidus_payload,
    );
    expect(result).toEqual({ error: 'Pool is not registered' });
  }, 15000);

  it('validatePool reports a registered pool', async () => {
    expect(await validatePool(valid_calidus_payload.pool_id)).toBe(true);
  }, 15000);

  it('validatePool reports a retired pool as unregistered', async () => {
    expect(await validatePool(retiredPoolId)).toBe(false);
  }, 15000);

  it('validatePool reports a pool that was never registered as unregistered', async () => {
    expect(await validatePool(unknownPoolId)).toBe(false);
  }, 15000);
});
