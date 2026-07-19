import { describe, it, expect } from 'vitest';
import { canonicalize, canonicalBytes } from './canonicalize.js';

/**
 * Backend's current `helper/canonicalJson.js`, lifted verbatim (TRD §3) as the
 * cross-repo byte target. Used by the differential test below to prove our
 * implementation is byte-for-byte identical for every valid-JSON input — the
 * single most important property of this module (already-issued hashes must not
 * change). The only intentional divergence is non-finite numbers, which this
 * reference coerces to "null" and ours rejects; the fuzzer never emits them.
 */
function backendCanonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(backendCanonicalize).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const parts = keys
    .filter((k) => record[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${backendCanonicalize(record[k])}`);
  return `{${parts.join(',')}}`;
}

describe('canonicalize', () => {
  describe('golden vectors (frozen cross-repo contract — TRD §6)', () => {
    const vectors: Array<[string, unknown, string]> = [
      ['sorts object keys', { b: 1, a: 2 }, '{"a":2,"b":1}'],
      ['keeps array order inside object', { a: 1, b: [3, 1, 2] }, '{"a":1,"b":[3,1,2]}'],
      ['sorts nested object keys', { z: { y: 1, x: 2 } }, '{"z":{"x":2,"y":1}}'],
      ['drops undefined-valued property', { a: undefined, b: 1 }, '{"b":1}'],
      ['sorts object inside array', [{ b: 1, a: 2 }], '[{"a":2,"b":1}]'],
      ['serializes a string', 'hi', '"hi"'],
      ['serializes a number', 5, '5'],
      ['serializes a boolean', true, 'true'],
      ['serializes null', null, 'null'],
      [
        'real evidence shape',
        { specVersion: 'x', answers: [], ekklesia: { voterId: 'v', credentialHrp: 'drep' } },
        '{"answers":[],"ekklesia":{"credentialHrp":"drep","voterId":"v"},"specVersion":"x"}',
      ],
    ];

    it.each(vectors)('%s', (_label, input, expected) => {
      expect(canonicalize(input)).toBe(expected);
    });
  });

  it('is independent of key insertion order (F-006 / P65 scenario)', () => {
    const a: Record<string, unknown> = {};
    a.specVersion = '1.0';
    a.ekklesia = { voterId: 'v1', credentialHrp: 'drep' };
    a.answers = [{ q: 1, choice: 'yes' }];

    const b: Record<string, unknown> = {};
    b.answers = [{ choice: 'yes', q: 1 }];
    b.ekklesia = { credentialHrp: 'drep', voterId: 'v1' };
    b.specVersion = '1.0';

    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it('preserves array element order (does not sort)', () => {
    expect(canonicalize([3, 1, 2, 'b', 'a'])).toBe('[3,1,2,"b","a"]');
  });

  it('handles deep nesting (objects in arrays in objects)', () => {
    const input = { outer: [{ inner: { z: 1, a: [{ d: 4, c: 3 }] } }] };
    expect(canonicalize(input)).toBe('{"outer":[{"inner":{"a":[{"c":3,"d":4}],"z":1}}]}');
  });

  it('drops undefined properties but keeps null properties', () => {
    expect(canonicalize({ a: null })).toBe('{"a":null}');
    expect(canonicalize({ a: undefined, b: null })).toBe('{"b":null}');
  });

  it('sorts keys by UTF-16 code unit, not locale (uppercase before lowercase)', () => {
    expect(canonicalize({ a: 1, B: 1 })).toBe('{"B":1,"a":1}');
    // 'A'(0x41) < 'Z'(0x5A) < 'a'(0x61) < 'z'(0x7A)
    expect(canonicalize({ z: 1, a: 1, Z: 1, A: 1 })).toBe('{"A":1,"Z":1,"a":1,"z":1}');
  });

  describe('RFC 8785 number serialization (ECMAScript Number::toString)', () => {
    const numbers: Array<[number, string]> = [
      [0, '0'],
      [-0, '0'],
      [1, '1'],
      [-1, '-1'],
      [1.5, '1.5'],
      [0.1, '0.1'],
      [100, '100'],
      [0.000001, '0.000001'],
      [0.0000001, '1e-7'],
      [1e21, '1e+21'],
      [1e30, '1e+30'],
      [5e-324, '5e-324'],
      [9007199254740992, '9007199254740992'],
    ];

    it.each(numbers)('canonicalize(%d) === %s', (input, expected) => {
      expect(canonicalize(input)).toBe(expected);
    });
  });

  it('conforms to the RFC 8785 Unicode key-sorting example', () => {
    // RFC 8785 Appendix B sorting example: keys sorted by UTF-16 code unit.
    // Input keys and the expected substrings use identical literal characters
    // (written once here), so they match regardless of Unicode normalization form.
    const input = {
      '€': 'Euro Sign', // €
      '\r': 'Carriage Return', // U+000D
      דּ: 'Hebrew Letter Dalet With Dagesh', // precomposed
      '1': 'One',
      '😀': 'Emoji: Grinning Face', // 😀
      '': 'Control',
      ö: 'Latin Small Letter O With Diaeresis', // ö
    };
    // Sorted first code units: 0x000D < 0x0031 < 0x0080 < 0x00F6 < 0x20AC < 0xD83D < 0xFB33.
    // JSON/RFC 8785 escape only U+0000–U+001F (so \r is escaped; U+0080 is literal).
    const expected =
      '{"\\r":"Carriage Return",' +
      '"1":"One",' +
      '"":"Control",' +
      '"ö":"Latin Small Letter O With Diaeresis",' +
      '"€":"Euro Sign",' +
      '"😀":"Emoji: Grinning Face",' +
      '"דּ":"Hebrew Letter Dalet With Dagesh"}';
    expect(canonicalize(input)).toBe(expected);
  });

  describe('non-finite numbers are rejected (RFC 8785)', () => {
    it.each([NaN, Infinity, -Infinity])('throws TypeError for %d', (value) => {
      expect(() => canonicalize(value)).toThrow(TypeError);
    });

    it('throws for a non-finite number nested in an object', () => {
      expect(() => canonicalize({ a: 1, b: Infinity })).toThrow(TypeError);
    });

    it('throws for a non-finite number nested in an array', () => {
      expect(() => canonicalize([1, NaN])).toThrow(TypeError);
    });
  });

  it("matches backend's reference output across randomized valid-JSON inputs", () => {
    // Seeded PRNG (mulberry32) so any failure is reproducible.
    let seed = 0x9e3779b9;
    const rand = (): number => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
    const keys = ['a', 'B', 'z', 'Z', '1', 'name', 'ärger', '😀', 'voterId', 'answers'];

    const gen = (depth: number): unknown => {
      const kind = depth <= 0 ? rand() * 0.5 : rand();
      if (kind < 0.2) return pick(['', 'hi', 'ünïcode', 'with"quote', 'tab\there']);
      if (kind < 0.4) return Math.floor((rand() - 0.5) * 1e6);
      if (kind < 0.5) return rand() * 1000 - 500;
      if (kind < 0.6) return rand() < 0.5;
      if (kind < 0.65) return null;
      if (kind < 0.8) {
        const len = Math.floor(rand() * 4);
        return Array.from({ length: len }, () => gen(depth - 1));
      }
      const obj: Record<string, unknown> = {};
      const count = Math.floor(rand() * 5);
      // Insert keys in randomized order to exercise the sort.
      for (let i = 0; i < count; i++) obj[pick(keys)] = gen(depth - 1);
      return obj;
    };

    for (let i = 0; i < 1000; i++) {
      const input = gen(4);
      expect(canonicalize(input)).toBe(backendCanonicalize(input));
    }
  });
});

describe('canonicalBytes', () => {
  it('returns the UTF-8 encoding of canonicalize', () => {
    const input = { b: 1, a: 2 };
    const bytes = canonicalBytes(input);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(bytes)).toBe(canonicalize(input));
  });

  it('encodes non-ASCII keys and values as UTF-8', () => {
    const input = { ключ: 'знач', emoji: '😀' };
    const bytes = canonicalBytes(input);
    expect(new TextDecoder().decode(bytes)).toBe(canonicalize(input));
    // Multi-byte content means more bytes than UTF-16 code units in the string.
    expect(bytes.length).toBeGreaterThan(canonicalize(input).length);
  });
});
