/**
 * Signature verification for Cardano addresses.
 *
 * Supports Ed25519 signatures (basic, CIP-8, CIP-30) and COSE Sign1 structures.
 * Handles pool calidus key lookups and native script (multisig) validation.
 *
 * @module crypto/verifySignature
 */

import { bech32 } from 'bech32';
import cbor from 'cbor';
import pkg from 'blakejs';
const { blake2bHex } = pkg;

import { PublicKey, Ed25519Signature } from '@emurgo/cardano-serialization-lib-nodejs';
import { getAddressType } from '../validation/address.js';
import { getScript, fetchCalidusKey } from '../cardano/cardanoApi.js';

/** A signature object as submitted by wallets. */
export interface SignatureObject {
  signature?: string;
  publicKey?: string;
  key?: string;
  COSE_Sign1_hex?: string;
  COSE_Key_hex?: string;
}

/** Error result from signature verification. */
export interface SignatureError {
  error: string;
}

/** Script criteria extracted from a native script. */
export interface ScriptCriteria {
  keys: string[];
  signers: string[];
  signed: number;
  required: number;
  count: number;
}

const regExpHex = /^[0-9a-fA-F]+$/;

function getHash(content: string, digestLengthBytes = 32): string {
  return blake2bHex(Buffer.from(content, 'hex'), undefined, digestLengthBytes);
}

function validate_cose_key(cose_key_structure: Map<number, unknown>): SignatureError | false {
  if (!(cose_key_structure instanceof Map) || cose_key_structure.size < 4) {
    return { error: 'COSE Key is invalid' };
  }
  if (cose_key_structure.get(1) !== 1) {
    return { error: "COSE Key map label '1' (kty) is not '1' (OKP)" };
  }
  if (cose_key_structure.get(3) !== -8) {
    return { error: "COSE Key map label '3' (alg) is not '-8' (EdDSA)" };
  }
  if (cose_key_structure.get(-1) !== 6) {
    return { error: "COSE Key map label '-1' (crv) is not '6' (Ed25519)" };
  }
  if (!cose_key_structure.has(-2)) {
    return { error: "COSE Key map label '-2' (public key) is missing" };
  }
  const pub_key_buffer = cose_key_structure.get(-2);
  if (!Buffer.isBuffer(pub_key_buffer)) {
    return { error: 'PublicKey entry of COSE Key is not a bytearray' };
  }
  return false;
}

function validate_cose_sign1(cose_sign1_structure: unknown[]): SignatureError | false {
  if (!Array.isArray(cose_sign1_structure) || cose_sign1_structure.length !== 4) {
    return { error: 'COSE Signature is invalid' };
  }
  const protectedHeader_buffer = cose_sign1_structure[0] as Buffer;
  if (!Buffer.isBuffer(protectedHeader_buffer)) {
    return { error: 'COSE Signature protected Header is invalid' };
  }
  const protectedHeader = cbor.decode(protectedHeader_buffer) as Map<string | number, unknown>;
  if (!protectedHeader.has(1)) {
    return { error: "Protected Header map label '1' is missing" };
  }
  if (protectedHeader.get(1) !== -8) {
    return { error: "Protected Header map label '1' (alg) is not '-8' (EdDSA)" };
  }
  if (!protectedHeader.has('address')) {
    return { error: "Protected Header does not have 'address' label" };
  }
  const sign_addr_buffer = protectedHeader.get('address');
  if (!Buffer.isBuffer(sign_addr_buffer)) {
    return { error: 'Protected Header signer address is not a bytearray' };
  }
  return false;
}

function make_cose1_sig_structure(payload: string, cose_sign1_structure: unknown[]): string {
  const protectedHeader_cbor_hex = (cose_sign1_structure[0] as Buffer).toString('hex');
  const sig_structure = [
    'Signature1',
    Buffer.from(protectedHeader_cbor_hex, 'hex'),
    Buffer.from(''),
    Buffer.from(payload, 'hex'),
  ];
  const encoded = cbor.encode(sig_structure) as Buffer;
  return encoded.toString('hex');
}

function standardize_signature(signature: SignatureObject): SignatureObject {
  if (typeof signature !== 'object') {
    throw new Error('Signature is not a valid JSON object');
  }

  try {
    if (signature.key) cbor.decode(signature.key);
    if (signature.signature) cbor.decode(signature.signature);
    if (signature.signature) signature.COSE_Sign1_hex = signature.signature;
    if (signature.key) signature.COSE_Key_hex = signature.key;
  } catch (_e) {
    // Not CBOR — probably a regular Ed25519 witness
  }

  if (signature.signature) {
    if (!regExpHex.test(signature.signature)) {
      try {
        signature.signature = Buffer.from(
          bech32.fromWords(bech32.decode(signature.signature, 128).words),
        ).toString('hex');
      } catch (_error) {
        throw new Error('Signature is invalid');
      }
    }
  }

  return signature;
}

function get_cose_public_key(signature: SignatureObject): string {
  if (!signature.COSE_Sign1_hex || !regExpHex.test(signature.COSE_Sign1_hex)) {
    throw new Error('COSE Signature is invalid');
  }
  if (!signature.COSE_Key_hex || !regExpHex.test(signature.COSE_Key_hex)) {
    throw new Error('COSE Key is invalid');
  }
  const cose_key_structure = cbor.decode(Buffer.from(signature.COSE_Key_hex, 'hex')) as Map<
    number,
    unknown
  >;
  const error = validate_cose_key(cose_key_structure);
  if (error) throw new Error(error.error);

  const pub_key_buffer = cose_key_structure.get(-2) as Buffer;
  return pub_key_buffer.toString('hex');
}

function get_cose_header(data: unknown[]): Map<string, unknown> {
  let unprotectedHeader = data[1] as Map<string, unknown> | Record<string, unknown>;
  if (!(unprotectedHeader instanceof Map) && typeof unprotectedHeader === 'object') {
    unprotectedHeader = new Map(Object.entries(unprotectedHeader));
  }
  if (!(unprotectedHeader instanceof Map)) {
    throw new Error('Unprotected header is not a map');
  }
  return unprotectedHeader;
}

function parse_cose_signature(
  signature: SignatureObject,
  payload: string,
): { payload_hex: string; signature_hex: string } {
  const cose_sign1_structure = cbor.decode(
    Buffer.from(signature.COSE_Sign1_hex!, 'hex'),
  ) as unknown[];

  const error = validate_cose_sign1(cose_sign1_structure);
  if (error) throw new Error(error.error);

  const unprotectedHeader = get_cose_header(cose_sign1_structure);
  const isHashed = unprotectedHeader.get('hashed');
  if (isHashed) {
    payload = getHash(payload, 28);
  }

  const payload_hex = make_cose1_sig_structure(payload, cose_sign1_structure);
  const signature_hex = (cose_sign1_structure[3] as Buffer).toString('hex');

  return { payload_hex, signature_hex };
}

interface KeySigPayload {
  verification_key: InstanceType<typeof PublicKey>;
  ed_sig: InstanceType<typeof Ed25519Signature>;
  signed_payload_hex: string;
}

function get_key_signature_and_payload(signature: SignatureObject, payload: string): KeySigPayload {
  let public_key_hex: string, ed_signature_hex: string, signed_payload_hex: string;

  if (signature.COSE_Sign1_hex) {
    public_key_hex = get_cose_public_key(signature);
    const { payload_hex, signature_hex } = parse_cose_signature(signature, payload);
    signed_payload_hex = payload_hex;
    ed_signature_hex = signature_hex;
  } else {
    if (regExpHex.test(payload)) {
      signed_payload_hex = payload;
    } else {
      signed_payload_hex = Buffer.from(payload).toString('hex');
    }
    ed_signature_hex = signature.signature!;
    public_key_hex = (signature.publicKey || signature.key)!;
  }

  let verification_key: InstanceType<typeof PublicKey>;
  try {
    verification_key = PublicKey.from_hex(public_key_hex);
  } catch (_error) {
    throw new Error('Invalid signature key');
  }

  let ed_sig: InstanceType<typeof Ed25519Signature>;
  try {
    ed_sig = Ed25519Signature.from_hex(ed_signature_hex);
  } catch (_error) {
    throw new Error('Invalid signature');
  }

  return { verification_key, ed_sig, signed_payload_hex };
}

/**
 * Verifies an Ed25519 or COSE signature against a Cardano address.
 *
 * For pool addresses, performs a Koios API lookup for the pool's calidus key
 * and verifies the signature against that key.
 *
 * @param payload - The hex-encoded payload that was signed.
 * @param address - The bech32-encoded Cardano address of the signer.
 * @param signature - The signature object (Ed25519 or COSE format).
 * @returns `true` if the signature is valid, `false` if invalid, or a {@link SignatureError}.
 *
 * @example
 * ```ts
 * const result = await verifySignature(payloadHex, "stake1u...", {
 *   signature: "3e1c...",
 *   publicKey: "4aaf...",
 * });
 * if (result === true) console.log("Valid!");
 * ```
 */
export async function verifySignature(
  payload: string,
  address: string,
  signature: SignatureObject,
): Promise<boolean | SignatureError> {
  if (!payload) return { error: 'Payload is missing' };
  if (!address) return { error: 'Signer address is not provided' };
  if (signature === null) {
    return { error: 'Signature is not a valid JSON object' };
  }
  if (typeof signature !== 'object') {
    return { error: 'Signature is not a valid JSON object' };
  }

  let verification_key: InstanceType<typeof PublicKey>,
    signed_payload_hex: string,
    ed_sig: InstanceType<typeof Ed25519Signature>;

  try {
    signature = standardize_signature(signature);
    ({ verification_key, ed_sig, signed_payload_hex } = get_key_signature_and_payload(
      signature,
      payload,
    ));
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  const type_details = getAddressType(address);
  if ('error' in type_details) return type_details;

  let keyHash = type_details.keyHash;
  const SignatureKeyHash = verification_key.hash();

  switch (type_details.type) {
    case 'pool': {
      const calidus_key = await fetchCalidusKey(address);
      if (calidus_key != null) {
        keyHash = PublicKey.from_hex(calidus_key.calidus_pub_key).hash().to_hex();
      }
      break;
    }
    default:
      break;
  }

  if (!keyHash.includes(SignatureKeyHash.to_hex())) {
    return { error: 'The key used for signing does not match the address provided!' };
  }

  return verification_key.verify(Buffer.from(signed_payload_hex, 'hex'), ed_sig);
}

/**
 * Checks if a signature is valid for a script-based address.
 *
 * Verifies that the signing key is one of the keys in the native script
 * and that the signature itself is cryptographically valid.
 *
 * @param payload - The hex-encoded payload that was signed.
 * @param address - The bech32-encoded script address.
 * @param signature - The signature object.
 * @param script_body - Optional pre-fetched script body. If not provided, fetched from Koios.
 * @returns `true` if valid, or a {@link SignatureError}.
 */
export async function isPartyToScript(
  payload: string,
  address: string,
  signature: SignatureObject,
  script_body?: Record<string, unknown>,
): Promise<boolean | SignatureError> {
  if (!payload) return { error: 'Payload is missing' };
  if (!address) return { error: 'Signer address is not provided' };
  if (typeof signature !== 'object') {
    return { error: 'Signature is not a valid JSON object' };
  }

  const address_type = getAddressType(address);
  if ('error' in address_type) return address_type;
  if (address_type.hashType !== 'script') {
    return { error: 'Address is not script-based' };
  }

  if (!script_body) {
    const fetched = await getScript(address_type.keyHash.trim());
    if (!fetched) return { error: 'Script not found' };
    script_body = fetched;
  }

  if (script_body.type !== 'timelock') {
    return { error: 'Only native scripts are supported' };
  }

  const criteria = getScriptCriteria(script_body.value as ScriptContents);

  signature = standardize_signature(signature);

  const { verification_key, ed_sig, signed_payload_hex } = get_key_signature_and_payload(
    signature,
    payload,
  );

  const SignatureKeyHash = verification_key.hash();
  if (criteria.keys.includes(SignatureKeyHash.to_hex())) {
    return verification_key.verify(Buffer.from(signed_payload_hex, 'hex'), ed_sig);
  } else {
    return { error: 'The signature is not part of the script' };
  }
}

/** Internal type for native script contents. */
interface ScriptContents {
  type: string;
  scripts: ScriptContents[];
  keyHash?: string;
  required?: number;
}

/**
 * Extracts signing requirements from a Cardano native script.
 *
 * Recursively processes `all`, `any`, and `atLeast` script types to determine
 * which keys can sign and how many signatures are required.
 *
 * @param script_contents - The native script value object.
 * @param carry - Accumulator for recursive processing (internal use).
 * @returns The extracted {@link ScriptCriteria}.
 */
export function getScriptCriteria(
  script_contents: ScriptContents,
  carry: ScriptCriteria = { keys: [], signers: [], signed: 0, required: 1, count: 0 },
): ScriptCriteria {
  script_contents.scripts.forEach((script) => {
    switch (script.type) {
      case 'sig':
        carry.keys.push(script.keyHash!);
        carry.count++;
        break;
      case 'after':
      case 'before':
        break;
      default:
        carry = getScriptCriteria(script, carry);
        break;
    }
  });

  switch (script_contents.type) {
    case 'all':
      carry.required = carry.count;
      break;
    case 'any':
      carry.required = 1;
      break;
    case 'atLeast':
      carry.required = script_contents.required!;
      break;
    default:
      console.error('Unexpected script contents type!', script_contents.type);
      break;
  }

  return carry;
}

/**
 * Validates multiple signatures against a native script's requirements.
 *
 * Checks each signature against the script's key list and counts valid,
 * non-duplicate signatures. Returns `true` if the number of valid signatures
 * meets or exceeds the script's `required` threshold.
 *
 * @param payload - The hex-encoded payload that was signed.
 * @param address - The bech32-encoded script address.
 * @param signatures - Array of signature objects from different signers.
 * @param script_body - Optional pre-fetched script body.
 * @returns `true` if enough valid signatures are present, `false` otherwise, or a {@link SignatureError}.
 */
export async function validateScriptSignatures(
  payload: string,
  address: string,
  signatures: SignatureObject[],
  script_body?: Record<string, unknown>,
): Promise<boolean | SignatureError> {
  if (!payload) return { error: 'Payload is missing' };
  if (!address) return { error: 'Signer address is not provided' };
  if (!Array.isArray(signatures)) return { error: 'Signatures must be an array' };

  const address_type = getAddressType(address);
  if ('error' in address_type) return address_type;

  if (!script_body) {
    const fetched = await getScript(address_type.keyHash);
    if (!fetched) return { error: 'Script not found' };
    script_body = fetched;
  }

  if (script_body.type !== 'timelock') {
    return { error: 'Only native scripts are supported' };
  }

  const script_criteria = getScriptCriteria(script_body.value as ScriptContents);

  for (let sig of signatures) {
    sig = standardize_signature(sig);
    const is_signature_in_script = await isPartyToScript(payload, address, sig, script_body);
    if (is_signature_in_script === true) {
      const { verification_key } = get_key_signature_and_payload(sig, payload);
      const SignatureKeyHash = verification_key.hash().to_hex();
      if (script_criteria.signers.includes(SignatureKeyHash)) {
        continue; // Double signer — don't count
      }
      script_criteria.signers.push(SignatureKeyHash);
      script_criteria.signed++;
    }
  }

  return script_criteria.signed >= script_criteria.required;
}
