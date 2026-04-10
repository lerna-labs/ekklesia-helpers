import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

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
  fetchIdentity,
  resetProviders,
} from "./cardanoApi.js";

/**
 * Live API tests against mainnet. Skipped unless LIVE_TEST=true.
 *
 * Requires at least one provider configured via env vars:
 *   - Koios: API_URL + API_TOKEN
 *   - Blockfrost: BLOCKFROST_URL + BLOCKFROST_PROJECT_ID
 *
 * Run: source .local.env && LIVE_TEST=true npx vitest run src/cardano/cardanoApi.live.test.ts
 */
describe.skipIf(process.env.LIVE_TEST !== "true")("cardanoApi — live mainnet tests", () => {
  beforeAll(() => {
    resetProviders();
  });

  // --- Known mainnet test data ---
  const knownTxHash = "833ec1b2bbaf0dae7946136865679794eae2d54613a40773f965e5e40962e356";
  const knownPoolId = "pool1qqqqqdk4zhsjuxxd8jyvwncf5eucfskz0xjjj64fdmlgj735lr9"; // ATADA
  const knownDrepId = "drep1y2200we9c904un36tzaearntzzl63snffuul9qsk0te4utqfkke0w"; // YUTA
  const knownStakeAddr = "stake1uxekfkqgs4ye2wnf38e7x8uy006wvleq3etu8t35gqmdmnq5v4rks"; // $426
  const knownScriptHash = "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a"; // ADA Handle
  const knownScriptDrepId = "drep1ydpfkyjxzeqvalf6fgvj7lznrk8kcmfnvy9hyl6gr6ez6wgsjaelx"; // CF

  // --- fetchTxInfo ---

  it("fetchTxInfo returns data for known tx", async () => {
    const result = await fetchTxInfo(knownTxHash);
    expect(result).not.toBeNull();
    expect(result!.tx_hash).toBe(knownTxHash);
    expect(result!.block_height).toBeGreaterThan(0);
  }, 15000);

  it("fetchTxInfo returns null for non-existent tx", async () => {
    const fakeTxHash = "0000000000000000000000000000000000000000000000000000000000000000";
    const result = await fetchTxInfo(fakeTxHash);
    expect(result).toBeNull();
  }, 15000);

  // --- getScript ---

  it("getScript returns data for known script", async () => {
    const result = await getScript(knownScriptHash);
    expect(result).not.toBe(false);
    if (result) {
      expect(result).toHaveProperty("type");
    }
  }, 15000);

  it("getScript returns false for non-existent script", async () => {
    const fakeHash = "00000000000000000000000000000000000000000000000000000000"; // 28 bytes
    const result = await getScript(fakeHash);
    expect(result).toBe(false);
  }, 15000);

  // --- fetchPoolTicker / fetchPoolMetadata ---

  it("fetchPoolTicker returns ATADA for known pool", async () => {
    const result = await fetchPoolTicker(knownPoolId);
    expect(result).toBe("ATADA");
  }, 15000);

  it("fetchPoolMetadata returns full metadata for known pool", async () => {
    const result = await fetchPoolMetadata(knownPoolId);
    expect(result).not.toBeNull();
    expect(result!.pool_id).toBeTruthy();
    expect(result!.ticker).toBe("ATADA");
    expect(result!.name).toBeTruthy();
    expect(result!.homepage).toBeTruthy();
  }, 15000);

  // --- fetchCalidusKey ---

  it("fetchCalidusKey returns data or null for known pool", async () => {
    const result = await fetchCalidusKey(knownPoolId);
    if (result !== null) {
      expect(result).toHaveProperty("calidus_pub_key");
      expect(result).toHaveProperty("pool_id_bech32");
    }
  }, 15000);

  // --- validateDrep / fetchDrepName ---

  it("validateDrep returns true for known registered DRep", async () => {
    const result = await validateDrep(knownDrepId);
    expect(result).toBe(true);
  }, 15000);

  it("validateDrep returns false for non-existent DRep", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await validateDrep("drep1yyyyyy");
    expect(result).toBe(false);
    spy.mockRestore();
  }, 15000);

  it("fetchDrepName returns YUTA for known DRep", async () => {
    const result = await fetchDrepName(knownDrepId);
    expect(result).toBe("YUTA");
  }, 15000);

  it("validateDrep returns true for known script-based DRep", async () => {
    const result = await validateDrep(knownScriptDrepId);
    expect(result).toBe(true);
  }, 15000);

  it("fetchDrepName returns Cardano Foundation for script-based DRep", async () => {
    const result = await fetchDrepName(knownScriptDrepId);
    expect(result).toBe("Cardano Foundation");
  }, 15000);

  // --- fetchHandle ---

  it("fetchHandle returns 426 for known stake address", async () => {
    const result = await fetchHandle(knownStakeAddr);
    expect(result).toBe("426");
  }, 15000);

  it("fetchHandle returns null for unknown address", async () => {
    const result = await fetchHandle(
      "stake1ux000000000000000000000000000000000000000000000000000000",
    );
    expect(result).toBeNull();
  }, 15000);

  // --- fetchName ---

  it("fetchName resolves pool to ATADA", async () => {
    const result = await fetchName(knownPoolId);
    expect(result).toBe("ATADA");
  }, 15000);

  it("fetchName resolves DRep to YUTA", async () => {
    const result = await fetchName(knownDrepId);
    expect(result).toBe("YUTA");
  }, 15000);

  it("fetchName resolves script-based DRep to Cardano Foundation", async () => {
    const result = await fetchName(knownScriptDrepId);
    expect(result).toBe("Cardano Foundation");
  }, 15000);

  it("fetchName resolves stake address to 426", async () => {
    const result = await fetchName(knownStakeAddr);
    expect(result).toBe("426");
  }, 15000);

  // --- fetchIdentity ---

  it("fetchIdentity returns pool identity with metadata", async () => {
    const result = await fetchIdentity(knownPoolId);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("pool");
    expect(result!.displayName).toBe("ATADA");
    expect(result!.fullName).toBeTruthy();
    expect(result!.homepage).toBeTruthy();
  }, 15000);

  it("fetchIdentity returns DRep identity", async () => {
    const result = await fetchIdentity(knownDrepId);
    expect(result).toEqual({ displayName: "YUTA", type: "drep" });
  }, 15000);

  it("fetchIdentity returns script-based DRep identity", async () => {
    const result = await fetchIdentity(knownScriptDrepId);
    expect(result).toEqual({ displayName: "Cardano Foundation", type: "drep" });
  }, 15000);

  it("fetchIdentity returns handle identity", async () => {
    const result = await fetchIdentity(knownStakeAddr);
    expect(result).toEqual({ displayName: "426", type: "handle" });
  }, 15000);
});

/**
 * Failover tests — Blockfrost-only (Koios credentials removed).
 * Skipped if Blockfrost is not configured.
 */
describe.skipIf(
  process.env.LIVE_TEST !== "true" ||
    !process.env.BLOCKFROST_URL ||
    !process.env.BLOCKFROST_PROJECT_ID,
)("cardanoApi — live failover (Blockfrost-only)", () => {
  let savedApiUrl: string | undefined;
  let savedApiToken: string | undefined;

  const knownPoolId = "pool1qqqqqdk4zhsjuxxd8jyvwncf5eucfskz0xjjj64fdmlgj735lr9";
  const knownDrepId = "drep1y2200we9c904un36tzaearntzzl63snffuul9qsk0te4utqfkke0w";
  const knownStakeAddr = "stake1uxekfkqgs4ye2wnf38e7x8uy006wvleq3etu8t35gqmdmnq5v4rks";
  const knownTxHash = "833ec1b2bbaf0dae7946136865679794eae2d54613a40773f965e5e40962e356";

  beforeAll(() => {
    savedApiUrl = process.env.API_URL;
    savedApiToken = process.env.API_TOKEN;
    delete process.env.API_URL;
    delete process.env.API_TOKEN;
    resetProviders();
  });

  afterAll(() => {
    if (savedApiUrl) process.env.API_URL = savedApiUrl;
    if (savedApiToken) process.env.API_TOKEN = savedApiToken;
    resetProviders();
  });

  it("fetchName resolves pool to ATADA", async () => {
    const result = await fetchName(knownPoolId);
    expect(result).toBe("ATADA");
  }, 15000);

  it("fetchName resolves DRep to YUTA", async () => {
    const result = await fetchName(knownDrepId);
    expect(result).toBe("YUTA");
  }, 15000);

  it("fetchName resolves stake address to 426", async () => {
    const result = await fetchName(knownStakeAddr);
    expect(result).toBe("426");
  }, 15000);

  it("fetchTxInfo returns data for known tx", async () => {
    const result = await fetchTxInfo(knownTxHash);
    expect(result).not.toBeNull();
    expect(result!.tx_hash).toBe(knownTxHash);
  }, 15000);

  it("fetchIdentity returns pool identity with metadata", async () => {
    const result = await fetchIdentity(knownPoolId);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("pool");
    expect(result!.displayName).toBe("ATADA");
  }, 15000);
});

/**
 * Failover tests — Koios is primary but unreachable, falls back to Blockfrost.
 * Skipped if either provider is not configured.
 */
describe.skipIf(
  process.env.LIVE_TEST !== "true" ||
    !process.env.API_URL ||
    !process.env.BLOCKFROST_URL,
)("cardanoApi — live failover (Koios unreachable, Blockfrost fallback)", () => {
  let savedApiUrl: string | undefined;

  const knownPoolId = "pool1qqqqqdk4zhsjuxxd8jyvwncf5eucfskz0xjjj64fdmlgj735lr9";
  const knownDrepId = "drep1y2200we9c904un36tzaearntzzl63snffuul9qsk0te4utqfkke0w";
  const knownStakeAddr = "stake1uxekfkqgs4ye2wnf38e7x8uy006wvleq3etu8t35gqmdmnq5v4rks";

  beforeAll(() => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    savedApiUrl = process.env.API_URL;
    process.env.API_URL = "https://localhost:1"; // unreachable
    resetProviders();
  });

  afterAll(() => {
    if (savedApiUrl) process.env.API_URL = savedApiUrl;
    resetProviders();
    vi.restoreAllMocks();
  });

  it("fetchName falls back to Blockfrost for pool", async () => {
    const result = await fetchName(knownPoolId);
    expect(result).toBe("ATADA");
  }, 15000);

  it("fetchName falls back to Blockfrost for DRep", async () => {
    const result = await fetchName(knownDrepId);
    expect(result).toBe("YUTA");
  }, 15000);

  it("fetchName falls back to Blockfrost for handle", async () => {
    const result = await fetchName(knownStakeAddr);
    expect(result).toBe("426");
  }, 15000);
});

/**
 * Failover tests — Blockfrost is primary but unreachable, falls back to Koios.
 * Skipped if either provider is not configured.
 */
describe.skipIf(
  process.env.LIVE_TEST !== "true" ||
    !process.env.API_URL ||
    !process.env.BLOCKFROST_URL,
)("cardanoApi — live failover (Blockfrost unreachable, Koios fallback)", () => {
  let savedBlockfrostUrl: string | undefined;
  let savedPrimaryProvider: string | undefined;

  const knownPoolId = "pool1qqqqqdk4zhsjuxxd8jyvwncf5eucfskz0xjjj64fdmlgj735lr9";
  const knownDrepId = "drep1y2200we9c904un36tzaearntzzl63snffuul9qsk0te4utqfkke0w";
  const knownStakeAddr = "stake1uxekfkqgs4ye2wnf38e7x8uy006wvleq3etu8t35gqmdmnq5v4rks";

  beforeAll(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    savedBlockfrostUrl = process.env.BLOCKFROST_URL;
    savedPrimaryProvider = process.env.PRIMARY_PROVIDER;
    process.env.BLOCKFROST_URL = "https://localhost:1"; // unreachable
    process.env.PRIMARY_PROVIDER = "blockfrost";
    resetProviders();
  });

  afterAll(() => {
    if (savedBlockfrostUrl) process.env.BLOCKFROST_URL = savedBlockfrostUrl;
    if (savedPrimaryProvider) process.env.PRIMARY_PROVIDER = savedPrimaryProvider;
    else delete process.env.PRIMARY_PROVIDER;
    resetProviders();
    vi.restoreAllMocks();
  });

  it("fetchName falls back to Koios for pool", async () => {
    const result = await fetchName(knownPoolId);
    expect(result).toBe("ATADA");
  }, 15000);

  it("fetchName falls back to Koios for DRep", async () => {
    const result = await fetchName(knownDrepId);
    expect(result).toBe("YUTA");
  }, 15000);

  it("fetchName falls back to Koios for handle", async () => {
    const result = await fetchName(knownStakeAddr);
    expect(result).toBe("426");
  }, 15000);
});
