import { describe, it, expect, beforeAll } from "vitest";

import {
  fetchTxInfo,
  validateDrep,
  getScript,
  fetchCalidusKey,
  fetchPoolTicker,
  fetchPoolMetadata,
  resetProviders,
} from "./cardanoApi.js";

/**
 * Live API tests against preprod Koios. Skipped unless LIVE_TEST=true.
 * These use the public preprod endpoint which requires no auth token.
 */
describe.skipIf(process.env.LIVE_TEST !== "true")("cardanoApi — live preprod tests", () => {
  beforeAll(() => {
    resetProviders();
    process.env.API_URL = "https://preprod.koios.rest/api/v1";
    process.env.API_TOKEN = "";
  });

  // Known preprod transaction
  const preprodTxHash = "f144a8264acf4bdfe2e1241170f427aba0f51a2b745f40e0f4148fb4c7616e2c";

  it("fetchTxInfo returns data for known preprod tx", async () => {
    const result = await fetchTxInfo(preprodTxHash);
    expect(result).not.toBeNull();
    expect(result!.tx_hash).toBe(preprodTxHash);
    expect(result!.block_height).toBeGreaterThan(0);
  }, 15000);

  it("fetchTxInfo returns null for non-existent tx", async () => {
    const fakeTxHash = "0000000000000000000000000000000000000000000000000000000000000000";
    const result = await fetchTxInfo(fakeTxHash);
    expect(result).toBeNull();
  }, 15000);

  // Known preprod registered DRep
  const preprodDrepId = "drep1yg3gkhv0ygzle3z9p2zel4mce7rfd5zy0hxlxjqmfvrdsjqayzav";

  it("validateDrep returns true for known registered DRep", async () => {
    const result = await validateDrep(preprodDrepId);
    expect(result).toBe(true);
  }, 15000);

  it("validateDrep returns false for non-existent DRep", async () => {
    const result = await validateDrep("drep1yyyyyy");
    expect(result).toBe(false);
  }, 15000);

  // Known preprod script hash
  const preprodScriptHash = "2ac096b860eb407ffb4a8955ef15c3774be4c632f6d3310925f2026f";

  it("getScript returns data for known preprod script", async () => {
    const result = await getScript(preprodScriptHash);
    expect(result).not.toBe(false);
    if (result) {
      expect(result).toHaveProperty("type");
    }
  }, 15000);

  // Known preprod pool with calidus key
  const preprodPoolId = "pool1rkfs9glmfva3jd0q9vnlqvuhnrflpzj4l07u6sayfx5k7d788us";

  it("fetchCalidusKey returns data or null for known preprod pool", async () => {
    const result = await fetchCalidusKey(preprodPoolId);
    // May or may not have a calidus key on preprod — just verify the call succeeds
    if (result !== null) {
      expect(result).toHaveProperty("calidus_pub_key");
      expect(result).toHaveProperty("pool_id_bech32");
    }
  }, 15000);

  it("fetchPoolTicker returns ticker or null for known preprod pool", async () => {
    const result = await fetchPoolTicker(preprodPoolId);
    // May or may not have metadata on preprod
    if (result !== null) {
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    }
  }, 15000);

  it("fetchPoolMetadata returns metadata or null for known preprod pool", async () => {
    const result = await fetchPoolMetadata(preprodPoolId);
    if (result !== null) {
      expect(result).toHaveProperty("pool_id");
      expect(result).toHaveProperty("ticker");
      expect(result).toHaveProperty("name");
    }
  }, 15000);
});
