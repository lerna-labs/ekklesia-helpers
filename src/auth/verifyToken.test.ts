import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';

import { verifyToken } from './verifyToken.js';

const TEST_SECRET = 'test-jwt-secret-for-testing';

describe('verifyToken', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, JWT_SECRET: TEST_SECRET };
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  it('returns 500 when JWT_SECRET is not set', () => {
    delete process.env.JWT_SECRET;
    const result = verifyToken({ headers: {} });
    expect(result).toEqual({
      status: 'error',
      message: 'Server configuration error',
      code: 500,
    });
  });

  it('returns 401 when no token in cookies or headers', () => {
    const result = verifyToken({ headers: {} });
    expect(result).toEqual({
      status: 'error',
      message: 'No token provided',
      code: 401,
    });
  });

  it('extracts token from cookie', () => {
    const token = jwt.sign({ userId: 'user1' }, TEST_SECRET, { expiresIn: '1h' });
    const result = verifyToken({ cookies: { token } });
    expect(result.status).toBe('success');
    expect(result.message).toBe('Token is valid');
    expect((result as Record<string, unknown>).userId).toBe('user1');
  });

  it('extracts token from Authorization header', () => {
    const token = jwt.sign({ userId: 'user2' }, TEST_SECRET, { expiresIn: '1h' });
    const result = verifyToken({
      headers: { authorization: `Bearer ${token}` },
    });
    expect(result.status).toBe('success');
    expect((result as Record<string, unknown>).userId).toBe('user2');
  });

  it('prefers cookie over header', () => {
    const cookieToken = jwt.sign({ userId: 'cookie-user' }, TEST_SECRET, { expiresIn: '1h' });
    const headerToken = jwt.sign({ userId: 'header-user' }, TEST_SECRET, { expiresIn: '1h' });
    const result = verifyToken({
      cookies: { token: cookieToken },
      headers: { authorization: `Bearer ${headerToken}` },
    });
    expect(result.status).toBe('success');
    expect((result as Record<string, unknown>).userId).toBe('cookie-user');
  });

  it('accepts token with voterId', () => {
    const token = jwt.sign({ voterId: 'voter1' }, TEST_SECRET, { expiresIn: '1h' });
    const result = verifyToken({ cookies: { token } });
    expect(result.status).toBe('success');
    expect((result as Record<string, unknown>).voterId).toBe('voter1');
  });

  it('rejects token with neither userId nor voterId', () => {
    const token = jwt.sign({ someOtherField: 'value' }, TEST_SECRET, { expiresIn: '1h' });
    const result = verifyToken({ cookies: { token } });
    expect(result).toEqual({
      status: 'error',
      message: 'Invalid token format',
      code: 401,
    });
  });

  it('rejects expired token', () => {
    const token = jwt.sign({ userId: 'user1' }, TEST_SECRET, { expiresIn: '-1s' });
    const result = verifyToken({ cookies: { token } });
    expect(result).toEqual({
      status: 'error',
      message: 'Token has expired',
      code: 401,
    });
  });

  it('rejects tampered token', () => {
    const token = jwt.sign({ userId: 'user1' }, TEST_SECRET, { expiresIn: '1h' });
    const result = verifyToken({ cookies: { token: token + 'tampered' } });
    expect(result).toEqual({
      status: 'error',
      message: 'Invalid token',
      code: 401,
    });
  });

  it('rejects token signed with wrong secret', () => {
    const token = jwt.sign({ userId: 'user1' }, 'wrong-secret', { expiresIn: '1h' });
    const result = verifyToken({ cookies: { token } });
    expect(result).toEqual({
      status: 'error',
      message: 'Invalid token',
      code: 401,
    });
  });

  it('spreads all decoded payload fields into result', () => {
    const token = jwt.sign(
      { userId: 'u1', signType: 'stake', multiSig: true, custom: 'data' },
      TEST_SECRET,
      { expiresIn: '1h' },
    );
    const result = verifyToken({ cookies: { token } });
    expect(result.status).toBe('success');
    const r = result as Record<string, unknown>;
    expect(r.userId).toBe('u1');
    expect(r.signType).toBe('stake');
    expect(r.multiSig).toBe(true);
    expect(r.custom).toBe('data');
    expect(r.iat).toEqual(expect.any(Number));
    expect(r.exp).toEqual(expect.any(Number));
  });

  it('returns 401 for completely invalid token string', () => {
    const result = verifyToken({ cookies: { token: 'not-a-jwt' } });
    expect(result).toEqual({
      status: 'error',
      message: 'Invalid token',
      code: 401,
    });
  });

  it('handles missing authorization header gracefully', () => {
    const result = verifyToken({ headers: { authorization: undefined } });
    expect(result).toEqual({
      status: 'error',
      message: 'No token provided',
      code: 401,
    });
  });

  it('handles Authorization header without Bearer prefix', () => {
    const token = jwt.sign({ userId: 'user1' }, TEST_SECRET, { expiresIn: '1h' });
    const result = verifyToken({ headers: { authorization: token } });
    expect(result).toEqual({
      status: 'error',
      message: 'No token provided',
      code: 401,
    });
  });
});
