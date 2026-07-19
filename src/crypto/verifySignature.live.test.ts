import { describe, it, expect, beforeAll } from 'vitest';

import { verifySignature } from './verifySignature.js';
import {
  valid_calidus_payload,
  invalid_calidus_payload,
  unregistered_calidus_payload,
} from '../__fixtures__/signatures.js';

/**
 * Live API tests for calidus key verification against preprod Koios.
 * Skipped unless LIVE_TEST=true.
 */
describe.skipIf(process.env.LIVE_TEST !== 'true')('verifySignature — live calidus tests', () => {
  beforeAll(() => {
    process.env.API_URL = 'https://preprod.koios.rest/api/v1';
    process.env.API_TOKEN = '';
    process.env.NETWORK_NAME = 'preprod';
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

  it('returns error for unregistered calidus pool', async () => {
    const result = await verifySignature(
      unregistered_calidus_payload.payload,
      unregistered_calidus_payload.pool_id,
      unregistered_calidus_payload,
    );
    expect(result).toEqual({
      error: 'The key used for signing does not match the address provided!',
    });
  }, 15000);
});
