import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  getScript,
  fetchCalidusKey,
  fetchDrepName,
  validateDrep,
  fetchHandle,
  fetchTxInfo,
  fetchPoolTicker,
  fetchPoolMetadata,
  fetchName,
  resetProviders,
} from "./cardanoApi.js";

// Valid script hash for format validation (28 bytes = 56 hex chars)
const validScriptHash = "2ac096b860eb407ffb4a8955ef15c3774be4c632f6d3310925f2026f";

describe("cardanoApi", () => {
  const ORIGINAL_ENV = process.env;
  const mockFetch = vi.fn();

  beforeEach(() => {
    resetProviders();
    process.env = {
      ...ORIGINAL_ENV,
      API_URL: "https://api.koios.rest/api/v1",
      API_TOKEN: "test-token",
    };
    vi.stubGlobal("fetch", mockFetch);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("getApiConfig (indirect)", () => {
    it("throws when API_URL is missing", async () => {
      delete process.env.API_URL;
      await expect(getScript(validScriptHash)).rejects.toThrow("API_URL is not set");
    });

    it("throws when API_TOKEN is missing", async () => {
      delete process.env.API_TOKEN;
      await expect(getScript(validScriptHash)).rejects.toThrow("API_TOKEN is not set");
    });
  });

  describe("getScript", () => {
    it("returns script data for valid hash", async () => {
      const scriptData = { script_hash: validScriptHash, type: "timelock", value: {} };
      mockFetch.mockResolvedValueOnce({
        json: async () => [scriptData],
      });
      const result = await getScript(validScriptHash);
      expect(result).toEqual(scriptData);
    });

    it("returns false when script not found", async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [],
      });
      const result = await getScript(validScriptHash);
      expect(result).toBe(false);
    });

    it("throws for invalid script hash format", async () => {
      await expect(getScript("invalidhash")).rejects.toThrow("Not a valid script hash");
    });

    it("returns false on fetch error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      const result = await getScript(validScriptHash);
      expect(result).toBe(false);
    });
  });

  describe("fetchCalidusKey", () => {
    it("returns calidus key data", async () => {
      const keyData = {
        pool_id_bech32: "pool1abc",
        calidus_pub_key: "abcdef1234",
        pool_status: "registered",
        calidus_nonce: 1,
        calidus_id_bech32: "calidus1abc",
        tx_hash: "tx123",
        epoch_no: 500,
        block_height: 100000,
        block_time: 1700000000,
      };
      mockFetch.mockResolvedValueOnce({
        json: async () => [keyData],
      });
      const result = await fetchCalidusKey("pool1abc");
      expect(result).toEqual(keyData);
    });

    it("returns null when no key found", async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [],
      });
      const result = await fetchCalidusKey("pool1abc");
      expect(result).toBeNull();
    });

    it("returns null on fetch error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      const result = await fetchCalidusKey("pool1abc");
      expect(result).toBeNull();
    });
  });

  describe("fetchDrepName", () => {
    it("returns name from dRepName.@value", async () => {
      mockFetch
        .mockResolvedValueOnce({
          json: async () => [
            { drep_id: "drep1abc", meta_url: "https://meta.example.com/drep.json" },
          ],
        })
        .mockResolvedValueOnce({
          json: async () => ({ body: { dRepName: { "@value": "Alice DRep" } } }),
        });
      const result = await fetchDrepName("drep1abc");
      expect(result).toBe("Alice DRep");
    });

    it("returns name from givenName", async () => {
      mockFetch
        .mockResolvedValueOnce({
          json: async () => [
            { drep_id: "drep1abc", meta_url: "https://meta.example.com/drep.json" },
          ],
        })
        .mockResolvedValueOnce({
          json: async () => ({ body: { givenName: "Bob DRep" } }),
        });
      const result = await fetchDrepName("drep1abc");
      expect(result).toBe("Bob DRep");
    });

    it("returns undefined when no name in metadata", async () => {
      mockFetch
        .mockResolvedValueOnce({
          json: async () => [
            { drep_id: "drep1abc", meta_url: "https://meta.example.com/drep.json" },
          ],
        })
        .mockResolvedValueOnce({
          json: async () => ({ body: {} }),
        });
      const result = await fetchDrepName("drep1abc");
      expect(result).toBeUndefined();
    });

    it("returns undefined when no meta_url", async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [{ drep_id: "drep1abc", meta_url: null }],
      });
      const result = await fetchDrepName("drep1abc");
      expect(result).toBeUndefined();
    });

    it("returns null when no DRep found", async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [],
      });
      const result = await fetchDrepName("drep1nonexistent");
      expect(result).toBeNull();
    });

    it("returns undefined when metadata fetch fails", async () => {
      mockFetch
        .mockResolvedValueOnce({
          json: async () => [
            { drep_id: "drep1abc", meta_url: "https://meta.example.com/drep.json" },
          ],
        })
        .mockRejectedValueOnce(new Error("Metadata fetch failed"));
      const result = await fetchDrepName("drep1abc");
      expect(result).toBeUndefined();
    });

    it("returns null on primary fetch error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      const result = await fetchDrepName("drep1abc");
      expect(result).toBeNull();
    });
  });

  describe("validateDrep", () => {
    it("returns true when DRep is found", async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [{ drep_id: "drep1abc" }],
      });
      expect(await validateDrep("drep1abc")).toBe(true);
    });

    it("returns false when DRep not found", async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [],
      });
      expect(await validateDrep("drep1nonexistent")).toBe(false);
    });

    it("returns false on error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      expect(await validateDrep("drep1abc")).toBe(false);
    });
  });

  describe("fetchHandle", () => {
    it("returns handle from Handle.me on 200", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ default_handle: "alice" }),
      });
      const result = await fetchHandle("stake1uabc");
      expect(result).toBe("alice");
    });

    it("returns null from Handle.me on 404", async () => {
      mockFetch.mockResolvedValueOnce({ status: 404 });
      const result = await fetchHandle("stake1uabc");
      expect(result).toBeNull();
    });

    it("falls back to Koios when Handle.me fails", async () => {
      // Handle.me returns unexpected status (throws)
      mockFetch.mockResolvedValueOnce({ status: 500 });
      // Koios account_assets returns data
      mockFetch.mockResolvedValueOnce({
        json: async () => [
          {
            policy_id: "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a",
            asset_name: "abc",
          },
        ],
      });
      // Koios asset_info returns metadata
      mockFetch.mockResolvedValueOnce({
        json: async () => [{ asset_name_ascii: "alice_handle" }],
      });
      const result = await fetchHandle("stake1uabc");
      expect(result).toBe("alice_handle");
    });

    it("uses Koios addr endpoint for addr prefix", async () => {
      mockFetch.mockResolvedValueOnce({ status: 500 }); // Handle.me fails
      mockFetch.mockResolvedValueOnce({
        json: async () => [
          {
            policy_id: "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a",
            asset_name: "abc",
          },
        ],
      });
      mockFetch.mockResolvedValueOnce({
        json: async () => [{ asset_name_ascii: "bob_handle" }],
      });
      const result = await fetchHandle("addr1qxabc");
      expect(result).toBe("bob_handle");
      // Verify the Koios call used address_assets endpoint
      expect(mockFetch.mock.calls[1][0]).toContain("address_assets");
    });

    it("returns null for invalid address prefix via Koios fallback", async () => {
      mockFetch.mockResolvedValueOnce({ status: 500 }); // Handle.me fails
      const result = await fetchHandle("invalid_prefix");
      expect(result).toBeNull();
    });

    it("uses preprod Handle.me API when NETWORK_NAME is not mainnet", async () => {
      process.env.NETWORK_NAME = "preprod";
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ default_handle: "preprod_handle" }),
      });
      await fetchHandle("stake1uabc");
      expect(mockFetch.mock.calls[0][0]).toContain("preprod.api.handle.me");
    });

    it("uses mainnet Handle.me API when NETWORK_NAME is mainnet", async () => {
      process.env.NETWORK_NAME = "mainnet";
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ default_handle: "mainnet_handle" }),
      });
      await fetchHandle("stake1uabc");
      expect(mockFetch.mock.calls[0][0]).toContain("api.handle.me");
      expect(mockFetch.mock.calls[0][0]).not.toContain("preprod");
    });

    it("returns null when Koios finds no handle assets", async () => {
      mockFetch.mockResolvedValueOnce({ status: 500 }); // Handle.me fails
      mockFetch.mockResolvedValueOnce({
        json: async () => [],
      });
      const result = await fetchHandle("stake1uabc");
      expect(result).toBeNull();
    });
  });

  describe("fetchTxInfo", () => {
    it("returns transaction data", async () => {
      const txData = { tx_hash: "abc123", block_height: 100 };
      mockFetch.mockResolvedValueOnce({
        json: async () => [txData],
      });
      const result = await fetchTxInfo("abc123");
      expect(result).toEqual(txData);
    });

    it("returns null when tx not found", async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [],
      });
      const result = await fetchTxInfo("nonexistent");
      expect(result).toBeNull();
    });

    it("returns null on fetch error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      const result = await fetchTxInfo("abc123");
      expect(result).toBeNull();
    });
  });

  describe("fetchPoolTicker", () => {
    it("returns ticker for known pool", async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [
          {
            pool_id_bech32: "pool1abc",
            meta_json: {
              ticker: "NUTS",
              name: "Stake Nuts",
              homepage: "https://example.com",
              description: "A pool",
            },
          },
        ],
      });
      const result = await fetchPoolTicker("pool1abc");
      expect(result).toBe("NUTS");
    });

    it("returns null when pool not found", async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [],
      });
      const result = await fetchPoolTicker("pool1nonexistent");
      expect(result).toBeNull();
    });

    it("returns null when pool has no metadata", async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [{ pool_id_bech32: "pool1abc", meta_json: null }],
      });
      const result = await fetchPoolTicker("pool1abc");
      expect(result).toBeNull();
    });

    it("returns null on fetch error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));
      const result = await fetchPoolTicker("pool1abc");
      expect(result).toBeNull();
    });
  });

  describe("fetchPoolMetadata", () => {
    it("returns full metadata for known pool", async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [
          {
            pool_id_bech32: "pool1abc",
            meta_json: {
              ticker: "NUTS",
              name: "Stake Nuts",
              homepage: "https://stakenuts.com",
              description: "The best pool",
            },
          },
        ],
      });
      const result = await fetchPoolMetadata("pool1abc");
      expect(result).toEqual({
        pool_id: "pool1abc",
        ticker: "NUTS",
        name: "Stake Nuts",
        homepage: "https://stakenuts.com",
        description: "The best pool",
      });
    });

    it("returns null when pool not found", async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [],
      });
      const result = await fetchPoolMetadata("pool1nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("fetchName", () => {
    it("routes addr prefix to fetchHandle", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ default_handle: "alice" }),
      });
      const result = await fetchName("addr1qxabc");
      expect(result).toBe("alice");
    });

    it("routes addr_test prefix to fetchHandle", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ default_handle: "bob" }),
      });
      const result = await fetchName("addr_test1qxabc");
      expect(result).toBe("bob");
    });

    it("routes stake prefix to fetchHandle", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ default_handle: "charlie" }),
      });
      const result = await fetchName("stake1uabc");
      expect(result).toBe("charlie");
    });

    it("routes stake_test prefix to fetchHandle", async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({ default_handle: "dave" }),
      });
      const result = await fetchName("stake_test1uabc");
      expect(result).toBe("dave");
    });

    it("routes drep prefix to fetchDrepName", async () => {
      mockFetch
        .mockResolvedValueOnce({
          json: async () => [
            { drep_id: "drep1abc", meta_url: "https://meta.example.com/drep.json" },
          ],
        })
        .mockResolvedValueOnce({
          json: async () => ({ body: { givenName: "Alice DRep" } }),
        });
      const result = await fetchName("drep1abc");
      expect(result).toBe("Alice DRep");
    });

    it("returns null for drep when name is undefined", async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [{ drep_id: "drep1abc", meta_url: null }],
      });
      const result = await fetchName("drep1abc");
      expect(result).toBeNull();
    });

    it("routes pool prefix to fetchPoolMetadata and returns name", async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [
          {
            pool_id_bech32: "pool1abc",
            meta_json: {
              ticker: "NUTS",
              name: "Stake Nuts",
              homepage: "https://example.com",
              description: "A pool",
            },
          },
        ],
      });
      const result = await fetchName("pool1abc");
      expect(result).toBe("Stake Nuts");
    });

    it("falls back to ticker when pool name is null", async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => [
          {
            pool_id_bech32: "pool1abc",
            meta_json: { ticker: "NUTS", name: null, homepage: null, description: null },
          },
        ],
      });
      const result = await fetchName("pool1abc");
      expect(result).toBe("NUTS");
    });

    it("returns null for unsupported prefix", async () => {
      const result = await fetchName("script1abc");
      expect(result).toBeNull();
    });

    it("returns null for empty string", async () => {
      const result = await fetchName("");
      expect(result).toBeNull();
    });
  });

  describe("provider fallback", () => {
    it("falls back to Blockfrost when Koios fails for fetchTxInfo", async () => {
      process.env.BLOCKFROST_URL = "https://cardano-mainnet.blockfrost.io/api/v0";
      process.env.BLOCKFROST_PROJECT_ID = "test-project-id";

      // Koios fails with network error
      mockFetch.mockRejectedValueOnce(new Error("Koios is down"));
      // Blockfrost /txs/{hash} succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          hash: "abc123",
          block: "block456",
          block_height: 100,
          block_time: 1700000000,
          fees: "200000",
          deposit: "0",
          treasury_donation: "0",
          output_amount: [{ unit: "lovelace", quantity: "10000000" }],
        }),
      });
      // Blockfrost /txs/{hash}/utxos succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ hash: "abc123", inputs: [], outputs: [] }),
      });

      const result = await fetchTxInfo("abc123");
      expect(result).not.toBeNull();
      expect(result!.tx_hash).toBe("abc123");
    });

    it("falls back to Koios when Blockfrost is primary and fails", async () => {
      process.env.PRIMARY_PROVIDER = "blockfrost";
      process.env.BLOCKFROST_URL = "https://cardano-mainnet.blockfrost.io/api/v0";
      process.env.BLOCKFROST_PROJECT_ID = "test-project-id";

      // Blockfrost fails
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      // Koios succeeds
      mockFetch.mockResolvedValueOnce({
        json: async () => [{ tx_hash: "abc123", block_height: 100 }],
      });

      const result = await fetchTxInfo("abc123");
      expect(result).not.toBeNull();
      expect(result!.tx_hash).toBe("abc123");
    });
  });
});
