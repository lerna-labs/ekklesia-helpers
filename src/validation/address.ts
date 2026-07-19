/**
 * Cardano address validation and conversion utilities.
 *
 * Supports addr, stake, drep, pool, and calidus address types with
 * bech32 encoding/decoding, CIP-105/CIP-129 DRep format handling,
 * and hex-to-bech32 conversions.
 *
 * @module validation/address
 */

import {
  PublicKey,
  Ed25519KeyHash,
  ScriptHash,
  Address,
  Credential,
} from '@emurgo/cardano-serialization-lib-nodejs';
import { bech32 } from 'bech32';

/** Error result returned when validation fails. */
export interface AddressError {
  error: string;
}

/** Result returned when validating a DRep address. */
export interface DrepAddressResult {
  /** CIP-105 bech32 encoding of the DRep ID. */
  cip105: string;
  /** CIP-129 bech32 encoding of the DRep ID. */
  cip129: string;
  /** Whether this DRep is script-based. */
  isScript: boolean;
}

/** Result returned when validating a calidus address. */
export interface CalidusAddressResult {
  signerAddress: string;
  credential: string;
  isScript: boolean;
  type: 'calidus';
}

/** Possible return types from {@link validateAddress}. */
export type ValidateAddressResult =
  | string
  | DrepAddressResult
  | CalidusAddressResult
  | AddressError;

/** Result from {@link getAddressType}. */
export interface AddressTypeInfo {
  type: string;
  keyHash: string;
  hashType: string;
}

/**
 * Validate an authenticating address matches an accepted format.
 *
 * Supports `addr`, `stake`, `drep`, `pool`, and `calidus` sign types.
 * For non-bech32 inputs (hex keys), attempts conversion via {@link pubKeyToBech32}.
 *
 * @param signerAddress - The address string to validate.
 * @param signType - The expected signer type prefix (`"addr"`, `"stake"`, `"drep"`, `"pool"`, `"calidus"`).
 * @returns The validated address string, a structured result object, or an error.
 *
 * @example
 * ```ts
 * const result = validateAddress("addr1qxy...", "addr");
 * if (typeof result === "string") {
 *   console.log("Valid address:", result);
 * }
 * ```
 */
export function validateAddress(signerAddress: string, signType?: string): ValidateAddressResult {
  if (!signerAddress) {
    return { error: 'Signer address missing' };
  }

  let prefix: string, words: number[], words_hex: string;

  try {
    const decoded = bech32.decode(signerAddress, 256);
    prefix = decoded.prefix;
    words = decoded.words;
    words_hex = Buffer.from(bech32.fromWords(words)).toString('hex');
  } catch (_error) {
    switch (signType) {
      case 'drep':
      case 'stake':
      case 'addr':
        try {
          return pubKeyToBech32(signerAddress, signType);
        } catch (_e) {
          return { error: 'Invalid address format' };
        }
      default:
        return { error: 'Invalid address format' };
    }
  }

  if (!signType || !prefix.startsWith(signType)) {
    return { error: 'Invalid signer type' };
  }

  switch (signType) {
    case 'addr':
      try {
        const payment_address = Address.from_hex(words_hex);
        const payment_key_type = payment_address.payment_cred()!.kind();
        const [, body] = extractParts(payment_address.to_hex());
        const payment_hash = body.substring(0, 56);
        switch (payment_key_type) {
          case 0: {
            const key_hash = Ed25519KeyHash.from_hex(payment_hash);
            Credential.from_keyhash(key_hash);
            break;
          }
          case 1: {
            const script_hash = ScriptHash.from_hex(payment_hash);
            Credential.from_scripthash(script_hash);
            break;
          }
        }
      } catch (error) {
        console.error(error);
        return { error: 'Invalid address format' };
      }
      break;

    case 'stake':
      try {
        const stake_address = Address.from_hex(words_hex);
        stake_address.network_id();
        const key_type = stake_address.kind();
        const [body] = extractParts(stake_address.to_hex());
        switch (key_type) {
          case 0: {
            const key_hash = Ed25519KeyHash.from_hex(body);
            Credential.from_keyhash(key_hash);
            break;
          }
          case 1: {
            const script_hash = ScriptHash.from_hex(body);
            Credential.from_scripthash(script_hash);
            break;
          }
        }
      } catch (_error) {
        return { error: 'Invalid stake address' };
      }
      break;

    case 'drep': {
      const parts = getAddressType(signerAddress);
      if ('error' in parts) return parts;

      let cip129_prefix: string, cip105_prefix: string, isScript: boolean;
      switch (parts.hashType) {
        case 'script':
          cip129_prefix = '23';
          cip105_prefix = 'drep_script';
          isScript = true;
          break;
        case 'key':
          cip129_prefix = '22';
          cip105_prefix = 'drep';
          isScript = false;
          break;
        default:
          return { error: 'Invalid DRep hash type' };
      }

      return {
        cip105: bech32.encode(
          cip105_prefix,
          bech32.toWords(Buffer.from(parts.keyHash, 'hex')),
          256,
        ),
        cip129: bech32.encode(
          'drep',
          bech32.toWords(Buffer.from(cip129_prefix + parts.keyHash, 'hex')),
          256,
        ),
        isScript,
      };
    }

    case 'pool': {
      const key_hash = Ed25519KeyHash.from_hex(words_hex);
      Credential.from_keyhash(key_hash);
      break;
    }

    case 'calidus':
      try {
        const [header, body] = extractParts(words_hex);
        let isScript: boolean;
        switch (header) {
          case 'a1': {
            const key_hash = Ed25519KeyHash.from_hex(body);
            isScript = false;
            const credential = Credential.from_keyhash(key_hash);
            return {
              signerAddress,
              credential: credential.to_hex(),
              isScript,
              type: 'calidus',
            };
          }
          case 'a2': {
            const script_hash = ScriptHash.from_hex(body);
            isScript = true;
            const credential = Credential.from_scripthash(script_hash);
            return {
              signerAddress,
              credential: credential.to_hex(),
              isScript,
              type: 'calidus',
            };
          }
          default:
            return { error: 'Unknown Calidus prefix!' };
        }
      } catch (_error) {
        return { error: 'Invalid Calidus ID' };
      }

    default:
      return { error: 'Invalid signer type' };
  }

  return signerAddress;
}

/**
 * Extract the type, key hash, and hash type from a bech32-encoded Cardano address.
 *
 * @param bech32Address - A bech32-encoded Cardano address.
 * @returns The decoded address type info, or an error.
 *
 * @example
 * ```ts
 * const info = getAddressType("stake1u...");
 * if (!("error" in info)) {
 *   console.log(info.type);     // "stake"
 *   console.log(info.hashType); // "key"
 * }
 * ```
 */
export function getAddressType(bech32Address: string): AddressTypeInfo | AddressError {
  try {
    const { prefix, words } = bech32.decode(bech32Address, 256);
    const body_hex = Buffer.from(bech32.fromWords(words)).toString('hex');
    let type: string | undefined, keyHash: string, hashType: string | undefined, keyPrefix: string;

    if (body_hex.length > 56) {
      const [kp, keyBody] = extractParts(body_hex);
      keyPrefix = kp;
      keyHash = keyBody;
    } else {
      keyPrefix = '22';
      keyHash = body_hex;
    }

    switch (prefix) {
      case 'pool':
        hashType = 'key';
        type = 'pool';
        break;
      case 'calidus':
        switch (keyPrefix) {
          case 'a1':
            hashType = 'key';
            break;
          case 'a2':
            hashType = 'script';
            break;
        }
        type = 'calidus';
        break;
      case 'drep_script':
        hashType = 'script';
        keyPrefix = '23';
      // falls through
      case 'drep':
        switch (keyPrefix) {
          case '22':
            hashType = 'key';
            break;
          case '23':
            hashType = 'script';
            break;
        }
        type = 'drep';
        break;
      case 'stake':
      case 'stake_test':
        switch (keyPrefix) {
          case 'e0':
          case 'e1':
            hashType = 'key';
            break;
          case 'f0':
          case 'f1':
            hashType = 'script';
            break;
        }
        type = 'stake';
        break;
    }

    return {
      type: type!.trim(),
      keyHash: keyHash.trim(),
      hashType: hashType!.trim(),
    };
  } catch (_error) {
    return { error: 'Not a valid bech32 address' };
  }
}

/**
 * Convert a hex public key or address to bech32 format.
 *
 * Supports `drep`, `stake`, `addr`, and `calidus` prefixes.
 * For DRep keys, returns both CIP-105 and CIP-129 encodings.
 *
 * @param key - The hex-encoded key or address.
 * @param prefix - The target bech32 prefix.
 * @param script - Whether the key is a script hash (for calidus keys).
 * @returns A bech32 string, a DRep result with both encodings, or throws on invalid input.
 *
 * @example
 * ```ts
 * const bech32Addr = pubKeyToBech32("e1cbeb...", "stake");
 * // Returns "stake1u897k..."
 * ```
 */
export function pubKeyToBech32(
  key: string,
  prefix: string = 'drep',
  script: boolean = false,
): string | DrepAddressResult {
  let bech32id: string | false = false;
  let pubkey, keyhash, key_hex: string, credential;

  switch (prefix) {
    case 'addr': {
      const [addr_header, addr_body] = extractParts(key);
      const payment_key_hash = addr_body.substring(0, 56);
      const stake_key_hash = addr_body.substring(56);
      switch (addr_header) {
        case '00':
          prefix = 'addr_test';
          Ed25519KeyHash.from_hex(payment_key_hash);
          Ed25519KeyHash.from_hex(stake_key_hash);
          break;
        case '01':
          prefix = 'addr';
          Ed25519KeyHash.from_hex(payment_key_hash);
          Ed25519KeyHash.from_hex(stake_key_hash);
          break;
      }
      key_hex = key;
      break;
    }

    case 'drep': {
      let cip105: string, isScript: boolean;
      if (key.length === 64) {
        isScript = false;
        pubkey = PublicKey.from_hex(key);
        keyhash = pubkey.hash();
        cip105 = bech32.encode('drep', bech32.toWords(keyhash.to_bytes()), 256);
      } else {
        isScript = true;
        const scriptHash = ScriptHash.from_hex(key);
        keyhash = scriptHash;
        cip105 = bech32.encode('drep_script', bech32.toWords(keyhash.to_bytes()), 256);
      }
      const prefix_byte = isScript ? 23 : 22;
      key_hex = prefix_byte + keyhash.to_hex();
      const cip129 = bech32.encode('drep', bech32.toWords(Buffer.from(key_hex, 'hex')), 256);
      return { cip105, cip129, isScript };
    }

    case 'calidus': {
      let calidus_prefix: string;
      switch (script) {
        case true:
          calidus_prefix = 'a2';
          keyhash = ScriptHash.from_hex(key);
          break;
        case false:
          calidus_prefix = 'a1';
          pubkey = PublicKey.from_hex(key);
          keyhash = pubkey.hash();
          break;
      }
      credential = Credential.from_keyhash(keyhash!);
      void credential; // validate only
      key_hex = calidus_prefix! + keyhash!.to_hex();
      break;
    }

    case 'stake': {
      const [header, body] = extractParts(key);
      switch (header) {
        case 'e0':
          prefix = 'stake_test';
          keyhash = Ed25519KeyHash.from_hex(body);
          break;
        case 'e1':
          keyhash = Ed25519KeyHash.from_hex(body);
          break;
        case 'f0':
          prefix = 'stake_test';
          keyhash = ScriptHash.from_hex(body);
          break;
        case 'f1':
          keyhash = ScriptHash.from_hex(body);
          break;
        default:
          throw new Error('Invalid stake address');
      }
      credential = Credential.from_keyhash(keyhash);
      void credential; // validate only
      key_hex = key;
      break;
    }

    default:
      throw new Error(`Unsupported prefix: ${prefix}`);
  }

  bech32id = bech32.encode(prefix, bech32.toWords(Buffer.from(key_hex!, 'hex')), 256);
  return bech32id;
}

/**
 * Split a hex string into a 2-character header and the remaining body.
 *
 * @param hexString - The hex string to split.
 * @returns A tuple of `[header, body]`.
 *
 * @example
 * ```ts
 * const [header, body] = extractParts("e1cbeb1cca...");
 * // header === "e1", body === "cbeb1cca..."
 * ```
 */
export function extractParts(hexString: string): [string, string] {
  if (hexString.length < 2) {
    return [hexString, ''];
  }
  return [hexString.slice(0, 2), hexString.slice(2)];
}
