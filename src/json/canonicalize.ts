/**
 * Canonical JSON serialization following RFC 8785 (JSON Canonicalization
 * Scheme, "JCS").
 *
 * Produces a deterministic, whitespace-free string for any JSON value so that
 * the *same logical object* always yields the *same bytes* — regardless of the
 * key insertion order used to build it. That byte stream is the canonical input
 * for signing and hashing (e.g. blake2b `voteHash` / `merkleRoot`), and is
 * interoperable with RFC 8785 implementations in other languages.
 *
 * Conformance notes:
 * - **Numbers** are serialized via `JSON.stringify`, i.e. the ECMAScript
 *   `Number::toString` algorithm — exactly the serialization RFC 8785 mandates
 *   for finite numbers.
 * - **Strings** use `JSON.stringify`'s well-formed (ES2019+) escaping, matching
 *   RFC 8785's string production including lone-surrogate handling.
 * - **Object keys** are sorted by UTF-16 code unit (the default
 *   `Array.prototype.sort`), which is the ordering RFC 8785 requires. No
 *   locale-aware / `Intl` comparison is used.
 * - **Non-finite numbers** (`NaN`, `Infinity`, `-Infinity`) are not
 *   representable in JSON; per RFC 8785 they are rejected with a `TypeError`
 *   rather than silently coerced to `null`.
 *
 * @module json/canonicalize
 */

/**
 * Serializes a value to its canonical JSON string per RFC 8785.
 *
 * Objects emit their keys in ascending UTF-16 code-unit order; arrays preserve
 * element order; properties whose value is `undefined` are dropped (matching
 * `JSON.stringify`). The result contains no insignificant whitespace.
 *
 * @param value - Any JSON-compatible value (object, array, string, number,
 *   boolean, or `null`). Callers need not pre-type their input; narrowing is
 *   done internally.
 * @returns The canonical JSON string. Byte-for-byte identical for two objects
 *   that are logically equal but were constructed with different key order.
 * @throws {TypeError} If a non-finite number (`NaN`/`Infinity`/`-Infinity`) is
 *   encountered, since it has no canonical JSON representation.
 *
 * @example
 * ```ts
 * canonicalize({ b: 1, a: 2 });        // '{"a":2,"b":1}'
 * canonicalize({ z: { y: 1, x: 2 } }); // '{"z":{"x":2,"y":1}}'
 * canonicalize([3, 1, 2]);             // '[3,1,2]'  (order preserved)
 * ```
 */
export function canonicalize(value: unknown): string {
  // Primitives and null defer to JSON.stringify, which already produces the
  // RFC 8785 serialization for strings, booleans, null, and finite numbers.
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new TypeError(`Cannot canonicalize non-finite number: ${value}`);
    }
    return JSON.stringify(value);
  }

  // Arrays: serialize each element in place; element order is significant.
  if (Array.isArray(value)) {
    return `[${value.map((element) => canonicalize(element)).join(',')}]`;
  }

  // Objects: sort keys by UTF-16 code unit, drop undefined-valued properties.
  const record = value as Record<string, unknown>;
  const parts = Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);
  return `{${parts.join(',')}}`;
}

/**
 * Returns the UTF-8 bytes of a value's canonical JSON serialization.
 *
 * Convenience wrapper over {@link canonicalize}; the returned bytes are the
 * exact input you would feed to a hash function (blake2b, SHA-256, …). A
 * `Uint8Array` is returned for cross-runtime portability — note that Node's
 * `Buffer` is itself a `Uint8Array`, so consumers expecting a `Buffer` continue
 * to work unchanged.
 *
 * @param value - Any JSON-compatible value (see {@link canonicalize}).
 * @returns The UTF-8 encoding of `canonicalize(value)`.
 * @throws {TypeError} Propagated from {@link canonicalize} for non-finite numbers.
 *
 * @example
 * ```ts
 * const bytes = canonicalBytes({ b: 1, a: 2 });
 * new TextDecoder().decode(bytes); // '{"a":2,"b":1}'
 * ```
 */
export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}
