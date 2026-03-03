import { describe, expect, it } from "vitest";

import { validateAddress, pubKeyToBech32, getAddressType, extractParts } from "./address.js";

const mainnet_enterprise_key_addr = "addr1v99r3mwucuhwqyj3vg7gdlyam2xurku0xj6f9qgamh5vefc4jytpq";
const testnet_enterprise_key_addr =
  "addr_test1vp9r3mwucuhwqyj3vg7gdlyam2xurku0xj6f9qgamh5vefcw6shw9";

const mainnet_enterprise_script_addr = "addr1wy0adahffetszp9fg84qj8lek7vpvr5chga2ljtumu6fx0qtdy49p";

const mainnet_key_key_addr =
  "addr1q99r3mwucuhwqyj3vg7gdlyam2xurku0xj6f9qgamh5vefccd4u3lk4wm9sjz2zs7mg2vlgtf8ru4v0p0truedrwm67ske0y8z";
const testnet_key_key_addr =
  "addr_test1qp9r3mwucuhwqyj3vg7gdlyam2xurku0xj6f9qgamh5vefccd4u3lk4wm9sjz2zs7mg2vlgtf8ru4v0p0truedrwm67s40jyta";

const mainnet_script_key_addr =
  "addr1zy0adahffetszp9fg84qj8lek7vpvr5chga2ljtumu6fx0qcd4u3lk4wm9sjz2zs7mg2vlgtf8ru4v0p0truedrwm67su4awmc";

const mainnet_key_script_addr =
  "addr1y99r3mwucuhwqyj3vg7gdlyam2xurku0xj6f9qgamh5vefcl6mmwjnjhqyz2js02py0lnduczc8f3w364lyhehe5jv7qr3uuaz";

const mainnet_script_script_addr =
  "addr1xy0adahffetszp9fg84qj8lek7vpvr5chga2ljtumu6fx0ql6mmwjnjhqyz2js02py0lnduczc8f3w364lyhehe5jv7qfawkpc";

const mainnet_stake_key_addr = "stake1uxmeqz9eud42zt80ya9qh3pg99mrl88lmpxf3wc407yjjcsrtmywc";
const mainnet_stake_script_addr = "stake17y0adahffetszp9fg84qj8lek7vpvr5chga2ljtumu6fx0qh8ynen";
const testnet_stake_key_addr = "stake_test1urzjpwq78l3pgung9r4zgh53t3t4smkvgll5v0tnhu9dkvc2cc58h";
const testnet_stake_script_addr =
  "stake_test17q0adahffetszp9fg84qj8lek7vpvr5chga2ljtumu6fx0qsdw3aw";

describe("validateAddress — general tests", () => {
  it("rejects missing address", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(validateAddress(undefined as any)).toEqual({
      error: "Signer address missing",
    });
  });

  it("rejects undefined signer type", () => {
    expect(validateAddress(mainnet_stake_key_addr)).toEqual({
      error: "Invalid signer type",
    });
  });
});

describe("validateAddress — payment addresses", () => {
  it("validates mainnet enterprise key address", () => {
    expect(validateAddress(mainnet_enterprise_key_addr, "addr")).toEqual(
      mainnet_enterprise_key_addr,
    );
  });

  it("validates testnet enterprise key address", () => {
    expect(validateAddress(testnet_enterprise_key_addr, "addr")).toEqual(
      testnet_enterprise_key_addr,
    );
  });

  it("validates mainnet enterprise script address", () => {
    expect(validateAddress(mainnet_enterprise_script_addr, "addr")).toEqual(
      mainnet_enterprise_script_addr,
    );
  });

  it("validates mainnet key+key address", () => {
    expect(validateAddress(mainnet_key_key_addr, "addr")).toEqual(mainnet_key_key_addr);
  });

  it("validates testnet key+key address", () => {
    expect(validateAddress(testnet_key_key_addr, "addr")).toEqual(testnet_key_key_addr);
  });

  it("validates mainnet script+key address", () => {
    expect(validateAddress(mainnet_script_key_addr, "addr")).toEqual(mainnet_script_key_addr);
  });

  it("validates mainnet key+script address", () => {
    expect(validateAddress(mainnet_key_script_addr, "addr")).toEqual(mainnet_key_script_addr);
  });

  it("validates mainnet script+script address", () => {
    expect(validateAddress(mainnet_script_script_addr, "addr")).toEqual(mainnet_script_script_addr);
  });
});

describe("validateAddress — stake addresses", () => {
  it("rejects invalid testnet stake address", () => {
    const stake_address = "stake_test1uxmeqz9eud42zt80ya9qh3pg99mrl88lmpxf3wc407yjjcsrtmywc";
    expect(validateAddress(stake_address, "stake")).toEqual({
      error: "Invalid address format",
    });
  });

  it("validates mainnet stake key address", () => {
    expect(validateAddress(mainnet_stake_key_addr, "stake")).toBe(mainnet_stake_key_addr);
  });

  it("validates mainnet stake script address", () => {
    expect(validateAddress(mainnet_stake_script_addr, "stake")).toBe(mainnet_stake_script_addr);
  });

  it("validates testnet stake address", () => {
    expect(validateAddress(testnet_stake_key_addr, "stake")).toBe(testnet_stake_key_addr);
  });

  it("validates testnet stake script address", () => {
    expect(validateAddress(testnet_stake_script_addr, "stake")).toBe(testnet_stake_script_addr);
  });

  it("converts testnet stake address from hex", () => {
    const hex = "e0cbeb1cca6db2d34312fc1e257f3c346a4e0a2fbcd1046a64f9250f25";
    const expected = "stake_test1ur97k8x2dkedxscjls0z2leux34yuz30hngsg6nylyjs7fgkxjnv2";
    expect(validateAddress(hex, "stake")).toBe(expected);
  });

  it("converts mainnet stake address from hex", () => {
    const hex = "e1cbeb1cca6db2d34312fc1e257f3c346a4e0a2fbcd1046a64f9250f25";
    const expected = "stake1u897k8x2dkedxscjls0z2leux34yuz30hngsg6nylyjs7fg3vc3gh";
    expect(validateAddress(hex, "stake")).toBe(expected);
  });

  it("converts testnet payment address from hex", () => {
    const hex =
      "004a38eddcc72ee01251623c86fc9dda8dc1db8f34b492811ddde8cca7186d791fdaaed961212850f6d0a67d0b49c7cab1e17ac7ccb46edebd";
    expect(validateAddress(hex, "addr")).toBe(
      "addr_test1qp9r3mwucuhwqyj3vg7gdlyam2xurku0xj6f9qgamh5vefccd4u3lk4wm9sjz2zs7mg2vlgtf8ru4v0p0truedrwm67s40jyta",
    );
  });
});

describe("validateAddress — calidus keys", () => {
  it("validates a calidus key", () => {
    const calidus_id = "calidus15yt3nqapz799tvp2lt8adttt29k6xa2xnltahn655tu4sgcph42p7";
    const result = validateAddress(calidus_id, "calidus");
    expect(result).toHaveProperty("signerAddress", calidus_id);
  });

  it("calidus matches public key round-trip", () => {
    const calidus_id = "calidus158zw04z6dqguue6ztvszsyvsakqs0kjapp3y2eqtfygt5kgh3tlp8";
    const public_key = "631787cab4c0fe264488668485141d5e73fc24f32200097a8aadd1fb0c4ac756";
    const result = validateAddress(calidus_id, "calidus");
    const reverse = pubKeyToBech32(public_key, "calidus");
    expect((result as { signerAddress: string }).signerAddress).toBe(reverse);
  });
});

describe("validateAddress — DRep IDs", () => {
  it("validates CIP-129 key DRep", () => {
    const drep_id = "drep1ytwmwvtd0a8lr45ssner2tjxzv5y8q03w3606yeald9mdmgmwecja";
    expect(validateAddress(drep_id, "drep")).toEqual({
      cip105: "drep1mkmnzmtlflcadyyy7g6ju3sn9ppcrut5wn73x00mfwmw642g5qy",
      cip129: "drep1ytwmwvtd0a8lr45ssner2tjxzv5y8q03w3606yeald9mdmgmwecja",
      isScript: false,
    });
  });

  it("validates CIP-105 key DRep", () => {
    const drep_id = "drep1mkmnzmtlflcadyyy7g6ju3sn9ppcrut5wn73x00mfwmw642g5qy";
    expect(validateAddress(drep_id, "drep")).toEqual({
      cip105: "drep1mkmnzmtlflcadyyy7g6ju3sn9ppcrut5wn73x00mfwmw642g5qy",
      cip129: "drep1ytwmwvtd0a8lr45ssner2tjxzv5y8q03w3606yeald9mdmgmwecja",
      isScript: false,
    });
  });

  it("validates CIP-129 script DRep", () => {
    const drep_id = "drep1yvve4554njxyun2s5p9q70v88d5jl7r0h34pjhw5f5tmw3sjtrutp";
    expect(validateAddress(drep_id, "drep")).toEqual({
      cip105: "drep_script1rxdd99vu338y659qfg8nmpemdyhlsmaudgv4m4zdz7m5vz8uzt6",
      cip129: "drep1yvve4554njxyun2s5p9q70v88d5jl7r0h34pjhw5f5tmw3sjtrutp",
      isScript: true,
    });
  });

  it("validates DRep PubKey", () => {
    const drep_pub_key = "7e0bdd1327bab4be5e209a588e6279cabf29d6174683c14986afb3858793c811";
    expect(validateAddress(drep_pub_key, "drep")).toEqual({
      cip105: "drep17vzth56sg9pyzsan7ljf3n2nf82zf6nm3z4tf6smtffpsr7tu9d",
      cip129: "drep1ytesfw7n2pq5ys2rk0m7fxxd2dyagf820wy24d82rdd9yxqfm4qjg",
      isScript: false,
    });
  });

  it("rejects invalid DRep PubKey", () => {
    const drep_pub_key = "7e0bdd1327bab4be5e209a588e6279cabf29d6174683c14986afb3858793c8";
    expect(validateAddress(drep_pub_key, "drep")).toEqual({
      error: "Invalid address format",
    });
  });

  it("validates CIP-105 script DRep", () => {
    const drep_id = "drep_script1rxdd99vu338y659qfg8nmpemdyhlsmaudgv4m4zdz7m5vz8uzt6";
    expect(validateAddress(drep_id, "drep")).toEqual({
      cip105: "drep_script1rxdd99vu338y659qfg8nmpemdyhlsmaudgv4m4zdz7m5vz8uzt6",
      cip129: "drep1yvve4554njxyun2s5p9q70v88d5jl7r0h34pjhw5f5tmw3sjtrutp",
      isScript: true,
    });
  });
});

describe("pubKeyToBech32", () => {
  it("converts hex to DRep ID", () => {
    const drep_hex = "7e0bdd1327bab4be5e209a588e6279cabf29d6174683c14986afb3858793c811";
    expect(pubKeyToBech32(drep_hex, "drep")).toEqual({
      cip105: "drep17vzth56sg9pyzsan7ljf3n2nf82zf6nm3z4tf6smtffpsr7tu9d",
      cip129: "drep1ytesfw7n2pq5ys2rk0m7fxxd2dyagf820wy24d82rdd9yxqfm4qjg",
      isScript: false,
    });
  });

  it("throws for invalid hex DRep", () => {
    const drep_hex = "7e0bdd1327bab4be5e209a588e6279cabf29d6174683c14986afb3858793c8";
    expect(() => pubKeyToBech32(drep_hex, "drep")).toThrow();
  });
});

describe("getAddressType", () => {
  it("identifies stake key address", () => {
    const result = getAddressType(mainnet_stake_key_addr);
    expect(result).toEqual({ type: "stake", keyHash: expect.any(String), hashType: "key" });
  });

  it("identifies stake script address", () => {
    const result = getAddressType(mainnet_stake_script_addr);
    expect(result).toEqual({ type: "stake", keyHash: expect.any(String), hashType: "script" });
  });

  it("identifies drep key address", () => {
    const drep_id = "drep1ytwmwvtd0a8lr45ssner2tjxzv5y8q03w3606yeald9mdmgmwecja";
    const result = getAddressType(drep_id);
    expect(result).toEqual({ type: "drep", keyHash: expect.any(String), hashType: "key" });
  });

  it("identifies drep script address", () => {
    const drep_id = "drep_script1rxdd99vu338y659qfg8nmpemdyhlsmaudgv4m4zdz7m5vz8uzt6";
    const result = getAddressType(drep_id);
    expect(result).toEqual({ type: "drep", keyHash: expect.any(String), hashType: "script" });
  });

  it("identifies pool address", () => {
    const pool_id = "pool1v4a76mt3fqhg64qja6r2rk8d65g0h7a3qjd9ykay3wqvy2h9cff";
    const result = getAddressType(pool_id);
    expect(result).toEqual({ type: "pool", keyHash: expect.any(String), hashType: "key" });
  });

  it("returns error for invalid input", () => {
    const result = getAddressType("not_a_bech32_address");
    expect(result).toEqual({ error: "Not a valid bech32 address" });
  });
});

describe("extractParts", () => {
  it("splits hex into header and body", () => {
    const [header, body] = extractParts("e1cbeb1cca6db2d343");
    expect(header).toBe("e1");
    expect(body).toBe("cbeb1cca6db2d343");
  });

  it("handles empty string", () => {
    const [header, body] = extractParts("");
    expect(header).toBe("");
    expect(body).toBe("");
  });

  it("handles single character", () => {
    const [header, body] = extractParts("a");
    expect(header).toBe("a");
    expect(body).toBe("");
  });
});
