import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  verifySignature,
  isPartyToScript,
  getScriptCriteria,
  validateScriptSignatures,
} from "./verifySignature.js";

import {
  generic_payload,
  mainnet_stake_address,
  testnet_stake_address,
  mainnet_cip129_drep_id,
  mainnet_cip105_drep_id,
  mainnet_pool_id,
  basic_signing_stake_key,
  cip8_signing_stake_key,
  cip30_signing_stake_key,
  browser_payload,
  browser_basic_signing_stake_key,
  browser_stake_address,
  basic_signing_drep_key,
  cip8_signing_drep_key,
  basic_signing_pool_key,
  cip8_signing_pool_key,
} from "../__fixtures__/signatures.js";

import { ms, std_signatures, cose_signatures } from "../__fixtures__/scripts.js";

vi.mock("../cardano/cardanoApi.js", () => ({
  getScript: vi.fn(),
  fetchCalidusKey: vi.fn(),
}));

const { getScript, fetchCalidusKey } = (await import("../cardano/cardanoApi.js")) as {
  getScript: ReturnType<typeof vi.fn>;
  fetchCalidusKey: ReturnType<typeof vi.fn>;
};

describe("verifySignature", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
    getScript.mockReset();
    fetchCalidusKey.mockReset();
  });

  describe("input validation", () => {
    it("returns error for missing payload", async () => {
      expect(await verifySignature("", mainnet_stake_address, basic_signing_stake_key)).toEqual({
        error: "Payload is missing",
      });
    });

    it("returns error for missing address", async () => {
      expect(await verifySignature(generic_payload, "", basic_signing_stake_key)).toEqual({
        error: "Signer address is not provided",
      });
    });

    it("returns error for missing signature", async () => {
      expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await verifySignature(generic_payload, mainnet_stake_address, undefined as any),
      ).toEqual({
        error: "Signature is not a valid JSON object",
      });
    });

    it("returns error when signature is null", async () => {
      expect(
        await verifySignature(generic_payload, mainnet_stake_address, null as unknown as string),
      ).toEqual({
        error: "Signature is not a valid JSON object",
      });
    });
  });

  describe("stake key signatures", () => {
    it("validates basic Ed25519 mainnet stake key", async () => {
      expect(
        await verifySignature(generic_payload, mainnet_stake_address, basic_signing_stake_key),
      ).toBe(true);
    });

    it("validates basic Ed25519 testnet stake key", async () => {
      expect(
        await verifySignature(generic_payload, testnet_stake_address, basic_signing_stake_key),
      ).toBe(true);
    });

    it("validates CIP-8 COSE stake key", async () => {
      expect(
        await verifySignature(generic_payload, mainnet_stake_address, cip8_signing_stake_key),
      ).toBe(true);
    });

    it("validates CIP-30 COSE stake key", async () => {
      expect(
        await verifySignature(generic_payload, mainnet_stake_address, cip30_signing_stake_key),
      ).toBe(true);
    });

    it("validates browser COSE signature", async () => {
      expect(
        await verifySignature(
          browser_payload,
          browser_stake_address,
          browser_basic_signing_stake_key,
        ),
      ).toBe(true);
    });

    it("returns error for key mismatch", async () => {
      expect(
        await verifySignature(generic_payload, mainnet_cip129_drep_id, basic_signing_stake_key),
      ).toEqual({
        error: "The key used for signing does not match the address provided!",
      });
    });
  });

  describe("DRep signatures", () => {
    it("validates basic DRep with CIP-105 ID", async () => {
      expect(
        await verifySignature(generic_payload, mainnet_cip105_drep_id, basic_signing_drep_key),
      ).toBe(true);
    });

    it("validates basic DRep with CIP-129 ID", async () => {
      expect(
        await verifySignature(generic_payload, mainnet_cip129_drep_id, basic_signing_drep_key),
      ).toBe(true);
    });

    it("validates CIP-8 DRep with CIP-105 ID", async () => {
      expect(
        await verifySignature(generic_payload, mainnet_cip105_drep_id, cip8_signing_drep_key),
      ).toBe(true);
    });

    it("validates CIP-8 DRep with CIP-129 ID", async () => {
      expect(
        await verifySignature(generic_payload, mainnet_cip129_drep_id, cip8_signing_drep_key),
      ).toBe(true);
    });
  });

  describe("pool signatures", () => {
    it("validates basic pool signature (no calidus key)", async () => {
      fetchCalidusKey.mockResolvedValueOnce(null);
      expect(await verifySignature(generic_payload, mainnet_pool_id, basic_signing_pool_key)).toBe(
        true,
      );
    });

    it("validates CIP-8 pool signature (no calidus key)", async () => {
      fetchCalidusKey.mockResolvedValueOnce(null);
      expect(await verifySignature(generic_payload, mainnet_pool_id, cip8_signing_pool_key)).toBe(
        true,
      );
    });
  });
});

describe("getScriptCriteria", () => {
  it("extracts criteria from all-of with 1 signer + timelock", () => {
    const criteria = getScriptCriteria(ms.one.script.value as never);
    expect(criteria.keys).toHaveLength(1);
    expect(criteria.keys[0]).toBe("40f07fe0321a211d8fddd174371586f18442ab5efe529b6252f53a83");
    expect(criteria.required).toBe(1);
    expect(criteria.count).toBe(1);
  });

  it("extracts criteria from all-of with 2 signers", () => {
    const criteria = getScriptCriteria(ms.two.script.value as never);
    expect(criteria.keys).toHaveLength(2);
    expect(criteria.required).toBe(2);
  });

  it("extracts criteria from any-of with 3 signers", () => {
    const criteria = getScriptCriteria(ms.seven.script.value as never);
    expect(criteria.keys).toHaveLength(3);
    expect(criteria.required).toBe(1);
  });

  it("extracts criteria from atLeast with required=2", () => {
    const criteria = getScriptCriteria(ms.five.script.value as never);
    expect(criteria.keys).toHaveLength(3);
    expect(criteria.required).toBe(2);
  });

  it("extracts criteria from atLeast with required=1", () => {
    const criteria = getScriptCriteria(ms.four.script.value as never);
    expect(criteria.keys).toHaveLength(3);
    expect(criteria.required).toBe(1);
  });

  it("extracts criteria from atLeast with required=3 (all)", () => {
    const criteria = getScriptCriteria(ms.six.script.value as never);
    expect(criteria.keys).toHaveLength(3);
    expect(criteria.required).toBe(3);
  });

  it("ignores timelock clauses", () => {
    const criteria = getScriptCriteria(ms.one.script.value as never);
    // Should only have 1 key, not include the "after" clause
    expect(criteria.keys).toHaveLength(1);
  });

  it("handles any-of with 2 signers", () => {
    const criteria = getScriptCriteria(ms.eight.script.value as never);
    expect(criteria.keys).toHaveLength(2);
    expect(criteria.required).toBe(1);
  });
});

describe("isPartyToScript", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    getScript.mockReset();
  });

  it("returns error for non-script address", async () => {
    const result = await isPartyToScript(
      generic_payload,
      "stake1uyvx67glm2hdjcfp9pg0d59x0595n372k8sh437vk3hda0gmuz8dq",
      std_signatures.one,
    );
    expect(result).toEqual({ error: "Address is not script-based" });
  });

  it("returns error when script not found", async () => {
    getScript.mockResolvedValueOnce(false);
    const result = await isPartyToScript(generic_payload, ms.one.cip105, std_signatures.one);
    expect(result).toEqual({ error: "Script not found" });
  });

  it("validates signer is party to script (CIP-105)", async () => {
    const result = await isPartyToScript(
      generic_payload,
      ms.one.cip105,
      std_signatures.one,
      ms.one.script as never,
    );
    expect(result).toBe(true);
  });

  it("validates signer is party to script (CIP-129)", async () => {
    const result = await isPartyToScript(
      generic_payload,
      ms.one.cip129,
      std_signatures.one,
      ms.one.script as never,
    );
    expect(result).toBe(true);
  });

  it("validates COSE signer is party to script", async () => {
    const result = await isPartyToScript(
      generic_payload,
      ms.one.cip105,
      cose_signatures.one,
      ms.one.script as never,
    );
    expect(result).toBe(true);
  });

  it("returns error when key not in script", async () => {
    const result = await isPartyToScript(
      generic_payload,
      ms.one.cip129,
      std_signatures.two,
      ms.one.script as never,
    );
    expect(result).toEqual({ error: "The signature is not part of the script" });
  });

  it("skips getScript call when script_body is provided", async () => {
    await isPartyToScript(
      generic_payload,
      ms.one.cip105,
      std_signatures.one,
      ms.one.script as never,
    );
    expect(getScript).not.toHaveBeenCalled();
  });

  it("calls getScript when script_body is not provided", async () => {
    getScript.mockResolvedValueOnce(ms.one.script);
    await isPartyToScript(generic_payload, ms.one.cip105, std_signatures.one);
    expect(getScript).toHaveBeenCalled();
  });
});

describe("validateScriptSignatures", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    getScript.mockReset();
  });

  describe("input validation", () => {
    it("rejects missing payload", async () => {
      expect(await validateScriptSignatures("", ms.one.cip105, [std_signatures.one])).toEqual({
        error: "Payload is missing",
      });
    });

    it("rejects missing address", async () => {
      expect(await validateScriptSignatures(generic_payload, "", [std_signatures.one])).toEqual({
        error: "Signer address is not provided",
      });
    });

    it("rejects non-array signatures", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.one.cip105,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          std_signatures.one as any,
        ),
      ).toEqual({
        error: "Signatures must be an array",
      });
    });
  });

  describe("scenario 1: time-locked single signer", () => {
    it("validates with correct signer", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.one.cip105,
          [std_signatures.one],
          ms.one.script as never,
        ),
      ).toBe(true);
    });

    it("rejects with wrong signer", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.one.cip129,
          [std_signatures.three],
          ms.one.script as never,
        ),
      ).toBe(false);
    });

    it("rejects with wrong COSE signer", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.one.cip105,
          [cose_signatures.two],
          ms.one.script as never,
        ),
      ).toBe(false);
    });
  });

  describe("scenario 2: all of two signers", () => {
    it("validates with both signers (CIP-105)", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.two.cip105,
          [std_signatures.one, std_signatures.two],
          ms.two.script as never,
        ),
      ).toBe(true);
    });

    it("rejects with only one signer", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.two.cip105,
          [cose_signatures.one],
          ms.two.script as never,
        ),
      ).toBe(false);
    });

    it("rejects when one signer is wrong", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.two.cip105,
          [std_signatures.one, std_signatures.three],
          ms.two.script as never,
        ),
      ).toBe(false);
    });

    it("validates with mixed signature types", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.two.cip105,
          [std_signatures.one, cose_signatures.two],
          ms.two.script as never,
        ),
      ).toBe(true);
    });

    it("validates with all COSE signatures", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.two.cip105,
          [cose_signatures.one, cose_signatures.two],
          ms.two.script as never,
        ),
      ).toBe(true);
    });

    it("validates with CIP-129 address", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.two.cip129,
          [std_signatures.one, std_signatures.two],
          ms.two.script as never,
        ),
      ).toBe(true);
    });
  });

  describe("scenario 3: all of one signer", () => {
    it("validates with correct signer", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.three.cip129,
          [std_signatures.one],
          ms.three.script as never,
        ),
      ).toBe(true);
    });

    it("validates with COSE signer", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.three.cip129,
          [cose_signatures.one],
          ms.three.script as never,
        ),
      ).toBe(true);
    });

    it("rejects with wrong signer", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.three.cip129,
          [std_signatures.two],
          ms.three.script as never,
        ),
      ).toBe(false);
    });
  });

  describe("scenario 4: atLeast 1 of 3", () => {
    it("validates with signer #1 alone", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.four.cip129,
          [std_signatures.one],
          ms.four.script as never,
        ),
      ).toBe(true);
    });

    it("validates with mixed signer #1 and COSE #2", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.four.cip105,
          [std_signatures.one, cose_signatures.two],
          ms.four.script as never,
        ),
      ).toBe(true);
    });

    it("validates with all signers", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.four.cip129,
          [std_signatures.one, cose_signatures.two, cose_signatures.three],
          ms.four.script as never,
        ),
      ).toBe(true);
    });
  });

  describe("scenario 5: atLeast 2 of 3", () => {
    it("rejects with only 1 signer", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.five.cip129,
          [std_signatures.one],
          ms.five.script as never,
        ),
      ).toBe(false);
    });

    it("validates with 2 signers", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.five.cip105,
          [cose_signatures.two, std_signatures.three],
          ms.five.script as never,
        ),
      ).toBe(true);
    });

    it("validates with all 3 signers", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.four.cip129,
          [std_signatures.one, cose_signatures.two, cose_signatures.three],
          ms.four.script as never,
        ),
      ).toBe(true);
    });
  });

  describe("scenario 6: atLeast 3 of 3 (all must sign)", () => {
    it("rejects with 1 signer", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.six.cip129,
          [std_signatures.one],
          ms.six.script as never,
        ),
      ).toBe(false);
    });

    it("rejects with 2 signers", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.six.cip105,
          [cose_signatures.two, std_signatures.three],
          ms.six.script as never,
        ),
      ).toBe(false);
    });

    it("validates with all 3 signers", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.four.cip129,
          [std_signatures.one, cose_signatures.two, cose_signatures.three],
          ms.four.script as never,
        ),
      ).toBe(true);
    });
  });

  describe("scenario 7: any of 3 signers", () => {
    it("validates with signer #1 alone", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.seven.cip129,
          [std_signatures.one],
          ms.seven.script as never,
        ),
      ).toBe(true);
    });

    it("validates with 2 signers", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.seven.cip105,
          [std_signatures.one, cose_signatures.two],
          ms.seven.script as never,
        ),
      ).toBe(true);
    });

    it("validates with all 3 signers", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.seven.cip129,
          [std_signatures.one, cose_signatures.two, cose_signatures.three],
          ms.seven.script as never,
        ),
      ).toBe(true);
    });
  });

  describe("scenario 8: any of 2 signers", () => {
    it("validates with signer #1 alone", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.eight.cip129,
          [std_signatures.one],
          ms.eight.script as never,
        ),
      ).toBe(true);
    });

    it("validates with 2 signers", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.eight.cip105,
          [std_signatures.one, cose_signatures.two],
          ms.eight.script as never,
        ),
      ).toBe(true);
    });

    it("rejects signer #3 (not in script)", async () => {
      const result = await isPartyToScript(
        generic_payload,
        ms.eight.cip105,
        std_signatures.three,
        ms.eight.script as never,
      );
      expect(result).toEqual({ error: "The signature is not part of the script" });
    });
  });

  describe("scenario 9: mesh single key", () => {
    it("mesh key can authenticate script", async () => {
      expect(
        await isPartyToScript(
          generic_payload,
          ms.mesh.cip129,
          std_signatures.mesh,
          ms.mesh.script as never,
        ),
      ).toBe(true);
    });

    it("mesh key can validate script", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.mesh.cip105,
          [std_signatures.mesh],
          ms.mesh.script as never,
        ),
      ).toBe(true);
    });

    it("mesh key can authenticate mesh2 script", async () => {
      expect(
        await isPartyToScript(
          generic_payload,
          ms.mesh2.cip129,
          std_signatures.mesh,
          ms.mesh2.script as never,
        ),
      ).toBe(true);
    });

    it("mesh key can validate mesh2 script", async () => {
      expect(
        await validateScriptSignatures(
          generic_payload,
          ms.mesh2.cip105,
          [std_signatures.mesh],
          ms.mesh2.script as never,
        ),
      ).toBe(true);
    });
  });
});
